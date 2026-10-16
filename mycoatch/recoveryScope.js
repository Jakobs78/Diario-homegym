/**
 * Classifica segnali ripetuti per regione, NON diagnostica fatica sistemica.
 * Categorie ignote mantengono per precauzione il veto globale.
 */
const REGIONS=Object.freeze({
    Petto:'petto',Spalle:'spalle',Tricipiti:'tricipiti',Bicipiti:'bicipiti',
    Back_Lats:'schiena',Back_Thickness:'schiena',
    Quadricipiti:'gambe',Femorali:'gambe',Glutei:'gambe',Polpacci:'gambe',
    Core:'core'
});
export function recoveryRegion(category) {
    return Object.hasOwn(REGIONS,category)?REGIONS[category]:null;
}
export function assessRecoveryScope(history={}) {
    const repeated=Object.values(history?.byExercise || {}).filter(ex=>
        ex?.fatigueConcern===true &&
        Number(ex?.progressionEvidence?.distinctWeeks || 0)>=2);
    const fatiguedMuscles=[...new Set(repeated.map(ex=>ex.category).filter(Boolean))];
    const fatiguedRegions=[...new Set(repeated.map(ex=>recoveryRegion(ex.category)).filter(Boolean))];
    const uncertain=repeated.some(ex=>!recoveryRegion(ex.category));
    const scope=!repeated.length?'none':uncertain?'uncertain':
        fatiguedRegions.length>=2?'diffuse':'local';
    return {
        scope,recoveryRequired:scope==='diffuse'||scope==='uncertain',
        fatiguedMuscles,fatiguedRegions,
        recoverySignals:[...new Set(repeated.map(ex=>ex.name).filter(Boolean))]
    };
}
export function isRegionAffected(assessment,category) {
    const region=recoveryRegion(category);
    return Boolean(region && assessment?.fatiguedRegions?.includes(region));
}
