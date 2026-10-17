/**
 * Per-set volume comparison for fixed visual feedback below the kg input.
 * Only checked, real, comparable working rows of the immediately preceding
 * comparable exercise are used. The workout prescription remains untouched.
 */
const checked=set=>set?.isLocked===true||set?.completed===true;
const warmup=set=>Boolean(set?.isWarmup||set?.warmup||set?.is_warmup);
const excluded=ex=>Boolean(ex?.isWarmup||ex?.isExcluded||ex?.is_excluded);
const number=x=>{
    if(x===null||x===undefined||String(x).trim()==='')return null;
    const v=Number(String(x).trim().replace(',','.'));
    return Number.isFinite(v)?v:null;
};
const round=x=>Math.round((x+Number.EPSILON)*100)/100;
const role=(ex,index)=>{
    const s=ex?.sets?.[index]||{};
    const hasTop=Boolean(ex?.topset||ex?.topsetKg||ex?.topsetKgMin||ex?.topsetKgMax);
    return s?.isTopset || index===0 && hasTop ? 'top' : hasTop ? 'backoff' : 'straight';
};
const technique=(ex,set)=>[
    ex?.groupType||'',ex?.isDropset===true?'drop':'',
    set?.intensityTechnique||'',set?.isDropset===true?'drop':''
].join('|');

export function compareConfirmedSetVolume(current,previous,index) {
    if(!current||!previous || excluded(current)||excluded(previous) ||
        current.isDeload||previous.isDeload||current.isDeloadWeek||
        previous.isDeloadWeek|| !Number.isInteger(index)||index<0)return null;
    const logs=current.loggedSets||[],old=previous.loggedSets||[];
    if(logs.length!==old.length)return null; // changed set structure
    const a=logs[index],b=old[index];
    if(a?.dropSegments?.length || b?.dropSegments?.length)return null;
    if(!checked(a)||!checked(b)||warmup(a)||warmup(b) ||
        role(current,index)!==role(previous,index) ||
        technique(current,a)!==technique(previous,b) ||
        String(current.reps||current.targetReps||'').trim()!==
            String(previous.reps||previous.targetReps||'').trim())return null;
    // Plans with individual prescriptions may use different intensities at
    // the same ordinal row: compare only identical prescription structures.
    const planA=current.sets?.[index]||{},planB=previous.sets?.[index]||{};
    for(const key of ['targetReps','targetRpe','intensityTechnique']){
        const v=String(planA[key]??''),w=String(planB[key]??'');
        if(v!==w)return null;
    }
    const kg=number(a.weight),reps=number(a.reps);
    const prevKg=number(b.weight),prevReps=number(b.reps);
    if(kg===null||kg<=0||reps===null||reps<=0||!Number.isInteger(reps)||
        prevKg===null||prevKg<=0||prevReps===null||prevReps<=0||
        !Number.isInteger(prevReps))return null;
    const oldVolume=prevKg*prevReps,nowVolume=kg*reps;
    const delta=round(nowVolume-oldVolume);
    const percent=round(delta/oldVolume*100);
    const arrow=delta>0?'▲':delta<0?'▼':'=';
    const sign=delta>0?'+':'';
    const display=arrow+' '+sign+String(percent).replace('.',',')+'%';
    const absolute=(delta>0?'+':'')+String(delta).replace('.',',')+' kg·rep';
    return {delta,percent,display,absolute,
        status:delta>0?'positive':delta<0?'negative':'neutral',
        label:'Volume della serie rispetto all’ultima sessione comparabile: '+
            display+', '+absolute};
}

