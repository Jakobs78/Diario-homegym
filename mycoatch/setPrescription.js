/** Original per-series targets. Never read performed or proposed values here. */
export const number = value => {
    if(value===null||value===undefined||typeof value==='boolean')return null;
    const text=String(value).trim().replace(/^@/,'').replace(',','.');
    return /^\d+(?:\.\d+)?$/.test(text)?Number(text):null;
};
export function bounds(value,min=null,max=null){
    const lo=number(min),hi=number(max);
    if(lo!==null||hi!==null){const a=lo??hi,b=hi??lo;return a<=b?{min:a,max:b}:null;}
    const m=String(value??'').trim().replace(/^@/,'').replace(/,/g,'.').match(/^(\d+(?:\.\d+)?)(?:\s*[-–a]\s*(\d+(?:\.\d+)?))?$/);
    if(!m)return null;
    const a=Number(m[1]),b=Number(m[2]??m[1]);return a<=b?{min:a,max:b}:null;
}
export function setPrescription(ex,index){
    const row=ex?.sets?.[index]||{};
    const general=bounds(ex?.reps??ex?.targetReps,ex?.minReps,ex?.maxReps);
    const top=index===0?String(ex?.topset??'').match(/\b1\s*[x×]\s*(\d+(?:\s*[-–]\s*\d+)?)\s*@\s*(\d+(?:[.,]\d+)?)\s*kg/i):null;
    const ownReps=bounds(row.targetReps,row.minReps,row.maxReps);
    const inherited=ownReps&&general&&ownReps.min===general.min&&ownReps.max===general.max;
    const reps=top&&(!ownReps||inherited)?bounds(top[1]):ownReps||general;
    const rpeValue=[row.targetRpe,ex?.targetRpe,ex?.rpeTarget,ex?.rpe].find(v=>v!==undefined&&v!==null&&String(v).trim()!=='');
    const rpe=bounds(row.targetRpe,row.minRpe,row.maxRpe)||bounds(rpeValue,ex?.minRpe,ex?.maxRpe);
    const topKg=index===0?(ex?.topsetKgMin??ex?.topsetKg??top?.[2]):null;
    const kg=bounds(row.targetKg??row.plannedKg??row.kg,row.kgMin,row.kgMax)||
        bounds(null,topKg??ex?.kgMin,(index===0?ex?.topsetKgMax??topKg:null)??ex?.kgMax);
    const first=ex?.sets?.[0];
    const mixedFirst=first&&String(first.targetReps??ex.reps)!==String(row.targetReps??ex.reps);
    const hasTop=Boolean(ex?.topset||ex?.topsetKg||ex?.topsetKgMin||first?.isTopset||first?.role==='top'||
        (first&&bounds(first.targetReps)?.max<(general?.min??0)));
    const role=row.role??(row.isTopset||index===0&&hasTop?'top':index>0&&(hasTop||mixedFirst)?'backoff':'work');
    const special=Boolean(ex?.isDropset||ex?.groupType==='dropset'||ex?.groupType==='restpause'||row.intensityTechnique||String(row.targetReps??ex?.reps??'').includes('+'));
    return {index,reps,rpe,kg,role,special};
}
export const blockKey=p=>JSON.stringify([p.role,p.reps,p.rpe,p.kg]);
export const confirmed=s=>s?.isLocked===true||s?.completed===true;
export const warm=s=>Boolean(s?.isWarmup||s?.warmup||s?.is_warmup);
export function observed(ex,index){
    const s=ex?.loggedSets?.[index];
    if(!confirmed(s)||warm(s)||ex?.isWarmup||ex?.isExcluded||ex?.is_excluded||s?.intensityTechnique||s?.dropSegments?.length)return null;
    const kg=number(s.weight??s.actualKg),reps=number(s.reps??s.actualReps),rpe=number(s.rpe);
    if(kg===null||kg<=0||kg>700||!Number.isInteger(reps)||reps<1||reps>100)return null;
    return {kg,reps,rpe:rpe!==null&&rpe>=5&&rpe<=10?rpe:null,index,performedAt:s.performedAt??s.completedAt??null,prescription:setPrescription(ex,index)};
}
