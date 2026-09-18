/* global Chart */
/**
 * Module: analytics.js
 * Summary: Calcola indicatori chiave di prestazione e gestisce i grafici Chart.js per Macro, Micro e Confronto Mesocicli.
 */
import { state } from './state.js';
import { parseRPE } from './helpers.js';

let activeCharts = {};
let currentRange = 'meso';

/**
 * Estrae una lista piatta di esercizi partendo da qualsiasi struttura dati.
 */
export function extractExercisesFromData(rawWorkoutData) {
    if (!rawWorkoutData) return [];

    let items = Array.isArray(rawWorkoutData) ? rawWorkoutData : Object.values(rawWorkoutData);
    let allExercises = [];

    items.forEach(item => {
        if (!item || typeof item !== 'object') return;

        const exercisesList = item.exercises || item.esercizi || item.exerciseList;
        
        if (exercisesList) {
            const exArray = Array.isArray(exercisesList) ? exercisesList : Object.values(exercisesList);
            allExercises.push(...exArray);
        } else if (item.loggedSets || item.series || (item.sets && typeof item.sets !== 'number')) {
            allExercises.push(item);
        }
    });

    return allExercises;
}

/**
 * Pulisce e filtra i dati grezzi dando priorità all'array `loggedSets`.
 */
export function filterValidSets(rawWorkoutData) {
    if (!rawWorkoutData) return [];

    const exercisesArray = extractExercisesFromData(rawWorkoutData);

    return exercisesArray
        .filter(ex => ex && !ex.is_excluded && !ex.isExcluded)
        .map(ex => {
            let targetSets = [];
            if (Array.isArray(ex.loggedSets)) {
                targetSets = ex.loggedSets;
            } else if (Array.isArray(ex.series)) {
                targetSets = ex.series;
            } else if (Array.isArray(ex.sets)) {
                targetSets = ex.sets;
            }

            const validSets = targetSets.filter(set => {
                if (!set || typeof set !== 'object') return false;

                const isWarmup = set.is_warmup || set.warmup || set.isWarmup;
                
                const rawWeight = String(set.weight || set.kg || set.peso || '').replace(',', '.').trim();
                const weightVal = parseFloat(rawWeight) || 0;
                
                // 🛠️ RISOLTO: Gestisce le stringhe delle tecniche (es. "10+8+6") estraendo solo il set base ed evitando numeri giganti
                const cleanRepsStr = set.reps && String(set.reps).includes('+') 
                    ? String(set.reps).split('+')[0] 
                    : String(set.reps || '');
                const repsVal = parseInt(cleanRepsStr.replace(/\D+/g, ''), 10) || 0;

                const hasValidWeightReps = weightVal > 0 && repsVal > 0;

                return !isWarmup && (set.completed === true || set.isLocked === true || hasValidWeightReps);
            });

            return {
                ...ex,
                sets: validSets,
                category: ex.category || (ex.target_reps && parseInt(ex.target_reps, 10) <= 6 ? 'Forza' : 'Ipertrofia')
            };
        })
        .filter(ex => ex.sets.length > 0);
}
export function calculateNetVolume(sets) {
    if (!sets) return 0;
    const setsArray = Array.isArray(sets) ? sets : Object.values(sets);
    
    return setsArray.reduce((sum, s) => {
        const w = parseFloat(String(s.weight || s.kg || s.peso || '0').replace(',', '.')) || 0;
        const r = parseInt(String(s.reps || s.repetition || s.ripetizioni || '0').replace(/\D+/g, ''), 10) || 0;
        return sum + (w * r);
    }, 0);
}

/**
 * Helper: Estrae in modo ricorsivo tutti i giorni da qualsiasi struttura dati (incluso history)
 */
export function extractAllDays(data) {
    const days = [];
    if (!data) return days;

    const processMeso = (meso, mesoNum = null) => {
        if (!meso || typeof meso !== 'object') return;
        const currentMesoNum = mesoNum || meso.mesoNumber || meso.id || meso.number || 1;
        
        if (Array.isArray(meso.weeks)) {
            meso.weeks.forEach(w => {
                if (Array.isArray(w?.days)) {
                    w.days.forEach(d => {
                        days.push({
                            ...d,
                            mesoNumber: d.mesoNumber ?? currentMesoNum,
                            weekNumber: d.weekNumber ?? w.weekNumber ?? w.number
                        });
                    });
                }
            });
        } else if (Array.isArray(meso.days)) {
            meso.days.forEach(d => {
                days.push({
                    ...d,
                    mesoNumber: d.mesoNumber ?? currentMesoNum
                });
            });
        }
    };

    const searchMesos = (node) => {
        if (!node || typeof node !== 'object') return;

        if (Array.isArray(node.weeks) || Array.isArray(node.days)) {
            processMeso(node);
            return;
        }

        if (Array.isArray(node)) {
            node.forEach(item => searchMesos(item));
            return;
        }

        Object.values(node).forEach(val => searchMesos(val));
    };

    searchMesos(data);
    return days;
}

