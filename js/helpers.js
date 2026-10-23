import {trainingExposures} from '../mycoatch/trainingHistory.js';
import {exerciseIdentity} from '../mycoatch/exerciseIdentity.js';
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
 * Trasforma una stringa in uno slug URL-friendly preservando i caratteri alfanumerici
 */
export function slugify(text) {
    if (!text) return '';
    return text.toString().toLowerCase()
        .trim()
        .replace(/\s+/g, '-')           
        .replace(/[^\w-]+/g, '')       
        .replace(/--+/g, '-')         
        .replace(/^-+/, '')             
        .replace(/-+$/, '');            
}

/**
 * Mappa il nome o la categoria dell'esercizio al gruppo muscolare compatibile con MyCoach LANDMARKS
 */
export function assignMuscleGroup(exerciseName) {
    if (!exerciseName) return 'Altro';
    const name = exerciseName.toLowerCase();

    if (name.includes('petto') || name.includes('panca') || name.includes('push') || name.includes('croci') || name.includes('chest') || name.includes('dip')) return 'Petto';
    if (name.includes('back_lats') || name.includes('trazioni') || name.includes('pulldown') || name.includes('lat') || name.includes('vertical_pull')) return 'Back_Lats';
    if (name.includes('back_thickness') || name.includes('rematore') || name.includes('pulley') || name.includes('stacco') || name.includes('horizontal_pull')) return 'Back_Thickness';
    if (name.includes('gambe') || name.includes('squat') || name.includes('leg') || name.includes('pressa') || name.includes('affondi') || name.includes('calf') || name.includes('rumeno')) return 'Gambe';
    if (name.includes('spalle') || name.includes('military') || name.includes('lento') || name.includes('alzate') || name.includes('shoulder')) return 'Spalle';
    if (name.includes('braccia') || name.includes('curl') || name.includes('french') || name.includes('pushdown') || name.includes('estensioni') || name.includes('bicipit') || name.includes('tricipit')) return 'Braccia';
    if (name.includes('crunch') || name.includes('plank') || name.includes('addominal')) return 'Addome';

    return 'Altro';
}

/**
 * Genera l'HTML formattato per il riassunto dell'esercizio (peso, topset, set/reps, rest)
 */
export function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char=>({
        '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[char]));
}

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
    
    const sets = getCell('set') || (getCell('setscount') ? getCell('setscount')+' set' : Array.isArray(ex.sets) ? ex.sets.length+' set' : getCell('sets'));
    const reps = getCell('reps', 'rep', 'rip', 'ripetizioni');
    const rpe = getCell('rpe','targetrpe','rpetarget');
    const recupero = getCell('recupero', 'rest', 'resttime', 'recovery');

    const isValidVal = (val) => val && String(val).trim() !== '' && String(val).trim() !== '-' && String(val).trim() !== '0' && String(val).trim() !== '0,0' && String(val).trim() !== '0.0';
    
    const hasKgRange = isValidVal(kgMin) && isValidVal(kgMax) && kgMin!==kgMax;
    const hasTopset = isValidVal(topset);

    const weightParts = [];

    if (hasKgRange) {
        weightParts.push(`${escapeHtml(kgMin)}-${escapeHtml(kgMax)} kg`);
    } else if (isValidVal(kgMin)) {
        weightParts.push(`${escapeHtml(kgMin)} kg`);
    }

    if (hasTopset) {
        const cleanTopset = topset.toLowerCase().includes('topset') ? topset : `topset: ${topset}${topset.toLowerCase().includes('kg') ? '' : ' kg'}`;
        weightParts.push(escapeHtml(cleanTopset));
    }

    let weightPart;
    if (weightParts.length > 0) {
        weightPart = `<span class="exercise-weight-highlight">${weightParts.join(' | ')}</span>`;
    } else {
        weightPart = `<span class="exercise-weight-highlight">Kg liberi</span>`;
    }

    const setsVal = Array.isArray(sets) ? sets.length : (sets || '-');
    const repsVal = reps || '-';
    
    let setRepsPart = `${escapeHtml(setsVal)} x ${escapeHtml(repsVal)}`;
    if (rpe && rpe !== '-' && rpe !== '0') {
        setRepsPart += ' ' + escapeHtml(rpe.startsWith('@') ? rpe : '@' + rpe);
    }

    const restVal = recupero && recupero !== '-' ? recupero : '';
    const restPart = restVal ? 'rest ' + escapeHtml(restVal) : '';

    const detailsPart = [setRepsPart, restPart].filter(Boolean).join(' | ');

    return `${weightPart}<br><span class="exercise-details-sub">${detailsPart}</span>`;
}

/**
 * Determina se l'esercizio ha un target a Range (es. 8-10) o a Reps Fisse (es. 5)
 * analizzando ESCLUSIVAMENTE la definizione del target in scheda.
 */
