/** Shared interpretation of prescribed techniques and recorded execution.
 * Unknown drop scope stays conservative; ordinary rows before a last-set drop
 * remain ordinary. A skipped drop never invents performed extra segments.
 */
export function dropScope(exercise) {
    if(['last','all'].includes(exercise?.dropSetScope))return exercise.dropSetScope;
    const notes=String(exercise?.notes||'').toLowerCase();
    if(!exercise?.isDropset && exercise?.groupType!=='dropset' && !/drop[ _-]?set|dropserie/.test(notes))return null;
    if(/\[drop_scope:last\]|(?:dopo|su|solo).*ultim[ao]\s+seri[ea]/.test(notes))return 'last';
    if(/\[drop_scope:all\]|(?:ogni|tutte le)\s+seri[ea]/.test(notes))return 'all';
    return null;
}
export function hasDropPrescription(exercise,index) {
    const plan=exercise?.sets?.[index];
    if(plan?.intensityTechnique==='DROP_SET'||plan?.isDropset)return true;
    const scope=dropScope(exercise);
    const count=Math.max(exercise?.loggedSets?.length||0,exercise?.sets?.length||0,parseInt(exercise?.setsCount??exercise?.set,10)||1);
    return scope==='all'||scope==='last'&&index===count-1;
}
export function needsDropScope(exercise) {
    return Boolean((exercise?.isDropset||exercise?.groupType==='dropset')&&!dropScope(exercise)&&
        !(exercise.sets||[]).some(s=>s.intensityTechnique==='DROP_SET'||s.isDropset));
}
export function specialSeries(exercise,index,set=exercise?.loggedSets?.[index]) {
    const row=exercise?.sets?.[index]||{};
    if(set?.dropSegments?.length||String(set?.reps??'').includes('+'))return true;
    const skipped=set?.dropSkipped===true;
    if(set?.intensityTechnique&&!(skipped&&set.intensityTechnique==='DROP_SET'))return true;
    if(row.intensityTechnique&&!(skipped&&row.intensityTechnique==='DROP_SET'))return true;
    if(exercise?.groupType==='restpause'||exercise?.groupType==='rest-pause')return true;
    if(String(row.targetReps??exercise?.reps??'').includes('+'))return true;
    return !skipped&&Boolean(set?.isDropset||row.isDropset||hasDropPrescription(exercise,index)||needsDropScope(exercise));
}
