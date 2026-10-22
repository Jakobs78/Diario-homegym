/**
 * Lossless versioned journal archive, with no credentials or auth tokens.
 * CSV remains a portable summary, not a full-fidelity restore format.
 */
export const FULL_BACKUP_FORMAT='homegym-diary-full-backup';
export function buildFullBackup(workoutData,now=new Date()) {
    if(!workoutData?.history?.years || typeof workoutData.history.years!=='object')
        throw Error('Nessun diario valido da esportare.');
    return {
        format:FULL_BACKUP_FORMAT,version:1,exportedAt:now.toISOString(),
        data:JSON.parse(JSON.stringify(workoutData))
    };
}
export function readFullBackup(text) {
    let archive;
    try { archive=JSON.parse(text); }
    catch { throw Error('Il file non contiene JSON valido.'); }
    if(!archive || archive.format!==FULL_BACKUP_FORMAT || archive.version!==1)
        throw Error('Formato o versione del backup non riconosciuti.');
    const data=archive.data;
    if(!data || Array.isArray(data) || typeof data!=='object' ||
       !data.history || Array.isArray(data.history) ||
       !data.history.years || Array.isArray(data.history.years) ||
       typeof data.history.years!=='object')throw Error('Struttura dello storico non valida.');
    for(const [year,entry] of Object.entries(data.history.years)){
        if(!/^\d{4}$/.test(year) || !entry ||
           !Array.isArray(entry.mesocycles))throw Error('Anno o mesociclo non valido.');
        for(const meso of entry.mesocycles){
            if(!meso || !Array.isArray(meso.weeks))throw Error('Mesociclo non valido.');
            for(const week of meso.weeks){
                if(!week || !Array.isArray(week.days))throw Error('Settimana non valida.');
                for(const day of week.days){
                    if(!day || !Array.isArray(day.exercises))throw Error('Giorno non valido.');
                    if(day.sessionArchives!==undefined&&!Array.isArray(day.sessionArchives))throw Error('Archivio sedute non valido.');
                    for(const session of [day,...(Array.isArray(day.sessionArchives)?day.sessionArchives:[])]){
                    if(!session||(session.exercises!==undefined&&!Array.isArray(session.exercises)))throw Error('Seduta archiviata non valida.');
                    for(const ex of session.exercises||[]){
                        if(!ex || typeof ex.name!=='string' || !ex.name.trim() || !Array.isArray(ex.loggedSets))
                            throw Error('Esercizio non valido.');
                        for(const set of ex.loggedSets){
                            if(!set || typeof set!=='object' || Array.isArray(set))throw Error('Serie del backup non valida.');
                            for(const key of ['weight','actualKg','rpe']){
                                const raw=set[key];
                                if(raw===undefined||raw===null||raw==='')continue;
                                const n=Number(String(raw).replace(',','.'));
                                if(!Number.isFinite(n)||n<0||(key==='rpe'?n>10:n>700))throw Error('Valore della serie non valido: '+key);
                            }
                            for(const key of ['isLocked','completed','isWarmup'])if(set[key]!==undefined&&typeof set[key]!=='boolean')throw Error('Stato della serie non valido.');
                            if(set.reps!==undefined && set.reps!=='' && !/^\d{1,3}(?:\+\d{1,3})*$/.test(String(set.reps)))throw Error('Ripetizioni del backup non valide.');
                            for(const key of ['performedAt','completedAt','recordedAt','updatedAt'])if(set[key]!==undefined&&!Number.isFinite(Date.parse(set[key])))throw Error('Data della serie non valida.');
                        }
                        if(day.sessionArchives!==undefined && !Array.isArray(day.sessionArchives))throw Error('Archivio sedute non valido.');
                    }}
                }
            }
        }
    }
    if(data.archivedMesocycles!==undefined){
        if(!Array.isArray(data.archivedMesocycles))throw Error('Archivio mesocicli non valido.');
        for(const entry of data.archivedMesocycles){
            if(!entry||!/^\d{4}$/.test(String(entry.year))||!entry.mesocycle)throw Error('Mesociclo archiviato non valido.');
            readFullBackup(JSON.stringify({format:FULL_BACKUP_FORMAT,version:1,data:{history:{years:{[entry.year]:{mesocycles:[entry.mesocycle]}}}}}));
        }
    }
    return JSON.parse(JSON.stringify(data));
}
export function downloadFullBackup(data,{suffix=''}={}) {
    const backup=buildFullBackup(data);
    const blob=new Blob([JSON.stringify(backup,null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url;a.download='homegym-backup-'+(suffix ? String(suffix).replace(/[^a-z0-9_-]/gi,'')+'-' : '')+backup.exportedAt.slice(0,10)+'.json';
    document.body.appendChild(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),2000);
}
export async function restoreFullBackupFile(file,{state,saveAndSync,renderWorkoutList}){
    if(file.size>25*1024*1024)throw Error('Backup troppo grande (limite 25 MB).');
    const candidate=readFullBackup(await file.text()); // validate BEFORE touching state
    const count=Object.values(candidate.history.years)
        .reduce((s,y)=>s+y.mesocycles.length,0);
    if(!confirm('Ripristinare '+count+' mesocicli dal backup? Il diario attuale sarà sostituito. Scarica una copia di sicurezza prima di proseguire.'))return false;
    // Preserve the prior journal as a recovery download.
    downloadFullBackup(state.workoutData);
    const saved=await saveAndSync(candidate,'RESTORE_FULL_BACKUP');
    if(saved===false)throw Error('Ripristino non completato: salvataggio locale o coda di sincronizzazione non riusciti. Conserva entrambi i backup e verifica lo spazio disponibile.');
    state.activeMesocycleIndex=0;state.activeWeek=1;state.activeDay=1;
    renderWorkoutList();
    alert('Backup ripristinato localmente. Attendi la sincronizzazione cloud prima di usare un altro dispositivo.');
    return true;
}

