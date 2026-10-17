/**
 * Pure outline for complete mesocycle PDF: preserve week/day boundaries and
 * prescription fields. Do not convert planned RPE into actual performance.
 */
export function buildMesocyclePdfOutline(meso) {
    const rows=[];
    for(const [wIdx,week] of (meso?.weeks || []).entries()){
        rows.push({kind:'week',title:'Settimana '+String(week.weekNumber || wIdx+1)+
            (week.isDeloadWeek?' (scarico)':'')});
        for(const [dIdx,day] of (week.days || []).entries()){
            rows.push({kind:'day',title:day.dayName || 'Giorno '+String(day.dayNumber || dIdx+1)});
            for(const [eIdx,ex] of (day.exercises || []).entries()){
                const count=ex.setsCount ?? (Array.isArray(ex.sets)?ex.sets.length:
                    Array.isArray(ex.loggedSets)?ex.loggedSets.length:ex.set || '?');
                const reps=ex.reps || ex.targetReps || 'da definire';
                const rpe=ex.targetRpe || ex.rpeTarget || ex.rpe || 'da misurare';
                const rest=ex.restTime || ex.rest || ex.recupero || 'da definire';
                const kgMin=ex.kgMin || '';
                const kgMax=ex.kgMax || '';
                const weight=kgMin && kgMax ? kgMin+'–'+kgMax+' kg':
                    kgMin ? kgMin+' kg':'kg da calibrare';
                const top=ex.topset?' · Top set: '+String(ex.topset):'';
                rows.push({
                    kind:'exercise',
                    text:(eIdx+1)+'. '+(ex.name || 'Esercizio')+' · '+count+
                        ' serie × '+reps+' reps · RPE target '+rpe+
                        ' · recupero '+rest+' · '+weight+top,
                    notes:String(ex.notes || '')
                });
            }
        }
    }
    return rows;
}


/**
 * Read-only export of the whole diary within one mesocycle. Real results
 * always come from loggedSets; prescribed sets are never reported as done.
 * Archived repetitions are printed separately from the current day.
 */
export function buildMesocyclePdfDetails(meso) {
    const rows = [];
    const value = input => input === null || input === undefined || String(input).trim() === ''
        ? '—' : String(input);
    const detailsForExercises = exercises => {
        for (const [exIdx, ex] of (exercises || []).entries()) {
            const count = ex.setsCount ?? (Array.isArray(ex.sets) ? ex.sets.length :
                Array.isArray(ex.loggedSets) ? ex.loggedSets.length : ex.set || '?');
            const reps = ex.reps || ex.targetReps || 'da definire';
            const rpe = ex.targetRpe || ex.rpeTarget || ex.rpe || 'da definire';
            const rest = ex.restTime || ex.rest || ex.recupero || 'da definire';
            const min = value(ex.kgMin);
            const max = value(ex.kgMax);
            const prescribedKg = min !== '—' && max !== '—' ? min + '–' + max + ' kg' :
                min !== '—' ? min + ' kg' : 'kg da definire';
            rows.push({
                kind: 'exercise',
                title: String(exIdx + 1) + '. ' + (ex.name || 'Esercizio'),
                block: ex.block || exIdx + 1,
                prescription: String(count) + ' serie · ' + reps + ' rip. · RPE target ' + rpe +
                    ' · recupero ' + rest + ' · ' + prescribedKg +
                    (ex.topset ? ' · Top set ' + ex.topset : ''),
                excluded: Boolean(ex.isWarmup || ex.isExcluded || ex.is_excluded)
            });
            if (String(ex.notes ?? '').trim()) rows.push({
                kind: 'note', label: 'NOTE ALLENATORE', text: String(ex.notes)
            });
            const logs = Array.isArray(ex.loggedSets) ? ex.loggedSets : [];
            if (!logs.length) rows.push({kind: 'notice', text: 'Nessuna serie registrata.'});
            else {
                rows.push({kind: 'set-head'});
                for (const [setIdx, set] of logs.entries()) {
                    rows.push({
                        kind: 'set',
                        number: value(set.setNumber ?? setIdx + 1),
                        weight: value(set.weight),
                        reps: value(set.reps),
                        rpe: value(set.rpe),
                        confirmed: set.isLocked === true || set.completed === true,
                        warmup: Boolean(set.isWarmup || set.warmup || set.is_warmup),
                        technique: value(set.intensityTechnique) === '—' ? '' : String(set.intensityTechnique)
                    });
                    if (Array.isArray(set.dropSegments)) {
                        for (const [idx, drop] of set.dropSegments.entries()) rows.push({
                            kind: 'drop',
                            text: 'Scarico ' + (idx + 1) + ': ' + value(drop.weight) + ' kg · ' +
                                value(drop.reps) + ' rip. · RPE ' + value(drop.rpe)
                        });
                    }
                    if (set.dropSkipped === true) rows.push({kind: 'drop', text: 'Scarichi non eseguiti.'});
                }
            }
            if (String(ex.userNotes ?? '').trim()) rows.push({
                kind: 'note', label: 'NOTE PERSONALI', text: String(ex.userNotes)
            });
        }
    };
    for (const [wIdx, week] of (meso?.weeks || []).entries()) {
        rows.push({
            kind: 'week',
            title: 'Settimana ' + (week.weekNumber ?? wIdx + 1) +
                (week.isDeloadWeek ? ' (scarico)' : '')
        });
        for (const [dIdx, day] of (week.days || []).entries()) {
            rows.push({
                kind: 'day',
                title: day.dayName || 'Giorno ' + (day.dayNumber ?? dIdx + 1),
                date: value(day.date)
            });
            const archives = Array.isArray(day.sessionArchives) ? day.sessionArchives : [];
            archives.forEach((archive, index) => {
                rows.push({
                    kind: 'session',
                    title: 'Ripetizione archiviata ' + (index + 1),
                    date: value(archive.sessionDate || String(archive.capturedAt || '').slice(0, 10))
                });
                detailsForExercises(archive.exercises);
            });
            if (archives.length) rows.push({
                kind: 'session',
                title: 'Seduta attuale',
                date: value(day.date)
            });
            detailsForExercises(day.exercises);
        }
    }
    return rows;
}
