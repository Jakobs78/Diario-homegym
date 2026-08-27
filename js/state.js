// state.js
export const state = {
    currentUser: null,
    activeMesocycleId: null,
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