export function isRangeExercise(ex) {
    if (!ex) return false;

    // 1. Controlla minReps e maxReps espliciti se diversi
    if (ex.minReps && ex.maxReps && String(ex.minReps) !== String(ex.maxReps)) {
        return true;
    }

    // 2. Controlla la stringa delle reps/targetReps nel riassunto della scheda (es. "8-10" o "10-12")
    const repsStr = String(ex.reps || ex.targetReps || ex.rip || ex.ripetizioni || '').trim();
    if (repsStr.includes('-')) {
        const parts = repsStr.split('-');
        if (parts.length === 2 && parts[0].trim() !== parts[1].trim()) {
            return true;
        }
    }

    return false;
}

/**
 * Genera la firma univoca dell'esercizio integrando la modalità (fixed o range)
 */
export function getExerciseSignature(ex) {
    if (!ex) return '';
    const name = typeof ex === 'string' ? ex : (ex.name || ex.nome || '');
    const slug = typeof ex==='object'?exerciseIdentity(ex):slugify(name);
    
    if (typeof ex === 'string') return slug;

    const mode = isRangeExercise(ex) ? 'range' : 'fixed';
    return `${slug}_${mode}`;
}

/**
 * Cerca l'esercizio nelle sessioni precedenti basandosi sulla firma univoca.
 * IMPORTANTE: Considera valido solo lo storico di serie CONFERMATE con Check ✓ (isLocked / completed).
 */
export function findPreviousExercise(workoutData, currentMesoIdx, currentWeekNum, currentDayIdx, currentExercise, sameMesoOnly = true, activeYear = null) {
    const years=workoutData?.history?.years||{};
    const year=activeYear||Object.keys(years).map(Number).sort((a,b)=>b-a)[0];
    return trainingExposures(workoutData,{year,mesoIndex:currentMesoIdx,weekNumber:currentWeekNum,dayIndex:currentDayIdx},currentExercise,{sameMesoOnly})[0]?.exercise??null;
}
/**
 * Calcola la combinazione di dischi da caricare per lato sul bilanciere
 */
export function getPlateBreakdown(totalWeight, barWeight = 20, inventory = null) {
    if(!Number.isFinite(totalWeight)||totalWeight<=barWeight)return null;
    const target=Math.floor(((totalWeight-barWeight)/2)*4+1e-9); // never exceed requested load
    const targetKg=Math.round(((totalWeight-barWeight)/2)*100)/100;
    const weights=[25,20,15,10,5,2.5,2,1.25,1,0.5];
    // Legacy default: catalogue list, not an assertion about owned plates.
    if(!inventory || typeof inventory!=='object'){
        let left=targetKg;
        const plates=[];
        for(const w of weights){
            while(left+0.0001>=w){plates.push(w);left=Math.round((left-w)*100)/100;}
        }
        return {sideWeight:targetKg,plates,
            str:plates.length?plates.join(' + '):'Nessun disco',
            exact:Math.abs(left)<0.001};
    }
    // Bounded knapsack: each count describes PAIRS available (one per side).
    // Prefer an exact solution when possible; otherwise the closest
    // achievable load below the target and a visible warning.
    const dp=Array(target+1).fill(null);
    dp[0]=[];
    for(const weight of weights){
        const quantity=Math.max(0,Math.min(24,Math.trunc(Number(inventory[String(weight)]??0))||0));
        const units=Math.round(weight*4);
        for(let j=0;j<quantity;j++){
            for(let k=target;k>=units;k--){
                const old=dp[k-units];
                if(!old)continue;
                const next=[...old,weight];
                if(!dp[k]||next.length<dp[k].length)dp[k]=next;
            }
        }
    }
    let best=target;
    while(best>0&&!dp[best])best--;
    const plates=dp[best]||[];
    return {sideWeight:targetKg,plates,
        str:plates.length?plates.join(' + '):'Nessun disco',
        exact:best===target && Math.abs(targetKg-best/4)<0.001};
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
                text: `▲ +${volDiff}`,
                isPositive: true,
                isNegative: false
            };
        } else if (volDiff < 0) {
            const absDiff = Math.abs(volDiff);
            return {
                volDiff,
                text: `▼ -${absDiff}`,
                isPositive: false,
                isNegative: true
            };
        }
    }

    return null;
}

/**
 * Helper interno per estrarre correttamente il limite numerico da un target (gestendo i range es. "8-10")
 */
function parseTargetLimit(target, isMax = false) {
    if (target === undefined || target === null) return NaN;
    const str = String(target).trim();
    if (str.includes('-')) {
        const parts = str.split('-');
        const val = parts[isMax ? 1 : 0];
        return parseFloat(val.replace(',', '.'));
    }
    return parseFloat(str.replace(',', '.'));
}

/**
 * Valida se un valore inserito è inferiore al minimo consentito
 */
export function isValueOutOfRange(value, minTarget) {
    if (value === undefined || value === null || String(value).trim() === '') return false;
    
    const val = parseFloat(String(value).replace(',', '.'));
    if (isNaN(val)) return false;

    const min = parseTargetLimit(minTarget, false);
    
    if (!isNaN(min) && val < min) {
        return true;
    }

    return false;
}

/**
 * Valida se un valore inserito supera il massimo target previsto
 */
