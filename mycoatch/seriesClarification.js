import {blockKey,setPrescription,confirmed,warm,number} from './setPrescription.js';
import {excludedFromCoaching} from './setReview.js';
import {isExerciseSkipped} from '../js/sessionSkip.js';
export function clarificationSignature(ex){return JSON.stringify((ex.loggedSets||[]).map(s=>[s.weight,s.reps,s.rpe,confirmed(s),warm(s)]));}
export function needsSeriesClarification(ex){
 if(isExerciseSkipped(ex)||ex.isWarmup||ex.isExcluded||ex.is_excluded)return false;
 const rows=(ex.loggedSets||[]).map((s,i)=>({s,i,p:setPrescription(ex,i)})).filter(x=>!warm(x.s)&&!warm(ex.sets?.[x.i]));
 if(rows.length<2||rows.some(x=>!confirmed(x.s)))return false;
 if(ex.coachClarification?.signature===clarificationSignature(ex)&&ex.coachClarification.status==='answered')return false;
 for(const a of rows)for(const b of rows){
  if(a.i>=b.i||a.p.special||b.p.special||blockKey(a.p)!==blockKey(b.p))continue;
  if(a.s.coachReview||b.s.coachReview||excludedFromCoaching(a.s)||excludedFromCoaching(b.s))continue;
  const kgA=number(a.s.weight),kgB=number(b.s.weight),ra=number(a.s.reps),rb=number(b.s.reps);
  if(kgA===null||kgB===null||ra===null||rb===null)continue;
  if(Math.max(kgA,kgB)>Math.min(kgA,kgB)*1.10 ||
    a.p.reps&&Math.max(ra,rb)>=a.p.reps.min&&Math.min(ra,rb)<a.p.reps.min&&Math.abs(ra-rb)>=2)return true;
 }
 return false;
}
