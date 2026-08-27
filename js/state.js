// state.js
export const state = {
    currentUser: null,
    activeMesocycle: null,
    workoutData: [],
    chartInstances: {},
    timer: {
        intervalId: null,
        remainingSeconds: 0,
        isActive: false
    }
};