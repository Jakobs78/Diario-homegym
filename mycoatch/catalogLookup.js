import {EXERCISE_DATABASE} from './exercisesDB.js';
import {canonicalExerciseKey} from './exerciseIdentity.js';
const byName=new Map(EXERCISE_DATABASE.map(ex=>[canonicalExerciseKey(ex.name),ex]));
const byId=new Map(EXERCISE_DATABASE.map(ex=>[ex.id,ex]));
/** An explicit personal choice wins over catalog guesses and future aliases. */
export function catalogExercise(value){
 if(typeof value==='string')return byName.get(canonicalExerciseKey(value))||null;
 if(!value||value.catalogMapping?.custom)return null;
 const mapping=value.catalogMapping;
 if(mapping?.confirmed)return byName.get(canonicalExerciseKey(mapping.name))||null;
 return byId.get(value.exerciseId)||byName.get(canonicalExerciseKey(value.name))||null;
}
