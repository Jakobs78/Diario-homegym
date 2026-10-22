// mycoatch/state.js

class MyCoatchState {
    constructor() {
        this.defaults = {
            name: "Mesociclo Adattivo MyCoach",
            durationWeeks: 4,
            daysPerWeek: 3,
            focus: "hybrid", // "strength", "hypertrophy", "hybrid"
            focusMuscleGroup: null, // "Petto", "Schiena", "Gambe", "Spalle", "Braccia"
            stepKg: 2.5,
            maxSessionMinutes: 60,
            userAge: 30,
            trainingYears: 3
        };
        this.config = { ...this.defaults };
        this.activeMesocycle = null;
    }

    updateConfig(newConfig) {
        this.config = { ...this.defaults, ...newConfig };
    }

    getConfig() {
        return { ...this.config };
    }

    setActiveMesocycle(meso) {
        this.activeMesocycle = meso;
    }

    getActiveMesocycle() {
        return this.activeMesocycle;
    }

    clear() {
        this.activeMesocycle = null;
    }
}

export const coachState = new MyCoatchState();

export const TRAINING_PROFILES = {
    hypertrophy_intermediate: {
        frequencyPerMuscle: 2, 
        repRange: [6, 12]      
    }
};
