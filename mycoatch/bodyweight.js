import {EXERCISE_DATABASE} from './exercisesDB.js';
import {canonicalExerciseKey} from './exerciseIdentity.js';
const catalog=new Map(EXERCISE_DATABASE.map(ex=>[canonicalExerciseKey(ex.name),ex]));
export function bodyweightMetadata(ex={}){
    if(!ex||typeof ex!=='object')return null;
    const mapped=ex.catalogMapping?.confirmed;
    const name=mapped?ex.catalogMapping.name:ex.name;
    const meta=catalog.get(canonicalExerciseKey(name));
    const equipment=String(mapped?ex.catalogMapping.equipment||meta?.equipment||ex.equipment:ex.equipment||meta?.equipment||'').toLowerCase();
    return equipment==='bodyweight'?{unloaded:meta?.externalLoadAllowed===false}:null;
}
export const isBodyweightExercise=ex=>bodyweightMetadata(ex)!==null;
