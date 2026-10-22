/** Durable journal-only storage. Auth tokens and UI preferences stay outside it. */
const DB_NAME='homegym-journal-v2';
const STORE='journal';
const MARKER='homegym-journal-v2-ready';
const isJournalKey=key=>key==='workoutApp_data' || key.startsWith('workoutApp_data_');
const values=new Map(), committed=new Map();
let db=null, initializing=null, pending=new Map(), chain=Promise.resolve();
let scheduled=false, failure=null;
let ready=false;

function transaction(entries) {
    return new Promise((resolve,reject)=>{
        const tx=db.transaction(STORE,'readwrite');
        const store=tx.objectStore(STORE);
        let conflict=false;
        for(const [key,value] of entries){
            const request=store.get(key);
            request.onsuccess=()=>{
                if((request.result ?? null)!==(committed.get(key) ?? null)){
                    conflict=true;tx.abort();return;
                }
                if(value===null)store.delete(key);else store.put(value,key);
            };
        }
        tx.oncomplete=()=>{
            for(const [key,value] of entries){
                if(value===null)committed.delete(key);else committed.set(key,value);
            }
            resolve();
        };
        tx.onabort=tx.onerror=()=>reject(conflict
            ? Error('Diario modificato in un’altra scheda: scarica il backup delle modifiche e ricarica prima di sincronizzare.')
            : tx.error || Error('Archivio locale non disponibile.'));
    });
}

export function initializeJournalStorage() {
    if(initializing)return initializing;
    initializing=(async()=>{
        if(!globalThis.indexedDB)throw Error('Archivio locale non supportato: nessun dato precedente è stato cancellato.');
        db=await new Promise((resolve,reject)=>{
            const request=indexedDB.open(DB_NAME,1);
            request.onupgradeneeded=()=>request.result.createObjectStore(STORE);
            request.onsuccess=()=>resolve(request.result);
            request.onerror=()=>reject(request.error);
            request.onblocked=()=>reject(Error('Chiudi le altre schede per aggiornare l’archivio.'));
        });
        db.onversionchange=()=>{db.close();failure=Error('Archivio aggiornato: ricarica la pagina.');};
        await new Promise((resolve,reject)=>{
            const tx=db.transaction(STORE,'readonly');
            const request=tx.objectStore(STORE).openCursor();
            request.onsuccess=()=>{
                const cursor=request.result;
                if(cursor){values.set(cursor.key,cursor.value);committed.set(cursor.key,cursor.value);cursor.continue();}
            };
            tx.oncomplete=resolve;tx.onabort=tx.onerror=()=>reject(tx.error);
        });
        // Copy only journal keys. A crash before cleanup is safe: existing DB
        // values always win over leftover legacy copies on the next startup.
        const legacy=[];
        for(let i=0;!localStorage.getItem(MARKER) && i<localStorage.length;i++){
            const key=localStorage.key(i);
            if(isJournalKey(key))legacy.push([key,localStorage.getItem(key)]);
        }
        const missing=legacy.filter(([key])=>!values.has(key));
        if(missing.length){
            await transaction(missing);
            for(const [key,value] of missing)values.set(key,value);
        }
        // The transaction committed successfully before any legacy deletion.
        for(const [key] of legacy)localStorage.removeItem(key);
        localStorage.setItem(MARKER,'1');
        ready=true;
    })().catch(error=>{failure=error;throw error;});
    return initializing;
}

function schedule() {
    if(scheduled)return;
    scheduled=true;
    queueMicrotask(()=>{
        scheduled=false;
        const entries=[...pending];pending=new Map();
        chain=chain.then(async()=>{
            if(failure)throw failure;
            await initializeJournalStorage();
            await transaction(entries);
        }).catch(error=>{
            failure=error;
            globalThis.dispatchEvent?.(new Event('homegym-storage-error'));
        });
    });
}

export const journalStorage={
    getItem(key){
        if(values.has(key))return values.get(key);
        if(db || localStorage.getItem(MARKER))return null;
        return localStorage.getItem(key);
    },
    setItem(key,value){
        if(!isJournalKey(key))throw Error('Chiave non appartenente al diario.');
        if(failure)throw failure;
        if(!db)throw Error('Archivio in inizializzazione: riprova fra un istante.');
        values.set(key,String(value));pending.set(key,String(value));schedule();
    },
    removeItem(key){
        if(!isJournalKey(key))throw Error('Chiave non appartenente al diario.');
        if(failure)throw failure;
        if(!db)throw Error('Archivio in inizializzazione.');
        values.delete(key);pending.set(key,null);schedule();
    }
};

export async function flushJournalStorage(){
    await Promise.resolve(); // collect synchronous journal + queue updates
    await chain;
    if(failure)throw failure;
}
export const journalStorageFailed=()=>Boolean(failure);
export const journalStorageReady=()=>ready && !failure;

/** Synchronous staging rollback before the single IndexedDB transaction. */
export function stageJournalUpdates(edit){
    const beforeValues=new Map(values),beforePending=new Map(pending);
    try{return edit();}catch(error){values.clear();for(const [key,value] of beforeValues)values.set(key,value);pending=beforePending;throw error;}
}
