// helpers.js
export function slugify(text) {
    return text.toString().toLowerCase()
        .trim()
        .replace(/\s+/g, '-')           
        .replace(/[^\w\-]+/g, '')       
        .replace(/\-\-+/g, '-')         
        .replace(/^-+/, '')             
        .replace(/-+$/, '');            
}

export function assignMuscleGroup(exerciseName) {
    if (!exerciseName) return 'Altro';
    const name = exerciseName.toLowerCase();

    if (name.includes('panca') || name.includes('push') || name.includes('croci') || name.includes('chest') || name.includes('dip')) return 'Petto';
    if (name.includes('squat') || name.includes('leg') || name.includes('pressa') || name.includes('affondi') || name.includes('calf') || name.includes('stacco rumeno')) return 'Gambe';
    if (name.includes('trazioni') || name.includes('rematore') || name.includes('pulldown') || name.includes('lat') || name.includes('stacco') || name.includes('pulley')) return 'Dorso';
    if (name.includes('curl') || name.includes('bicipit')) return 'Bicipiti';
    if (name.includes('french') || name.includes('pushdown') || name.includes('estensioni') || name.includes('tricipit')) return 'Tricipiti';
    if (name.includes('military') || name.includes('lento') || name.includes('alzate') || name.includes('shoulder')) return 'Spalle';
    if (name.includes('crunch') || name.includes('plank') || name.includes('addominal')) return 'Addome';

    return 'Altro';
}

/**
/**
 * Genera il riassunto dell'esercizio formattato per la scheda
 */
export function formatExerciseSummary(ex) {
    if (!ex) return '-';

    const formatVal = (val) => (!val || val === '0' || val === 0) ? '-' : val;

    // Recupera il primo set di riferimento per i dati di base del blocco
    const firstSet = Array.isArray(ex.sets) && ex.sets.length > 0 ? ex.sets[0] : {};

    // 1. Gestione Pesi: usa kgMin/kgMax se presenti, altrimenti legge weight dal primo set
    let kgStr = '-';
    if (ex.kgMin || ex.kgMax) {
        const kgMin = formatVal(ex.kgMin);
        const kgMax = formatVal(ex.kgMax);
        kgStr = (kgMin === kgMax) ? `${kgMin}kg` : `${kgMin}-${kgMax}kg`;
    } else if (firstSet.weight) {
        kgStr = firstSet.weight;
    }

    // 2. Conteggio Serie, Reps ed RPE
    const setsCount = Array.isArray(ex.sets) ? `${ex.sets.length} set` : formatVal(ex.sets);
    const reps = formatVal(ex.reps || firstSet.reps);
    const rpe = formatVal(ex.targetRpe || ex.rpe || firstSet.rpe);

    // 3. Recupero e Topset
    const rest = formatVal(ex.rest || ex.restTime);
    const topset = formatVal(ex.topset);

    // Formattazione HTML
    const kgHtml = `<span style="color: #ef4444; font-weight: 700;">${kgStr}</span>`;
    const topsetHtml = `<span style="color: #ef4444; font-weight: 700;">${topset}${topset !== '-' && !String(topset).toLowerCase().includes('kg') ? 'kg' : ''}</span>`;

    const rpeStr = (rpe !== '-') ? ` ${rpe}` : '';

    return `${kgHtml} | ${setsCount} ${reps}${rpeStr} | rest ${rest} | Topset ${topsetHtml}`;
}

/**
 * Distingue lo stimolo dell'esercizio (Forza vs Ipertrofia) basandosi sul target reps
 */
export function getExerciseSignature(ex) {
    const slug = slugify(ex.name || '');
    const repsStr = String(ex.reps || '');
    const firstNum = parseInt(repsStr.match(/\d+/)?.[0] || '8', 10);
    
    const type = firstNum <= 5 ? 'strength' : 'hypertrophy';
    return `${slug}_${type}`;
}

/**
 * Calcola la combinazione di dischi da caricare per lato sul bilanciere
 */
