import {EXERCISE_DATABASE} from '../mycoatch/exercisesDB.js';
import {canonicalExerciseKey} from '../mycoatch/exerciseIdentity.js';
const catalog=new Map(EXERCISE_DATABASE.map(ex=>[canonicalExerciseKey(ex.name),ex.equipment]));
export const PLATES_AUTO_OPEN_KG=35;
export function equipmentKind(exercise){
    const explicit=String(exercise?.equipment||'').toLowerCase();
    const name=String(exercise?.name||'').toLowerCase();
    // A specific implement in the name overrides generic/legacy catalogue aliases.
    if(/manubr|dumbbell|kettlebell|cav[oi]|cable|macchina|machine|smith|multipower/.test(name+' '+explicit))return 'other';
    if(/bilanciere|barbell|barra ez/.test(name+' '+explicit))return 'barbell';
    const known=catalog.get(canonicalExerciseKey(name));
    return known==='barbell'?'barbell':known?'other':'unknown';
}
export function automaticallyShowPlates(exercise,weight){
    return equipmentKind(exercise)==='barbell' && Number(String(weight).replace(',','.'))>PLATES_AUTO_OPEN_KG;
}
