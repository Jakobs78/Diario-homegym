/* global Chart */
// ==========================================
// MODULI: charts.js - Rendering grafici 1RM stimato (Formula Epley) e metriche storiche con Chart.js
// ==========================================
import { state } from './state.js';

export function render1RMChart(canvasId, exerciseName) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;

    // Raccoglie date e carichi dell'esercizio specifico da tutto lo storico gerarchico
    const labels = [];
    const values = [];

    const yearsObj = state.workoutData.history?.years || {};
    Object.keys(yearsObj).forEach(year => {
        (yearsObj[year].mesocycles || []).forEach(meso => {
            (meso.weeks || []).forEach(week => {
                (week.days || []).forEach(day => {
                    (day.exercises || []).forEach(ex => {
                        if (ex.name.toLowerCase() === exerciseName.toLowerCase()) {
                            (ex.loggedSets || []).forEach(set => {
                                // Calcola l'e1RM solo per serie effettive entro le 10 ripetizioni[cite: 1]
                                if (set.reps && set.reps > 0 && set.reps <= 10) {
                                labels.push(day.date);
                                // Formula Epley 1RM: weight * (1 + reps / 30)
                                const estimated1RM = set.weight * (1 + (set.reps / 30));
                                values.push(Math.round(estimated1RM));
                                }
                            });
                        }
                    });
                });
            });
        });
    });

    if (state.chartInstances['1rm']) {
        state.chartInstances['1rm'].destroy();
    }

    state.chartInstances['1rm'] = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: `1RM Stimato (${exerciseName})`,
                data: values,
                borderColor: 'rgba(75, 192, 192, 1)',
                backgroundColor: 'rgba(75, 192, 192, 0.2)',
                tension: 0.1
            }]
        },
        options: {
            responsive: true,
            scales: { y: { beginAtZero: false } }
        }
    });
}