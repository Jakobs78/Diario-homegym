// Stato condiviso dell'applicazione
// js/state.js
export const state = {
    currentUser: null,
    supabaseClient: null,
    supabaseDebounceTimer: null,
    currentMesoNumber: 1,
    CURRENT_YEAR: new Date().getFullYear(),
    STORAGE_KEY_DATA: 'workout_diary_data',
    workoutPlan: [],
    instanceMacroChart: null,
    instanceMuscleChart: null
};