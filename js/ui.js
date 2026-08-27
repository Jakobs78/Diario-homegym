// ui.js
import { state } from './state.js';

export const DOM = {
    appContainer: document.getElementById('app-container'),
    workoutForm: document.getElementById('workout-form'),
    workoutListContainer: document.getElementById('workout-list-container'),
    timerDisplay: document.getElementById('timer-display')
};

export function renderWorkoutList() {
    if (!DOM.workoutListContainer) return;
    
    DOM.workoutListContainer.innerHTML = '';
    
    const yearsObj = state.workoutData.history?.years || {};
    const years = Object.keys(yearsObj);
    
    if (years.length === 0) {
        DOM.workoutListContainer.innerHTML = '<p>Nessun mesociclo o allenamento registrato.</p>';
        return;
    }
    
    // Ciclo sugli anni
    years.forEach(year => {
        const yearSection = document.createElement('div');
        yearSection.className = 'year-section';
        yearSection.innerHTML = `<h3>Anno ${year}</h3>`;
        
        const mesocycles = yearsObj[year].mesocycles || [];
        if (mesocycles.length === 0) {
            yearSection.innerHTML += `<p>Nessun mesociclo per il ${year}.</p>`;
        }
        
        // Ciclo sui mesocicli
        mesocycles.forEach(meso => {
            const mesoDiv = document.createElement('div');
            mesoDiv.className = 'mesocycle-card';
            mesoDiv.innerHTML = `<h4>Mesociclo: ${meso.name} (${meso.startDate} - ${meso.endDate || 'In corso'})</h4>`;
            
            // Ciclo sulle settimane
            (meso.weeks || []).forEach(week => {
                const weekDiv = document.createElement('div');
                weekDiv.className = 'week-block';
                weekDiv.innerHTML = `<h5>Settimana ${week.weekNumber}</h5>`;
                
                // Ciclo sui giorni
                (week.days || []).forEach(day => {
                    const dayDiv = document.createElement('div');
                    dayDiv.className = 'day-block';
                    dayDiv.innerHTML = `<strong>${day.dayName} (${day.date})</strong>`;
                    
                    const ul = document.createElement('ul');
                    (day.exercises || []).forEach(ex => {
                        const li = document.createElement('li');
                        const setsSummary = (ex.loggedSets || []).map(s => `${s.reps}r @ ${s.weight}kg`).join(' | ');
                        li.textContent = `${ex.name}: ${setsSummary || 'Nessun set registrato'}`;
                        ul.appendChild(li);
                    });
                    
                    dayDiv.appendChild(ul);
                    weekDiv.appendChild(dayDiv);
                });
                mesoDiv.appendChild(weekDiv);
            });
            yearSection.appendChild(mesoDiv);
        });
        DOM.workoutListContainer.appendChild(yearSection);
    });
}

export function showNotification(message, type = 'info') {
    alert(`${type.toUpperCase()}: ${message}`);
}