/**
 * Helper: Estrae in modo ricorsivo tutti i mesocicli disponibili per il confronto
 */
export function extractAllMesocycles(data) {
    const mesos = [];
    if (!data) return mesos;

    const searchMesos = (node) => {
        if (!node || typeof node !== 'object') return;

        if (Array.isArray(node.weeks) || Array.isArray(node.days)) {
            mesos.push({
                ...node,
                name: node.name || `Mesociclo ${mesos.length + 1}`
            });
            return;
        }

        if (Array.isArray(node)) {
            node.forEach(item => searchMesos(item));
            return;
        }

        Object.values(node).forEach(val => searchMesos(val));
    };

    searchMesos(data);
    return mesos;
}

/**
 * Estrae tutti i mesocicli reali gestendo sia Array che Oggetti (es. state.workoutData.history)
 */
export function getAllMesocyclesList(data) {
    if (!data) return [];
    
    const rawHistory = data.history || data.mesocycles || data;
    let mesoArray = [];

    if (Array.isArray(rawHistory)) {
        mesoArray = rawHistory;
    } else if (typeof rawHistory === 'object' && rawHistory !== null) {
        mesoArray = Object.entries(rawHistory).map(([key, val]) => ({
            id: key,
            ...(typeof val === 'object' ? val : {}),
            name: val?.name || val?.title || `Mesociclo (${key.substring(0, 8)})`
        }));
    }

    return mesoArray.filter(m => m && typeof m === 'object' && (m.weeks || m.days));
}

/**
 * Estrae l'elenco univoco dei nomi degli esercizi da un determinato mesociclo (pulito da duplicati e varianti di maiuscole/minuscole)
 */
export function getExerciseNamesFromMeso(meso) {
    if (!meso) return [];
    const exerciseNamesMap = new Map(); // Mappa per gestire l'unicità normalizzata (lowercase -> nome originale pulito)

    const days = extractAllDays(meso);
    days.forEach(day => {
        const exs = day.exercises || day.esercizi || day.exerciseList;
        if (!exs) return;
        
        const arr = Array.isArray(exs) ? exs : Object.values(exs);
        arr.forEach(ex => {
            const name = ex?.name || ex?.nome || ex?.exerciseName;
            if (name && typeof name === 'string' && name.trim() !== '' && !ex.is_excluded && !ex.isExcluded) {
                const trimmedName = name.trim();
                const lowerKey = trimmedName.toLowerCase();
                // Salviamo la versione pulita evitando duplicati dovuti a casing o doppioni nel blocco
                if (!exerciseNamesMap.has(lowerKey)) {
                    exerciseNamesMap.set(lowerKey, trimmedName);
                }
            }
        });
    });

    return Array.from(exerciseNamesMap.values()).sort((a, b) => a.localeCompare(b));
}

/**
 * Helper: Recupera l'oggetto del mesociclo attualmente selezionato dal dropdown
 */
export function getSelectedMesoData(workoutData) {
    if (!workoutData) return null;
    const mesoSelect = document.getElementById('macro-meso-select') || document.getElementById('analytics-meso-select');
    const mesos = getAllMesocyclesList(workoutData);
    if (mesos.length === 0) return workoutData;

    if (mesoSelect && mesoSelect.value) {
        const found = mesos.find(m => String(m.id) === String(mesoSelect.value));
        if (found) return found;
    }
    return mesos[0] || workoutData;
}

/**
 * Inizializza il selettore del Mesociclo nella vista Macro
 */
