// js/dashboards.js
import { state } from './state.js';
import { render1RMChart } from './charts.js';
import { assignMuscleGroup } from './helpers.js';

/**
 * Renderizza la Dashboard del Volume Muscolare (#stats-content)
 */
export function renderStatsView() {
    const container = document.getElementById('stats-content');
    if (!container) return;

    // Struttura di conteggio serie per gruppo muscolare
    const setCounts = {};
    const historyObj = state.workoutData?.history?.years || {};

    Object.keys(historyObj).forEach(year => {
        (historyObj[year].mesocycles || []).forEach(meso => {
            (meso.weeks || []).forEach(week => {
                (week.days || []).forEach(day => {
                    (day.exercises || []).forEach(ex => {
                        const group = assignMuscleGroup(ex.name);
                        const completedSets = (ex.loggedSets || []).filter(s => s.completed && !s.isWarmup).length;
                        setCounts[group] = (setCounts[group] || 0) + completedSets;
                    });
                });
            });
        });
    });

    let html = '<div style="display: flex; flex-direction: column; gap: 8px;">';
    for (const [group, count] of Object.entries(setCounts)) {
        html += `
            <div style="display: flex; justify-content: space-between; padding: 6px 12px; background: var(--block-bg); border-radius: 6px; font-size: 0.85rem;">
                <span style="font-weight: 600;">${group}</span>
                <span style="font-weight: 700; color: var(--accent-color);">${count} set totali</span>
            </div>
        `;
    }
    html += '</div>';

    container.innerHTML = html || '<p style="font-size: 0.8rem; color: var(--text-muted);">Nessun dato di volume disponibile.</p>';
}

/**
 * Renderizza i Progressi del Mesociclo (#progress-content)
 */
export function renderProgressView() {
    const container = document.getElementById('progress-content');
    if (!container) return;

    container.innerHTML = `
        <p style="font-size: 0.85rem; color: var(--text-muted);">
            Sezione analitica del mesociclo in fase di calcolo dettagliato sui volumi settimanali.
        </p>
    `;
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

    // Renderizza di default per l'esercizio di prova
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