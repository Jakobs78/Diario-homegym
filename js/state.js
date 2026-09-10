// ==========================================
// MODULI: state.js - Gestione dello stato reattivo globale dell'applicazione e funzione di reset
// ==========================================

export const state = {
    currentUser: null,
    activeMesocycleIndex: 0,
    activeWeek: 1,
    activeView: 'workout',
    workoutData: {
        athlete: { email: null },
        history: {
            years: {}
        }
    },
    chartInstances: {},
    timer: {
        intervalId: null,
        remainingSeconds: 0,
        isActive: false
    }
};

/**
 * Ripristina lo stato globale dell'applicazione ai valori iniziali di default
 */
export function resetState() {
    // Interrompe un eventuale timer attivo per evitare leak di memoria
    if (state.timer?.intervalId) {
        clearInterval(state.timer.intervalId);
    }

    state.currentUser = null;
    state.activeMesocycleIndex = 0;
    state.activeWeek = 1;
    state.activeView = 'workout';
    state.workoutData = {
        athlete: { email: null },
        history: {
            years: {}
        }
    };
    state.chartInstances = {};
    state.timer = {
        intervalId: null,
        remainingSeconds: 0,
        isActive: false
    };
}