// ==========================================
// MODULI: mesocycle.js - Gestione cicli di allenamento, navigazione mesocicli, blocco/sblocco e export PDF
// ==========================================
// ==========================================
// 1. IMPORT & DIPENDENZE
// ==========================================
import { state } from './state.js';
import { saveAndSync } from './storage.js';
import { renderWorkoutList, showNotification } from './ui.js';


// ==========================================
// 2. RECUPERO MESOCICLO ATTIVO
// ==========================================
/**
 * Recupera l'oggetto del mesociclo attualmente attivo
 */
export function getActiveMesocycleObject() {
    const currentYear = new Date().getFullYear().toString();
    const mesocycles = state.workoutData?.history?.years?.[currentYear]?.mesocycles || [];
    const currentIndex = state.activeMesocycleIndex || 0;
    return mesocycles[currentIndex] || null;
}

// ==========================================
// 3. NAVIGAZIONE E GESTIONE MESOCICLI
// ==========================================
/**
 * Gestisce lo scorrimento dei mesocicli (-1 o +1) con controlli sui limiti
 */
export function changeMesocycle(delta) {
    const currentYear = new Date().getFullYear().toString();
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
    const currentYear = new Date().getFullYear().toString();
    const mesocycles = state.workoutData?.history?.years?.[currentYear]?.mesocycles || [];

    if (mesocycles.length === 0) {
        showNotification("Nessun mesociclo da eliminare.", "error");
        return;
    }

    const activeIdx = state.activeMesocycleIndex || 0;
    const mesoToDelete = mesocycles[activeIdx];

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
export function toggleCurrentMesocycleLock() {
    const currentMeso = getActiveMesocycleObject();
    if (!currentMeso) return;

    currentMeso.locked = !currentMeso.locked;
    
    saveAndSync(state.workoutData);
    updateMesocycleLockUI();
    renderWorkoutList();
}

export function updateMesocycleLockUI() {
    const currentMeso = getActiveMesocycleObject();
    const container = document.getElementById('workout-list-container');
    const lockBtn = document.getElementById('toggle-lock-meso-btn');

    if (!currentMeso) return;

    if (currentMeso.locked) {
        if (container) {
            container.setAttribute('inert', '');
            container.style.opacity = '0.85';
        }
        if (lockBtn) {
            lockBtn.innerHTML = '🔒 Bloccato';
            lockBtn.style.background = '#fef2f2';
            lockBtn.style.borderColor = '#fca5a5';
            lockBtn.style.color = '#991b1b';
        }
    } else {
        if (container) {
            container.removeAttribute('inert');
            container.style.opacity = '1';
        }
        if (lockBtn) {
            lockBtn.innerHTML = '🔓 Sbloccato';
            lockBtn.style.background = '';
            lockBtn.style.borderColor = '';
            lockBtn.style.color = '';
        }
    }
}

// ==========================================
// 5. AGGIORNAMENTO UI CONTATORI & NAVIGAZIONE
// ==========================================
export function updateMesocycleUI() {
    const currentYear = new Date().getFullYear().toString();
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
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text(`Mesociclo: ${mesoData.name || "Senza nome"}`, 14, 20);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text(`ID Univoco: ${mesoData.id || 'N/D'}`, 14, 28);
  doc.text(`Data: ${new Date().toLocaleDateString()}`, 14, 34);

  let startY = 45;

  (mesoData.weeks || []).forEach((week, weekIndex) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text(`Settimana ${weekIndex + 1}`, 14, startY);
    startY += 8;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);

    // Raccoglie gli esercizi gestendo in modo flessibile la struttura (days o exercises diretti)
    const exercisesList = [];
    if (Array.isArray(week.days)) {
      week.days.forEach(day => {
        const exs = day.exercises || day.esercizi || day.exerciseList || [];
        if (Array.isArray(exs)) exercisesList.push(...exs);
        else if (typeof exs === 'object') exercisesList.push(...Object.values(exs));
      });
    } else if (Array.isArray(week.exercises)) {
      exercisesList.push(...week.exercises);
    } else if (week.exercises && typeof week.exercises === 'object') {
      exercisesList.push(...Object.values(week.exercises));
    }

    if (exercisesList.length === 0) {
      doc.text("- Nessun esercizio registrato in questa settimana", 20, startY);
      startY += 6;
    } else {
      exercisesList.forEach((ex) => {
        const exName = ex.name || ex.nome || 'Esercizio';
        const exerciseText = `- ${exName}: Topset ${ex.topset || '-'} kg | Range: ${ex.kgMin || 0}-${ex.kgMax || 0} kg`;
        
        if (startY > 280) {
          doc.addPage();
          startY = 20;
        }

        doc.text(exerciseText, 20, startY);
        startY += 6;
      });
    }

    startY += 6;
  });

  doc.save(`${mesoData.name || "mesociclo"}_${mesoData.id || 'export'}.pdf`);
}