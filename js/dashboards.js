// js/dashboards.js
import { state } from './state.js';
import { render1RMChart } from './charts.js';
import { assignMuscleGroup } from './helpers.js';

/**
 * Renderizza la Dashboard del Volume Muscolare (#stats-content)
 * Dettaglio per distretto e per singolo esercizio, contando ESCLUSIVAMENTE i set spuntati/bloccati (isLocked)
 */
export function renderStatsView() {
    const container = document.getElementById('stats-content');
    if (!container) return;

    // Struttura gerarchica: { [distretto]: { [nomeEsercizio]: setValidCount } }
    const volumeData = {};

    const scanData = (node) => {
        if (!node) return;
        if (Array.isArray(node)) {
            node.forEach(item => scanData(item));
        } else if (typeof node === 'object') {
            if (node.exercises && Array.isArray(node.exercises)) {
                node.exercises.forEach(ex => {
                    // Esclude i movimenti di riscaldamento espliciti
                    if (ex.isWarmup || ex.type === 'warmup') return;

                    const group = assignMuscleGroup(ex.name) || 'Altro';
                    const exerciseName = ex.name || 'Esercizio';

                    // Conta ESCLUSIVAMENTE i set che l'utente ha spuntato/bloccato in palestra
                    const validSets = (ex.loggedSets || []).filter(s => {
                        const isWarmupSet = s.isWarmup || s.warmup;
                        return s.isLocked && !isWarmupSet;
                    }).length;

                    if (validSets > 0) {
                        if (!volumeData[group]) {
                            volumeData[group] = {};
                        }
                        volumeData[group][exerciseName] = (volumeData[group][exerciseName] || 0) + validSets;
                    }
                });
            } else {
                Object.values(node).forEach(val => scanData(val));
            }
        }
    };

    scanData(state.workoutData);

    let html = '<div style="display: flex; flex-direction: column; gap: 12px;">';

    if (Object.keys(volumeData).length === 0) {
        html = '<p style="font-size: 0.85rem; color: var(--text-muted); text-align: center; padding: 20px;">Nessun set completato e spuntato trovato. Spunta le serie durante il workout per tracciare il volume effettivo.</p>';
    } else {
        for (const [group, exercises] of Object.entries(volumeData)) {
            let groupTotalSets = 0;
            let exercisesHtml = '';

            for (const [exName, setsCount] of Object.entries(exercises)) {
                groupTotalSets += setsCount;
                exercisesHtml += `
                    <div style="display: flex; justify-content: space-between; align-items: center; padding: 4px 0; font-size: 0.8rem; border-bottom: 1px dashed var(--border-color);">
                        <span style="color: var(--text-color);">${exName}</span>
                        <span style="font-weight: 600; color: var(--accent-color);">${setsCount} set</span>
                    </div>
                `;
            }

            html += `
                <div style="background: var(--block-bg); border-radius: 8px; padding: 10px 14px; border-left: 4px solid var(--accent-color);">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; border-bottom: 1px solid var(--border-color); padding-bottom: 4px;">
                        <strong style="font-size: 0.9rem; text-transform: uppercase; letter-spacing: 0.5px;">${group}</strong>
                        <span style="font-size: 0.85rem; font-weight: 700; background: var(--bg-card); padding: 2px 8px; border-radius: 4px;">Totale: ${groupTotalSets} set</span>
                    </div>
                    <div style="display: flex; flex-direction: column; gap: 2px;">
                        ${exercisesHtml}
                    </div>
                </div>
            `;
        }
        html += '</div>';
    }

    container.innerHTML = html;
}

/**
 * Renderizza i Progressi del Mesociclo (#progress-content)
 * Analisi settimanale di volume effettivo (set bloccati) e tonnellaggio totale
 */
