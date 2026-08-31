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
    if (!ex) return '';

    // Cerca la chiave in modo case-insensitive bypassando la differenza maiuscole/minuscole
    const getRawVal = (...keys) => {
        const exKeys = Object.keys(ex);
        for (const k of keys) {
            const actualKey = exKeys.find(key => key.toLowerCase() === k.toLowerCase());
            if (actualKey !== undefined) {
                let v = ex[actualKey];
                if (v !== undefined && v !== null && typeof v !== 'object') {
                    v = String(v).trim();
                    // Ignora i trattini o gli zeri che indicano cella vuota nel CSV
                    if (v !== '' && v !== '-' && v !== '0' && v.toLowerCase() !== '0 kg' && v !== '0,0' && v !== '0.0' && v.toLowerCase() !== 'nan') {
                        return v;
                    }
                }
            }
        }
        return '';
    };

    // Rimuove SOLO le unità di misura alla fine della stringa, preservando i numeri
    const cleanUnit = (val, unitString) => {
        if (!val) return '';
        // Toglie " kg", "kg", " set", "set", " rep", "rep" (ignorando maiuscole/minuscole)
        const regex = new RegExp(`\\s*${unitString}s?\\s*$`, 'i');
        return val.replace(regex, '').trim();
    };

    // 1. GESTIONE PESO
    let kgMin = cleanUnit(getRawVal('kgmin', 'minkg', 'weightmin'), 'kg');
    let kgMax = cleanUnit(getRawVal('kgmax', 'maxkg', 'weightmax'), 'kg');
    let topset = cleanUnit(getRawVal('topset', 'topsetweight', 'weight'), 'kg');

    let weightPart = '';
    if (kgMin && kgMax) {
        weightPart = `${kgMin}-${kgMax} kg`;
    } else if (kgMin) {
        weightPart = `${kgMin} kg`;
    } else if (topset) {
        weightPart = `Topset ${topset} kg`;
    } else {
        weightPart = 'Topset';
    }

    // 2. GESTIONE SET
    let sets = getRawVal('set', 'sets', 'targetsets');
    if (!sets && Array.isArray(ex.loggedSets)) sets = ex.loggedSets.length.toString();
    sets = cleanUnit(sets, 'set');
    if (!sets) sets = '-';

    // 3. GESTIONE REPS (cerca in 'reps', 'rep', 'rip', 'ripetizioni')
    let reps = getRawVal('reps', 'rep', 'targetreps', 'rip', 'ripetizioni');
    if (!reps && Array.isArray(ex.reps)) reps = ex.reps.join('-');
    // Pulisce varianti come "rep", "reps", "rip"
    reps = reps.replace(/\s*(reps?|ripetizioni|rip)\s*$/i, '').trim();
    if (!reps) reps = '-';

    // 4. GESTIONE RPE
    let rpe = getRawVal('rpe', 'targetrpe');
    let rpePart = rpe ? ` @${rpe.replace(/^@+/, '')}` : '';

    const setRepsPart = `${sets} set x ${reps}${rpePart}`;

    // 5. GESTIONE RECUPERO
    let rest = getRawVal('recupero', 'rest', 'recovery', 'tempo', 'pause') || '2min';
    let restPart = `rest ${rest}`;

    return `${weightPart} | ${setRepsPart} | ${restPart}`;
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