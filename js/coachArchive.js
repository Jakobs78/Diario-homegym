/** Diagnostic snapshots never participate in training calculations or normal journal transfers. */
import {journalStorage,flushJournalStorage} from './journalStore.js';
import {supabase} from './config.js';
import {timedQuery,sameJSON} from './syncPrimitives.js';
const key=(user,id)=>`workoutApp_data_coach_archive_${user.id}_${id}`;
const receipt=(user,id)=>key(user,id)+'_sent';
export function archiveReferences(data){
    const refs=[];
    for(const year of Object.values(data?.history?.years||{}))
        for(const meso of year.mesocycles||[])refs.push(...(meso.coachArchiveRefs||[]));
    for(const entry of data?.archivedMesocycles||[])refs.push(...(entry.mesocycle?.coachArchiveRefs||[]));
    return [...new Map(refs.map(ref=>[ref.ownerId+':'+ref.id,ref])).values()];
}
export function separateCoachArchives(data,user){
    if(!user?.id)return;
    const mesos=Object.values(data?.history?.years||{}).flatMap(y=>y.mesocycles||[])
        .concat((data?.archivedMesocycles||[]).map(e=>e.mesocycle));
    const undo=[];
    const rollback=()=>{for(const [meso,events,refs] of undo){meso.coachAdjustments=events;if(refs===undefined)delete meso.coachArchiveRefs;else meso.coachArchiveRefs=refs;}};
    try{for(const meso of mesos){
        const events=meso?.coachAdjustments||[];
        const compact=events.filter(event=>event.format===2);
        const overflow=compact.length>30 || JSON.stringify(compact).length>32768;
        const keep=overflow?compact.slice(-5):compact;
        const archived=events.filter(event=>event.format!==2 || overflow&&!keep.includes(event));
        if(!archived.length)continue;
        undo.push([meso,meso.coachAdjustments,meso.coachArchiveRefs]);
        const id=crypto.randomUUID();
        journalStorage.setItem(key(user,id),JSON.stringify({version:1,events:archived}));
        meso.coachArchiveRefs=[...(meso.coachArchiveRefs||[]),{id,ownerId:String(user.id)}];
        meso.coachAdjustments=keep;
    }}catch(error){rollback();throw error;}
    return rollback;
}
export async function syncCoachArchives(data,user){
    for(const ref of archiveReferences(data)){
        if(String(ref.ownerId)!==String(user.id))continue; // restored foreign diagnostics are never uploaded as this user
        if(journalStorage.getItem(receipt(user,ref.id)))continue;
        const raw=journalStorage.getItem(key(user,ref.id));
        if(raw){
            const attempt=key(user,ref.id)+'_attempt';
            if(journalStorage.getItem(attempt)){
                const found=await timedQuery(supabase.from('workout_coach_archives').select('archive_id')
                    .eq('user_id',user.id).eq('archive_id',ref.id).maybeSingle());
                if(found.error)throw found.error;
                if(found.data){journalStorage.setItem(receipt(user,ref.id),'1');continue;}
            }
            journalStorage.setItem(attempt,'1');await flushJournalStorage();
            const result=await timedQuery(supabase.from('workout_coach_archives')
                .insert({user_id:user.id,archive_id:ref.id,payload:JSON.parse(raw)}));
            if(result.error?.code==='23505'){
                const existing=await timedQuery(supabase.from('workout_coach_archives').select('payload')
                    .eq('user_id',user.id).eq('archive_id',ref.id).maybeSingle());
                if(existing.error)throw existing.error;
                if(!sameJSON(existing.data?.payload,JSON.parse(raw)))throw Error('Archivio tecnico remoto diverso: nessuna sostituzione consentita.');
            }else if(result.error)throw result.error;
        }else{
            const result=await timedQuery(supabase.from('workout_coach_archives').select('archive_id')
                .eq('user_id',user.id).eq('archive_id',ref.id).maybeSingle());
            if(result.error)throw result.error;
            if(!result.data)throw Error('Archivio tecnico mancante: diario conservato localmente, invio sospeso.');
        }
        journalStorage.setItem(receipt(user,ref.id),'1');
    }
}
export async function loadCoachArchives(data,user){
    const archives=[];
    for(const ref of archiveReferences(data)){
        if(!user?.id || String(ref.ownerId)!==String(user.id))throw Error('Per includere l’archivio tecnico accedi con il suo account originale.');
        let raw=journalStorage.getItem(key(user,ref.id));
        if(!raw){
            const result=await timedQuery(supabase.from('workout_coach_archives').select('payload')
                .eq('user_id',user.id).eq('archive_id',ref.id).maybeSingle());
            if(result.error)throw result.error;
            if(!result.data?.payload)throw Error('Archivio tecnico non disponibile: riprova online.');
            raw=JSON.stringify(result.data.payload);
            journalStorage.setItem(key(user,ref.id),raw);
        }
        archives.push({ref,payload:JSON.parse(raw)});
    }
    return archives;
}
export function restoreCoachArchives(archives,user){
    for(const item of archives||[]){
        if(!user?.id || String(item.ref?.ownerId)!==String(user.id))throw Error('Archivio tecnico appartenente a un altro account.');
        if(!/^[a-f0-9-]{36}$/i.test(item.ref.id)||item.payload?.version!==1||!Array.isArray(item.payload.events))throw Error('Archivio tecnico non valido.');
        const previous=journalStorage.getItem(key(user,item.ref.id));
        const raw=JSON.stringify(item.payload);
        if(previous && !sameJSON(JSON.parse(previous),item.payload))throw Error('Archivio tecnico con contenuto diverso: nessuna sostituzione consentita.');
        journalStorage.setItem(key(user,item.ref.id),raw);
    }
}