export function getPlateBreakdown(totalWeight, barWeight = 20) {
    if (!totalWeight || totalWeight <= barWeight) {
        return null;
    }

    let sideWeight = Math.round(((totalWeight - barWeight) / 2) * 100) / 100;
    const availablePlates = [20, 15, 10, 5, 2.5, 2, 1.25, 1, 0.5];
    const combination = [];

    for (const plate of availablePlates) {
        while (sideWeight >= plate) {
            combination.push(plate);
            sideWeight = Math.round((sideWeight - plate) * 100) / 100;
        }
    }

    const sideTotal = Math.round(((totalWeight - barWeight) / 2) * 100) / 100;
    return {
        sideWeight: sideTotal,
        plates: combination,
        str: combination.length > 0 ? combination.join(' + ') : 'Nessun disco'
    };
}

export function showNotification(message, type = 'info') {
    alert(`${type.toUpperCase()}: ${message}`);
}

/**
 * ==============================================================================
 * PROMEMORIA UTILIZZO BOTTOM SHEET / MENU DAL BASSO
 * ==============================================================================
 * Funzione riutilizzabile per qualsiasi menu a comparsa dal basso con auto-chiusura.
 * 
 * ESEMPIO HTML REQUISITO:
 * <button id="mio-btn-apri">Apri Menu</button>
 * 
 * <div id="mio-modal" class="bottom-sheet-overlay hidden">
 *   <div class="bottom-sheet-content">
 *     <button id="mio-btn-chiudi">&times;</button>
 *     <button class="sheet-item" data-view="opzione1">Opzione 1</button>
 *     <button class="sheet-item" data-value="opzione2">Opzione 2</button>
 *   </div>
 * </div>
 * 
 * PARAMETRI CONFIG:
 * @param {string} config.modalId       - ID del container overlay (es. 'analytics-modal')
 * @param {string} config.openBtnId     - ID del pulsante di apertura (es. 'open-analytics-btn')
 * @param {string} config.closeBtnId    - ID del pulsante di chiusura (es. 'close-analytics-btn')
 * @param {string} [config.itemSelector='.sheet-item'] - (Opzionale) Selettore per le opzioni
 * @param {number} [config.timeoutMs=6000]             - (Opzionale) Millisecondi prima della chiusura (0 = disattivo)
 * @param {Function} config.onSelect    - Callback eseguita alla selezione: (valore, evento) => {}
 * ==============================================================================
 */
export function setupBottomSheet({
    modalId,
    openBtnId,
    closeBtnId,
    itemSelector = '.sheet-item',
    timeoutMs = 6000,
    onSelect
}) {
    const modal = document.getElementById(modalId);
    const openBtn = document.getElementById(openBtnId);
    const closeBtn = document.getElementById(closeBtnId);
    const sheetItems = modal?.querySelectorAll(itemSelector);

    let autoCloseTimer = null;

    const closeSheet = () => {
        modal?.classList.add('hidden');
        if (autoCloseTimer) {
            clearTimeout(autoCloseTimer);
            autoCloseTimer = null;
        }
    };

    const openSheet = () => {
        modal?.classList.remove('hidden');

        if (autoCloseTimer) clearTimeout(autoCloseTimer);
        if (timeoutMs > 0) {
            autoCloseTimer = setTimeout(closeSheet, timeoutMs);
        }
    };

    openBtn?.addEventListener('click', openSheet);
    closeBtn?.addEventListener('click', closeSheet);

    modal?.addEventListener('click', (e) => {
        if (e.target === modal) closeSheet();
    });

    // Gestione click sulle opzioni
    sheetItems?.forEach(item => {
        item.addEventListener('click', (e) => {
            // Legge data-action, data-view o data-value
            const val = e.currentTarget.dataset.action || e.currentTarget.dataset.view || e.currentTarget.dataset.value;

            if (typeof onSelect === 'function') {
                onSelect(val, e);
            }
            closeSheet();
        });
    });
}
// Fine BOTTOM SHEET / MENU DAL BASSO