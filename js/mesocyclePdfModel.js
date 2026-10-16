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
