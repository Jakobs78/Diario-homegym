// ui.js
import { state } from './state.js';

// Cache degli elementi del DOM per prestazioni migliori
export const DOM = {
    appContainer: document.getElementById('app-container'),
    workoutForm: document.getElementById('workout-form'),
    workoutListContainer: document.getElementById('workout-list-container'),
    timerDisplay: document.getElementById('timer-display')
    // Aggiungi qui gli altri ID del tuo index.html
};

export function renderWorkoutList() {
    if (!DOM.workoutListContainer) return;
    
    DOM.workoutListContainer.innerHTML = '';
    
    if (!state.workoutData || state.workoutData.length === 0) {
        DOM.workoutListContainer.innerHTML = '<p>Nessun allenamento registrato.</p>';
        return;
    }
    
    // Genera l'HTML per ogni set/allenamento
    state.workoutData.forEach(item => {
        const div = document.createElement('div');
        div.className = 'workout-item'; 
        // Adatta queste proprietà a come hai chiamato gli input nel form
        div.innerHTML = `
            <strong>${item.date || 'Data N/D'}</strong> - ${item.exercise || 'Esercizio'} 
            <br>
            ${item.sets || '-'}x${item.reps || '-'} @ ${item.weight || '-'}kg
        `;
        DOM.workoutListContainer.appendChild(div);
    });
}

export function showNotification(message, type = 'info') {
    // Semplice funzione per mostrare feedback visivi all'utente
    alert(`${type.toUpperCase()}: ${message}`); 
    // Puoi sostituire l'alert con un bel toast o un div a comparsa nel tuo CSS
}