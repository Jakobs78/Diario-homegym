import {canonicalExerciseKey} from './exerciseIdentity.js';

/** Validate the CSV round trip before transferring trusted proposal metadata.
 * Only unperformed prescriptions are copied; neither source nor history is mutated.
 */
export function restoreProposalMetadata(imported, proposal) {
    const result=structuredClone(imported);
    if(!proposal || result.weeks.length!==proposal.weeks?.length)
        throw Error('La proposta non corrisponde alla scheda importata: rigenera l’anteprima.');
    const copy=(to,from,keys)=>{
        for(const key of keys)if(from[key]!==undefined)to[key]=structuredClone(from[key]);
    };
    for(const [wi,week] of result.weeks.entries()){
        const original=proposal.weeks[wi];
        if(week.weekNumber!==original.weekNumber || week.days.length!==original.days?.length)
            throw Error('Settimane della proposta non corrispondenti.');
        copy(week,original,['isDeloadWeek','isDeload','targetRpe','phase','weeklyCoverage','volumeBalance']);
        for(const [di,day] of week.days.entries()){
            const before=original.days[di];
            if(day.exercises.length!==before.exercises?.length)throw Error('Esercizi della proposta non corrispondenti.');
            copy(day,before,['estimatedMinutes','estimatedSeconds','timeBudgetMinutes','selectionAudit']);
            for(const [ei,ex] of day.exercises.entries()){
                const source=before.exercises[ei];
                if(canonicalExerciseKey(ex.name)!==canonicalExerciseKey(source.name) ||
                    ex.sets.length!==source.setsCount || String(ex.reps)!==String(source.reps) ||
                    Number(ex.rpe)!==Number(source.rpe) || String(ex.kgMin)!==String(source.kgMin))
                    throw Error('Prescrizione diversa dall’anteprima: nessuna scheda applicata.');
                copy(ex,source,['anchorKey','priorityProtected','isOptional','pattern','category',
                    'equipment','shoulderHeadIsolation','setsCount','restTime','groupType','groupBase','isGroupLast']);
                ex.isDeload=Boolean(original.isDeloadWeek || original.isDeload);
                for(const [si,set] of ex.sets.entries()){
                    const prescription=source.sets?.[si] || {};
                    copy(set,prescription,['targetReps','intensityTechnique']);
                    if(prescription.targetKg && Number(prescription.targetKg)!==Number(source.kgMin))
                        set.targetKg=prescription.targetKg;
                    set.targetRpe=source.rpe;
                }
                ex.loggedSets=structuredClone(ex.sets);
            }
        }
    }
    copy(result,proposal,['periodization','coachReport','macrocycle']);
    return result;
}
