import {canonicalExerciseKey} from './exerciseIdentity.js';
export const PLATE_SIZES=Object.freeze([25,20,15,10,5,2.5,2,1.25,1,0.5]);
export function barbellForExercise(ex,settings={}) {
    return settings.barbellAssignments?.[canonicalExerciseKey(ex?.name)] || null;
}
// Never mix or assign the legacy undifferentiated inventory to a diameter.
export function compatiblePlates(ex,settings={}) {
    const binding=barbellForExercise(ex,settings);
    const diameter=String(binding?.diameter||'');
    if(!['50','29'].includes(diameter))return null;
    if(Array.isArray(settings.ownedBarbells) && !settings.ownedBarbells.some(bar=>
        Number(bar.weight)===Number(binding?.weight) && String(bar.diameter)===diameter))return null;
    const inventory=settings.plateInventories?.[diameter];
    const weight=Number(binding.weight);
    if(!inventory || !Number.isFinite(weight)||weight<=0)return null;
    return {inventory,weight,diameter};
}
