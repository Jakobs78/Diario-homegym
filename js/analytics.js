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
                
                const reps = String(set.reps ?? '').trim();
                const repsValid = /^[1-9]\d{0,2}(?:\+[1-9]\d{0,2})*$/.test(reps);
                // Only athlete-confirmed performed sets enter statistics. A draft with
                // weight/reps typed is NOT proof of performance.
                return !isWarmup && repsValid && weightVal > 0 &&
                    (set.completed === true || set.isLocked === true);
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
        const repsText=String(s.reps ?? s.repetition ?? s.ripetizioni ?? '').trim();
        // Drops/rest-pause have different loads across phases; only the
        // first measured stage can be valued without inventing extra kg.
        const match=/^([1-9]\d{0,2})(?:\+[1-9]\d{0,2})*$/.exec(repsText);
        return sum + (match && w > 0 ? w * Number(match[1]) : 0);
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
    const years=data?.history?.years;
    if (years && typeof years==='object') {
        return Object.entries(years).flatMap(([year, record])=>
            (record?.mesocycles || []).map((meso,index)=>({
                ...meso,
                id:year+'/'+(meso.id ?? index),
                sourceYear:year,
                sourceIndex:index
            })));
    }
    return extractAllMesocycles(data).map((meso,index)=>({
        ...meso,id:String(meso.id ?? index)
    }));
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
    const currentYear=String(state.currentYear || new Date().getFullYear());
    return mesos.find(m=>m.sourceYear===currentYear &&
        m.sourceIndex===(state.activeMesocycleIndex || 0)) ||
        mesos[mesos.length-1] || workoutData;
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

        const dateStr = day.sessionCompletedAt || day.date ||
            day.completedAt || day.timestamp || day.created_at;
        // Undated or future scheduled sessions must not inflate a
        // historical 3-month/1-year report.
        if (!dateStr) return false;
        const sessionDate = new Date(dateStr);
        if (isNaN(sessionDate.getTime()) || sessionDate>now) return false;

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
            const repsText=String(s.reps ?? s.repetition ?? s.ripetizioni ?? '').trim();
            const match=/^([1-9]\d{0,2})(?:\+[1-9]\d{0,2})*$/.exec(repsText);
            const r=match?Number(match[1]):0;
            const setVol = w * r;

            if (w > maxWeight) maxWeight = w;
            if (setVol > maxSetVolume) maxSetVolume = setVol;
            if (w > 0 && r > maxRepsAtTarget.reps) maxRepsAtTarget = { weight: w, reps: r };
        });
    });

    return { maxWeight, maxSetVolume, maxRepsAtTarget };
}

/**
 * One entry per real completed session, including safely archived repeats.
 * A planned day without a performance date is not a completed session.
 */