export function renderProgressView() {
    const container = document.getElementById('progress-content');
    if (!container) return;

    const weeklyData = {};

    const scanMesocycle = (node) => {
        if (!node) return;
        if (Array.isArray(node)) {
            node.forEach(item => scanMesocycle(item));
        } else if (typeof node === 'object') {
            if (node.weeks && Array.isArray(node.weeks)) {
                node.weeks.forEach((week, wIdx) => {
                    const weekNum = week.weekNumber || (wIdx + 1);
                    if (!weeklyData[weekNum]) weeklyData[weekNum] = { sets: 0, tonnage: 0, exercisesCount: new Set() };

                    (week.days || []).forEach(day => {
                        (day.exercises || []).forEach(ex => {
                            if (ex.isWarmup || ex.type === 'warmup') return;

                            (ex.loggedSets || []).forEach(s => {
                                const isWarmupSet = s.isWarmup || s.warmup;
                                // Conta solo i set effettivamente eseguiti e spuntati
                                if (s.isLocked && !isWarmupSet) {
                                    weeklyData[weekNum].sets += 1;
                                    weeklyData[weekNum].exercisesCount.add(ex.name);
                                    
                                    const w = parseFloat(String(s.weight).replace(/[^0-9.]/g, '')) || 0;
                                    const r = parseFloat(String(s.reps).replace(/[^0-9.]/g, '')) || 0;
                                    weeklyData[weekNum].tonnage += (w * r);
                                }
                            });
                        });
                    });
                });
            } else {
                Object.values(node).forEach(val => scanMesocycle(val));
            }
        }
    };

    scanMesocycle(state.workoutData);

    let html = '<div style="display: flex; flex-direction: column; gap: 10px;">';
    const sortedWeeks = Object.keys(weeklyData).sort((a, b) => a - b);

    if (sortedWeeks.length === 0) {
        html = '<p style="font-size: 0.85rem; color: var(--text-muted); text-align: center; padding: 20px;">Nessun dato di progressione disponibile. Completa e spunta i set per visualizzare l\'andamento del mesociclo.</p>';
    } else {
        sortedWeeks.forEach(wNum => {
            const data = weeklyData[wNum];
            html += `
                <div style="padding: 12px; background: var(--block-bg); border-radius: 8px; font-size: 0.85rem; display: flex; justify-content: space-between; align-items: center; border-left: 4px solid var(--accent-color);">
                    <div>
                        <strong style="font-size: 0.95rem;">Settimana ${wNum}</strong>
                        <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 3px;">
                            Set validi: <strong>${data.sets}</strong> | Esercizi stimolati: <strong>${data.exercisesCount.size}</strong>
                        </div>
                    </div>
                    <div style="text-align: right;">
                        <div style="font-weight: 700; color: var(--accent-color); font-size: 1rem;">${Math.round(data.tonnage).toLocaleString()} kg</div>
                        <div style="font-size: 0.75rem; color: var(--text-muted);">Tonnellaggio Totale</div>
                    </div>
                </div>
            `;
        });
        html += '</div>';
    }

    container.innerHTML = html;
}

/**
 * Renderizza la Macro Progressione Pluriennale e abilita i grafici 1RM (#macro-progress-content)
 */
export function renderMacroProgressView() {
    const container = document.getElementById('macro-progress-content');
    if (!container) return;

    container.innerHTML = `
        <div style="margin-bottom: 12px;">
            <label style="font-size: 0.8rem; font-weight: 600;">Seleziona Esercizio:</label>
            <input type="text" id="chart-exercise-input" placeholder="Es. Panca Piana" value="Panca Piana" style="margin-top: 4px;">
            <button class="btn" id="render-chart-btn" style="margin-top: 6px; width: 100%;">Genera Grafico 1RM</button>
        </div>
        <div style="position: relative; width: 100%; height: 260px;">
            <canvas id="chart-1rm-canvas"></canvas>
        </div>
    `;

    document.getElementById('render-chart-btn')?.addEventListener('click', () => {
        const exName = document.getElementById('chart-exercise-input')?.value.trim();
        if (exName) {
            render1RMChart('chart-1rm-canvas', exName);
        }
    });

    render1RMChart('chart-1rm-canvas', 'Panca Piana');
}

/**
 * Renderizza il Manuale di Istruzioni (#manual-content)
 */
export function renderManualView() {
    const container = document.getElementById('manual-content');
    if (!container) return;

    container.innerHTML = `
        <div style="font-size: 0.85rem; line-height: 1.5; color: var(--text-color);">
            <h4 style="color: var(--accent-color); margin-top: 0;">Come utilizzare il diario:</h4>
            <ul>
                <li><strong>Seleziona Settimana e Giorno:</strong> Naviga tramite i pulsanti in alto per accedere ai tuoi workout.</li>
                <li><strong>Log dei Set:</strong> Inserisci Peso e Ripetizioni. Spunta il checkbox per confermare la serie eseguita.</li>
                <li><strong>Timer Automatizzato:</strong> Il timer parte automaticamente alla spunta di ogni serie completata.</li>
                <li><strong>Import/Export CSV:</strong> Usa il pannello strumenti per fare backup o caricare nuove schede.</li>
            </ul>
        </div>
    `;
}