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