import {estimateE1rm} from '../mycoatch/historyAnalysis.js';
import {isWarmupExercise,isWarmupSet} from './workoutSemantics.js';
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
                        if (!isWarmupExercise(ex) && ex.name.toLowerCase() === exerciseName.toLowerCase()) {
                            (ex.loggedSets || []).forEach(set => {
                                const weightVal = parseFloat(set.weight) || 0;
                                
                                // 🚀 RISOLTO: Estrae la prima cifra numerica utile anche in presenza di tecniche (es. "10+8" -> 10)
                                let rawRepsStr = String(set.reps || '');
                                if (rawRepsStr.includes('+')) {
                                    rawRepsStr = rawRepsStr.split('+')[0];
                                }
                                const repsVal = parseInt(rawRepsStr.replace(/\D+/g, ''), 10) || 0;
                                if(!(set.isLocked||set.completed)||isWarmupSet(set)||set.intensityTechnique||set.dropSegments?.length)return;
                                const rpeVal = set.rpe ? parseRPE(set.rpe) : null;

                                // Calcola l'e1RM solo per serie effettive valide con buffer ipertrofico controllato
                                if (weightVal > 0 && repsVal > 0 && repsVal <= 12 && rpeVal!==null && rpeVal>=6 && rpeVal<=10) {
                                    labels.push(day.date || week.weekNumber);
                                    
                                    // 🚀 ALLINEAMENTO SCIENTIFICO: Formula di Epley Modificata basata su RPE (RIR = 10 - RPE)
                                    const estimated1RM = estimateE1rm(weightVal,repsVal,rpeVal);
                                    
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
                label: `e1RM Epley con RIR (≤12 reps, RPE registrato) (${exerciseName})`,
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
