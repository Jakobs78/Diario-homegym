import {EXERCISE_DATABASE} from './exercisesDB.js';
import {canonicalExerciseKey} from './exerciseIdentity.js';
import {resolveNearbyLoad} from './loadProposal.js';
const catalog=new Map(EXERCISE_DATABASE.map(ex=>[canonicalExerciseKey(ex.name),ex]));
export function warmupPattern(ex){
 const known=catalog.get(canonicalExerciseKey(ex?.name));
 const pattern=ex?.pattern||known?.pattern,equipment=ex?.equipment||known?.equipment;
 return !ex?.isWarmup&&!ex?.isExcluded&&!ex?.is_excluded&&['barbell','dumbbell'].includes(equipment)&&
  ['squat','hinge','horizontal_push','vertical_push','horizontal_pull'].includes(pattern)?pattern:null;
}
function integerLoad(ex,weight,equipment){
 const candidates=[];
 for(let distance=0;distance<=10;distance++)for(const target of new Set([Math.round(weight)-distance,Math.round(weight)+distance])){
  if(target<=0)continue;
  const result=resolveNearbyLoad(ex,target,equipment,{min:target,max:target});
  if(result.weight===target)candidates.push({weight:target,verified:result.verified});
 }
 return candidates.sort((a,b)=>Math.abs(a.weight-weight)-Math.abs(b.weight-weight)||a.weight-b.weight)[0]||null;
}
export function buildWarmupPlan(ex,equipment={}, {workWeight=null,previousExercises=[]}={}){
 const pattern=warmupPattern(ex);if(!pattern)return [];
 const working=Number(String(workWeight??ex.kgMin??'').replace(',','.'));
 const alreadyWarm=previousExercises.some(previous=>warmupPattern(previous)===pattern);
 const ratios=alreadyWarm?[.65]:[.5,.75];const used=new Set();
 return ratios.map((ratio,i)=>{
  const resolved=working>0?integerLoad(ex,working*ratio,equipment):null;
  const weight=resolved&&resolved.weight<working&&!used.has(resolved.weight)?resolved.weight:null;
  if(weight!==null)used.add(weight);
  return {isWarmup:true,targetKg:weight===null?'':String(weight),targetReps:String(alreadyWarm?4:i===0?8:4),verified:Boolean(weight!==null&&resolved.verified),completed:false};
 });
}
