export {dropScope,hasDropPrescription,needsDropScope} from '../mycoatch/seriesTechnique.js';
export function validateDropSegments(baseWeight,segments,skipped=false) {
    if(skipped)return {ok:true,segments:[],skipped:true};
    if(!Array.isArray(segments)||!segments.length)return {ok:false,message:'Registra lo scarico oppure indica “Dropset non eseguito”.'};
    let previous=Number(String(baseWeight).replace(',','.'));
    const parsed=[];
    for(const s of segments){
        const weight=Number(String(s?.weight??'').replace(',','.')),reps=Number(s?.reps);
        const raw=String(s?.rpe??'').replace(',','.');const rpe=raw===''?null:Number(raw);
        if(!Number.isFinite(weight)||weight<=0||weight>=previous||!Number.isInteger(reps)||reps<1||reps>40 ||
            rpe!==null && (!Number.isFinite(rpe)||rpe<6||rpe>10))
            return {ok:false,message:'Ogni scarico richiede un peso inferiore alla fase precedente, 1–40 ripetizioni e RPE 6–10 oppure vuoto.'};
        parsed.push({weight,reps,rpe});previous=weight;
    }
    return {ok:true,segments:parsed,skipped:false};
}
