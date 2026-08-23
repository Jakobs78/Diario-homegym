// Stato globale dell'applicazione
export const state = {
    isSignUpMode: false,
    currentUser: null,
    currentActiveTab: 'giorno1',
    workoutPlan: [],
    currentMesoNumber: 1,
    instanceChart1RM: null,
    instanceChartVol: null,
    instanceMacroChart: null,
    instanceMuscleChart: null,
    supabaseDebounceTimer: null,
    restInterval: null,
    currentTimerSeconds: 0
};