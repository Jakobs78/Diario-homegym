// js/mesocycle.js
import { state } from './state.js';
import { saveAndSync } from './storage.js';
import { renderWorkoutList } from './ui.js';
import { showNotification } from './helpers.js';

/**
 * Recupera l'oggetto del mesociclo attualmente attivo
 */
export function getActiveMesocycleObject() {
    const currentYear = new Date().getFullYear().toString();
    const mesocycles = state.workoutData.history?.years?.[currentYear]?.mesocycles || [];
    const currentIndex = state.activeMesocycleIndex || 0;
    return mesocycles[currentIndex] || null;
}

/**
 * Gestisce lo scorrimento dei mesocicli (-1 o +1) con controlli sui limiti
 */
export function changeMesocycle(delta) {
    const currentYear = new Date().getFullYear().toString();
    const mesocycles = state.workoutData.history?.years?.[currentYear]?.mesocycles || [];
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
    const mesocycles = state.workoutData.history?.years?.[currentYear]?.mesocycles || [];

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

/**
 * Aggiorna graficamente il contatore e lo stato dei pulsanti del mesociclo
 */
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

// Logica di blocco e sblocco manuale del mesociclo
export function toggleCurrentMesocycleLock() {
    const currentMeso = getActiveMesocycleObject();
    if (!currentMeso) return;

    currentMeso.locked = !currentMeso.locked;
    
    // Salva e sincronizza subito lo stato di blocco
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
            lockBtn.style.background = '#fef2f2'; // Sfondo rosso chiaro di avviso
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
            lockBtn.style.background = ''; // Ripristina lo stile originale del bottone
            lockBtn.style.borderColor = '';
            lockBtn.style.color = '';
        }
    }
}