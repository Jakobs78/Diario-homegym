/* global Chart */
// ==========================================
// MODULI: charts.js - Rendering grafici 1RM stimato (Formula Epley) e metriche storiche con Chart.js
// ==========================================
import { state } from './state.js';
import { parseRPE } from './helpers.js';

export function render1RMChart(canvasId, exerciseName) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;

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
                                const weightVal = parseFloat(set.weight) || 0;
                                
                                // 🚀 RISOLTO: Estrae la prima cifra numerica utile anche in presenza di tecniche (es. "10+8" -> 10)
                                let rawRepsStr = String(set.reps || '');
                                if (rawRepsStr.includes('+')) {
                                    rawRepsStr = rawRepsStr.split('+')[0];
                                }
                                const repsVal = parseInt(rawRepsStr.replace(/\D+/g, ''), 10) || 0;
                                const rpeVal = set.rpe ? parseRPE(set.rpe) : 10;

                                // Calcola l'e1RM solo per serie effettive valide con buffer ipertrofico controllato
                                if (weightVal > 0 && repsVal > 0 && repsVal <= 12) {
                                    labels.push(day.date || week.weekNumber);
                                    
                                    // 🚀 ALLINEAMENTO SCIENTIFICO: Formula di Epley Modificata basata su RPE (RIR = 10 - RPE)
                                    const effectiveReps = repsVal + Math.max(0, 10 - rpeVal);
                                    const estimated1RM = weightVal * (1 + (effectiveReps / 30));
                                    
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
                label: `1RM Stimato Adattivo (${exerciseName})`,
                data: values,
                borderColor: 'rgba(59, 130, 246, 1)', // Cambiato in azzurro per allinearsi al brand MyCoatch
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                tension: 0.15,
                fill: true
            }]
        },
        options: {
            responsive: true,
            scales: { 
                y: { 
                    beginAtZero: false,
                    title: { display: true, text: 'Massimale Stimato (kg)' }
                } 
            }
        }
    });
}
