import {parseRepsRange} from './athleteProfile.js';

/** Same-variant recent evidence only. No extrapolation above 12 reps. */
export function estimatePrescribedLoad(history,reps,rpe) {
    const range=parseRepsRange(reps),effort=Number(rpe);
    if(!range || range.min<1 || range.max>12 || !Number.isFinite(effort) || effort<6 || effort>9.5)return null;
    const samples=(history?.exposures || []).filter(ex=>!ex.isDeload && ex.allStraightSets &&
        ex.completedSets===ex.plannedSets && Number.isFinite(ex.loadReferenceE1rm) &&
        ex.loadReferenceE1rm>0).slice(-3).map(ex=>ex.loadReferenceE1rm).sort((a,b)=>a-b);
    if(!samples.length)return null;
    const reference=samples[Math.floor((samples.length-1)/2)];
    const raw=reference/(1+(range.min+10-effort)/30);
    return {raw,reference,samples:samples.length,reps:range.min,rpe:effort};
}
