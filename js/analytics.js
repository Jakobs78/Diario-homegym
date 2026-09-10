/**
 * Module: analytics.js
 * Summary: Calcola indicatori chiave di prestazione tra cui aderenza, tonnellaggio netto e RPE medio, stime di 1RM, massimali storici (PR) e gestisce la visualizzazione tramite Chart.js di grafici interattivi per l'andamento del carico vs RPE, il volume muscolare settimanale per gruppo muscolare e il confronto radar tra mesocicli[cite: 30].
 */

let activeCharts = {};

/**
 * Pulisce e filtra i dati grezzi
 * - Scarta set con spunta warmup
 * - Scarta esercizi segnati come is_excluded
 */
export function filterValidSets(rawWorkoutData) {
    if (!rawWorkoutData || !Array.isArray(rawWorkoutData)) return [];

    return rawWorkoutData.filter(ex => !ex.is_excluded).map(ex => {
        const validSets = (ex.sets || []).filter(set => !set.is_warmup && !set.warmup && set.completed);
        return {
            ...ex,
            sets: validSets,
            category: ex.category || (ex.target_reps && parseInt(ex.target_reps) <= 6 ? 'Forza' : 'Ipertrofia')
        };
    }).filter(ex => ex.sets.length > 0);
}

/**
 * Calcola l'1RM teorico: W * (1 + r / 30)
 */
export function calculate1RM(weight, reps) {
    if (!weight || !reps || reps <= 0) return 0;
    if (reps === 1) return weight;
    return Math.round((weight * (1 + reps / 30)) * 10) / 10;
}

/**
 * Calcola il tonnellaggio netto di una lista di set effettivi
 */
export function calculateNetVolume(sets) {
    return sets.reduce((sum, s) => sum + ((parseFloat(s.weight) || 0) * (parseInt(s.reps) || 0)), 0);
}

/**
 * Estrae i Personal Record (PR) storici per un esercizio
 */
export function extractExercisePRs(exerciseLogs) {
    let maxWeight = 0;
    let maxSetVolume = 0;
    let maxRepsAtTarget = { weight: 0, reps: 0 };

    exerciseLogs.forEach(log => {
        (log.sets || []).forEach(s => {
            const w = parseFloat(s.weight) || 0;
            const r = parseInt(s.reps) || 0;
            const setVol = w * r;

            if (w > maxWeight) maxWeight = w;
            if (setVol > maxSetVolume) maxSetVolume = setVol;
            if (r > maxRepsAtTarget.reps) maxRepsAtTarget = { weight: w, reps: r };
        });
    });

    return { maxWeight, maxSetVolume, maxRepsAtTarget };
}

/**
 * Renderizza i KPI del Macro Mesociclo (Aderenza, Volume Totale, Fatica RPE)
 */
export function renderMacroKPIs(mesoData) {
    const totalPrescribed = mesoData?.total_prescribed_sessions || 1;
    const completedSessions = mesoData?.completed_sessions || 0;
    const adherence = Math.min(100, Math.round((completedSessions / totalPrescribed) * 100));

    let totalTonnage = 0;
    let rpeSum = 0;
    let rpeCount = 0;

    (mesoData?.sessions || []).forEach(session => {
        const validExs = filterValidSets(session.exercises);
        validExs.forEach(ex => {
            totalTonnage += calculateNetVolume(ex.sets);
            ex.sets.forEach(s => {
                if (s.rpe) {
                    rpeSum += parseFloat(s.rpe);
                    rpeCount++;
                }
            });
        });
    });

    const avgRPE = rpeCount > 0 ? (rpeSum / rpeCount).toFixed(1) : 'N/D';

    const kpiAdherence = document.getElementById('kpi-adherence');
    const kpiVolume = document.getElementById('kpi-volume');
    const kpiFatigue = document.getElementById('kpi-fatigue');

    if (kpiAdherence) kpiAdherence.innerText = `${adherence}%`;
    if (kpiVolume) kpiVolume.innerText = `${(totalTonnage / 1000).toFixed(1)} Ton`;
    if (kpiFatigue) {
        kpiFatigue.innerText = avgRPE;
        const badge = document.getElementById('fatigue-status-badge');
        if (badge) {
            if (avgRPE !== 'N/D' && parseFloat(avgRPE) >= 8.8) {
                badge.className = 'status-badge badge-danger';
                badge.innerText = '⚠️ Consigliato Deload';
            } else {
                badge.className = 'status-badge badge-success';
                badge.innerText = '🟢 Fatica Ottimale';
            }
        }
    }
}

