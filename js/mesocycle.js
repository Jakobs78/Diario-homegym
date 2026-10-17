// ==========================================
// MODULI: mesocycle.js - Gestione cicli di allenamento, navigazione mesocicli, blocco/sblocco e export PDF
// ==========================================
// ==========================================
// 1. IMPORT & DIPENDENZE
// ==========================================
import { state } from './state.js';
import { buildMesocyclePdfOutline } from './mesocyclePdfModel.js';
import { saveAndSync } from './storage.js';
import { renderWorkoutList, showNotification } from './ui.js';
import { closeMesocycleInMemory, summarizeMesocycleClosure } from './mesocycleClosure.js';

// ==========================================
// 2. RECUPERO MESOCICLO ATTIVO (Sincronizzato con ui.js)
// ==========================================
export function getActiveMesocycleObject() {
    const yearsObj = state.workoutData?.history?.years || {};
    const currentYear = String(state.currentYear || new Date().getFullYear());
    
    let yearData = yearsObj[currentYear];
    if (!yearData || !yearData.mesocycles || yearData.mesocycles.length === 0) {
        const yearKeys = Object.keys(yearsObj);
        if (yearKeys.length > 0) {
            yearData = yearsObj[yearKeys.sort((a,b)=>Number(b)-Number(a))[0]];
        }
    }
    
    const mesoIndex = state.activeMesocycleIndex || 0;
    return yearData?.mesocycles?.[mesoIndex] || yearData?.mesocycles?.[0] || null;
}

// ==========================================
// 3. NAVIGAZIONE E GESTIONE MESOCICLI
// ==========================================
/**
 * Gestisce lo scorrimento dei mesocicli (-1 o +1) con controlli sui limiti
 */
export function changeMesocycle(delta) {
    const currentYear = String(state.currentYear || new Date().getFullYear());
    const mesocycles = state.workoutData?.history?.years?.[currentYear]?.mesocycles || [];
    const currentIndex = state.activeMesocycleIndex || 0;
    const targetIndex = currentIndex + delta;

    if (delta > 0 && targetIndex >= mesocycles.length) {
        showNotification(`Il Mesociclo ${targetIndex + 1} non è ancora stato caricato. Importa un file CSV per proseguire.`, 'warning');
        return;
    }

    if (delta < 0 && targetIndex < 0) return;

    if (targetIndex !== currentIndex) {
        state.activeMesocycleIndex = targetIndex;
        state.activeWeek = 1;
        state.activeDay = 1;
        renderWorkoutList();
    }
}

/**
 * Elimina la scheda e i dati del mesociclo attivo riallineando la numerazione
 */
export function deleteCurrentMesocycle() {
    const currentYear = String(state.currentYear || new Date().getFullYear());
    const mesocycles = state.workoutData?.history?.years?.[currentYear]?.mesocycles || [];

    if (mesocycles.length === 0) {
        showNotification("Nessun mesociclo da eliminare.", "error");
        return;
    }

    const activeIdx = state.activeMesocycleIndex || 0;
    const mesoToDelete = mesocycles[activeIdx];
    if (mesoToDelete?.locked) {
        showNotification('Il mesociclo è bloccato: sbloccalo prima di eliminarlo.', 'warning');
        return;
    }

    if (!confirm(`Sei sicuro di voler eliminare definitivamente il "${mesoToDelete?.name || 'Mesociclo'}"?`)) {
        return;
    }

    mesocycles.splice(activeIdx, 1);

    mesocycles.forEach((meso, idx) => {
        meso.number = idx + 1;
        meso.name = `Mesociclo ${idx + 1}`;
    });

    if (activeIdx >= mesocycles.length) {
        state.activeMesocycleIndex = Math.max(0, mesocycles.length - 1);
    }

    saveAndSync(state.workoutData);
    renderWorkoutList();
    showNotification("Mesociclo eliminato e numerazione riallineata!");
}

// ==========================================
// 4. BLOCCO & SBLOCCO MESOCICLO
// ==========================================
export async function toggleCurrentMesocycleLock() {
    const currentMeso = getActiveMesocycleObject();
    if (!currentMeso) return;
    const previousLock = Boolean(currentMeso.locked);
    const previousClosure = currentMeso.coachClosure;
    // Un ciclo concluso richiede una conferma distinta dallo sblocco normale.
    if (previousLock && previousClosure?.status === 'closed' &&
        !confirm('Questo mesociclo è stato CONCLUSO. Riaprirlo permetterà di modificare i dati e annullerà la chiusura registrata. Vuoi davvero riaprirlo?')) return;
    currentMeso.locked = !previousLock;
    if (previousLock && previousClosure?.status === 'closed')
        delete currentMeso.coachClosure;
    try {
        const result = await saveAndSync(state.workoutData);
        if (result === false) throw Error('Salvataggio non confermato: verifica archivio e sincronizzazione.');
    } catch(error) {
        currentMeso.locked = previousLock;
        if (previousClosure === undefined) delete currentMeso.coachClosure;
        else currentMeso.coachClosure = previousClosure;
        renderWorkoutList();
        showNotification(error.message);
        return;
    }
    renderWorkoutList();
    showNotification(currentMeso.locked ? 'Mesociclo bloccato in sola lettura' :
        'Mesociclo sbloccato');
}

