// mycoatch/state.js

class MyCoatchState {
    constructor() {
        this.config = {
            name: "Nuovo Mesociclo Biologico Ibrido",
            durationWeeks: 4,
            daysPerWeek: 3,
            focus: "hybrid", // "strength", "hypertrophy", "hybrid"
            stepKg: 2.5,
            userAge: 30, // Parametro biologico fondamentale per il recupero SNC e tendineo
            trainingYears: 3 // Anzianità di allenamento
        };
        this.activeMesocycle = null;
    }

    updateConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
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
        mevSets: 8,            // Serie minime settimanali per gruppo
        mavRange: [12, 18],    // Range ottimale di serie (Accumulo -> Intensificazione)
        mrvSets: 22,           // Soglia di stallo/sovrallenamento
        repRange: [6, 12]      
    }
};