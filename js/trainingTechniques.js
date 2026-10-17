/** Explicit prescriptions, separate from the performed drop segments. */
export function dropScope(exercise) {
    if(['last','all'].includes(exercise?.dropSetScope))return exercise.dropSetScope;
    const notes=String(exercise?.notes||'').toLowerCase();
    if(!exercise?.isDropset && !/drop[ _-]?set|dropserie/.test(notes))return null;
    if(/\[drop_scope:last\]|(?:dopo|su|solo).*ultim[ao]\s+seri[ea]/.test(notes))return 'last';
    if(/\[drop_scope:all\]|(?:ogni|tutte le)\s+seri[ea]/.test(notes) && exercise?.isDropset)return 'all';
    return null;
}
export function hasDropPrescription(exercise,index) {
    const plan=exercise?.sets?.[index];
    if(plan?.intensityTechnique==='DROP_SET' || plan?.isDropset)return true;
    const scope=dropScope(exercise);
    return scope==='all' || scope==='last' && index===(exercise?.loggedSets?.length||exercise?.sets?.length||1)-1;
}
export function needsDropScope(exercise) {
    return Boolean(exercise?.isDropset && !dropScope(exercise) &&
        !(exercise.sets||[]).some(s=>s.intensityTechnique==='DROP_SET'||s.isDropset));
}
export function validateDropSegments(baseWeight,segments,skipped=false) {
    if(skipped)return {ok:true,segments:[],skipped:true};
    if(!Array.isArray(segments)||!segments.length)return {ok:false,message:'Registra lo scarico oppure indica “Dropset non eseguito”.'};
    let previous=Number(String(baseWeight).replace(',','.'));
    const parsed=[];
    for(const s of segments){
        const weight=Number(String(s?.weight??'').replace(',','.')),reps=Number(s?.reps);
        const raw=String(s?.rpe??'').replace(',','.');const rpe=raw===''?null:Number(raw);
        if(!Number.isFinite(weight)||weight<=0||weight>=previous||!Number.isInteger(reps)||reps<1||reps>40 ||
            rpe!==null && (!Number.isFinite(rpe)||rpe<6||rpe>10))
            return {ok:false,message:'Ogni scarico richiede un peso inferiore alla fase precedente, 1–40 ripetizioni e RPE 6–10 oppure vuoto.'};
        parsed.push({weight,reps,rpe});previous=weight;
    }
    return {ok:true,segments:parsed,skipped:false};
}
