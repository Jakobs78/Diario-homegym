// Product limits for newly generated proposals, not physiological thresholds.
// Imported plans keep their existing independent limits (52 weeks / 7 days).
export function generationSchedule({durationWeeks = 4, daysPerWeek = 3} = {}) {
    const weeks = Number(durationWeeks), days = Number(daysPerWeek);
    if (!['number','string'].includes(typeof durationWeeks) || String(durationWeeks).trim() === '' || !Number.isInteger(weeks) || weeks < 1 || weeks > 12)
        throw Error('Scegli una durata da 1 a 12 settimane.');
    if (!['number','string'].includes(typeof daysPerWeek) || String(daysPerWeek).trim() === '' || !Number.isInteger(days) || days < 1 || days > 6)
        throw Error('Scegli da 1 a 6 allenamenti a settimana.');
    return {durationWeeks: weeks, daysPerWeek: days};
}

// These are candidates for the existing time/coverage optimizer. More days
// redistribute the weekly work; they do not prescribe more sets per exercise.
export function additionalDayTemplates(days, base) {
    const slot = (muscle, pattern, extra = {}) => ({muscle, pattern, ...extra});
    if (days === 1) return [{name:'Full Body A (seduta essenziale)', slots:[
        slot('Quadricipiti','squat',{anchor:'squat'}),
        slot('Petto','horizontal_push',{anchor:'bench'}),
        slot('Back_Thickness','horizontal_pull'),
        slot('Femorali','hinge',{optional:true}),
        slot('Spalle','isolation',{optional:true}),
        slot('Polpacci','isolation',{optional:true})
    ]}];
    if (days === 2) return [
        {name:'Full Body A (ginocchio, petto e tirata)',slots:[
            slot('Quadricipiti','squat',{anchor:'squat'}),
            slot('Petto','horizontal_push',{anchor:'bench'}),
            slot('Back_Lats','vertical_pull'),
            slot('Femorali','isolation',{optional:true}),
            slot('Spalle','isolation',{optional:true}),
            slot('Bicipiti','isolation',{optional:true})]},
        {name:'Full Body B (anca, spinta e rematore)',slots:[
            slot('Femorali','hinge',{anchor:'hinge'}),
            slot('Spalle','vertical_push',{anchor:'military'}),
            slot('Back_Thickness','horizontal_pull'),
            slot('Petto','horizontal_push',{optional:true}),
            slot('Polpacci','isolation',{optional:true}),
            slot('Tricipiti','isolation',{optional:true})]}
    ];
    const upper = structuredClone(base[0]);
    upper.name='Upper C (richiamo e complementari)';
    upper.slots=[slot('Petto','horizontal_push'),slot('Back_Thickness','horizontal_pull'),
        slot('Spalle','isolation',{shoulderHeadIsolation:'posteriore'}),
        slot('Bicipiti','isolation',{optional:true}),slot('Tricipiti','isolation',{optional:true})];
    if (days === 5) return [...base,{name:'Full Body E (richiamo distribuito)',slots:[
        slot('Back_Thickness','horizontal_pull'),slot('Quadricipiti','squat'),
        slot('Spalle','isolation',{shoulderHeadIsolation:'posteriore',optional:true}),
        slot('Femorali','isolation',{optional:true}),slot('Core','isolation',{optional:true})]}];
    const lower={name:'Lower C (richiamo e complementari)',slots:[
        slot('Quadricipiti','squat'),slot('Femorali','hinge'),
        slot('Femorali','isolation',{optional:true}),slot('Polpacci','isolation'),
        slot('Core','isolation',{optional:true})]};
    return [...base,upper,lower];
}