export function initMacroMesoSelector(workoutData) {
    const mesoSelect = document.getElementById('macro-meso-select') || document.getElementById('analytics-meso-select');
    if (!mesoSelect || !workoutData) return;

    const mesos = getAllMesocyclesList(workoutData);
    if (mesos.length === 0) return;

    const currentVal = mesoSelect.value;
    mesoSelect.innerHTML = '';

    mesos.forEach((meso, idx) => {
        const opt = document.createElement('option');
        opt.value = meso.id || idx;
        opt.textContent = meso.name || `Mesociclo ${idx + 1}`;
        mesoSelect.appendChild(opt);
    });

    if (currentVal && mesos.some(m => String(m.id) === currentVal)) {
        mesoSelect.value = currentVal;
    }

    mesoSelect.onchange = () => {
        refreshCurrentAnalyticsView();
    };
}

/**
 * Filtra la lista dei giorni in base al range temporale selezionato
 */
export function filterDaysByRange(days, range = 'meso') {
    if (!days || !Array.isArray(days)) return [];
    if (range === 'all') return days;

    const now = new Date();

    return days.filter(day => {
        if (!day) return false;

        if (range === 'meso') {
            if (day.isCurrentMeso === true) return true;
            if (day.mesoNumber !== undefined && day.mesoNumber !== null) {
                return String(day.mesoNumber) === String(state.currentMeso);
            }
            return true;
        }

        const dateStr = day.date || day.completedAt || day.timestamp || day.created_at;
        if (!dateStr) return true;

        const sessionDate = new Date(dateStr);
        if (isNaN(sessionDate.getTime())) return true;

        if (range === '3m') {
            const limit = new Date();
            limit.setMonth(now.getMonth() - 3);
            return sessionDate >= limit;
        }

        if (range === '1y') {
            const limit = new Date();
            limit.setFullYear(now.getFullYear() - 1);
            return sessionDate >= limit;
        }

        return true;
    });
}

export function calculate1RM(weight, reps) {
    if (!weight || !reps || reps <= 0 || reps > 10) return 0;
    if (reps === 1) return weight;
    return Math.round((weight * (1 + reps / 30)) * 10) / 10;
}

export function extractExercisePRs(exerciseLogs) {
    let maxWeight = 0;
    let maxSetVolume = 0;
    let maxRepsAtTarget = { weight: 0, reps: 0 };

    exerciseLogs.forEach(log => {
        (log.sets || []).forEach(s => {
            const w = parseFloat(String(s.weight || s.kg || s.peso || '0').replace(',', '.')) || 0;
            const r = parseInt(String(s.reps || s.repetition || s.ripetizioni || '0').replace(/\D+/g, ''), 10) || 0;
            const setVol = w * r;

            if (w > maxWeight) maxWeight = w;
            if (setVol > maxSetVolume) maxSetVolume = setVol;
            if (r > maxRepsAtTarget.reps) maxRepsAtTarget = { weight: w, reps: r };
        });
    });

    return { maxWeight, maxSetVolume, maxRepsAtTarget };
}

export function renderMacroKPIs(workoutData, range = currentRange) {
    let targetData = workoutData;
    if (range === 'meso') {
        targetData = getSelectedMesoData(workoutData);
    }

    const allDays = extractAllDays(targetData);
    const days = range === 'meso' ? allDays : filterDaysByRange(allDays, range);
    
    let completedSessions = 0;
    let totalTonnage = 0;
    let rpeSum = 0;
    let rpeCount = 0;

    days.forEach(day => {
        if (day.completed || day.is_completed) completedSessions++;
        const validExs = filterValidSets(day.exercises || day.esercizi || []);
        validExs.forEach(ex => {
            totalTonnage += calculateNetVolume(ex.sets);
            ex.sets.forEach(s => {
                const rpeVal = parseRPE(s.rpe);
                if (rpeVal > 0) {
                    rpeSum += rpeVal;
                    rpeCount++;
                }
            });
        });
    });

    const totalPrescribed = days.length || 1;
    const adherence = Math.min(100, Math.round((completedSessions / totalPrescribed) * 100));
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
            } else if (avgRPE !== 'N/D') {
                badge.className = 'status-badge badge-success';
                badge.innerText = '🟢 Fatica Ottimale';
            } else {
                badge.className = 'status-badge';
                badge.innerText = '⚪ Nessun dato RPE';
            }
        }
    }
}