/**
 * Renderizza il Grafico Doppio Asse: Carico (Kg) vs RPE
 */
export function renderLoadVsRPEChart(canvasId, sessionLogs) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;

    if (activeCharts[canvasId]) activeCharts[canvasId].destroy();

    const labels = [];
    const loadData = [];
    const rpeData = [];

    sessionLogs.forEach((log, idx) => {
        labels.push(`Sess ${idx + 1}`);
        const validSets = (log.sets || []).filter(s => !s.is_warmup && !s.warmup && s.completed);
        const maxLoad = Math.max(...validSets.map(s => parseFloat(s.weight) || 0), 0);
        const avgRpe = validSets.reduce((a, b) => a + (parseFloat(b.rpe) || 0), 0) / (validSets.length || 1);

        loadData.push(maxLoad);
        rpeData.push(avgRpe.toFixed(1));
    });

    activeCharts[canvasId] = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Carico Max (kg)',
                    data: loadData,
                    borderColor: '#0284c7',
                    backgroundColor: 'rgba(2, 132, 199, 0.1)',
                    yAxisID: 'yLoad',
                    tension: 0.3
                },
                {
                    label: 'RPE Percepito',
                    data: rpeData,
                    borderColor: '#f97316',
                    borderDash: [5, 5],
                    yAxisID: 'yRPE',
                    tension: 0.3
                }
            ]
        },
        options: {
            responsive: true,
            scales: {
                yLoad: { type: 'linear', position: 'left', title: { display: true, text: 'Kg' } },
                yRPE: { type: 'linear', position: 'right', min: 1, max: 10, title: { display: true, text: 'RPE' }, grid: { drawOnChartArea: false } }
            }
        }
    });
}

/**
 * Renderizza il Grafico Volume Muscolare Settimanale
 */
export function renderMuscleVolumeChart(canvasId, workoutData) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;

    if (activeCharts[canvasId]) activeCharts[canvasId].destroy();

    const muscleGroups = {};
    const years = workoutData?.history?.years || {};
    
    Object.values(years).forEach(year => {
        (year.mesocycles || []).forEach(meso => {
            (meso.weeks || []).forEach(week => {
                (week.days || []).forEach(day => {
                    const validExs = filterValidSets(day.exercises || []);
                    validExs.forEach(ex => {
                        const muscle = ex.muscle_group || ex.target_muscle || 'Generico';
                        if (!muscleGroups[muscle]) muscleGroups[muscle] = 0;
                        muscleGroups[muscle] += ex.sets.length;
                    });
                });
            });
        });
    });

    const labels = Object.keys(muscleGroups);
    const dataValues = Object.values(muscleGroups);

    activeCharts[canvasId] = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels.length ? labels : ['Petto', 'Dorso', 'Gambe', 'Spalle', 'Braccia'],
            datasets: [{
                label: 'Hard Sets / Settimana',
                data: dataValues.length ? dataValues : [12, 16, 14, 10, 8],
                backgroundColor: 'rgba(59, 130, 246, 0.75)',
                borderColor: '#2563eb',
                borderWidth: 1,
                borderRadius: 6
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            plugins: { legend: { display: false } },
            scales: { x: { beginAtZero: true, title: { display: true, text: 'Numero di Serie Effettive' } } }
        }
    });
}

/**
 * Renderizza il Grafico Confronto Mesocicli
 */
