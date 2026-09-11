// ==========================================
// MODULI: helpers.js - Utility di logica pura, formattazione stringhe, calcolo dischi e ricerca storico
// ==========================================
/**
 * Pulisce una stringa o valore di ripetizioni estraendo solo il primo numero valido
 */
export function cleanNumericReps(val) {
    if (val === undefined || val === null) return '';
    const str = String(val).trim();
    if (!str) return '';
    const match = str.match(/\d+/);
    return match ? match[0] : str;
}

/**
 * Trasforma una stringa in uno slug URL-friendly
 */
export function slugify(text) {
    if (!text) return '';
    return text.toString().toLowerCase()
        .trim()
        .replace(/\s+/g, '-')           
        .replace(/[^\w\-]+/g, '')       
        .replace(/\-\-+/g, '-')         
        .replace(/^-+/, '')             
        .replace(/-+$/, '');            
}

/**
 * Mappa il nome dell'esercizio al gruppo muscolare principale
 */
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
 * Genera l'HTML formattato per il riassunto dell'esercizio (peso, set/reps, rest)
 */
/**
 * Genera l'HTML formattato per il riassunto dell'esercizio (peso, topset, set/reps, rest)
 */
export function formatExerciseSummary(ex) {
    if (!ex) return '';

    const getCell = (...keys) => {
        const objKeys = Object.keys(ex);
        for (const k of keys) {
            const found = objKeys.find(key => key.toLowerCase() === k.toLowerCase());
            if (found !== undefined && ex[found] !== undefined && ex[found] !== null) {
                const val = ex[found];
                if (typeof val === 'object') {
                    if (Array.isArray(val)) {
                        return val.map(item => (item && typeof item === 'object' ? (item.reps || item.rip || item.value || '') : String(item))).filter(Boolean).join('-');
                    }
                    return val.value || val.reps || val.set || '';
                }
                const str = String(val).trim();
                return str !== '[object Object]' ? str : '';
            }
        }
        return '';
    };

    const kgMin = getCell('kgmin', 'minkg', 'min_kg');
    const kgMax = getCell('kgmax', 'maxkg', 'max_kg');
    const topset = getCell('topset', 'topsetweight');
    
    const sets = getCell('set', 'sets');
    const reps = getCell('reps', 'rep', 'rip', 'ripetizioni');
    const rpe = getCell('rpe');
    const recupero = getCell('recupero', 'rest', 'recovery');

    const isValidVal = (val) => val && String(val).trim() !== '' && String(val).trim() !== '-' && String(val).trim() !== '0' && String(val).trim() !== '0,0' && String(val).trim() !== '0.0';
    
    const hasKgRange = isValidVal(kgMin) && isValidVal(kgMax);
    const hasTopset = isValidVal(topset);

    // Costruzione dinamica dei pesi (Range + Topset)
    const weightParts = [];

    if (hasKgRange) {
        weightParts.push(`${kgMin}-${kgMax} kg`);
    } else if (isValidVal(kgMin)) {
        weightParts.push(`${kgMin} kg`);
    }

    if (hasTopset) {
        const cleanTopset = topset.toLowerCase().includes('topset') ? topset : `topset: ${topset}${topset.toLowerCase().includes('kg') ? '' : ' kg'}`;
        weightParts.push(cleanTopset);
    }

    let weightPart = '';
    if (weightParts.length > 0) {
        weightPart = `<span style="color: #dc2626; font-weight: 700;">${weightParts.join(' | ')}</span>`;
    } else {
        weightPart = `<span style="color: #dc2626; font-weight: 700;">--</span>`;
    }

    const setsVal = sets || '-';
    const repsVal = reps || '-';
    
    let setRepsPart = `${setsVal} x ${repsVal}`;
    if (rpe && rpe !== '-' && rpe !== '0') {
        setRepsPart += ` ${rpe.startsWith('@') ? rpe : '@' + rpe}`;
    }

    const restVal = recupero && recupero !== '-' ? recupero : '';
    const restPart = restVal ? `rest ${restVal}` : '';

    return [weightPart, setRepsPart, restPart].filter(Boolean).join(' | ');
}