/** Salva solo la chiusura e il blocco; i log esistenti non vengono riscritti. */
export async function concludeCurrentMesocycle(mesocycle, report, {
    acknowledgeIncomplete = false
} = {}) {
    if (!mesocycle || mesocycle !== getActiveMesocycleObject())
        throw Error('Selezione cambiata: riapri la revisione del mesociclo corretto.');
    const beforeLocked = mesocycle.locked;
    const beforeClosure = mesocycle.coachClosure;
    closeMesocycleInMemory(mesocycle, report, { acknowledgeIncomplete });
    try {
        const saved = await saveAndSync(state.workoutData);
        if (saved === false) throw Error('Salvataggio non confermato: la chiusura non è stata completata. Conserva un backup e verifica la sincronizzazione.');
    } catch(error) {
        mesocycle.locked = beforeLocked;
        if (beforeClosure === undefined) delete mesocycle.coachClosure;
        else mesocycle.coachClosure = beforeClosure;
        throw error;
    }
    renderWorkoutList();
    return summarizeMesocycleClosure(mesocycle);
}

export function updateMesocycleLockUI() {
    const currentMeso = getActiveMesocycleObject();
    const lockBtn = document.getElementById('toggle-lock-meso-btn');

    if (!currentMeso || !lockBtn) return;

    const isLocked = Boolean(currentMeso.locked);
    lockBtn.innerHTML = isLocked ? '🔒 Sblocca' : '🔓 Blocca';
    if (isLocked) {
        lockBtn.classList.add('is-locked');
    } else {
        lockBtn.classList.remove('is-locked');
    }
}

// ==========================================
// 5. AGGIORNAMENTO UI CONTATORI & NAVIGAZIONE
// ==========================================
export function updateMesocycleUI() {
    const currentYear = String(state.currentYear || new Date().getFullYear());
    const mesos = state.workoutData?.history?.years?.[currentYear]?.mesocycles || [];
    const currentIndex = state.activeMesocycleIndex || 0;
    
    const mesoDisplay = document.getElementById('meso-display');
    const prevBtn = document.getElementById('prev-meso-btn');
    const nextBtn = document.getElementById('next-meso-btn');

    if (mesoDisplay) {
        mesoDisplay.textContent = (mesos.length > 0) ? (currentIndex + 1) : 1;
    }

    if (prevBtn) prevBtn.disabled = (currentIndex <= 0 || mesos.length === 0);
    if (nextBtn) nextBtn.disabled = (currentIndex >= mesos.length - 1 || mesos.length === 0);
}

export function exportMesoToPDF(mesoData) {
    if(!mesoData){alert('Nessun mesociclo da esportare.');return;}
    const {jsPDF}=window.jspdf;
    const doc=new jsPDF({unit:'mm',format:'a4'});
    const entries=buildMesocyclePdfOutline(mesoData);
    const margin=14,innerWidth=182,pageBottom=280;
    let y=20;
    const advance=(height)=>{
        if(y+height>pageBottom){doc.addPage();y=18;}
    };
    doc.setFont('helvetica','bold');doc.setFontSize(16);
    const title=doc.splitTextToSize(mesoData.name || 'Mesociclo',innerWidth);
    advance(title.length*7+2);doc.text(title,margin,y);y+=title.length*7+2;
    doc.setFont('helvetica','normal');doc.setFontSize(9);
    doc.text('Programmazione proposta / registrata. Verificare sempre kg, RPE e recuperi reali.',margin,y);y+=9;
    for(const entry of entries){
        if(entry.kind==='week'){
            advance(15);
            doc.setFillColor(226,232,240);doc.rect(margin,y-5,innerWidth,10,'F');
            doc.setTextColor(15,23,42);doc.setFont('helvetica','bold');doc.setFontSize(12);
            doc.text(entry.title,margin+3,y+2);y+=14;
            continue;
        }
        if(entry.kind==='day'){
            advance(12);doc.setFont('helvetica','bold');doc.setFontSize(11);
            doc.text(entry.title,margin,y);y+=8;continue;
        }
        const desc=doc.splitTextToSize(entry.text,innerWidth-8);
        const extra=entry.notes?doc.splitTextToSize('Note: '+entry.notes,innerWidth-12):[];
        const height=desc.length*5+extra.length*4.3+5;
        advance(height);
        doc.setFont('helvetica','normal');doc.setFontSize(9);
        doc.text(desc,margin+3,y);y+=desc.length*5;
        if(extra.length){
            doc.setTextColor(82,96,115);doc.setFontSize(8);
            doc.text(extra,margin+5,y);y+=extra.length*4.3;
            doc.setTextColor(15,23,42);
        }
        y+=5;
    }
    const filename=String(mesoData.name||'mesociclo').replace(/[^a-zA-Z0-9_-]/g,'_');
    doc.save(filename+'_programma_completo.pdf');
}