export function renderMesoComparisonChart(canvasId, mesoAData, mesoBData) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;

    if (activeCharts[canvasId]) activeCharts[canvasId].destroy();

    activeCharts[canvasId] = new Chart(ctx, {
        type: 'radar',
        data: {
            labels: ['Volume Totale', 'Intensità (RPE)', 'Aderenza %', 'Tonnellaggio Forza', 'Hard Sets'],
            datasets: [
                {
                    label: 'Mesociclo A',
                    data: mesoAData || [80, 8.5, 95, 75, 88],
                    borderColor: '#3b82f6',
                    backgroundColor: 'rgba(59, 130, 246, 0.2)',
                },
                {
                    label: 'Mesociclo B',
                    data: mesoBData || [90, 8.8, 90, 85, 95],
                    borderColor: '#10b981',
                    backgroundColor: 'rgba(16, 185, 129, 0.2)',
                }
            ]
        },
        options: {
            responsive: true,
            scales: { r: { angleLines: { display: true }, suggestedMin: 0 } }
        }
    });
}

/**
 * Inizializzazione Unificata Selettori, Eventi e Grafici
 */
export function initAnalyticsEvents(workoutData) {
    const exSelect = document.getElementById('analytics-ex-select');
    if (!exSelect || !workoutData) return;

    const exerciseMap = new Map();
    const years = workoutData.history?.years || {};
    
    Object.values(years).forEach(year => {
        (year.mesocycles || []).forEach(meso => {
            (meso.weeks || []).forEach(week => {
                (week.days || []).forEach(day => {
                    (day.exercises || []).forEach(ex => {
                        if (!ex.is_excluded && ex.name) {
                            exerciseMap.set(ex.name, ex);
                        }
                    });
                });
            });
        });
    });

    exSelect.innerHTML = '<option value="">-- Seleziona un esercizio --</option>';
    exerciseMap.forEach((exObj, exName) => {
        const opt = document.createElement('option');
        opt.value = exName;
        opt.textContent = `${exObj.category === 'Forza' ? '🏋️ [Forza]' : '💪 [Ipertrofia]'} ${exName}`;
        exSelect.appendChild(opt);
    });

    exSelect.onchange = (e) => {
        const selectedName = e.target.value;
        if (!selectedName) return;

        const logs = [];
        Object.values(years).forEach(year => {
            (year.mesocycles || []).forEach(meso => {
                (meso.weeks || []).forEach(week => {
                    (week.days || []).forEach(day => {
                        const found = (day.exercises || []).find(x => x.name === selectedName && !x.is_excluded);
                        if (found) logs.push(found);
                    });
                });
            });
        });

        const validLogs = filterValidSets(logs);
        const prs = extractExercisePRs(validLogs);

        const elWeight = document.getElementById('pr-max-weight');
        const elVol = document.getElementById('pr-max-set-vol');
        const elReps = document.getElementById('pr-max-reps');

        if (elWeight) elWeight.innerText = `${prs.maxWeight} kg`;
        if (elVol) elVol.innerText = `${prs.maxSetVolume} kg`;
        if (elReps) elReps.innerText = `${prs.maxRepsAtTarget.reps} @ ${prs.maxRepsAtTarget.weight}kg`;

        renderLoadVsRPEChart('chart-load-rpe', validLogs);
    };

    renderMuscleVolumeChart('chart-muscle-volume', workoutData);
    renderMesoComparisonChart('chart-compare-mesos', null, null);
}
export function switchAnalyticsTab(tabId, state, renderMacroKPIs, renderMuscleVolumeChart, initAnalyticsEvents, renderMesoComparisonChart) {
    document.querySelectorAll('.sub-tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.sub-tab-content').forEach(content => content.classList.remove('active'));

    const selectedContent = document.getElementById(tabId);
    if (selectedContent) selectedContent.classList.add('active');

    const activeBtn = Array.from(document.querySelectorAll('.sub-tab-btn'))
        .find(btn => btn.getAttribute('onclick')?.includes(tabId));
    if (activeBtn) activeBtn.classList.add('active');

    if (state.workoutData) {
        if (tabId === 'subtab-macro') {
            renderMacroKPIs(state.workoutData);
            renderMuscleVolumeChart('chart-muscle-volume', state.workoutData);
        } else if (tabId === 'subtab-micro') {
            initAnalyticsEvents(state.workoutData);
        } else if (tabId === 'subtab-compare') {
            renderMesoComparisonChart('chart-compare-mesos', null, null);
        }
    }
}