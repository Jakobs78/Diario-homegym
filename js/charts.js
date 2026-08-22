// gestione grafici e statistiche
// js/charts.js
import { state } from './state.js';

export function renderMacroChart(sortedMesos, chartDatasets) {
    if (state.instanceMacroChart) {
        state.instanceMacroChart.destroy();
    }

    const canvas = document.getElementById('macroChart1RM');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    state.instanceMacroChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: sortedMesos.map(m => `Mese ${m}`),
            datasets: chartDatasets
        },
        options: {
            responsive: true,
            plugins: { 
                title: { display: true, text: 'Evoluzione 1RM nei Mesocicli (kg)' } 
            },
            spanGaps: true
        }
    });
}

export function renderMuscleBarChart(labels, dataValues, weekNumber) {
    if (state.instanceMuscleChart) {
        state.instanceMuscleChart.destroy();
    }

    const canvas = document.getElementById('muscleBarChart');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    state.instanceMuscleChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Serie per Distretto',
                data: dataValues,
                backgroundColor: 'rgba(2, 132, 199, 0.6)',
                borderColor: 'rgba(2, 132, 199, 1)',
                borderWidth: 1,
                borderRadius: 4
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            plugins: {
                legend: { display: false },
                title: { display: true, text: `Volume Settimanale per Gruppo Muscolare (Sett. ${weekNumber})` }
            },
            scales: {
                x: { beginAtZero: true, ticks: { stepSize: 1 } }
            }
        }
    });
}