export function getTrainingCalendarEntries(workoutData) {
    const sessions=[];
    for(const day of extractAllDays(workoutData)){
        const name=day.dayName || 'Allenamento';
        const push=(date,duration,source)=>{
            const text=String(date||'').slice(0,10);
            if(!/^\d{4}-\d{2}-\d{2}$/.test(text) ||
               Number.isNaN(Date.parse(text)))return;
            sessions.push({date:text,name,duration:Number.isFinite(Number(duration)) &&
                Number(duration)>0?Number(duration):null,source});
        };
        if(day.completed===true || day.is_completed===true)
            push(day.date || day.sessionCompletedAt,day.totalDurationMinutes,'current');
        for(const old of day.sessionArchives || [])
            push(old.sessionDate || old.sessionCompletedAt || old.capturedAt,
                old.totalDurationMinutes,'archive');
    }
    return sessions.sort((a,b)=>b.date.localeCompare(a.date));
}
export function renderTrainingCalendar(workoutData,range=currentRange){
    const root=document.getElementById('analytics-session-calendar');
    if(!root)return;
    root.replaceChildren();
    const data=range==='meso' ? getSelectedMesoData(workoutData) : workoutData;
    const sessions=getTrainingCalendarEntries(data).filter(item=>{
        if(range==='meso'||range==='all')return true;
        return filterDaysByRange([{date:item.date}],range).length>0;
    });
    if(!sessions.length){
        const p=document.createElement('p');
        p.textContent='Nessuna seduta completata con una data valida nel periodo.';
        root.append(p);return;
    }
    const groups=new Map();
    for(const session of sessions){
        const month=session.date.slice(0,7);
        if(!groups.has(month))groups.set(month,[]);
        groups.get(month).push(session);
    }
    for(const [month,items] of groups){
        const detail=document.createElement('details');
        detail.className='training-calendar-month';
        detail.open=groups.size===1 || month===groups.keys().next().value;
        const label=new Date(month+'-01T12:00:00');
        const summary=document.createElement('summary');
        summary.textContent=label.toLocaleDateString('it-IT',{month:'long',year:'numeric'})+
            ' · '+items.length+' sedute';
        detail.append(summary);
        const list=document.createElement('ul');
        for(const item of items){
            const row=document.createElement('li');
            row.textContent=new Date(item.date+'T12:00:00').toLocaleDateString('it-IT')+
                ' · '+item.name+(item.duration?' · '+item.duration+' min':' · durata non registrata')+
                (item.source==='archive'?' · seduta ripetuta':'');
            list.append(row);
        }
        detail.append(list);root.append(detail);
    }
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
                badge.innerText = '⚠️ RPE medio elevato: valuta il contesto';
            } else if (avgRPE !== 'N/D') {
                badge.className = 'status-badge badge-success';
                badge.innerText = 'RPE medio misurato · ' + rpeCount + ' serie';
            } else {
                badge.className = 'status-badge';
                badge.innerText = '⚪ Nessun RPE reale misurato';
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
    const plannedGroups = {};
    
    const uniqueWeeks = new Set();
    days.forEach(d => {
        const date=d.sessionCompletedAt || d.date;
        if(date && !Number.isNaN(Date.parse(date))) {
            const current=new Date(date);
            // Calendar week per year, not simply "week 1" across multiple mesocycles.
            const first=new Date(Date.UTC(current.getUTCFullYear(),0,1));
            const ordinal=Math.floor((current-first)/86400000);
            uniqueWeeks.add(current.getUTCFullYear()+'-'+Math.floor((ordinal+first.getUTCDay())/7));
        } else if (d.weekNumber || d.week) {
            uniqueWeeks.add(String(d.mesoNumber || 'meso')+'/'+(d.weekNumber || d.week));
        }
    });
    const totalWeeks = uniqueWeeks.size || 1;

    const muscleFor = ex=>{
        let muscle=String(ex.muscle_group || ex.target_muscle || ex.category || 'Generico');
        if (muscle.toLowerCase().includes('back_') || muscle.toLowerCase()==='schiena')
            muscle='Dorso';
        return muscle;
    };
    days.forEach(day=>{
        const raw=day.exercises || day.esercizi || [];
        for(const ex of Array.isArray(raw)?raw:Object.values(raw)){
            if(ex.isExcluded || ex.is_excluded)continue;
            const muscle=muscleFor(ex);
            const planned=Array.isArray(ex.sets)?ex.sets.length:
                Array.isArray(ex.loggedSets)?ex.loggedSets.length:0;
            plannedGroups[muscle]=(plannedGroups[muscle]||0)+planned;
        }
        const validExs=filterValidSets(day.exercises || day.esercizi || []);
        for(const ex of validExs){
            const muscle=muscleFor(ex);
            muscleGroups[muscle]=(muscleGroups[muscle]||0)+ex.sets.length;
        }
    });
    const labels=[...new Set([...Object.keys(plannedGroups),...Object.keys(muscleGroups)])];
    const round=x=>Math.round(x*10)/10;
    const dataValues=labels.map(muscle=>round((muscleGroups[muscle]||0)/totalWeeks));
    const plannedValues=labels.map(muscle=>round((plannedGroups[muscle]||0)/totalWeeks));

    activeCharts[canvasId] = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels.length ? labels : ['Petto', 'Dorso', 'Gambe', 'Spalle', 'Braccia'],
            datasets: [{
                label: 'Confermate / settimana',
                data: dataValues.length ? dataValues: [0, 0, 0, 0, 0],
                backgroundColor: 'rgba(59, 130, 246, 0.75)',
                borderWidth: 1,borderRadius: 6
            },{
                label: 'Previste / settimana',
                data: plannedValues.length ? plannedValues: [0, 0, 0, 0, 0],
                backgroundColor: 'rgba(148, 163, 184, 0.65)',
                borderWidth: 1,borderRadius: 6
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            plugins: { legend: { display: true } },
            scales: { x: { beginAtZero: true, title: { display: true, text: 'Serie per settimana (piano e completamento)' } } }
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
    const days=extractAllDays(mesoData);
    const weeks=Math.max(1,mesoData?.weeks?.length || 1);
    const plannedSessions=days.length;
    const completedSessions=days.filter(day=>day.completed === true || day.is_completed===true).length;
    const adherence=plannedSessions ? Math.round(100*completedSessions/plannedSessions) : 0;
    let tonnage=0,sets=0,rpeSum=0,rpeCount=0;
    for(const day of days){
        const exercises=filterValidSets(day.exercises || day.esercizi || []);
        for(const ex of exercises){
            sets+=ex.sets.length;
            tonnage+=calculateNetVolume(ex.sets);
            for(const set of ex.sets){
                const rpe=parseRPE(set.rpe);
                if(rpe>0){rpeSum+=rpe;rpeCount++;}
            }
        }
    }
    return {
        plannedSessions,completedSessions,adherence,
        tonnageKg:Math.round(tonnage),
        confirmedSets:sets,
        setsPerWeek:Math.round(sets/weeks*10)/10,
        averageRpe:rpeCount?Math.round(rpeSum/rpeCount*10)/10:null,
        rpeMeasurements:rpeCount
    };
}

export function renderMesoComparisonChart(canvasId, rawMesoA, rawMesoB) {
    const canvas=document.getElementById(canvasId);
    if(!canvas)return;
    if(activeCharts[canvasId]) {
        activeCharts[canvasId].destroy();
        delete activeCharts[canvasId];
    }
    // Do not compare arbitrarily normalized values as if they were
    // athlete-performance outcomes. Show raw units side by side instead.
    canvas.hidden=true;
    const existing=document.getElementById(canvasId+'-actual-values');
    existing?.remove();
    const a=extractMesoMetrics(rawMesoA);
    const b=extractMesoMetrics(rawMesoB);
    const table=document.createElement('table');
    table.id=canvasId+'-actual-values';
    table.className='meso-comparison-table';
    const header=document.createElement('thead');
    const body=document.createElement('tbody');
    const row=(cells,tag='td')=>{
        const tr=document.createElement('tr');
        for(const content of cells){
            const node=document.createElement(tag);
            node.textContent=String(content);tr.append(node);
        }
        return tr;
    };
    header.append(row(['Indicatore',rawMesoA?.name||'A',rawMesoB?.name||'B'],'th'));
    const values=[
        ['Sedute concluse',a.completedSessions+' / '+a.plannedSessions,
            b.completedSessions+' / '+b.plannedSessions],
        ['Aderenza',a.adherence+'%',b.adherence+'%'],
        ['Tonnellaggio misurato',a.tonnageKg+' kg',b.tonnageKg+' kg'],
        ['Serie confermate',a.confirmedSets,b.confirmedSets],
        ['Serie confermate/settimana',a.setsPerWeek,b.setsPerWeek],
        ['RPE medio registrato',a.averageRpe??'N/D',b.averageRpe??'N/D'],
        ['Serie con RPE misurato',a.rpeMeasurements,b.rpeMeasurements]
    ];
    for(const cells of values)body.append(row(cells));
    table.append(header,body);
    const note=document.createElement('p');
    note.className='text-xs text-muted';
    note.textContent='Solo serie confermate. Il tonnellaggio non misura direttamente lo stimolo ipertrofico; il primo blocco delle tecniche a carico variabile viene contato senza inventare i carichi delle fasi successive.';
    canvas.parentElement?.insertBefore(table,canvas);
    table.after(note);
    // Clear any previous explanatory paragraph from an earlier redraw.
    for(const previous of canvas.parentElement?.querySelectorAll('p.meso-comparison-description')||[])
        previous.remove();
    note.classList.add('meso-comparison-description');
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
        renderTrainingCalendar(data,currentRange);
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