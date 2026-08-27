// charts.js
import { state } from './state.js';

export function render1RMChart(canvasId, dataLabels, dataValues) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;

    // Distrugge l'istanza precedente se esiste
    if (state.chartInstances['1rm']) {
        state.chartInstances['1rm'].destroy();
    }

    state.chartInstances['1rm'] = new Chart(ctx, {
        type: 'line',
        data: {
            labels: dataLabels,
            datasets: [{
                label: 'Andamento 1RM Stimato (kg)',
                data: dataValues,
                borderColor: 'rgba(75, 192, 192, 1)',
                backgroundColor: 'rgba(75, 192, 192, 0.2)',
                tension: 0.1
            }]
        },
        options: {
            responsive: true,
            scales: {
                y: { beginAtZero: false }
            }
        }
    });
}

export function renderVolumeChart(canvasId, dataLabels, dataValues) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;

    if (state.chartInstances['volume']) {
        state.chartInstances['volume'].destroy();
    }

    state.chartInstances['volume'] = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: dataLabels,
            datasets: [{
                label: 'Volume Muscolare (Ripetizioni Totali)',
                data: dataValues,
                backgroundColor: 'rgba(153, 102, 255, 0.5)',
                borderColor: 'rgba(153, 102, 255, 1)',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            scales: {
                y: { beginAtZero: true }
            }
        }
    });
}