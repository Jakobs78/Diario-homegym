import {optimizeSession} from './groupOptimizer.js';
import {canonicalExerciseKey} from './exerciseIdentity.js';

const role=ex=>ex.category==='Femorali' && ex.pattern==='isolation'?'knee_flexion':ex.pattern;
const essential=['horizontal_push','vertical_push','squat','hinge','vertical_pull','horizontal_pull','knee_flexion'];
const roles=days=>new Set(days.flatMap(day=>day.exercises.map(role)));
const clean=ex=>{
    const copy=structuredClone(ex);
    for(const key of ['groupType','groupBase','isGroupLast'])delete copy[key];
    copy.notes=String(copy.notes || '').replace(/\[(?:SUPERSERIE|TRISET)\][^|]*/gi,'');
    return copy;
};

/** Repair global omissions before retaining repeated movements/accessories.
 * Only Full Body; preserve every already-covered essential role and real rests.
 */
export function repairEssentialCoverage(days,intended,minutes,options={}) {
    let result=structuredClone(days);
    const changes=[];
    if(result.length!==4 || !result.every(day=>/^Full Body/.test(day.dayName)))return {days:result,changes};
    for(const wanted of essential){
        if(roles(result).has(wanted))continue;
        const source=intended.flat().find(ex=>role(ex)===wanted);
        if(!source)continue;
        const addition=clean(source);
        addition.setsCount=Math.min(source.setsCount,minutes<=30?1:2);
        addition.sets=addition.sets.slice(0,addition.setsCount);
        addition.priorityProtected=true;
        let best=null;
        const beforeRoles=roles(result);
        for(const [di,day] of result.entries()){
            if(day.exercises.some(ex=>canonicalExerciseKey(ex.name)===canonicalExerciseKey(addition.name)))continue;
            for(let replace=-1;replace<day.exercises.length;replace++){
                if(replace===-1 && day.exercises.length>=6)continue;
                const proposal=day.exercises.map(clean).filter((_,i)=>i!==replace);
                proposal.push(structuredClone(addition));
                if(proposal.length<2)continue;
                let trial;
                try{trial=optimizeSession(proposal,minutes,options);}catch{continue;}
                if(!trial.exercises.some(ex=>role(ex)===wanted))continue;
                const daysNext=result.map((d,i)=>i===di?{...d,...trial}:d);
                const after=roles(daysNext);
                if([...beforeRoles].some(r=>essential.includes(r)&&!after.has(r)))continue;
                const lost=day.exercises.reduce((sum,ex)=>{
                    const remaining=trial.exercises.find(x=>canonicalExerciseKey(x.name)===canonicalExerciseKey(ex.name));
                    return sum+Math.max(0,ex.setsCount-(remaining?.setsCount||0))*(ex.pattern==='isolation'?1:3);
                },0);
                const cost=lost*100+trial.estimatedSeconds/1000;
                if(!best || cost<best.cost)best={daysNext,di,cost,removed:replace<0?null:day.exercises[replace].name};
            }
        }
        if(best){
            result=best.daysNext;
            const first=result[best.di].exercises[0];
            if(!String(first.notes).includes('[WARM-UP'))
                first.notes='[WARM-UP] Serie leggere di avvicinamento prima del lavoro. | '+(first.notes || '');
            result[best.di].dayName=result[best.di].dayName.match(/^Full Body [ABCD]/)?.[0] || result[best.di].dayName;
            changes.push({day:best.di+1,added:addition.name,replaced:best.removed,
                reason:'Conservare uno schema allenante assente nella settimana prima del lavoro ripetuto.'});
        }
    }
    return {days:result,changes};
}