/**
 * Determina se l'esercizio ha un target a Range (es. 6-8) o a Reps Fisse (es. 8)
 */
export function isRangeExercise(ex) {
    if (!ex) return false;
    if (ex.minReps && ex.maxReps && ex.minReps !== ex.maxReps) return true;
    const repsStr = String(ex.reps || ex.targetReps || '').trim();
    return repsStr.includes('-');
}

/**
 * Genera la firma univoca dell'esercizio
 */
export function getExerciseSignature(ex) {
    if (!ex) return '';
    const name = typeof ex === 'string' ? ex : (ex.name || '');
    const slug = slugify(name);
    
    if (typeof ex === 'string') return slug;

    const mode = isRangeExercise(ex) ? 'range' : 'fixed';
    return `${slug}_${mode}`;
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

/**
 * Cerca l'esercizio nelle sessioni precedenti basandosi sulla signature univoca
 */
export function findPreviousExercise(workoutData, currentMesoIdx, currentWeekNum, currentDayIdx, currentExercise) {
    if (!workoutData?.history?.years || !currentExercise) return null;
    
    const currentYear = new Date().getFullYear().toString();
    const yearData = workoutData.history.years[currentYear];
    if (!yearData || !yearData.mesocycles) return null;

    const meso = yearData.mesocycles[currentMesoIdx];
    if (!meso || !meso.weeks) return null;

    const currentSig = getExerciseSignature(currentExercise);

    for (let w = currentWeekNum - 1; w >= 1; w--) {
        const prevWeek = meso.weeks.find(item => item.weekNumber === w);
        if (prevWeek && prevWeek.days && prevWeek.days[currentDayIdx]) {
            const day = prevWeek.days[currentDayIdx];
            const foundEx = (day.exercises || []).find(ex => getExerciseSignature(ex) === currentSig);
            
            if (foundEx && foundEx.loggedSets && foundEx.loggedSets.some(s => s.weight || s.reps)) {
                return foundEx;
            }
        }
    }

    if (currentMesoIdx > 0) {
        const prevMeso = yearData.mesocycles[currentMesoIdx - 1];
        if (prevMeso && prevMeso.weeks) {
            for (let w = prevMeso.weeks.length; w >= 1; w--) {
                const prevWeek = prevMeso.weeks[w - 1];
                if (prevWeek && prevWeek.days && prevWeek.days[currentDayIdx]) {
                    const day = prevWeek.days[currentDayIdx];
                    const foundEx = (day.exercises || []).find(ex => getExerciseSignature(ex) === currentSig);
                    if (foundEx && foundEx.loggedSets && foundEx.loggedSets.some(s => s.weight || s.reps)) {
                        return foundEx;
                    }
                }
            }
        }
    }

    return null;
}

/**
 * Calcola il delta del volume tra il set attuale e quello precedente
 */
export function calculateSetVolumeTrend(currentSet, prevSet) {
    if (!currentSet || !prevSet) return null;

    const currentKg = parseFloat(currentSet.weight || currentSet.kg || 0);
    const currentReps = parseFloat(currentSet.reps || 0);
    const prevKg = parseFloat(prevSet.weight || prevSet.kg || 0);
    const prevReps = parseFloat(prevSet.reps || 0);

    if (currentKg > 0 && currentReps > 0 && prevKg > 0 && prevReps > 0) {
        const currentVolume = currentKg * currentReps;
        const prevVolume = prevKg * prevReps;
        const volDiff = currentVolume - prevVolume;

        if (volDiff > 0) {
            return {
                volDiff,
                text: `▲ +${volDiff} kg`,
                isPositive: true,
                isNegative: false
            };
        } else if (volDiff < 0) {
            const absDiff = Math.abs(volDiff);
            return {
                volDiff,
                text: `▼ -${absDiff} kg`,
                isPositive: false,
                isNegative: true
            };
        }
    }

    return null;
}

/**
 * Valida se un valore inserito è effettivamente inferiore al minimo consentito nella scheda
 */
export function isValueOutOfRange(value, minTarget, maxTarget) {
    if (value === undefined || value === null || String(value).trim() === '') return false;
    
    const val = parseFloat(String(value).replace(',', '.'));
    if (isNaN(val)) return false;

    const min = parseFloat(String(minTarget).replace(',', '.'));
    
    // Se c'è un minimo e il valore inserito è strettamente inferiore, è fuori range (rosso)
    if (!isNaN(min) && val < min) {
        return true;
    }

    return false;
}
/**
 * Valida se un valore inserito supera in positivo il massimo target previsto dalla scheda
 */
export function isValueExceedingTarget(value, minTarget, maxTarget) {
    if (value === undefined || value === null || String(value).trim() === '') return false;
    
    const val = parseFloat(String(value).replace(',', '.'));
    if (isNaN(val)) return false;

    const max = parseFloat(String(maxTarget).replace(',', '.'));
    const min = parseFloat(String(minTarget).replace(',', '.'));

    // Se c'è un massimo definito e il valore lo supera
    if (!isNaN(max) && val > max) {
        return true;
    }

    // Se c'è solo un valore minimo/fisso (senza max esplicito) e il valore lo supera
    if (isNaN(max) && !isNaN(min) && val > min) {
        return true;
    }

    return false;
}
/**
 * Assegna i tag visivi e di raggruppamento per Triset, Superset, Dropset e Jumpset
 */
export function applyTrisetDropsetGrouping(daysArray) {
    if (!Array.isArray(daysArray)) return;
    
    daysArray.forEach(day => {
        const exercises = day.exercises;
        if (!exercises || exercises.length === 0) return;

        let i = 0;
        while (i < exercises.length) {
            const ex = exercises[i];
            const notes = (ex.notes || '').toLowerCase();
            const name = (ex.name || '').toLowerCase();
            const combinedText = `${name} ${notes}`;
            
            const isTriset = combinedText.includes('triset') || combinedText.includes('tri-set') || combinedText.includes('tri set') || combinedText.includes('triserie') || combinedText.includes('tri serie') || combinedText.includes('tri-serie');
            const isDropset = combinedText.includes('dropset') || combinedText.includes('drop-set') || combinedText.includes('drop set') || combinedText.includes('dropserie') || combinedText.includes('drop serie') || combinedText.includes('drop-serie');
            const isSuperset = combinedText.includes('superset') || combinedText.includes('super-set') || combinedText.includes('super set') || combinedText.includes('superserie') || combinedText.includes('super serie') || combinedText.includes('super-serie');
            const isJumpset = combinedText.includes('jumpset') || combinedText.includes('jump-set') || combinedText.includes('jump set') || combinedText.includes('jumpserie') || combinedText.includes('jump serie') || combinedText.includes('jump-serie');

            if (isDropset) {
                ex.isDropset = true;
                const baseBlock = String(ex.block || (i + 1)).replace(/[A-Za-z]/g, '');
                ex.block = baseBlock || String(i + 1);
                i++;
            } else if (isTriset || isSuperset || isJumpset) {
                let groupSize = isTriset ? 3 : 2;
                const baseBlock = String(ex.block || (i + 1)).replace(/[A-Za-z]/g, '');
                const letters = ['A', 'B', 'C', 'D', 'E'];
                const groupType = isTriset ? 'triset' : (isSuperset ? 'superset' : 'jumpset');
                
                for (let j = 0; j < groupSize && (i + j) < exercises.length; j++) {
                    const targetEx = exercises[i + j];
                    targetEx.block = `${baseBlock || (i + 1)}${letters[j] || (j + 1)}`;
                    targetEx.groupType = groupType;
                    targetEx.groupBase = baseBlock || String(i + 1);
                    targetEx.isGroupLast = (j === groupSize - 1) || ((i + j) === exercises.length - 1);
                }
                i += groupSize;
            } else {
                const baseBlock = String(ex.block || (i + 1)).replace(/[A-Za-z]/g, '');
                ex.block = baseBlock || String(i + 1);
                i++;
            }
        }
    });
}
