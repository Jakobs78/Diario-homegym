import {exerciseIdentity} from './exerciseIdentity.js';
import {observed} from './setPrescription.js';
/** Chronological coordinates prevent current or future rows leaking into evidence. */
export function trainingExposures(data,{year,mesoIndex,weekNumber,dayIndex,exerciseIndex=Infinity},exercise,{sameMesoOnly=false}={}){
    const result=[];
    const end=[Number(year),Number(mesoIndex),Number(weekNumber),Number(dayIndex),Number(exerciseIndex)];
    const earlier=position=>{for(let i=0;i<position.length;i++){if(position[i]!==end[i])return position[i]<end[i];}return false;};
    const identity=exerciseIdentity(exercise);
    for(const [y,yd] of Object.entries(data?.history?.years||{})){
        if(!/^\d{4}$/.test(y)||Number(y)>end[0])continue;
        for(const [mi,meso] of (yd.mesocycles||[]).entries()){
            if(sameMesoOnly&&(Number(y)!==end[0]||mi!==end[1]))continue;
            for(const w of meso.weeks||[])for(const [di,day] of (w.days||[]).entries()){
                const position=[Number(y),mi,Number(w.weekNumber),di,0];
                for(const [ai,session] of [...(day.sessionArchives||[]),day].entries()){
                    for(const [ei,ex] of (session.exercises||session.esercizi||[]).entries()){
                        position[4]=ei;
                        // An archive of the active day is a previous exposure; live rows of that day are not.
                        const archived=ai<(day.sessionArchives||[]).length;
                        const sameDay=position.slice(0,4).every((v,i)=>v===end[i]);
                        if(!(earlier(position)&&(!sameDay||Number.isFinite(end[4])&&ei<end[4])||archived&&sameDay)||exerciseIdentity(ex)!==identity)continue;
                        if(ex.isWarmup||ex.isExcluded||ex.is_excluded)continue;
                        const sets=(ex.loggedSets||[]).map((_,i)=>observed(ex,i)).filter(Boolean);
                        if(!sets.length)continue;
                        result.push({exercise:ex,sets,position:[...position,ai],source:{year:Number(y),mesoIndex:mi,weekNumber:Number(w.weekNumber),dayIndex:di,exerciseIndex:ei,archiveIndex:archived?ai:null},checkin:session.coachCheckin??null,date:session.sessionDate??session.date??sets[0].performedAt});
                    }
                }
            }
        }
    }
    return result.sort((a,b)=>{for(let i=0;i<a.position.length;i++)if(a.position[i]!==b.position[i])return b.position[i]-a.position[i];return 0;});
}