export function renderMuscleVolumeChart(canvasId, workoutData, range = currentRange) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;

    if (activeCharts[canvasId]) activeCharts[canvasId].destroy();

    let targetData = workoutData;
    if (range === 'meso') {
        targetData = getSelectedMesoData(workoutData);
    }

    const allDays = extractAllDays(targetData);
    const days = range === 'meso' ? allDays : filterDaysByRange(allDays, range);
    const muscleGroups = {};
    
    const uniqueWeeks = new Set();
    days.forEach(d => {
        if (d.weekNumber || d.week) uniqueWeeks.add(d.weekNumber || d.week);
    });
    
    const totalWeeks = uniqueWeeks.size || 1;

    days.forEach(day => {
        const validExs = filterValidSets(day.exercises || day.esercizi || []);
        validExs.forEach(ex => {
            let muscle = ex.muscle_group || ex.target_muscle || ex.category || 'Generico';
            
            // 🛠️ RISOLTO: Mappa i tag specialistici di MyCoatch ("Back_Lats", "Back_Thickness") sull'etichetta "Dorso" della UI
            if (muscle.toLowerCase().includes('back_') || muscle.toLowerCase() === 'schiena') {
                muscle = 'Dorso';
            }

            if (!muscleGroups[muscle]) muscleGroups[muscle] = 0;
            muscleGroups[muscle] += ex.sets.length;
        });
    });

    const labels = Object.keys(muscleGroups);
    const dataValues = Object.values(muscleGroups).map(totalSets => 
        Math.round((totalSets / totalWeeks) * 10) / 10
    );

    activeCharts[canvasId] = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels.length ? labels : ['Petto', 'Dorso', 'Gambe', 'Spalle', 'Braccia'],
            datasets: [{
                label: 'Hard Sets Medie / Settimana',
                data: dataValues.length ? dataValues: [0, 0, 0, 0, 0],
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
            scales: { x: { beginAtZero: true, title: { display: true, text: 'Media Serie Effettive / Settimana' } } }
        }
    });
}

export function renderLoadVsRPEChart(canvasId, sessionLogs) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;

    if (activeCharts[canvasId]) activeCharts[canvasId].destroy();

    const labels = [];
    const loadData = [];
    const rpeData = [];

    sessionLogs.forEach((ex, idx) => {
        labels.push(`Sess ${idx + 1}`);
        const validSets = ex.sets || [];
        
        const maxLoad = validSets.length > 0 
            ? Math.max(...validSets.map(s => parseFloat(String(s.weight || s.kg || s.peso || '0').replace(',', '.')) || 0), 0) 
            : 0;
        
        const rpeSets = validSets
            .map(s => parseRPE(s.rpe))
            .filter(rpeVal => rpeVal > 0);

        const avgRpe = rpeSets.length > 0 
            ? rpeSets.reduce((a, b) => a + b, 0) / rpeSets.length 
            : 0;

        loadData.push(maxLoad);
        rpeData.push(avgRpe > 0 ? parseFloat(avgRpe.toFixed(1)) : null);
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
                    tension: 0.3,
                    fill: true
                },
                {
                    label: 'RPE Percepito',
                    data: rpeData,
                    borderColor: '#f97316',
                    borderDash: [5, 5],
                    yAxisID: 'yRPE',
                    tension: 0.3,
                    spanGaps: true
                }
            ]
        },
        options: {
            responsive: true,
            scales: {
                yLoad: { type: 'linear', position: 'left', title: { display: true, text: 'Kg' }, beginAtZero: true },
                yRPE: { type: 'linear', position: 'right', min: 1, max: 10, title: { display: true, text: 'RPE' }, grid: { drawOnChartArea: false } }
            }
        }
    });
}

