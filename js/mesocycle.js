// js/mesocycle.js
import { state } from './state.js';
import { saveAndSync } from './storage.js';
import { renderWorkoutList, showNotification } from './ui.js';

/**
 * Gestisce lo scorrimento dei mesocicli (-1 o +1)
 */
export function changeMesocycle(direction) {
    if (!state.activeMesocycleIndex) state.activeMesocycleIndex = 0;
    
    const newIndex = state.activeMesocycleIndex + direction;
    if (newIndex >= 0) {
        state.activeMesocycleIndex = newIndex;
        const display = document.getElementById('meso-display');
        if (display) display.textContent = newIndex + 1;
        renderWorkoutList();
    }
}

/**
 * Elimina la scheda ed i dati del mesociclo attivo
 */
export function resetCurrentMesocycle() {
    if (confirm("Sei sicuro di voler eliminare la scheda e i dati del mesociclo selezionato?")) {
        const currentYear = new Date().getFullYear().toString();
        const yearData = state.workoutData.history?.years?.[currentYear];
        
        if (yearData && yearData.mesocycles) {
            yearData.mesocycles.splice(state.activeMesocycleIndex || 0, 1);
            saveAndSync(state.workoutData);
            renderWorkoutList();
            showNotification("Mesociclo eliminato con successo.");
        }
    }
}