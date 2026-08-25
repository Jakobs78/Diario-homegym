// Rendering delle viste, tab, grafici Charts.js e PDF
import { renderManualView } from './manual.js';
import { CURRENT_YEAR, STORAGE_KEY_DATA } from './config.js';
import { state } from './state.js';
import { slugify, extractNumber, getExerciseSignature, getAutoMuscleGroup, parseRestTime } from './helpers.js';
import { playBeep } from './audio.js';
import { saveInputToStorage, saveMetaToStorage } from './storage.js';


export function switchTab(dayId, btn) {
    state.currentActiveTab = dayId;

    document.querySelectorAll('.tab-btn').forEach(tab => tab.classList.remove('active'));
    if (btn) {
        btn.classList.add('active');
    } else {
        const matchingTab = document.querySelector(`.tab-btn[data-target="${dayId}"]`);
        if (matchingTab) matchingTab.classList.add('active');
    }
    // Gestione visualizzazione delle viste
    document.querySelectorAll('.day-view').forEach(view => view.classList.remove('active'));
    const targetView = document.getElementById(dayId);
    if (targetView) targetView.classList.add('active');
    
    if (dayId === 'stats') {
        renderMuscleVolumeDashboard();
    } else if (dayId === 'progress') {
        renderProgressTable();
    } else if (dayId === 'macro-progress') {
        renderMacroProgress();
    } else if (dayId === 'manual') {
        const manualContainer = document.getElementById('manual-content');
        if (manualContainer) {
            manualContainer.innerHTML = renderManualView();
        }
    } else {
        renderCurrentView(); 
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
}
// Rendi disponibile switchTab globalmente (lascia questa riga così com'è)
window.switchTab = switchTab;

// AGGIUNGI QUI SOTTO la nuova funzione per il menu a tendina
window.handleAnalyticsNavigation = function(tabId) {
    if (!tabId) return;
    
    const targetView = document.getElementById(tabId);
    if (targetView) {
        switchTab(tabId, null); 
    }

    // Riporta il select sulla voce iniziale dopo la selezione
    setTimeout(() => {
        const menu = document.getElementById('analyticsMenu');
        if (menu) menu.value = "";
    }, 150);
};

export function generateDynamicDays() {
    const tabsContainer = document.getElementById('dynamic-day-tabs');
    const viewsContainer = document.getElementById('dynamic-views-container');
    
    tabsContainer.innerHTML = '';
    viewsContainer.innerHTML = '';

    if (!state.workoutPlan || state.workoutPlan.length === 0) return;

    const uniqueDays = new Set();
    state.workoutPlan.forEach(ex => {
        if (ex.Giorno) {
            uniqueDays.add(parseInt(ex.Giorno));
        }
    });

    const sortedDays = Array.from(uniqueDays).sort((a, b) => a - b);
    if (sortedDays.length === 0) return;

    sortedDays.forEach((day, index) => {
        const dayId = `giorno${day}`;
        
        const btn = document.createElement('button');
        btn.className = `tab-btn ${index === 0 ? 'active' : ''}`;
        btn.onclick = function() { switchTab(dayId, this); };
        btn.innerText = `Giorno ${day}`;
        tabsContainer.appendChild(btn);

        const viewDiv = document.createElement('div');
        viewDiv.className = `day-view ${index === 0 ? 'active' : ''}`;
        viewDiv.id = dayId;
        viewsContainer.appendChild(viewDiv);
    });

    if (!sortedDays.some(day => `giorno${day}` === state.currentActiveTab)) {
        state.currentActiveTab = `giorno${sortedDays[0]}`;
    }
}

export function renderCurrentView() {
    if (state.currentActiveTab === 'manual') {
        document.querySelectorAll('.day-view').forEach(view => view.classList.remove('active'));
        
        const manualView = document.getElementById('manual');
        if (manualView) {
            manualView.classList.add('active');
        }
        
        const manualContainer = document.getElementById('manual-content');
        if (manualContainer) {
            manualContainer.innerHTML = renderManualView();
        }
        return;
    }
    if (state.currentActiveTab === 'macro-progress') {
        document.querySelectorAll('.day-view').forEach(view => view.classList.remove('active'));
        document.getElementById('macro-progress').classList.add('active');
        renderMacroProgress();
        return;
    }
    if (state.currentActiveTab === 'progress') {
        document.querySelectorAll('.day-view').forEach(view => view.classList.remove('active'));
        document.getElementById('progress').classList.add('active');
        renderProgressTable();
        return;
    }
    if (state.currentActiveTab === 'stats') {
        document.querySelectorAll('.day-view').forEach(view => view.classList.remove('active'));
        document.getElementById('stats').classList.add('active');
        renderMuscleVolumeDashboard();
        return;
    }
    if (state.workoutPlan.length === 0) return;

    document.querySelectorAll('.day-view').forEach(view => view.classList.remove('active'));
    const container = document.getElementById(state.currentActiveTab);
    container.classList.add('active');

    const dayNum = state.currentActiveTab.replace('giorno', '');
    container.innerHTML = '';
    const mesoPrefix = `${CURRENT_YEAR}-mese_${state.currentMesoNumber}`;
    const weekNumber = document.getElementById('week-selector').value;
    
    const dailyExercises = state.workoutPlan.filter(ex => parseInt(ex.Settimana) === parseInt(weekNumber) && parseInt(ex.Giorno) === parseInt(dayNum));
    
    if(dailyExercises.length === 0) {
        container.innerHTML = `<div class="day-card"><p style="text-align:center; padding: 20px;">Nessun esercizio programmato per la Settimana ${weekNumber} - Giorno ${dayNum}.</p></div>`;
        return;
    }

    container.innerHTML = `
        <div class="day-card" id="card-${state.currentActiveTab}">
            <div class="day-title">
                <span>Giorno ${dayNum}</span>
                <span class="day-subtitle">Mese ${state.currentMesoNumber} - Settimana ${weekNumber}</span>
            </div>
        </div>
    `;
    
    const cardContainer = document.getElementById(`card-${state.currentActiveTab}`);

    const blockOrder = [];
    const blockMap = {};

    dailyExercises.forEach(ex => {
        const bNum = ex.Blocco ? ex.Blocco.trim() : '1';
        if (!blockMap[bNum]) {
            blockMap[bNum] = [];
            blockOrder.push(bNum);
        }
        blockMap[bNum].push(ex);
    });

    let i = 0;
    while (i < blockOrder.length) {
        const currentBNum = blockOrder[i];
        const currentExercises = blockMap[currentBNum];
        
        const hasSupersetNote = currentExercises.some(ex => 
            ex.NoteAllenatore && /superset|superserie/i.test(ex.NoteAllenatore)
        );

        if (hasSupersetNote && i + 1 < blockOrder.length) {
            const nextBNum = blockOrder[i + 1];
            const nextExercises = blockMap[nextBNum];
            
            const baseNumMatch = currentBNum.match(/\d+/);
            const baseNum = baseNumMatch ? baseNumMatch[0] : currentBNum;

            let blockHtml = `<div class="block">`;
            blockHtml += `<div class="block-title">Blocco ${baseNum}A - ${baseNum}B</div>`;
            blockHtml += `<div class="superset-block">`;
            blockHtml += `<div class="superset-header"><span class="superset-badge">SUPERSET</span><span class="rest-info">Esegui ${baseNum}A e ${baseNum}B in sequenza</span></div>`;

            currentExercises.forEach((ex) => {
                blockHtml += renderExerciseCard(ex, `${baseNum}A`, mesoPrefix, weekNumber, dayNum);
            });

            nextExercises.forEach((ex) => {
                blockHtml += renderExerciseCard(ex, `${baseNum}B`, mesoPrefix, weekNumber, dayNum);
            });

            blockHtml += `</div></div>`;
            cardContainer.innerHTML += blockHtml;
            i += 2;
        } else {
            let blockHtml = `<div class="block"><div class="block-title">Blocco ${currentBNum}</div>`;
            currentExercises.forEach((ex) => {
                blockHtml += renderExerciseCard(ex, `${currentBNum}`, mesoPrefix, weekNumber, dayNum);
            });

            blockHtml += `</div>`;
            cardContainer.innerHTML += blockHtml;
            i += 1;
        }
    }

    attachStorageListeners();
}

function findLastSessionForExercise(targetMeso, targetWeek, targetDay, ex, totalSets) {
    const savedData = JSON.parse(localStorage.getItem(STORAGE_KEY_DATA)) || {};
    const targetSig = getExerciseSignature(ex);

    let m = targetMeso;
    let w = targetWeek;
    let d = targetDay;

    // Cicla all'indietro nel tempo per trovare la sessione precedente
    while (m >= 1) {
        d--;
        if (d < 1) { 
            d = 7; // Cerca su un massimo di 7 giorni a settimana
            w--; 
            if (w < 1) { 
                w = 8; // Massimo range di settimane
                m--; 
            } 
        }

        if (m < 1) break;

        const prefix = `${CURRENT_YEAR}-mese_${m}_w${w}-d${d}-`;
        
        for (let key of Object.keys(savedData)) {
            if (key.startsWith(prefix) && key.includes(`-${targetSig}-s`) && key.endsWith('-kg')) {
                let historySetsData = [];
                const baseKeyWithoutSet = key.replace(/-s\d+-kg$/, '');

                let st = 1;
                while (true) {
                    const specificKgKey = `${baseKeyWithoutSet}-s${st}-kg`;
                    const specificRepKey = `${baseKeyWithoutSet}-s${st}-r`;
                    const specificRpeKey = `${baseKeyWithoutSet}-s${st}-rpe`;

                    if (savedData[specificKgKey] !== undefined && savedData[specificKgKey] !== '') {
                        historySetsData.push({
                            set: st,
                            kg: savedData[specificKgKey],
                            reps: savedData[specificRepKey] || '',
                            rpe: savedData[specificRpeKey] || ''
                        });
                        st++;
                    } else {
                        break;
                    }
                }

                if (historySetsData.length > 0) return historySetsData;
            }
        }
    }

    return null;
}

export function renderExerciseCard(ex, exerciseLabel, mesoPrefix, weekNumber, dayNum) {
    const totalSets = parseInt(ex.Set) || 1;
    const currentWeekInt = parseInt(weekNumber);
    const savedData = JSON.parse(localStorage.getItem(STORAGE_KEY_DATA)) || {};

    let lastSessionData = findLastSessionForExercise(state.currentMesoNumber, currentWeekInt, parseInt(dayNum), ex, totalSets);
    
    let historyText = "Nessun dato precedente";
    if (lastSessionData && lastSessionData.length > 0) {
        let historySets = lastSessionData.map(item => {
            let repStr = item.reps ? `x ${item.reps}` : '';
            let rpeStr = item.rpe ? `(RPE ${item.rpe})` : '';
            return `S${item.set}: ${item.kg}kg ${repStr} ${rpeStr}`;
        });
        historyText = historySets.join(' | ');
    }

    // Costruzione Range KG e gestione accurata del Topset in caso di vuoti
    let csvKgMin = null, csvKgMax = null;
    let kgDisplay = '';
    
    const hasKgMin = ex.KgMin && String(ex.KgMin).trim() !== '';
    const hasKgMax = ex.KgMax && String(ex.KgMax).trim() !== '';
    const hasTopset = ex.Topset && String(ex.Topset).trim() !== '';

    if (hasKgMin && hasKgMax) {
        csvKgMin = parseFloat(ex.KgMin);
        csvKgMax = parseFloat(ex.KgMax);
        kgDisplay = `${ex.KgMin}-${ex.KgMax}`;
    } else if (hasTopset) {
        csvKgMin = parseFloat(ex.Topset);
        csvKgMax = parseFloat(ex.Topset);
        kgDisplay = `${ex.Topset} Topset`; // Mostrato come target testuale
    } else if (ex.Kg && String(ex.Kg).trim() !== '') {
        const kgStr = String(ex.Kg).trim();
        kgDisplay = kgStr;
        if (kgStr.includes('-')) {
            const pts = kgStr.split('-');
            csvKgMin = parseFloat(pts[0]);
            csvKgMax = parseFloat(pts[1]);
        } else {
            csvKgMin = parseFloat(kgStr);
            csvKgMax = parseFloat(kgStr);
        }
    }

    let csvRepMin = null, csvRepMax = null;
    if (ex.Reps) {
        const repStr = String(ex.Reps).trim();
        if (repStr.includes('-')) {
            const parts = repStr.split('-');
            csvRepMin = parseFloat(parts[0]);
            csvRepMax = parseFloat(parts[1]);
        } else {
            csvRepMin = parseFloat(repStr);
            csvRepMax = parseFloat(repStr);
        }
    }

    // Placeholder di Default: Usa Topset se min/max sono vuoti
    let defaultKgPlaceholder = '';
    if (hasKgMin && hasKgMax) {
        defaultKgPlaceholder = `${ex.KgMin}-${ex.KgMax}`;
    } else if (hasTopset) {
        defaultKgPlaceholder = `${ex.Topset}`; // Imposta il topset come numero per il placeholder
    } else if (ex.Kg && String(ex.Kg).trim() !== '') {
        defaultKgPlaceholder = `${ex.Kg}`;
    }

    const targetKgText = kgDisplay ? `<span style="color: #ea580c; font-weight: 700;"> ${kgDisplay}</span> | ` : '';
    const exSlugWithSig = getExerciseSignature(ex);
    const cardUniqueId = `${mesoPrefix}_w${weekNumber}-d${dayNum}-${ex.Blocco}-${exSlugWithSig}`;
    const firstSetKgId = `${cardUniqueId}-s1-kg`;
    const barbellSelectId = `barbell-${cardUniqueId}`;
    const plateDisplayId = `plates-display-${cardUniqueId}`;

    let setsHtml = '';
    for (let s = 1; s <= totalSets; s++) {
        const kgId = `${cardUniqueId}-s${s}-kg`;
        const warmupId = `${cardUniqueId}-s${s}-w`;
        const repId = `${cardUniqueId}-s${s}-r`;
        const rpeId = `${cardUniqueId}-s${s}-rpe`;
        const checkId = `${cardUniqueId}-s${s}-c`;

        let kgPlaceholder = defaultKgPlaceholder;
        let repPlaceholder = ex.Reps ? String(ex.Reps) : '';

        if (lastSessionData && lastSessionData.length > 0) {
            const matchedSet = lastSessionData.find(item => item.set === s) || lastSessionData[lastSessionData.length - 1];
            if (matchedSet.kg !== undefined && matchedSet.kg !== '') kgPlaceholder = matchedSet.kg;
            if (matchedSet.reps !== undefined && matchedSet.reps !== '') repPlaceholder = matchedSet.reps;
        }

        let currentKgValue = savedData[kgId] !== undefined ? savedData[kgId] : '';
        let currentRepValue = savedData[repId] !== undefined ? savedData[repId] : '';
        let currentRpeValue = savedData[rpeId] !== undefined ? savedData[rpeId] : (ex.RPE ? extractNumber(ex.RPE) : '');

        const onInputAttr = (s === 1) ? `oninput="window.updateLivePlates('${cardUniqueId}', '${firstSetKgId}')"` : '';

        setsHtml += `
        <tr>
            <td>
              <div style="display: flex; align-items: center; justify-content: center;">
                ${s}
                <label>
                    <input type="checkbox" class="warmup-checkbox" data-id="${warmupId}">
                    <span class="warmup-toggle" title="Segna come Warm-up">Escludi</span>
                </label>
              </div>
            </td>
            <td>
                <input type="text" inputmode="decimal" 
                       data-id="${kgId}" 
                       data-csv-kg-min="${csvKgMin !== null ? csvKgMin : ''}" 
                       data-csv-kg-max="${csvKgMax !== null ? csvKgMax : ''}" 
                       value="${currentKgValue}" 
                       placeholder="${kgPlaceholder}" 
                       ${onInputAttr} onfocus="this.select()">
            </td>
            <td>
                <input type="text" inputmode="decimal" 
                       data-id="${repId}" 
                       data-csv-rep-min="${csvRepMin !== null ? csvRepMin : ''}" 
                       data-csv-rep-max="${csvRepMax !== null ? csvRepMax : ''}" 
                       value="${currentRepValue}" 
                       placeholder="${repPlaceholder}" 
                       onfocus="this.select()">
            </td>
            <td>
                <input type="text" inputmode="decimal" data-id="${rpeId}" value="${currentRpeValue}" onfocus="this.select()">
            </td>
            <td>
                <input type="checkbox" class="check-input" data-id="${checkId}" data-rest="${ex.Recupero || '90'}">
            </td>
        </tr>
        `;
    }

    setTimeout(() => { if(window.updateLivePlates) window.updateLivePlates(cardUniqueId, firstSetKgId); }, 50);

    return `
        <div class="ex-card" data-card-id="${cardUniqueId}">
        <div class="ex-header">
            <div style="display: flex; justify-content: space-between; align-items: center; width: 100%; flex-wrap: wrap; gap: 4px;">
                <span class="ex-name">${exerciseLabel}. ${ex.Esercizio}</span>
                
                <div style="display: flex; align-items: center; gap: 6px; font-size: 0.7rem;">
                    <select id="${barbellSelectId}" onchange="window.updateLivePlates('${cardUniqueId}', '${firstSetKgId}')" style="font-size: 0.7rem; padding: 2px 4px; border-radius: 4px; border: 1px solid #d1d5db; background: #fff; cursor: pointer;">
                        <option value="20">Bil. 20kg</option>
                        <option value="15">Bil. 15kg</option>
                        <option value="10">Bil. 10kg</option>
                        <option value="9">Bil. 9kg</option>
                        <option value="6">Bil. 6kg</option>
                    </select>
                    <span id="${plateDisplayId}" style="background: #eff6ff; padding: 3px 8px; border-radius: 4px; font-weight: 600; color: #1e40af; border: 1px solid #bfdbfe; white-space: nowrap;">
                        ⚖️ --
                    </span>
                </div>
            </div>
            <span class="ex-target">
            ${targetKgText}${ex.Set} Set x ${ex.Reps} | RPE: ${ex.RPE} | Rest: ${ex.Recupero}
            ${ex.Topset ? ` | <span style="color: #dc2626; font-weight: 800;">Topset: ${ex.Topset}</span>` : ''}
            </span>
        </div>
        
        ${ex.NoteAllenatore ? `
            <div class="note-allenatore">
                <div class="note-allenatore-title">Note Allenatore</div>
                <span class="note-allenatore-text">${ex.NoteAllenatore}</span>
            </div>` : ''}

        <div class="history-box">
            <div class="history-title">Scorsa Sessione</div>
            <span>${historyText}</span>
        </div>

        <table class="set-table">
            <tr><th>SET</th><th>KG</th><th>REPS</th><th>RPE</th><th>✓</th></tr>
            ${setsHtml}
        </table>
        <textarea class="notes-input" data-id="${cardUniqueId}-notes" placeholder="Note esercizio..." rows="1" oninput="this.style.height = 'auto'; this.style.height = this.scrollHeight + 'px'"></textarea>
        </div>
    `;
}

export function calcPlates(targetWeight) {
    const barWeight = parseFloat(document.getElementById('barbell-selector')?.value) || 20;
    
    if (!targetWeight || targetWeight <= barWeight) {
        alert(`Nessun disco necessario! Usa solo il bilanciere da ${barWeight}kg o un target inferiore.`);
        return;
    }

    let perSide = (targetWeight - barWeight) / 2;
    const plates = [25, 20, 15, 10, 5, 2.5, 2, 1.25, 1, 0.5]; 
    let loaded = [];
    
    for (let p of plates) {
        let count = Math.floor(perSide / p + 1e-9);
        if (count > 0) {
            loaded.push(`${count} disco/i da ${p} kg`);
            perSide = Number((perSide - count * p).toFixed(2));
        }
    }
    
    alert(`🎯 TARGET: ${targetWeight} kg\n🏋️ BILANCIERE: ${barWeight} kg\n\n👉 CARICA PER OGNI LATO:\n- ` + loaded.join('\n- '));
}
window.calcPlates = calcPlates;

// Funzione che calcola se un input (o il suo placeholder se vuoto) è fuori range
function validateInput(input) {
    if (!input || input.type === 'checkbox') return false;
    
    // Per calcolare l'errore, guardiamo il valore inserito. Se è vuoto, valutiamo il placeholder.
    const textToValidate = input.value.trim() !== '' ? input.value : input.placeholder;
    const val = parseFloat(textToValidate.replace(',', '.'));
    
    if (isNaN(val)) return false;

    let isOutOfRange = false;
    
    // Check limiti KG
    if (input.hasAttribute('data-csv-kg-min') && input.getAttribute('data-csv-kg-min') !== '') {
        const minKg = parseFloat(input.getAttribute('data-csv-kg-min'));
        const maxKg = parseFloat(input.getAttribute('data-csv-kg-max'));
        if (!isNaN(minKg) && !isNaN(maxKg) && (val < minKg || val > maxKg)) {
            isOutOfRange = true;
        }
    }
    
    // Check limiti REPS
    if (input.hasAttribute('data-csv-rep-min') && input.getAttribute('data-csv-rep-min') !== '') {
        const minRep = parseFloat(input.getAttribute('data-csv-rep-min'));
        const maxRep = parseFloat(input.getAttribute('data-csv-rep-max'));
        if (!isNaN(minRep) && !isNaN(maxRep) && (val < minRep || val > maxRep)) {
            isOutOfRange = true;
        }
    }

    // Colora di rosso il testo digitato SOLO se l'utente ci ha scritto qualcosa
    if (input.value.trim() !== '') {
        if (isOutOfRange) {
            input.style.color = '#dc2626';     
            input.style.fontWeight = '700';    
        } else {
            input.style.color = '';            
            input.style.fontWeight = '600';
        }
    } else {
        input.style.color = '';
        input.style.fontWeight = '600';
    }
    
    // Ritorna true se il numero analizzato è fuori range (servirà per il placeholder successivo)
    return isOutOfRange;
}

// Funzione di "Refresh Istantaneo": propaga valori e calcola i rossi sfumati
export function syncCardPlaceholders(cardUniqueId) {
    let lastValidKg = '';
    let lastValidRep = '';
    let lastWasInvalid = false;
    
    let s = 1;
    while(true) {
        const kgInput = document.querySelector(`input[data-id="${cardUniqueId}-s${s}-kg"]`);
        const repInput = document.querySelector(`input[data-id="${cardUniqueId}-s${s}-r"]`);
        const checkInput = document.querySelector(`input[data-id="${cardUniqueId}-s${s}-c"]`);
        
        if (!kgInput || !checkInput) break; // Fine dei set per questa scheda
        
        // 1. Applica il placeholder ereditato dal set spuntato precedente (se esiste)
        if (s > 1 && lastValidKg !== '') {
            kgInput.placeholder = lastValidKg;
            if (lastWasInvalid) kgInput.classList.add('invalid-placeholder');
            else kgInput.classList.remove('invalid-placeholder');
        }
        if (s > 1 && lastValidRep !== '') {
            repInput.placeholder = lastValidRep;
        }
        
        // 2. Valida istantaneamente l'input di questa riga
        const currentIsInvalid = validateInput(kgInput);
        validateInput(repInput);
        
        // 3. Se questo set è COMPLETATO (spuntato), cattura il suo valore e lo passa alla riga sotto
        if (checkInput.checked) {
            lastValidKg = kgInput.value.trim() !== '' ? kgInput.value : kgInput.placeholder;
            lastValidRep = repInput.value.trim() !== '' ? repInput.value : repInput.placeholder;
            lastWasInvalid = currentIsInvalid;
        }
        
        s++;
    }
}

// Configura tutti i listener all'avvio
export function attachStorageListeners() {
    const savedData = JSON.parse(localStorage.getItem(STORAGE_KEY_DATA)) || {};
    const processedCards = new Set();
    
    document.querySelectorAll('.day-view.active input').forEach(input => {
        const dataId = input.getAttribute('data-id');
        if (!dataId) return;
        
        // Assegna il valore salvato (se c'è)
        if (savedData[dataId] !== undefined) {
            if (input.type === 'checkbox') input.checked = savedData[dataId];
            else input.value = savedData[dataId];
        }

        // Troviamo l'ID della scheda madre
        let cardUniqueId = "";
        if (dataId.includes('-s')) cardUniqueId = dataId.substring(0, dataId.lastIndexOf('-s'));
        else if (dataId.includes('-notes')) cardUniqueId = dataId.replace('-notes', '');

        // Alla prima interazione, sincronizziamo tutta la scheda per applicare i rossi se caricati da DB
        if (cardUniqueId && !processedCards.has(cardUniqueId)) {
            syncCardPlaceholders(cardUniqueId);
            processedCards.add(cardUniqueId);
        }

        // Evento 1: Digitazione live
        if (input.type !== 'checkbox') {
            input.addEventListener('input', function(e) {
                if (cardUniqueId) syncCardPlaceholders(cardUniqueId);
                saveInputToStorage(e);
            });
            input.addEventListener('focus', function() {
                setTimeout(() => this.select(), 50);
            });
        }

        // Evento 2: Salvataggio standard e Click sulle Spunte (Refresh + Timer + Blocco Riga)
        input.addEventListener('change', function(e) {
            saveInputToStorage(e);
            
            if (this.type === 'checkbox' && this.classList.contains('check-input')) {
                // Esegue il refresh istantaneo della UI
                syncCardPlaceholders(cardUniqueId);
                
                // UI: Blocca input e rende grigia la riga
                const baseId = dataId.substring(0, dataId.lastIndexOf('-'));
                const kgInput = document.querySelector(`input[data-id="${baseId}-kg"]`);
                const repInput = document.querySelector(`input[data-id="${baseId}-r"]`);
                const rpeInput = document.querySelector(`input[data-id="${baseId}-rpe"]`);

                [kgInput, repInput, rpeInput].forEach(inp => {
                    if (inp) {
                        inp.readOnly = this.checked;
                        inp.style.backgroundColor = this.checked ? 'var(--block-bg)' : '';
                        inp.style.opacity = this.checked ? '0.7' : '1';
                    }
                });

                // AVVIO TIMER DEL REST QUANDO SI SPUNTA (solo se si sta attivando la spunta)
                if (this.checked) {
                    const restTime = this.getAttribute('data-rest');
                    if (typeof window.startTimer === 'function') {
                        window.startTimer(parseInt(restTime, 10));
                    } else if (typeof window.startRestTimer === 'function') {
                        window.startRestTimer(parseInt(restTime, 10));
                    }
                }
            }
        });
    });

    // Controllo al caricamento: Blocca visualmente le celle che risultano GIÀ spuntate dal salvataggio precedente
    document.querySelectorAll('.day-view.active input.check-input').forEach(checkbox => {
        if (checkbox.checked) {
            const checkId = checkbox.getAttribute('data-id');
            const baseId = checkId.substring(0, checkId.lastIndexOf('-'));
            
            const kgInput = document.querySelector(`input[data-id="${baseId}-kg"]`);
            const repInput = document.querySelector(`input[data-id="${baseId}-r"]`);
            const rpeInput = document.querySelector(`input[data-id="${baseId}-rpe"]`);

            [kgInput, repInput, rpeInput].forEach(inp => {
                if (inp) {
                    inp.readOnly = true;
                    inp.style.backgroundColor = 'var(--block-bg)';
                    inp.style.opacity = '0.7';
                }
            });
        }
    });
}

export function renderProgressTable() {
    const container = document.getElementById('progress-content');
    const savedData = JSON.parse(localStorage.getItem(STORAGE_KEY_DATA)) || {};
    const mesoPrefix = `${CURRENT_YEAR}-mese_${state.currentMesoNumber}`;

    const uniqueExercises = [];
    const seen = new Set();
    state.workoutPlan.forEach(ex => {
        const nameSlug = slugify(ex.Esercizio);
        if (!seen.has(nameSlug)) {
            seen.add(nameSlug);
            uniqueExercises.push(ex);
        }
    });

    if (uniqueExercises.length === 0) {
        container.innerHTML = `<p style="text-align:center; padding: 20px;">Nessun esercizio trovato nella scheda.</p>`;
        return;
    }

    const colors = ['#0284c7', '#16a34a', '#dc2626', '#ca8a04', '#9333ea', '#0d9488', '#ea580c', '#4f46e5'];
    let chartDatasets1RM = [];
    let chartDatasetsVol = [];

    let html = `
        <h4 style="color: var(--accent-color); margin-bottom: 8px;">Massimali Teorici (1RM Stimato con RPE) - Mese ${state.currentMesoNumber}</h4>
        <table class="progress-table" style="margin-bottom: 14px;">
            <tr><th>Esercizio</th><th>Sett. 1</th><th>Sett. 2</th><th>Sett. 3</th><th>Sett. 4</th></tr>
    `;

    uniqueExercises.forEach((ex, index) => {
        const nameSlug = slugify(ex.Esercizio);
        let weekMax1RM = ['', '', '', ''];
        let raw1RM = [null, null, null, null];
        let rawVol = [null, null, null, null];

        for (let w = 1; w <= 4; w++) {
            let max1RMForWeek = 0;
            let weekVolume = 0;
            
            Object.keys(savedData).forEach(key => {
                if (key.startsWith(`${mesoPrefix}_w${w}-`) && key.includes(`-${nameSlug}_`) && key.endsWith('-kg')) {
                    const baseId = key.substring(0, key.lastIndexOf('-kg'));
                    const repKey = `${baseId}-r`;
                    const rpeKey = `${baseId}-rpe`;
                    const warmupKey = `${baseId}-w`;
                    const isWarmup = savedData[warmupKey] === true || savedData[warmupKey] === 'true';
                    
                    if (!isWarmup && savedData[key] && savedData[repKey]) {
                        let weight = parseFloat(savedData[key]);
                        let reps = parseFloat(savedData[repKey]);
                        let rpe = parseFloat(savedData[rpeKey]);

                        if (!isNaN(weight) && !isNaN(reps) && weight > 0 && reps > 0) {
                            weekVolume += weight * reps;
                            
                            let effectiveReps = reps;
                            if (!isNaN(rpe) && rpe >= 1 && rpe <= 10) {
                                const rir = Math.max(0, 10 - rpe);
                                effectiveReps = reps + rir;
                            }
                            let current1RM = weight * (1 + effectiveReps / 30);
                            if (current1RM > max1RMForWeek) max1RMForWeek = current1RM;
                        }
                    }
                }
            });

            if (max1RMForWeek > 0) {
                weekMax1RM[w - 1] = Math.round(max1RMForWeek) + " kg";
                raw1RM[w - 1] = Math.round(max1RMForWeek);
            } else {
                weekMax1RM[w - 1] = "-";
            }

            if (weekVolume > 0) rawVol[w - 1] = Math.round(weekVolume);
        }

        html += `<tr><td style="text-align: left; font-weight: 700;">${ex.Esercizio}</td><td>${weekMax1RM[0]}</td><td>${weekMax1RM[1]}</td><td>${weekMax1RM[2]}</td><td>${weekMax1RM[3]}</td></tr>`;

        const color = colors[index % colors.length];
        chartDatasets1RM.push({ label: ex.Esercizio, data: raw1RM, borderColor: color, backgroundColor: color, fill: false, tension: 0.1 });
        chartDatasetsVol.push({ label: ex.Esercizio, data: rawVol, borderColor: color, backgroundColor: color, fill: false, tension: 0.1 });
    });
    html += `</table>`;

    html += `<div style="margin-bottom: 24px; background: #fff; padding: 10px; border-radius: 8px; border: 1px solid var(--border-color);"><canvas id="chart1RM"></canvas></div>`;

    html += `
        <h4 style="color: var(--accent-color); margin-bottom: 8px;">Volume Totale (Tonnage Kg x Reps)</h4>
        <table class="progress-table" style="margin-bottom: 14px;">
            <tr><th>Esercizio</th><th>Sett. 1</th><th>Sett. 2</th><th>Sett. 3</th><th>Sett. 4</th></tr>
    `;

    uniqueExercises.forEach(ex => {
        const nameSlug = slugify(ex.Esercizio);
        let weekVolume = ['', '', '', ''];

        for (let w = 1; w <= 4; w++) {
            let totalVol = 0;
            Object.keys(savedData).forEach(key => {
                if (key.startsWith(`${mesoPrefix}_w${w}-`) && key.includes(`-${nameSlug}_`) && key.endsWith('-kg')) {
                    const baseId = key.substring(0, key.lastIndexOf('-kg'));
                    const repKey = `${baseId}-r`;
                    const warmupKey = `${baseId}-w`;
                    const isWarmup = savedData[warmupKey] === true || savedData[warmupKey] === 'true';
                    if (!isWarmup && savedData[key] && savedData[repKey]) {
                        let weight = parseFloat(savedData[key]);
                        let reps = parseFloat(savedData[repKey]);
                        if (!isNaN(weight) && !isNaN(reps) && weight > 0 && reps > 0) {
                            totalVol += weight * reps;
                        }
                    }
                }
            });
            weekVolume[w - 1] = totalVol > 0 ? Math.round(totalVol) + " kg" : "-";
        }

        html += `<tr><td style="text-align: left; font-weight: 700;">${ex.Esercizio}</td><td>${weekVolume[0]}</td><td>${weekVolume[1]}</td><td>${weekVolume[2]}</td><td>${weekVolume[3]}</td></tr>`;
    });
    html += `</table>`;

    html += `<div style="background: #fff; padding: 10px; border-radius: 8px; border: 1px solid var(--border-color);"><canvas id="chartVol"></canvas></div>`;

    container.innerHTML = html;

    if (state.instanceChart1RM) state.instanceChart1RM.destroy();
    if (state.instanceChartVol) state.instanceChartVol.destroy();

    const ctx1RM = document.getElementById('chart1RM').getContext('2d');
    state.instanceChart1RM = new Chart(ctx1RM, {
        type: 'line',
        data: { labels: ['Sett 1', 'Sett 2', 'Sett 3', 'Sett 4'], datasets: chartDatasets1RM },
        options: { responsive: true, plugins: { title: { display: true, text: 'Andamento Massimale 1RM (kg)' } }, spanGaps: true }
    });

    const ctxVol = document.getElementById('chartVol').getContext('2d');
    state.instanceChartVol = new Chart(ctxVol, {
        type: 'line',
        data: { labels: ['Sett 1', 'Sett 2', 'Sett 3', 'Sett 4'], datasets: chartDatasetsVol },
        options: { responsive: true, plugins: { title: { display: true, text: 'Andamento Tonnellaggio (kg)' } }, spanGaps: true }
    });
}

export function renderMacroProgress() {
    const container = document.getElementById('macro-progress-content');
    const savedData = JSON.parse(localStorage.getItem(STORAGE_KEY_DATA)) || {};

    const mesosSet = new Set();
    const exerciseMesoMax1RM = {};

    Object.keys(savedData).forEach(key => {
        if (key.toLowerCase().includes('mese_') && key.endsWith('-kg')) {
            const baseId = key.substring(0, key.lastIndexOf('-kg'));
            
            const mesoMatch = key.match(/mese_(\d+)/i);
            if (!mesoMatch) return;
            const mesoNum = parseInt(mesoMatch[1]);
            mesosSet.add(mesoNum);

            const weightVal = parseFloat(savedData[key]);
            const repKey = `${baseId}-r`;
            const rpeKey = `${baseId}-rpe`;
            const warmupKey = `${baseId}-w`;
            const isWarmup = savedData[warmupKey] === true || savedData[warmupKey] === 'true';
            
            const repVal = parseFloat(savedData[repKey]);
            const rpeVal = parseFloat(savedData[rpeKey]);

            if (!isWarmup && !isNaN(weightVal) && weightVal > 0 && !isNaN(repVal) && repVal > 0) {
                let effectiveReps = repVal;
                if (!isNaN(rpeVal) && rpeVal >= 1 && rpeVal <= 10) {
                    const rir = Math.max(0, 10 - rpeVal);
                    effectiveReps = repVal + rir;
                }
                let current1RM = weightVal * (1 + effectiveReps / 30);

                const parts = baseId.split('-');
                if (parts.length >= 5) {
                    const fullSig = parts.slice(3, parts.length - 1).join('-');
                    const nameSlug = fullSig.split('_')[0];

                    if (!exerciseMesoMax1RM[fullSig]) {
                        exerciseMesoMax1RM[fullSig] = { nameSlug: nameSlug, mesos: {} };
                    }
                    if (!exerciseMesoMax1RM[fullSig].mesos[mesoNum] || current1RM > exerciseMesoMax1RM[fullSig].mesos[mesoNum]) {
                        exerciseMesoMax1RM[fullSig].mesos[mesoNum] = current1RM;
                    }
                }
            }
        }
    });

    const sortedMesos = Array.from(mesosSet).sort((a, b) => a - b);
    const signatures = Object.keys(exerciseMesoMax1RM);

    if (sortedMesos.length === 0 || signatures.length === 0) {
        container.innerHTML = `<p style="text-align:center; padding: 20px; color: var(--text-muted);">Nessun dato storico pluriennale trovato.</p>`;
        return;
    }

    let mesoHeaders = sortedMesos.map(m => `<th>Mese ${m}</th>`).join('');
    let html = `
        <p style="font-size:0.85rem; color:var(--text-muted); margin-bottom:12px;">Massimale Teorico (1RM Stimato) più alto registrato per ciascun esercizio nei vari mesocicli:</p>
        <div style="overflow-x:auto;">
        <table class="progress-table">
            <tr><th>Esercizio (Schema Reps)</th>${mesoHeaders}</tr>
    `;

    let chartDatasets = [];
    const colors = ['#0284c7', '#16a34a', '#dc2626', '#ca8a04', '#9333ea', '#0d9488', '#ea580c', '#4f46e5'];

    signatures.forEach((sig, index) => {
        const item = exerciseMesoMax1RM[sig];
        const color = colors[index % colors.length];
        const formattedSigName = sig.replace(/_/g, ' ').toUpperCase();
        
        let rowHtml = `<tr><td style="text-align: left; font-weight: 700;">${formattedSigName}</td>`;
        let mesoDataPoints = [];

        sortedMesos.forEach(m => {
            const val = item.mesos[m];
            if (val && val > 0) {
                rowHtml += `<td>${Math.round(val)} kg</td>`;
                mesoDataPoints.push(Math.round(val));
            } else {
                rowHtml += `<td>-</td>`;
                mesoDataPoints.push(null);
            }
        });

        rowHtml += `</tr>`;
        html += rowHtml;

        chartDatasets.push({
            label: formattedSigName,
            data: mesoDataPoints,
            borderColor: color,
            backgroundColor: color,
            fill: false,
            tension: 0.1
        });
    });

    html += `</table></div>`;
    html += `<div style="margin-top: 20px; background: #fff; padding: 10px; border-radius: 8px; border: 1px solid var(--border-color);"><canvas id="macroChart1RM"></canvas></div>`;

    container.innerHTML = html;

    if (state.instanceMacroChart) state.instanceMacroChart.destroy();

    const ctx = document.getElementById('macroChart1RM').getContext('2d');
    state.instanceMacroChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: sortedMesos.map(m => `Mese ${m}`),
            datasets: chartDatasets
        },
        options: {
            responsive: true,
            plugins: { title: { display: true, text: 'Evoluzione 1RM nei Mesocicli (kg)' } },
            spanGaps: true
        }
    });
}