export function isValueExceedingTarget(value, minTarget, maxTarget) {
    if (value === undefined || value === null || String(value).trim() === '') return false;
    
    const val = parseFloat(String(value).replace(',', '.'));
    if (isNaN(val)) return false;

    const max = parseTargetLimit(maxTarget, true);
    const min = parseTargetLimit(minTarget, false);

    if (!isNaN(max) && val > max) {
        return true;
    }

    if (isNaN(max) && !isNaN(min) && val > min) {
        return true;
    }

    return false;
}

/**
 * Assegna i tag visivi e di raggruppamento per Triset, Superset, Dropset, Rest-Pause, Myo-Reps e Jumpset.
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
            
            const isTriset = combinedText.includes('triset') || combinedText.includes('tri-set') || combinedText.includes('tri set') || combinedText.includes('triserie');
            const isDropset = combinedText.includes('dropset') || combinedText.includes('drop-set') || combinedText.includes('drop set') || combinedText.includes('dropserie') || combinedText.includes('[drop_set]');
            const isRestPause = combinedText.includes('restpause') || combinedText.includes('rest-pause') || combinedText.includes('rest pause') || combinedText.includes('r-pause') || combinedText.includes('r/p') || combinedText.includes('[rest_pause]');
            const isMyoReps = combinedText.includes('myoreps') || combinedText.includes('myo-reps') || combinedText.includes('myo reps') || combinedText.includes('[myo_reps]');
            const isSuperset = combinedText.includes('superset') || combinedText.includes('super-set') || combinedText.includes('super set') || combinedText.includes('superserie') || combinedText.includes('[superset]');
            const isJumpset = combinedText.includes('jumpset') || combinedText.includes('jump-set') || combinedText.includes('jump set') || combinedText.includes('jumpserie');

            if (isDropset) {
                ex.isDropset = true;
                ex.intensityTechnique = 'DROP_SET';
                const baseBlock = String(ex.block || (i + 1)).replace(/[A-Za-z]/g, '');
                ex.block = baseBlock || String(i + 1);
                i++;
            } else if (isRestPause || isMyoReps) {
                ex.isRestPause = true;
                ex.intensityTechnique = isMyoReps ? 'MYO_REPS' : 'REST_PAUSE';
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

/**
 * Rimuove simboli non numerici (@, spazi) e converte le virgole decimali in punti.
 */
export function parseRPE(rpeValue) {
    if (rpeValue === null || rpeValue === undefined) return 0;
    if (typeof rpeValue === 'number') return isNaN(rpeValue) ? 0 : rpeValue;

    const cleaned = String(rpeValue)
        .replace('@', '')
        .replace(',', '.')
        .trim();

    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? 0 : parsed;
}

/**
 * Normalizza il nome dell'esercizio in Title Case
 */
export function normalizeExerciseName(name) {
    if (!name || typeof name !== 'string') return '';
    return name
        .trim()
        .toLowerCase()
        .split(/\s+/)
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}
/**
 * Valuta il calo prestazionale su un esercizio e aggiorna il box di alert MyCoach.
 */
export function checkFatigueAlert(ex, exIdx) {
    const alertEl = document.getElementById(`mycoach-advice-${exIdx}`);
    if (!alertEl) return;
    if(ex?.isWarmup || ex?.isExcluded || ex?.is_excluded){
        alertEl.classList.remove('is-visible');
        alertEl.classList.add('is-hidden');
        return;
    }

    const targetMinReps = ex.minReps || (typeof ex.reps === 'string' && ex.reps.includes('-') ? parseInt(ex.reps.split('-')[0], 10) : parseInt(ex.reps, 10)) || 0;
    let coachAdviceHtml = '';

    if (targetMinReps > 0 && ex.loggedSets) {
        for (const sObj of ex.loggedSets) {
            if ((sObj.isLocked || sObj.completed) && sObj.reps) {
                const actualReps = parseInt(String(sObj.reps).replace(/\D+/g, ''), 10) || 0;
                if (actualReps > 0 && actualReps <= targetMinReps - 2) {
                    coachAdviceHtml = `⚠️ <strong>MyCoach:</strong> Hai chiuso ${actualReps} rep (Target: ${targetMinReps}). Il drop di performance è eccessivo. Scala il carico del 10% nella prossima serie o il volume diventerà spazzatura.`;
                    break;
                }
            }
        }
    }

    if (coachAdviceHtml) {
        alertEl.innerHTML = coachAdviceHtml;
        alertEl.classList.remove('is-hidden');
        alertEl.classList.add('is-visible');
    } else {
        alertEl.classList.remove('is-visible');
        alertEl.classList.add('is-hidden');
    }
}


/**
 * Earlier COMPLETED workouts of the exact movement in this mesocycle,
 * newest first, including another day of the same week. UI/read only.
 * Unlike findPreviousExercise, this searches across weekday slots so a
 * different-repetition exposure can supply cautious calibration evidence.
 */
export function findPriorExerciseExposures(workoutData,mesoIdx,weekNum,dayNum,exercise,year=null){
    return trainingExposures(workoutData,{year:year||new Date().getFullYear(),mesoIndex:mesoIdx,weekNumber:weekNum,dayIndex:Number(dayNum)-1},exercise).map(item=>item.exercise);
}
