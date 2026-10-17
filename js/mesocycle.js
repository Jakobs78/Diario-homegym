// ==========================================
// MODULI: mesocycle.js - Gestione cicli di allenamento, navigazione mesocicli, blocco/sblocco e export PDF
// ==========================================
// ==========================================
// 1. IMPORT & DIPENDENZE
// ==========================================
import { state } from './state.js';
import { buildMesocyclePdfDetails } from './mesocyclePdfModel.js';
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

/**
 * Complete mesocycle diary export. Strictly read-only: no sync or state writes.
 * Text is wrapped and paginated at the line level, so long notes are never cut.
 */
export function exportMesoToPDF(mesoData) {
    if (!mesoData) { alert('Nessun mesociclo da esportare.'); return; }
    const {jsPDF} = window.jspdf;
    const doc = new jsPDF({orientation:'portrait',unit:'mm',format:'a4'});
    const rows = buildMesocyclePdfDetails(mesoData);
    const left = 14, right = 196, width = right - left, bottom = 278;
    const dark = [15, 23, 42], muted = [71, 85, 105], blue = [3, 105, 161];
    let y = 18;
    const pageBreak = () => {
        doc.addPage();
        y = 19;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(...muted);
        doc.text(String(mesoData.name || 'Mesociclo') + ' · continua', left, y);
        y += 8;
    };
    const ensure = height => { if (y + height > bottom) pageBreak(); };
    const wrapped = (text, x = left + 2, fontSize = 8.5, step = 4.5,
        color = dark, font = 'normal', maxWidth = right - x - 2) => {
        doc.setFont('helvetica', font);
        doc.setFontSize(fontSize);
        doc.setTextColor(...color);
        const lines = doc.splitTextToSize(String(text), maxWidth);
        for (const line of lines) {
            ensure(step + 1);
            doc.text(line, x, y);
            y += step;
        }
    };
    const header = () => {
        ensure(10);
        doc.setFillColor(241, 245, 249);
        doc.setDrawColor(226, 232, 240);
        doc.rect(left + 1, y - 4, width - 2, 7, 'FD');
        doc.setFont('helvetica','bold');
        doc.setFontSize(7.6);
        doc.setTextColor(...muted);
        const cols = [17, 36, 74, 112, 137];
        ['SERIE','KG','REPS','RPE','STATO'].forEach((text, index) =>
            doc.text(text, cols[index], y));
        y += 5;
    };

    doc.setFont('helvetica','bold');
    doc.setFontSize(15);
    doc.setTextColor(...dark);
    wrapped(String(mesoData.name || 'Mesociclo') + ' · DIARIO COMPLETO',
        left, 15, 7.5, dark, 'bold', width);
    y += 1;
    wrapped('Programmazione e risultati sono distinti. Solo le serie confermate ' +
        'sono prestazioni validate nel diario.',left,8,4.5,muted);
    y += 7;

    for (const row of rows) {
        if (row.kind === 'week') {
            ensure(16);
            doc.setFillColor(226, 232, 240);
            doc.rect(left, y - 5, width, 10, 'F');
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(11);
            doc.setTextColor(...dark);
            doc.text(row.title, left + 3, y + 2);
            y += 15;
        } else if (row.kind === 'day') {
            ensure(15);
            doc.setFillColor(240, 249, 255);
            doc.rect(left, y - 4, width, 9, 'F');
            doc.setFont('helvetica','bold');
            doc.setFontSize(10);
            doc.setTextColor(...blue);
            doc.text(row.title + (row.date !== '—' ? ' · ' + row.date : ''),left + 3,y + 2);
            y += 13;
        } else if (row.kind === 'session') {
            ensure(10);
            doc.setFont('helvetica','bold');
            doc.setFontSize(8.5);
            doc.setTextColor(...muted);
            doc.text(row.title + (row.date !== '—' ? ' · ' + row.date : ''),left + 2,y);
            y += 8;
        } else if (row.kind === 'exercise') {
            ensure(20); // Do not orphan exercise titles at the foot of a page.
            doc.setFont('helvetica','bold');
            doc.setFontSize(8);
            doc.setTextColor(...muted);
            doc.text('BLOCCO ' + row.block + (row.excluded ? ' · RISCALDAMENTO' : ''),left + 2,y);
            y += 5;
            wrapped(row.title,left + 2,10,5.5,dark,'bold');
            y += 1;
            wrapped('TARGET: ' + row.prescription,left + 2,8.2,4.5,muted);
            y += 3;
        } else if (row.kind === 'note') {
            ensure(11);
            doc.setFont('helvetica','bold');
            doc.setFontSize(8);
            doc.setTextColor(...blue);
            doc.text(row.label,left + 2,y);
            y += 5;
            wrapped(row.text,left + 3,8.5,4.5,dark,'normal',width - 8);
            y += 3;
        } else if (row.kind === 'notice') {
            ensure(7);
            wrapped(row.text,left + 3,8,4.5,muted);
            y += 3;
        } else if (row.kind === 'set-head') {
            ensure(16);
            header();
        } else if (row.kind === 'set') {
            const status = (row.confirmed ? 'Confermata' : 'Non confermata') +
                (row.warmup ? ' · warmup' : '') +
                (row.technique ? ' · ' + row.technique : '');
            doc.setFont('helvetica','normal');
            doc.setFontSize(7.7);
            const statusLines = doc.splitTextToSize(status, right - 139);
            const height = Math.max(9, statusLines.length * 4 + 3);
            if (y + height + 1 > bottom) {
                pageBreak();
                header(); // Repeat table heading on the following page.
            }
            doc.setFillColor(248, 250, 252);
            doc.setDrawColor(226, 232, 240);
            doc.rect(left + 1, y - 4, width - 2, height, 'FD');
            doc.setFont('helvetica','normal');
            doc.setFontSize(8.5);
            doc.setTextColor(...dark);
            const x = [17, 36, 74, 112];
            [row.number,row.weight,row.reps,row.rpe].forEach((value,idx) =>
                doc.text(String(value),x[idx],y + 1));
            doc.setFontSize(7.7);
            for (const [idx,line] of statusLines.entries()) doc.text(line,139,y + idx * 4 + 1);
            y += height;
        } else if (row.kind === 'drop') {
            ensure(7);
            wrapped(row.text,left + 8,7.8,4.5,muted);
            y += 2;
        }
    }
    // Print the page count without touching the mesocycle data.
    if (typeof doc.getNumberOfPages === 'function') {
        const count = doc.getNumberOfPages();
        for (let i = 1; i <= count; i++) {
            doc.setPage(i);
            doc.setFont('helvetica','normal');
            doc.setFontSize(8);
            doc.setTextColor(...muted);
            doc.text('Pagina ' + i + ' / ' + count,right,289,{align:'right'});
        }
    }
    const name = String(mesoData.name || 'mesociclo')
        .replace(/[^a-zA-Z0-9_-]/g,'_');
    doc.save(name + '_diario_completo.pdf');
}