export function renderMuscleVolumeDashboard() {
    const container = document.getElementById('stats-content');
    const savedData = JSON.parse(localStorage.getItem(STORAGE_KEY_DATA)) || {};
    const mesoPrefix = `${CURRENT_YEAR}-mese_${state.currentMesoNumber}`;
    const weekNumber = document.getElementById('week-selector').value;

    let volumePerDistretto = {};

    const dailyExercises = state.workoutPlan.filter(ex => parseInt(ex.Settimana) === parseInt(weekNumber));

    dailyExercises.forEach(ex => {
        let distretto = ex.Distretto || ex['Distretto Muscolare'];
        if (!distretto || distretto.trim() === '') {
            distretto = getAutoMuscleGroup(ex.Esercizio);
        } else {
            distretto = distretto.trim();
        }

        if (!volumePerDistretto[distretto]) {
            volumePerDistretto[distretto] = 0;
        }

        const totalSets = parseInt(ex.Set) || 1;
        const dayNum = ex.Giorno || 1;

        for (let s = 1; s <= totalSets; s++) {
            const baseId = `${mesoPrefix}_w${weekNumber}-d${dayNum}-${ex.Blocco}-${getExerciseSignature(ex)}-s${s}`;
            const warmupKey = `${baseId}-w`;
            const checkKey = `${baseId}-c`;

            const isWarmup = savedData[warmupKey] === true || savedData[warmupKey] === 'true';
            const isCompleted = savedData[checkKey] === true || savedData[checkKey] === 'true';

            if (isCompleted && !isWarmup) {
                volumePerDistretto[distretto] += 1;
            }
        }
    });

    const labels = Object.keys(volumePerDistretto);
    const dataValues = Object.values(volumePerDistretto);

    if (labels.length === 0 || dataValues.reduce((a, b) => a + b, 0) === 0) {
        container.innerHTML = `<p style="text-align:center; padding: 20px; color: var(--text-muted);">Nessun set completato registrato per questa settimana. Spunta qualche serie per generare la heatmap!</p>`;
        return;
    }

    let html = `
        <p style="font-size:0.85rem; color:var(--text-muted); margin-bottom:12px;">Numero di serie allenanti (esclusi i warm-up) completate nella <strong>Settimana ${weekNumber}</strong>:</p>
        <div style="background: #fff; padding: 10px; border-radius: 8px; border: 1px solid var(--border-color);">
            <canvas id="muscleBarChart"></canvas>
        </div>
    `;
    container.innerHTML = html;

    if (state.instanceMuscleChart) state.instanceMuscleChart.destroy();

    const ctx = document.getElementById('muscleBarChart').getContext('2d');
    state.instanceMuscleChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Serie per Distretto',
                data: dataValues,
                backgroundColor: 'rgba(2, 132, 199, 0.6)',
                borderColor: 'rgba(2, 132, 199, 1)',
                borderWidth: 1,
                borderRadius: 4
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            plugins: {
                legend: { display: false },
                title: { display: true, text: `Volume Settimanale per Gruppo Muscolare (Sett. ${weekNumber})` }
            },
            scales: {
                x: { beginAtZero: true, ticks: { stepSize: 1 } }
            }
        }
    });
}