export function initAnalyticsEvents(workoutData) {
    const mesoSelect = document.getElementById('macro-meso-select') || document.getElementById('analytics-meso-select');
    const exSelect = document.getElementById('analytics-ex-select') || document.getElementById('micro-exercise-select');
    
    if (!workoutData) return;

    const mesos = getAllMesocyclesList(workoutData);

    if (mesoSelect) {
        const currentSelectedMeso = mesoSelect.value;
        mesoSelect.innerHTML = '';

        if (mesos.length === 0) {
            mesoSelect.innerHTML = '<option value="">Nessun mesociclo trovato</option>';
        } else {
            mesos.forEach((meso, idx) => {
                const opt = document.createElement('option');
                opt.value = meso.id || idx;
                opt.textContent = meso.name || `Mesociclo ${idx + 1}`;
                mesoSelect.appendChild(opt);
            });

            if (currentSelectedMeso && mesos.some(m => String(m.id) === currentSelectedMeso)) {
                mesoSelect.value = currentSelectedMeso;
            }
        }

        mesoSelect.onchange = () => {
            updateExerciseDropdown();
        };
    }

    const updateExerciseDropdown = () => {
        if (!exSelect) return;

        let targetData = workoutData;
        if (mesoSelect && mesoSelect.value) {
            const found = mesos.find(m => String(m.id) === String(mesoSelect.value));
            if (found) targetData = found;
        }

        const exerciseNames = getExerciseNamesFromMeso(targetData);
        const previousEx = exSelect.value;

        exSelect.innerHTML = '';

        if (exerciseNames.length === 0) {
            exSelect.innerHTML = '<option value="">-- Nessun esercizio trovato --</option>';
            updateMicroView('');
            return;
        }

        exSelect.innerHTML = '<option value="">-- Seleziona un esercizio --</option>';
        exerciseNames.forEach(exName => {
            const opt = document.createElement('option');
            opt.value = exName;
            opt.textContent = exName;
            exSelect.appendChild(opt);
        });

        if (previousEx && exerciseNames.includes(previousEx)) {
            exSelect.value = previousEx;
            updateMicroView(previousEx);
        } else if (exerciseNames.length > 0) {
            exSelect.value = exerciseNames[0];
            updateMicroView(exerciseNames[0]);
        }
    };

    const updateMicroView = (selectedName) => {
        if (!selectedName) {
            const elWeight = document.getElementById('pr-max-weight');
            const elVol = document.getElementById('pr-max-set-vol');
            const elReps = document.getElementById('pr-max-reps');
            if (elWeight) elWeight.innerText = `-- kg`;
            if (elVol) elVol.innerText = `-- kg`;
            if (elReps) elReps.innerText = `-- reps`;
            if (activeCharts['chart-load-rpe']) activeCharts['chart-load-rpe'].destroy();
            return;
        }

        // Isolamento rigoroso del target basato unicamente sul mesociclo selezionato nel menu
        let targetData = workoutData;
        if (mesoSelect && mesoSelect.value) {
            const found = mesos.find(m => String(m.id) === String(mesoSelect.value));
            if (found) targetData = found;
        }

        // Estrae i giorni solo di questo specifico mesociclo
        const days = extractAllDays(targetData);
        const logs = [];
        days.forEach(day => {
            const rawExs = day.exercises || day.esercizi || [];
            const arr = Array.isArray(rawExs) ? rawExs : Object.values(rawExs);
            const found = arr.find(x => {
                const xName = x?.name || x?.nome || x?.exerciseName;
                return xName && xName.trim().toLowerCase() === selectedName.trim().toLowerCase() && !x.is_excluded && !x.isExcluded;
            });
            if (found) logs.push(found);
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

    if (exSelect) {
        exSelect.onchange = (e) => updateMicroView(e.target.value);
    }

    updateExerciseDropdown();
}

export function initMesoCompareSelectors(data) {
    const selectA = document.getElementById('compare-meso-a');
    const selectB = document.getElementById('compare-meso-b');
    if (!selectA || !selectB || !data) return;

    const mesos = extractAllMesocycles(data);
    if (mesos.length === 0) return;

    selectA.innerHTML = '';
    selectB.innerHTML = '';

    mesos.forEach((meso, idx) => {
        const optA = document.createElement('option');
        optA.value = idx;
        optA.textContent = meso.name;
        selectA.appendChild(optA);

        const optB = document.createElement('option');
        optB.value = idx;
        optB.textContent = meso.name;
        selectB.appendChild(optB);
    });

    if (mesos.length > 1) selectB.value = 1;

    const updateCompareChart = () => {
        const mesoA = mesos[parseInt(selectA.value, 10)] || mesos[0];
        const mesoB = mesos[parseInt(selectB.value, 10)] || mesos[0];
        renderMesoComparisonChart('chart-compare-mesos', mesoA, mesoB);
    };

    selectA.onchange = updateCompareChart;
    selectB.onchange = updateCompareChart;

    updateCompareChart();
}

export function extractMesoMetrics(mesoData) {
    if (!mesoData) return [0, 0, 0, 0, 0];

    const weeksCount = mesoData.weeks?.length || 1;
    const totalPrescribed = mesoData.total_prescribed_sessions || 1;
    const completedSessions = mesoData.completed_sessions || 0;
    const adherence = Math.min(100, Math.round((completedSessions / totalPrescribed) * 100));

    let totalVolume = 0;
    let strengthTonnage = 0;
    let hardSetsCount = 0;
    let rpeSum = 0;
    let rpeCount = 0;

    const days = extractAllDays(mesoData);
    days.forEach(day => {
        const validExs = filterValidSets(day.exercises || day.esercizi || []);
        validExs.forEach(ex => {
            const netVol = calculateNetVolume(ex.sets);
            totalVolume += netVol;
            
            if (ex.category === 'Forza') {
                strengthTonnage += netVol;
            }

            hardSetsCount += ex.sets.length;
            ex.sets.forEach(s => {
                const rpeVal = parseRPE(s.rpe);
                if (rpeVal > 0) {
                    rpeSum += rpeVal;
                    rpeCount++;
                }
            });
        });
    });

    const avgRPE = rpeCount > 0 ? (rpeSum / rpeCount) : 0;
    const weeklyHardSets = hardSetsCount / weeksCount;

    const normVolume = Math.min(100, Math.round((totalVolume / 50000) * 100));
    const normRPE = Math.min(100, Math.round((avgRPE / 10) * 100));
    const normAdherence = adherence;
    const normStrength = Math.min(100, Math.round((strengthTonnage / 20000) * 100));
    const normSets = Math.min(100, Math.round((weeklyHardSets / 25) * 100));

    return [normVolume, normRPE, normAdherence, normStrength, normSets];
}

export function renderMesoComparisonChart(canvasId, rawMesoA, rawMesoB) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;

    if (activeCharts[canvasId]) activeCharts[canvasId].destroy();

    const dataA = rawMesoA ? extractMesoMetrics(rawMesoA) : [0, 0, 0, 0, 0];
    const dataB = rawMesoB ? extractMesoMetrics(rawMesoB) : [0, 0, 0, 0, 0];

    activeCharts[canvasId] = new Chart(ctx, {
        type: 'radar',
        data: {
            labels: ['Volume Totale', 'Intensità (RPE)', 'Aderenza %', 'Tonnellaggio Forza', 'Hard Sets / Wk'],
            datasets: [
                {
                    label: rawMesoA?.name || 'Mesociclo A',
                    data: dataA,
                    borderColor: '#3b82f6',
                    backgroundColor: 'rgba(59, 130, 246, 0.2)',
                },
                {
                    label: rawMesoB?.name || 'Mesociclo B',
                    data: dataB,
                    borderColor: '#10b981',
                    backgroundColor: 'rgba(16, 185, 129, 0.2)',
                }
            ]
        },
        options: {
            responsive: true,
            scales: { r: { angleLines: { display: true }, suggestedMin: 0, suggestedMax: 100 } }
        }
    });
}

export function refreshCurrentAnalyticsView(range = currentRange) {
    if (range) currentRange = range;

    const activeSubtab = document.querySelector('.sub-tab-content.active')?.id || 'subtab-macro';
    const data = state.workoutData;
    if (!data) return;

    if (activeSubtab === 'subtab-macro') {
        initMacroMesoSelector(data);
        renderMacroKPIs(data, currentRange);
        renderMuscleVolumeChart('chart-muscle-volume', data, currentRange);
    } else if (activeSubtab === 'subtab-micro') {
        initAnalyticsEvents(data, currentRange);
    } else if (activeSubtab === 'subtab-compare') {
        initMesoCompareSelectors(data, currentRange);
    }
}

export function switchAnalyticsTab(tabId) {
    if (!tabId) return;

    document.querySelectorAll('.sub-tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.sub-tab-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.getAttribute('onclick')?.includes(tabId)) {
            btn.classList.add('active');
        }
    });

    const targetContent = document.getElementById(tabId);
    if (targetContent) targetContent.classList.add('active');

    refreshCurrentAnalyticsView();
}

export function initFilterBarEvents() {
    const filterBtns = document.querySelectorAll('.analytics-filter-bar .filter-btn');
    filterBtns.forEach(btn => {
        btn.onclick = (e) => {
            filterBtns.forEach(b => b.classList.remove('active'));
            e.currentTarget.classList.add('active');
            const range = e.currentTarget.dataset.range || 'meso';
            refreshCurrentAnalyticsView(range);
        };
    });
}

// Esposizione Scope Globale e Inizializzazione Listener
if (typeof window !== 'undefined') {
    window.switchAnalyticsTab = switchAnalyticsTab;
    window.refreshCurrentAnalyticsView = refreshCurrentAnalyticsView;
    window.extractAllDays = extractAllDays;
    window.getAllMesocyclesList = getAllMesocyclesList;
    window.getExerciseNamesFromMeso = getExerciseNamesFromMeso;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initFilterBarEvents);
    } else {
        initFilterBarEvents();
    }
}