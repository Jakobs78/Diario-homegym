// ==========================================
// MODULI: state.js - Gestione dello stato reattivo globale dell'applicazione e funzione di reset
// ==========================================

export const state = {
    currentUser: null,
    currentYear: localStorage.getItem('ui_active_year') || String(new Date().getFullYear()),
    // 🧠 Legge la posizione visiva salvata dal browser
    activeMesocycleIndex: parseInt(localStorage.getItem('ui_active_meso')) || 0,
    activeWeek: parseInt(localStorage.getItem('ui_active_week')) || 1,
    activeDay: parseInt(localStorage.getItem('ui_active_day')) || 1,

    showArchivedHistory: false,
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
    state.currentYear = String(new Date().getFullYear());
    state.activeMesocycleIndex = 0;
    state.activeWeek = 1;
    state.activeView = 'workout';
    state.showArchivedHistory = false;
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