export function startTimer(seconds) {
    stopTimer();
    
    const timerUI = document.getElementById('floating-timer');
    const display = document.getElementById('timer-display');
    state.currentTimerSeconds = seconds;
    
    timerUI.classList.add('active');
    
    const updateDisplay = () => {
        const m = Math.floor(state.currentTimerSeconds / 60).toString().padStart(2, '0');
        const s = (state.currentTimerSeconds % 60).toString().padStart(2, '0');
        display.innerText = `${m}:${s}`;
    };
    
    updateDisplay();
    
    state.restInterval = setInterval(() => {
        state.currentTimerSeconds--;
        updateDisplay();
        
        if (state.currentTimerSeconds > 0 && state.currentTimerSeconds <= 5) {
            playBeep(800, 0.15, 0.4);
        }

        if (state.currentTimerSeconds <= 0) {
            playBeep(2000, 1.8, 1);
            stopTimer();
            if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
        }
    }, 1000);
}

export function adjustTimer(amount) {
    state.currentTimerSeconds += amount;
    if (state.currentTimerSeconds < 0) state.currentTimerSeconds = 0;
    
    const m = Math.floor(state.currentTimerSeconds / 60).toString().padStart(2, '0');
    const s = (state.currentTimerSeconds % 60).toString().padStart(2, '0');
    document.getElementById('timer-display').innerText = `${m}:${s}`;
    
    if (state.currentTimerSeconds === 0) {
        stopTimer();
    }
}

