// 1RM e volume muscolare
// js/analytics.js
import { state } from './state.js';
import { renderMacroChart, renderMuscleBarChart } from './charts.js';
import { getAutoMuscleGroup, getExerciseSignature } from './utils.js';

export function renderMacroProgress() {
    const container = document.getElementById('macro-progress-content');
    const savedData = JSON.parse(localStorage.getItem(state.STORAGE_KEY_DATA)) || {};

    const mesosSet = new Set();
    const exerciseMesoMax1RM = {};

    Object.keys(savedData).forEach(key => {
        if (key.toLowerCase().includes('mese_') && key.endsWith('-kg')) {
            const baseId = key.substring(0, key.lastIndexOf('-kg'));
            
            const mesoMatch = key.match(/mese_(\d+)/i);
            if (!mesoMatch) return;
            const mesoNum = parseInt(mesoMatch[1]);
            mesosSet.add(mesoNum);

            const weightVal = parseFloat(savedData[key]);
            const repKey = `${baseId}-r`;
            const rpeKey = `${baseId}-rpe`;
            const warmupKey = `${baseId}-w`;
            const isWarmup = savedData[warmupKey] === true || savedData[warmupKey] === 'true';
            
            const repVal = parseFloat(savedData[repKey]);
            const rpeVal = parseFloat(savedData[rpeKey]);

            if (!isWarmup && !isNaN(weightVal) && weightVal > 0 && !isNaN(repVal) && repVal > 0) {
                let effectiveReps = repVal;
                if (!isNaN(rpeVal) && rpeVal >= 1 && rpeVal <= 10) {
                    const rir = Math.max(0, 10 - rpeVal);
                    effectiveReps = repVal + rir;
                }
                let current1RM = weightVal * (1 + effectiveReps / 30);

                const parts = baseId.split('-');
                if (parts.length >= 5) {
                    const fullSig = parts.slice(3, parts.length - 1).join('-');
                    const nameSlug = fullSig.split('_')[0];

                    if (!exerciseMesoMax1RM[fullSig]) {
                        exerciseMesoMax1RM[fullSig] = { nameSlug: nameSlug, mesos: {} };
                    }
                    if (!exerciseMesoMax1RM[fullSig].mesos[mesoNum] || current1RM > exerciseMesoMax1RM[fullSig].mesos[mesoNum]) {
                        exerciseMesoMax1RM[fullSig].mesos[mesoNum] = current1RM;
                    }
                }
            }
        }
    });

    const sortedMesos = Array.from(mesosSet).sort((a, b) => a - b);
    const signatures = Object.keys(exerciseMesoMax1RM);

    if (sortedMesos.length === 0 || signatures.length === 0) {
        container.innerHTML = `<p style="text-align:center; padding: 20px; color: var(--text-muted);">Nessun dato storico pluriennale trovato.</p>`;
        return;
    }

    let mesoHeaders = sortedMesos.map(m => `<th>Mese ${m}</th>`).join('');
    let html = `
        <p style="font-size:0.85rem; color:var(--text-muted); margin-bottom:12px;">Massimale Teorico (1RM Stimato) più alto registrato per ciascun esercizio nei vari mesocicli:</p>
        <div style="overflow-x:auto;">
        <table class="progress-table">
            <tr><th>Esercizio (Schema Reps)</th>${mesoHeaders}</tr>
    `;

    let chartDatasets = [];
    const colors = ['#0284c7', '#16a34a', '#dc2626', '#ca8a04', '#9333ea', '#0d9488', '#ea580c', '#4f46e5'];

    signatures.forEach((sig, index) => {
        const item = exerciseMesoMax1RM[sig];
        const color = colors[index % colors.length];
        const formattedSigName = sig.replace(/_/g, ' ').toUpperCase();
        
        let rowHtml = `<tr><td style="text-align: left; font-weight: 700;">${formattedSigName}</td>`;
        let mesoDataPoints = [];

        sortedMesos.forEach(m => {
            const val = item.mesos[m];
            if (val && val > 0) {
                rowHtml += `<td>${Math.round(val)} kg</td>`;
                mesoDataPoints.push(Math.round(val));
            } else {
                rowHtml += `<td>-</td>`;
                mesoDataPoints.push(null);
            }
        });

        rowHtml += `</tr>`;
        html += rowHtml;

        chartDatasets.push({
            label: formattedSigName,
            data: mesoDataPoints,
            borderColor: color,
            backgroundColor: color,
            fill: false,
            tension: 0.1
        });
    });

    html += `</table></div>`;
    html += `<div style="margin-top: 20px; background: #fff; padding: 10px; border-radius: 8px; border: 1px solid var(--border-color);"><canvas id="macroChart1RM"></canvas></div>`;

    container.innerHTML = html;

    // Delega la creazione del grafico al modulo charts.js
    renderMacroChart(sortedMesos, chartDatasets);
}

export function renderMuscleVolumeDashboard() {
    const container = document.getElementById('stats-content');
    const savedData = JSON.parse(localStorage.getItem(state.STORAGE_KEY_DATA)) || {};
    const mesoPrefix = `${state.CURRENT_YEAR}-mese_${state.currentMesoNumber}`;
    const weekNumber = document.getElementById('week-selector').value;

    let volumePerDistretto = {};
    const dailyExercises = state.workoutPlan.filter(ex => parseInt(ex.Settimana) === parseInt(weekNumber));

    dailyExercises.forEach(ex => {
        let distretto = ex.Distretto || ex['Distretto Muscolare'];
        if (!distretto || distretto.trim() === '') {
            distretto = getAutoMuscleGroup(ex.Esercizio);
        } else {
            distretto = distretto.trim();
        }

        if (!volumePerDistretto[distretto]) {
            volumePerDistretto[distretto] = 0;
        }

        const totalSets = parseInt(ex.Set) || 1;
        const dayNum = ex.Giorno || 1;

        for (let s = 1; s <= totalSets; s++) {
            const baseId = `${mesoPrefix}_w${weekNumber}-d${dayNum}-${ex.Blocco}-${getExerciseSignature(ex)}-s${s}`;
            const warmupKey = `${baseId}-w`;
            const checkKey = `${baseId}-c`;

            const isWarmup = savedData[warmupKey] === true || savedData[warmupKey] === 'true';
            const isCompleted = savedData[checkKey] === true || savedData[checkKey] === 'true';

            if (isCompleted && !isWarmup) {
                volumePerDistretto[distretto] += 1;
            }
        }
    });

    const labels = Object.keys(volumePerDistretto);
    const dataValues = Object.values(volumePerDistretto);

    if (labels.length === 0 || dataValues.reduce((a, b) => a + b, 0) === 0) {
        container.innerHTML = `<p style="text-align:center; padding: 20px; color: var(--text-muted);">Nessun set completato registrato per questa settimana. Spunta qualche serie per generare la heatmap!</p>`;
        return;
    }

    let html = `
        <p style="font-size:0.85rem; color:var(--text-muted); margin-bottom:12px;">Numero di serie allenanti (esclusi i warm-up) completate nella <strong>Settimana ${weekNumber}</strong>:</p>
        <div style="background: #fff; padding: 10px; border-radius: 8px; border: 1px solid var(--border-color);">
            <canvas id="muscleBarChart"></canvas>
        </div>
    `;
    container.innerHTML = html;

    // Delega la creazione del grafico a barre al modulo charts.js
    renderMuscleBarChart(labels, dataValues, weekNumber);
}