export function stopTimer() {
    clearInterval(state.restInterval);
    document.getElementById('floating-timer').classList.remove('active');
}

export function esportaWorkoutPDF() {
    const nomeAtleta = state.currentUser && state.currentUser.email ? state.currentUser.email.split('@')[0] : "Atleta";
    const dataOra = new Date().toLocaleString('it-IT', { 
        day: '2-digit', month: '2-digit', year: 'numeric', 
        hour: '2-digit', minute: '2-digit' 
    });
    
    const weekSelector = document.getElementById('week-selector');
    const weekNumber = weekSelector ? weekSelector.value : '1';
    const mesoDisplay = document.getElementById('meso-display');
    const mesoNumber = mesoDisplay ? mesoDisplay.innerText : '1';
    
    const activeTab = document.querySelector('.tab-btn.active');
    const giornoText = activeTab ? activeTab.innerText : 'Giorno';

    let reportHTML = `
        <!DOCTYPE html>
        <html lang="it">
        <head>
            <meta charset="UTF-8">
            <title>Report Allenamento - Mese ${mesoNumber} Sett. ${weekNumber}</title>
            <style>
                @page { margin: 8mm; }
                body { 
                    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; 
                    padding: 0; 
                    margin: 0;
                    color: #1e293b; 
                    line-height: 1.2; 
                    font-size: 8.5pt;
                }
                .header { 
                    border-bottom: 1.5px solid #0284c7; 
                    padding-bottom: 4px; 
                    margin-bottom: 8px; 
                }
                .header h1 { 
                    margin: 0; 
                    font-size: 13pt; 
                    color: #0284c7; 
                }
                .meta-info { 
                    display: flex; 
                    justify-content: space-between; 
                    margin-top: 3px; 
                    font-size: 8pt; 
                    color: #64748b; 
                }
                .exercise-card { 
                    border: 1px solid #cbd5e1; 
                    border-radius: 4px; 
                    padding: 5px 8px; 
                    margin-bottom: 6px; 
                    page-break-inside: avoid; 
                }
                .exercise-title { 
                    font-size: 9.5pt; 
                    font-weight: bold; 
                    color: #0f172a; 
                    margin-bottom: 3px; 
                    border-left: 3px solid #0284c7; 
                    padding-left: 5px; 
                }
                table { 
                    width: 100%; 
                    border-collapse: collapse; 
                    margin-top: 3px; 
                    font-size: 8pt; 
                }
                th, td { 
                    border: 1px solid #cbd5e1; 
                    padding: 2px 5px; 
                    text-align: center; 
                }
                th { 
                    background-color: #f8fafc; 
                    color: #475569; 
                    font-weight: 700; 
                }
                .note-box { 
                    background-color: #eff6ff; 
                    border: 1px solid #bfdbfe; 
                    border-radius: 3px; 
                    padding: 3px 6px; 
                    font-size: 8pt; 
                    margin-top: 3px; 
                    color: #1e40af; 
                }
                .note-title { 
                    font-weight: bold; 
                    color: #1d4ed8; 
                }
            </style>
        </head>
        <body>
            <div class="header">
                <h1>Report Allenamento: ${giornoText}</h1>
                <div class="meta-info">
                    <span><strong>Atleta:</strong> ${nomeAtleta}</span>
                    <span><strong>Prog:</strong> Mese ${mesoNumber} - Sett. ${weekNumber}</span>
                    <span><strong>Data:</strong> ${dataOra}</span>
                </div>
            </div>
    `;

    const eserciziCards = document.querySelectorAll('.day-view.active .ex-card');

    if (eserciziCards.length === 0) {
        alert("Nessun esercizio trovato nella vista attiva per generare il report.");
        return;
    }

    eserciziCards.forEach((card) => {
        const nomeExEl = card.querySelector('.ex-name');
        const nomeEx = nomeExEl ? nomeExEl.innerText.trim() : 'Esercizio';

        const righeTable = card.querySelectorAll('.set-table tr');
        let righeHTML = '';

        righeTable.forEach((riga) => {
            if (riga.querySelector('th')) return; 

            const setTd = riga.querySelector('td:first-child');
            let setNum = '-';
            if (setTd) {
                const match = setTd.textContent.match(/\d+/);
                if (match) setNum = match[0];
            }

            const kgInput = riga.querySelector('input[data-id$="-kg"]');
            const repInput = riga.querySelector('input[data-id$="-r"]');
            const rpeInput = riga.querySelector('input[data-id$="-rpe"]');
            const checkInput = riga.querySelector('input[data-id$="-c"]');

            const peso = kgInput ? kgInput.value : '-';
            const reps = repInput ? repInput.value : '-';
            const rpe = rpeInput ? rpeInput.value : '-';
            const isChecked = checkInput && checkInput.checked ? 'OK' : 'NO';

            if (peso !== '' || reps !== '') {
                righeHTML += `
                    <tr>
                        <td>${setNum}</td>
                        <td><strong>${peso || '-'} kg</strong></td>
                        <td>${reps || '-'}</td>
                        <td>${rpe || '-'}</td>
                        <td>${isChecked}</td>
                    </tr>
                `;
            }
        });

        const notaInput = card.querySelector('.notes-input');
        const testoNota = notaInput ? notaInput.value : '';

        reportHTML += `
            <div class="exercise-card">
                <div class="exercise-title">${nomeEx}</div>
                ${righeHTML ? `
                    <table>
                        <thead>
                            <tr>
                                <th>SET</th>
                                <th>KG</th>
                                <th>REPS</th>
                                <th>RPE</th>
                                <th>STATO</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${righeHTML}
                        </tbody>
                    </table>
                ` : '<p style="font-size:7.5pt; color:#94a3b8; margin:2px 0;">Nessun dato registrato</p>'}
                
                ${testoNota.trim() ? `
                    <div class="note-box">
                        <span class="note-title">📝 Note:</span> ${testoNota.trim()}
                    </div>
                ` : ''}
            </div>
        `;
    });

    reportHTML += `
        </body>
        </html>
    `;

    const printWindow = window.open('', '_blank');
    printWindow.document.write(reportHTML);
    printWindow.document.close();
    
    printWindow.onload = function() {
        printWindow.focus();
        printWindow.print();
    };
}

export function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark mode' ? 'light mode' : 'dark mode';
    
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('preferred_theme', newTheme);
    
    updateThemeButtonText(newTheme);
}

export function updateThemeButtonText(theme) {
    const btn = document.getElementById('theme-toggle-btn');
    if (btn) {
        btn.innerText = theme === 'dark mode' ? '☀️ Light mode' : '🌙 Dark mode';
    }
}

export function initTeme() {
    const savedTheme = localStorage.getItem('preferred_theme') || 'light mode';
    document.documentElement.setAttribute('data-theme', savedTheme);
    updateThemeButtonText(savedTheme);
}

// Funzione globale per il calcolo live dei dischi
window.updateLivePlates = function(cardUniqueId, firstSetInputId) {
    const weightInput = document.querySelector(`input[data-id='${firstSetInputId}']`);
    const barbellSelect = document.getElementById(`barbell-${cardUniqueId}`);
    const plateDisplay = document.getElementById(`plates-display-${cardUniqueId}`);

    if (!weightInput || !plateDisplay) return;

    const targetWeight = parseFloat(weightInput.value) || 0;
    const barbellWeight = barbellSelect ? parseFloat(barbellSelect.value) : 20;

    if (targetWeight <= 0) {
        plateDisplay.innerHTML = 'Inserisci un peso nel set 1';
        plateDisplay.title = "Inserisci un peso nel Set 1";
        return;
    }

    if (targetWeight < barbellWeight) {
        plateDisplay.innerHTML = '⚠️ Il peso < Bilanciere';
        plateDisplay.title = "Il peso target è inferiore al bilanciere";
        return;
    }

    const weightPerSide = (targetWeight - barbellWeight) / 2;
    const availablePlates = [25, 20, 15, 10, 5, 2.5, 2, 1.25, 0.5];
    let remaining = weightPerSide;
    const breakdown = [];

    for (let plate of availablePlates) {
        let count = Math.floor((remaining + 0.001) / plate);
        if (count > 0) {
            breakdown.push(`${count}×${plate}`);
            remaining -= count * plate;
            remaining = Math.round(remaining * 100) / 100;
        }
    }

    if (breakdown.length === 0 || remaining > 0) {
        plateDisplay.innerHTML = `⚖️ Lato: ${weightPerSide}kg`;
        plateDisplay.title = `Per lato: ${weightPerSide}kg (Resto non componibile esatto)`;
    } else {
        plateDisplay.innerHTML = `⚖️ Lato: <b>${breakdown.join(' + ')}kg</b>`;
        plateDisplay.title = `Bilanciere: ${barbellWeight}kg | Per lato: ${weightPerSide}kg`;
    }
};