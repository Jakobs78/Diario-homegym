// mycoatch/engine.js
import { EXERCISE_DATABASE } from './exercisesDB.js';
import { resolvePlannedLoad } from './loadProposal.js';
import { isWarmupExercise } from '../js/workoutSemantics.js';
import { analyzeCompletedMesocycle } from './historyAnalysis.js';
import { canonicalExerciseKey } from './exerciseIdentity.js';
import { rebalanceWeeklyAccessories } from './weeklyVolumeBalancer.js';
import { normalizeSelectionPreferences, selectExerciseForSlot, defaultFundamentalName } from './exerciseSelection.js';
import { auditWeeklyCoverage } from './weeklyCoverage.js';
import { normalizeAthleteProfile, onboardingPlan, eligibleReferenceLoad, profileSummary } from './athleteProfile.js';
import { deriveMesocyclePolicy } from './periodizationPolicy.js';
import { isRegionAffected } from './recoveryScope.js';
import { prescribeExerciseReps, prescribeExerciseRpe, HIGH_REP_EXERCISES } from './prescriptionPolicy.js';
import { suggestDropset } from './intensityTechniquePolicy.js';
import { evaluateCoachingGuardrails, authorizeTopset } from './coachGuardrails.js';
import { addFocusAccessorySlot, selectExercisesForTime, registerSelectedWeeklySets } from './sessionSelection.js';

/**
 * Intervalli iniziali orientativi, NON valori MEV/MAV/MRV universali validati.
 * Volume utile e recuperabile variano per atleta, esercizio e fase.
 */
export const MUSCLE_VOLUME_LANDMARKS = {
    Petto: { mev: 8, mav: 14, mrv: 20 },
    Back_Lats: { mev: 10, mav: 16, mrv: 22 },
    Back_Thickness: { mev: 8, mav: 14, mrv: 20 },
    Quadricipiti: { mev: 8, mav: 14, mrv: 20 },
    Femorali: { mev: 6, mav: 12, mrv: 16 },
    Spalle: { mev: 8, mav: 14, mrv: 20 },
    Bicipiti: { mev: 6, mav: 10, mrv: 15 },
    Tricipiti: { mev: 6, mav: 10, mrv: 15 },
    Gambe: { mev: 10, mav: 16, mrv: 22 }, // Fallback generico
    Glutei: { mev: 4, mav: 8, mrv: 16 },
    Polpacci: { mev: 4, mav: 8, mrv: 14 },
    Core: { mev: 4, mav: 8, mrv: 12 }
};

/**
 * Genera un mesociclo ottimizzato bilanciando MEV/MAV/MRV, focus muscolari,
 * progressioni RPE e tecniche di intensità temporizzate.
 */
/**
 * Continuity must use the most recent COMPARABLE day, not always week 1.
 * Prefer recent confirmed non-deload sessions, then a recent planned
 * operational day. Deload variants are fallback only.
 */
export function previousComparableTrainingDay(lastMesocycle, dayNumber) {
    const ordered=[...(lastMesocycle?.weeks || [])]
        .sort((a,b)=>Number(b.weekNumber)-Number(a.weekNumber))
        .map(week=>({
            isDeload:week.isDeloadWeek===true || week.phase==='recovery',
            day:(week.days || []).find(day=>Number(day.dayNumber)===Number(dayNumber))
        }))
        .filter(item=>Array.isArray(item.day?.exercises) &&
            item.day.exercises.length>0);
    const actuallyTrained=item=>item.day.exercises.some(ex=>
        !isWarmupExercise(ex) && (ex.loggedSets || []).some(set=>
            !set.isWarmup && !set.warmup && !set.is_warmup &&
            (set.isLocked===true || set.completed===true) &&
            Number(String(set.weight??set.actualKg??'').replace(',','.'))>0));
    return (ordered.find(item=>!item.isDeload && actuallyTrained(item)) ||
        ordered.find(item=>!item.isDeload) ||
        ordered.find(actuallyTrained) || ordered[0])?.day || null;
}

export function generateSmartMesocycle(config = {}, historicalData = {}, rawLastMesocycle = null) {
    const safeHistory = historicalData || {};
    
    // Analizziamo lo storico con il motore avanzato basato su e1RM e note trasparenti
    const analysis = safeHistory.byExercise ? safeHistory : analyzeCompletedMesocycle(rawLastMesocycle);
    
    const { 
        name = "Mesociclo Adattivo MyCoach", 
        durationWeeks = 4, 
        daysPerWeek = 3, 
        focus = "hybrid", 
        focusMuscleGroup = null, 
        stepKg = 2.5, 
        maxSessionMinutes = 60,
        userAge = 30,
        trainingYears = 3
    } = config;

    // 1. Parametri di recupero biologico
    const isMaster = false; // Non imporre riduzioni automatiche basate solo sull'età.
    // Scarico e target di impegno: proposte adattate a dati confermati, non obblighi di calendario.

    // 2. Vincoli di tempo
    // Il vincolo è il tempo realmente stimato, non un taglio prefissato degli slot.

    const templateDays = getTemplateForDays(daysPerWeek, config.splitPreference);
    const athleteProfile = normalizeAthleteProfile(config.athleteProfile);
    const hasConfirmedHistory = Number(safeHistory.sessionsAnalyzed) > 0 ||
        Object.keys(analysis?.byExercise || {}).length > 0;
    const onboarding = onboardingPlan(athleteProfile, hasConfirmedHistory);
    const guardrails = evaluateCoachingGuardrails({
        ...config, athleteProfile, focusMuscleGroup
    }, analysis, onboarding);
    const periodization = deriveMesocyclePolicy(config, analysis, onboarding);
    const effectiveFocusMuscle = guardrails.effectiveFocusMuscle;
    const excludedGroupingMuscles=[...new Set(EXERCISE_DATABASE
        .filter(ex=>isRegionAffected(guardrails,ex.category)).map(ex=>ex.category))];
    const selectionPreferences = normalizeSelectionPreferences({
        ...config, excludedExercises: athleteProfile?.excludedExercises || []
    });
    
    // Calcolo della frequenza settimanale reale per ogni gruppo muscolare nel template
    const muscleFrequencyMap = {};
    templateDays.forEach(day => {
        const slots = day.slots;
        slots.forEach(slot => {
            const mainMuscle = slot.muscle;
            muscleFrequencyMap[mainMuscle] = (muscleFrequencyMap[mainMuscle] || 0) + 1;
        });
    });

    const weeks = [];

    for (let w = 1; w <= durationWeeks; w++) {
        const weekDays = [];
        const intendedDays = [];
        const volumeAdjustmentsApplied = new Set();
        const weeklySelectionCounts = new Map();
        const scheduledWeeklySets = Object.create(null);
        const excludedOptionalSlots = [];
        const weekPolicy = periodization.weeks[w - 1];
        const isDeloadWeek = weekPolicy.isDeload;

        // Il target RPE non sale automaticamente fino a 9 ogni terza settimana.
        // Ogni esercizio riceve un RPE personalizzato, con il target
        // settimanale soltanto come baseline conservativa.

        templateDays.forEach((dayTemplate, dayIndex) => {
            const activeSlots = addFocusAccessorySlot(dayTemplate.slots, {
                dayName:dayTemplate.name, focusMuscleGroup:effectiveFocusMuscle,
                maxSessionMinutes
            });
            
            const exercisesSelectedToday = [];
            const daySelectionCounts = new Map(weeklySelectionCounts);
            const previousDay = previousComparableTrainingDay(
                rawLastMesocycle, dayIndex + 1);
            const deloadReference = isDeloadWeek && w > 1
                ? weeks[w - 2].days[dayIndex] : null;
            // Il selettore non confonde una preferenza storica con uno schema
            // motorio diverso. Le quattro alzate fondamentali occupano posizioni
            // protette contro i tagli per il tempo, ma possono essere sostituite
            // esplicitamente dall'atleta con varianti dello stesso pattern.
            let rawExercises = activeSlots.flatMap((slot, slotIndex) => {
                // L'indice puro non basta quando un piano precedente aveva
                // accessori aggiunti/rimossi. Riusa solo la variante del medesimo
                // schema motorio e distretto, altrimenti cerca nella giornata.
                const priorExercises = previousDay?.exercises || [];
                const priorAtIndex = priorExercises[slotIndex];
                const catalogFor = name => EXERCISE_DATABASE.find(x =>
                    canonicalExerciseKey(x.name) === canonicalExerciseKey(name));
                const matchesSlot = ex => {
                    const meta = catalogFor(ex?.name);
                    return meta?.category === slot.muscle && meta?.pattern === slot.pattern &&
                        (!slot.shoulderHeadIsolation ||
                         meta.shoulderHeadIsolation === slot.shoulderHeadIsolation);
                };
                const previousName = matchesSlot(priorAtIndex) ? priorAtIndex.name :
                    priorExercises.find(matchesSlot)?.name || null;
                const selected = selectExerciseForSlot(slot, {
                    preferences: selectionPreferences,
                    focus,
                    previousName,
                    selectedToday: exercisesSelectedToday,
                    weeklyCounts: daySelectionCounts
                });
                if (!selected.exercise) {
                    excludedOptionalSlots.push({
                        dayNumber: dayIndex + 1,
                        muscle: slot.muscle,
                        pattern: slot.pattern,
                        reason: selected.reason
                    });
                    return [];
                }
                const exercise = selected.exercise;
                exercisesSelectedToday.push(exercise.name);
                daySelectionCounts.set(exercise.id,
                    (daySelectionCounts.get(exercise.id) || 0) + 1);
                return [{ ...exercise, anchorKey: slot.anchor || null,
                    repIntent: slot.repIntent || null,
                    priorityProtected: Boolean(slot.priorityProtected),
                    isOptional: Boolean(slot.optional),
                    selectionReason:slot.addedForFocus
                        ? 'Accessorio opzionale per il distretto prioritario ' +
                            slot.muscle + '; inserito soltanto se resta tempo.'
                        : selected.reason }];
            });

            // Lo scarico conserva la seduta effettivamente programmata, inclusi
            // gli accessori trasferiti: il tempo liberato non autorizza aggiunte.
            if (deloadReference) rawExercises = deloadReference.exercises.map(previous => ({
                ...EXERCISE_DATABASE.find(ex => ex.name === previous.name),
                anchorKey: previous.anchorKey, priorityProtected: previous.priorityProtected,
                isOptional: previous.isOptional, deloadSets: Math.max(1, Math.floor(previous.setsCount * 0.67)),
                selectionReason: 'Esercizio mantenuto dalla settimana precedente per lo scarico.'
            }));

            // Integrazione della funzione di specializzazione originale
            rawExercises = applySpecializationFocus(rawExercises, safeHistory);

            const processedExercises = rawExercises.map((exItem, index) => {
                const ex = exItem;
                const fatiguedRegion=isRegionAffected(guardrails,ex.category);
                
                const canonicalKey = canonicalExerciseKey(ex.name);
                const prior = analysis.byExercise?.[canonicalKey];
                const loadDecision = analysis.decisions?.byExercise?.[canonicalKey];
                let baseKg = Number.isFinite(loadDecision?.plannedKg) && loadDecision.plannedKg > 0
                    ? loadDecision.plannedKg : (
                        Number.isFinite(prior?.lastWorkingKg) && prior.lastWorkingKg > 0
                            ? prior.lastWorkingKg
                            : (Number.isFinite(prior?.lastKg) && prior.lastKg > 0
                                ? prior.lastKg : null)
                    );
                const reps = prescribeExerciseReps(ex, {
                    focus, index, experience: onboarding.experience,
                    calibrationWeek: onboarding.calibrationWeek && w === 1,
                    weekNumber: w, isDeload: isDeloadWeek, loadDecision
                });
                // Un range piu' alto non autorizza a riutilizzare gli stessi
                // kg della precedente zona di ripetizioni: nessuna stima
                // automatica oltre il campo osservato.
                const oldMax = Number(prior?.lastReps?.max);
                const newMax = Number(reps.split('-')[1]);
                const requiresHighRepRecalibration = Boolean(
                    HIGH_REP_EXERCISES[ex.name] &&
                    Number.isFinite(oldMax) && oldMax > 0 &&
                    Number.isFinite(newMax) && newMax > oldMax
                );
                if (requiresHighRepRecalibration) baseKg = null;
                const exerciseRpeString = prescribeExerciseRpe(ex, {
                    weekTargetRpe: weekPolicy.targetRpe, isDeload: isDeloadWeek,
                    experience: onboarding.experience,
                    calibrationWeek: onboarding.calibrationWeek && w === 1,
                    fatigueConcern: prior?.fatigueConcern === true || fatiguedRegion || guardrails.recoveryRequired
                }).toFixed(1);
                if (HIGH_REP_EXERCISES[ex.name]) {
                    // Le note di forza del vecchio range non descrivono la nuova prescrizione.
                    ex.noteOverride = null;
                }
                const reference = ex.anchorKey
                    ? athleteProfile?.referenceLoads?.[ex.anchorKey] : null;
                const expectedVariant = ex.anchorKey
                    ? (selectionPreferences.preferredLifts[ex.anchorKey] ||
                        defaultFundamentalName(ex.anchorKey, focus)) : null;
                // Non trasformare un peso riferito alla panca in un carico
                // prescritto per una variante alternativa scelta automaticamente.
                const referenceKg = !hasConfirmedHistory && !onboarding.calibrationWeek &&
                    ex.name === expectedVariant
                    ? eligibleReferenceLoad(athleteProfile, ex.anchorKey, reps) : null;
                const usingReference = baseKg === null && referenceKg !== null;
                if (usingReference) baseKg = referenceKg;

                // Auto-Deload Preventivo per Inattività
                let autoNote = requiresHighRepRecalibration
                    ? '[CALIBRAZIONE NUOVO RANGE] Ripetizioni più alte delle sedute comparabili: scegli e registra un nuovo carico confortevole, senza copiare il peso precedente. | '
                    : "";
                
                // Iniettiamo la nota analitica sullo stallo o progresso basata sull'e1RM
                if (analysis.exerciseNotes && analysis.exerciseNotes[canonicalExerciseKey(ex.name)]) {
                    autoNote += `${analysis.exerciseNotes[canonicalExerciseKey(ex.name)]} | `;
                }
                
                // Il carico progredisce in base alle prestazioni e all'RPE, non al calendario.
                // Una riduzione deliberata dalla revisione dei dati non deve
                // essere sommata ciecamente a un altro -15% nella settimana
                // di recupero: volume e RPE sono gia' ridotti.
                const plannedKg = baseKg === null ? null :
                    (isDeloadWeek && loadDecision?.action !== 'reduce_load'
                        ? baseKg * 0.85 : baseKg);
                // Real load steps are set by the athlete and synced in their
                // equipment profile. Defaults are illustrative.
                const equipmentSettings=config.equipmentSettings || config.loadingSteps || {};
                const resolvedLoad=resolvePlannedLoad(ex,plannedKg,equipmentSettings);
                const targetKgMin=resolvedLoad.weight===null?'':String(resolvedLoad.weight);
                const targetKgMax=targetKgMin;

                const mainMuscle = ex.category;
                const realFrequency = muscleFrequencyMap[mainMuscle] || 2;

                let baseSets = calculateTargetSets({
                    category: ex.category,
                    focusMuscleGroup: effectiveFocusMuscle,
                    isDeloadWeek,
                    weekNumber: w,
                    isMaster,
                    frequency: realFrequency
                });
                
                let setsCount = Math.max(2, onboarding.volumeCap === null
                    ? baseSets : Math.min(baseSets, onboarding.volumeCap));
                if (deloadReference) setsCount = ex.deloadSets;
                const volumeDecision = analysis.decisions?.byMuscle?.[ex.category];
                if (!isDeloadWeek && ex.pattern === 'isolation' &&
                    !volumeAdjustmentsApplied.has(ex.category) && volumeDecision?.volumeDelta &&
                    (!guardrails.recoveryRequired || volumeDecision.volumeDelta < 0) &&
                     (!fatiguedRegion || volumeDecision.volumeDelta < 0)) {
                    const suggested = Math.max(2, Math.min(4, setsCount + volumeDecision.volumeDelta));
                    if (suggested !== setsCount) {
                        setsCount = onboarding.volumeCap === null
                            ? suggested : Math.min(suggested, onboarding.volumeCap);
                        volumeAdjustmentsApplied.add(ex.category);
                        autoNote += `${volumeDecision.reason} | `;
                    }
                }

                // Riduzione prudente mirata: mai sommare un altro -1
                // a una riduzione accessoria già proposta per lo stesso distretto.
                if(!isDeloadWeek && !guardrails.recoveryRequired && fatiguedRegion &&
                    ex.pattern==='isolation' && setsCount>2 &&
                    !volumeAdjustmentsApplied.has(ex.category)){
                    setsCount--;
                    volumeAdjustmentsApplied.add(ex.category);
                    autoNote += '[RECUPERO LOCALE] Una serie accessoria in meno; gli altri distretti invariati. | ';
                }

                let topsetStr = "";
                if (loadDecision && loadDecision.action !== 'maintain' && !requiresHighRepRecalibration) {
                    autoNote += `[PROGRESSIONE MYCOATCH] ${loadDecision.reason} | `;
                }
                if (loadDecision?.stallStrategy) {
                    autoNote += '[STRATEGIA STALLO] ' + loadDecision.stallStrategy.recommendation + ' | ';
                }
                if (loadDecision?.caveats?.includes('rpe_mancante_o_sopra_target') &&
                    loadDecision.action === 'maintain') {
                    autoNote += '[QUALITÀ DATI] RPE assente o oltre il target nelle settimane di confronto: carico non aumentato. | ';
                }
                if (plannedKg !== null && ex.equipment !== 'bodyweight') {
                    autoNote += resolvedLoad.verified
                        ? targetKgMin ? '[ATTREZZATURA] Carico componibile con il bilanciere e i dischi configurati. | '
                            : resolvedLoad.reason === 'missing_assignment'
                                ? '[ATTREZZATURA DA CONFIGURARE] Associa a questo esercizio peso e diametro del bilanciere e inventario compatibile. Il carico non è ancora verificabile. | '
                                : '[ATTREZZATURA] Il carico previsto non è componibile con i dischi configurati. Kg lasciati vuoti: scegli un carico disponibile rispettando il target RPE e registralo. | '
                        : '[ATTREZZATURA] Arrotondamento indicativo: verifica gli incrementi di peso realmente disponibili. | ';
                }
                const coachingContext = generateContextNote(ex, exerciseRpeString, isDeloadWeek);
                let noteFinal = autoNote + coachingContext +
                    (exItem.selectionReason ? ' | [SCELTA MYCOATCH] ' + exItem.selectionReason : '') +
                    (exItem.noteOverride ? ' | ' + exItem.noteOverride : '');
                if (!targetKgMin && ex.equipment !== 'bodyweight' && plannedKg === null && !requiresHighRepRecalibration) {
                    noteFinal += ' | [CARICO DA CALIBRARE] Nessun carico storico comparabile disponibile: usa le serie di avvicinamento per trovare un peso entro il range e il target RPE, poi registra kg, reps e RPE reali.';
                }
                if (!isDeloadWeek) noteFinal += ' | [PROGRESSIONE] Aumenta prima le ripetizioni nel range. Quando tutte le serie confermate raggiungono il limite alto con tecnica stabile e RPE entro target, valuta il minimo incremento disponibile nella prossima seduta. Se il salto è troppo grande, mantieni. Se non raggiungi il minimo o superi il target, rivaluta carico e recupero. Il solo check non misura lo sforzo: registra reps, kg e RPE reali.';
                if (onboarding.calibrationWeek && w === 1) {
                    noteFinal += ' | [CALIBRAZIONE MYCOATCH] Prima settimana: tecnica pulita, carico leggero/moderato e RPE prescritto, non tentare massimali. Compila kg e reps reali per adattare la prossima proposta.';
                }
                if (reference) {
                    noteFinal += ' | [RIFERIMENTO ATLETA] ' + reference.kg + ' kg × ' +
                        reference.reps + ' reps' +
                        (reference.rpe !== null ? ' @RPE ' + reference.rpe : '') +
                        '. Dato dichiarato, NON risultato confermato dal diario.' +
                        (usingReference ? ' Peso provvisorio: riconferma durante la seduta.' :
                            hasConfirmedHistory ? ' Peso non prescritto automaticamente: precedenza allo storico confermato o calibrazione.' :
                            ' Peso non prescritto automaticamente: controlla data, range, RPE e variante.');
                }
                if (onboarding.experience === 'beginner') {
                    noteFinal += ' | [VOLUME INIZIALE] Massimo 2 serie per esercizio nella proposta iniziale.';
                }

                const isFirstCompound = index === 0 && ["squat", "hinge", "horizontal_push", "vertical_push", "vertical_pull"].includes(ex.pattern);
                
                if (isFirstCompound) {
                    if (targetKgMin && !usingReference) {
                        const warmupReferenceKg = Number(targetKgMin);
                        const warmups=[0.5,0.7,0.85].map(ratio=>resolvedLoad.verified
                            ? resolvePlannedLoad(ex,warmupReferenceKg*ratio,equipmentSettings).weight
                            : Math.round(warmupReferenceKg*ratio));
                        noteFinal = warmups.every(kg=>kg!==null && kg>0)
                            ? `🔥 [WARM-UP AUTO]: 8x${warmups[0]}kg, 4x${warmups[1]}kg, 2x${warmups[2]}kg. | ` + noteFinal
                            : '[WARM-UP] Avvicinati gradualmente al carico di lavoro con pesi realmente disponibili, senza affaticarti. | ' + noteFinal;
                    } else {
                        // When no verified training load is available (or the
                        // reference is provisional), still prescribe gradual
                        // warm-up sets without inventing a kilogram target.
                        // The time estimator already budgets this warm-up.
                        noteFinal = '[WARM-UP] Esegui serie di avvicinamento progressive con un peso leggero e disponibile, senza affaticarti, prima delle serie di lavoro. | ' + noteFinal;
                    }
                }

                // Mai inventare un top set più pesante dei carichi verificati.
                // Quando richiesto, la prima serie è solo una serie di riferimento
                // allo stesso carico e al target RPE della settimana.
                if (config.useTopset === true && !isDeloadWeek &&
                    !onboarding.calibrationWeek && !usingReference &&
                    targetKgMin && index === 0 && !fatiguedRegion &&
                    authorizeTopset(prior,{
                        recoveryRequired:guardrails.recoveryRequired,
                        isDeload:isDeloadWeek,
                        calibrationWeek:onboarding.calibrationWeek,
                        experience:onboarding.experience
                    })) {
                    topsetStr = `1x${reps.split('-')[0]} @ ${targetKgMin}kg (RPE max ${exerciseRpeString})`;
                    noteFinal += ' | [TOP SET CONTROLLATO] Nessun incremento extra: registra RPE e ripetizioni reali prima di proporre un carico maggiore.';
                }

                const currentTechnique = (onboarding.calibrationWeek ||
                    onboarding.experience === 'beginner' ||
                    !guardrails.allowNewAdvancedTechniques || fatiguedRegion) ? null :
                    (exItem.intensityTechnique || null);

                const setsArray = Array.from({ length: setsCount }, (_, setIdx) => {
                    let setKg = plannedKg === null ? null : Number(targetKgMin);
                    

                    const isLastSet = (setIdx === setsCount - 1);

                    return {
                        setNumber: setIdx + 1,
                        targetReps: reps,
                        targetKg: setKg !== null && setKg > 0 ? setKg.toString() : "",
                        actualReps: "",
                        actualKg: "",
                        completed: false,
                        isWarmup: false,
                        intensityTechnique: (isLastSet && currentTechnique) ? currentTechnique : null
                    };
                });

                return {
                    name: ex.name,
                    // Priorita' mantenuta fino all'ottimizzatore del tempo: lo
                    // squat puo' essere il terzo esercizio ma resta un anchor.
                    anchorKey: ex.anchorKey || null,
                    priorityProtected: Boolean(ex.priorityProtected),
                    isOptional: Boolean(ex.isOptional),
                    setsCount: setsCount,
                    reps: reps,
                    kgMin: String(targetKgMin),
                    kgMax: String(targetKgMax),
                    restTime: ex.pattern === "isolation" ? "90s" :
                        (index === 0 ? "180s" : "150s"),
                    category: ex.category,
                    pattern: ex.pattern,
                    equipment: ex.equipment,
                    topset: topsetStr,
                    rpe: exerciseRpeString,
                    notes: noteFinal, // <-- Visibile direttamente nel tab delle note della WebApp per spiegare le decisioni
                    sets: setsArray
                };
            });

            intendedDays.push(processedExercises);
            const timedPlan = selectExercisesForTime(processedExercises,
                maxSessionMinutes, {
                    focusMuscleGroup:effectiveFocusMuscle,
                    scheduledWeeklySets,history:analysis,
                    // Le superserie alzano mediamente l'RPE percepito:
                    // non accelerare sedute con fatica ripetuta documentata.
                    allowGrouping:!guardrails.recoveryRequired,
                    paceFactor:config.durationCalibration?.factor ?? 1,
                     excludedGroupingMuscles
                });
            registerSelectedWeeklySets(scheduledWeeklySets,timedPlan.exercises);
            // Le varianti scartate per il tempo NON vanno considerate come
            // gia' programmate quando si scelgono quelle del giorno seguente.
            for(const programmed of timedPlan.exercises) {
                const meta=EXERCISE_DATABASE.find(item =>
                    canonicalExerciseKey(item.name) === canonicalExerciseKey(programmed.name));
                if(meta) weeklySelectionCounts.set(meta.id,
                    (weeklySelectionCounts.get(meta.id)||0)+1);
            }
            weekDays.push({
                dayNumber: dayIndex + 1,
                dayName: dayTemplate.name,
                ...timedPlan
            });
        });

        // Il limite di minuti si applica a OGNI giornata. Solo dopo avere
        // costruito la settimana si possono recuperare accessori nei giorni
        // compatibili con margine sufficiente. Non modificare il deload.
        const balanced = rebalanceWeeklyAccessories(
            weekDays, intendedDays, maxSessionMinutes, {
                isDeloadWeek,
                preventTransfers:guardrails.recoveryRequired,
                 blockedTransferMuscles:excludedGroupingMuscles,
                 excludedGroupingMuscles,
                paceFactor:config.durationCalibration?.factor ?? 1,
                maxAccessorySets: onboarding.volumeCap ?? 4
            }
        );
        for (const day of balanced.days) {
            // Un solo dropset facoltativo nella seconda settimana, soltanto
            // su isolamenti con due settimane di RPE misurato e recupero
            // credibile. Mai concatenarlo con superset/triset o deload.
            if (!isDeloadWeek && w === 2 && guardrails.allowNewAdvancedTechniques) {
                for (const exercise of day.exercises.slice(2)) {
                    if(isRegionAffected(guardrails,exercise.category))continue;
                    const proposal = suggestDropset(exercise, {
                        weekNumber: w, isDeload: isDeloadWeek,
                        experience: onboarding.experience,
                        calibrationWeek: onboarding.calibrationWeek,
                        focus, timeBudgetMinutes: maxSessionMinutes,
                        availableSeconds: maxSessionMinutes * 60 - day.estimatedSeconds,
                        history: analysis.byExercise?.[canonicalExerciseKey(exercise.name)]
                    });
                    if (!proposal) continue;
                    const lastSet = exercise.sets?.at(-1);
                    if (!lastSet) continue;
                    lastSet.intensityTechnique = proposal.technique;
                    exercise.notes = [exercise.notes, proposal.note].filter(Boolean).join(' | ');
                    day.estimatedSeconds += proposal.extraSeconds;
                    day.estimatedMinutes = Math.ceil(day.estimatedSeconds / 60);
                    break;
                }
            }
            // Il CSV originale non contiene la colonna "nome giornata":
            // conserviamo lo split nella nota del primo esercizio, così
            // l'importatore può mostrare Upper A / Lower A / Upper B / Lower B.
            const dayLabel = String(day.dayName).match(/^(Upper [AB]|Lower [AB]|Full Body [ABCD])\b/)?.[1];
            const splitNote = dayLabel ? `[SPLIT MYCOATCH] ${dayLabel}` : '';
            const calibrated = (config.durationCalibration?.sampleCount ?? 0) >= 3;
            const durationNote = `[DURATA STIMATA] ${day.estimatedMinutes} minuti su ${maxSessionMinutes} disponibili, inclusi riscaldamento generale, avvicinamento e lavoro su entrambi i lati. ${calibrated ? 'Stima prudente calibrata su ' + config.durationCalibration.sampleCount + ' sedute reali. ' : ''}Il timer del diario parte dopo la prima serie confermata, quindi misura solo parte della seduta. Stima orientativa.`;
            const adjustments = [];
            if (day.reducedPrioritySets) adjustments.push(`${day.reducedPrioritySets} serie dei movimenti prioritari ridotte per rispettare il tempo, valuta più minuti per recuperare il volume`);
            if (day.reducedAccessorySets) adjustments.push(`${day.reducedAccessorySets} serie accessorie ridotte`);
            if (day.removedAccessoryExercises) adjustments.push(`${day.removedAccessoryExercises} esercizi rimossi`);
            if (day.transferredAccessorySetsIn) {
                adjustments.push(`${day.transferredAccessorySetsIn} serie accessorie recuperate da altri giorni`);
            }
            if (day.transferredAccessorySetsOut) {
                adjustments.push(`${day.transferredAccessorySetsOut} serie recuperate su un altro giorno`);
            }
            if (adjustments.length) {
                adjustments.push('verificare il riepilogo del volume settimanale');
            }
            // Il CSV resta a 12 colonne: note con stima e compromessi.
            day.exercises[0].notes = [
                splitNote, day.exercises[0].notes, durationNote,
                adjustments.length ? '[TEMPO RIDOTTO] ' + adjustments.join(', ') + '.' : ''
            ].filter(Boolean).join(' | ');
        }
        weeks.push({
            weekNumber: w,
            phase: weekPolicy.phase,
            isDeloadWeek,
            targetRpe: weekPolicy.targetRpe,
            days: balanced.days,
            volumeBalance: balanced.report,
            weeklyCoverage: auditWeeklyCoverage(balanced.days, templateDays, intendedDays),
            optionalSlotsNotAvailable: excludedOptionalSlots
        });
    }

    return {
        id: `mycoatch_meso_${Date.now()}`,
        name: name,
        createdAt: new Date().toISOString(),
        config: config,
        athleteOnboarding: profileSummary(athleteProfile, onboarding),
        coachGuardrails: guardrails,
        periodization,
        weeks: weeks
    };
}

/**
 * Calcola il numero di serie target rispettando le soglie ipertrofiche (MEV/MAV/MRV)
 */
function calculateTargetSets({ category = "", focusMuscleGroup, isDeloadWeek, weekNumber, isMaster, frequency = 2 }) {
    if (isDeloadWeek) return 2;

    const mainMuscle = Object.keys(MUSCLE_VOLUME_LANDMARKS).find(m => m.toLowerCase() === category.toLowerCase()) || "Gambe";
    const landmarks = MUSCLE_VOLUME_LANDMARKS[mainMuscle] || MUSCLE_VOLUME_LANDMARKS.Petto;

    const isSpecialization = focusMuscleGroup && focusMuscleGroup.toLowerCase() === mainMuscle.toLowerCase();
    const targetVolumeLandmark = isSpecialization ? landmarks.mav : landmarks.mev;
    
    let targetSets = Math.round(targetVolumeLandmark / Math.max(1, frequency));
    // Nessun aumento di serie solo perche e' la terza settimana.
    // Eventuali +1/-1 derivano da segnali di tolleranza in adaptiveDecisions.
    const maxAllowed = Math.min(3, Math.ceil(landmarks.mrv / Math.max(1, frequency)));
    return Math.max(2, Math.min(targetSets, maxAllowed));
}

function generateContextNote(ex, rpe, isDeload) {
    const rir = Math.round((10 - Number(rpe)) * 2) / 2;
    const cue = ex.name === 'Hamstring Walkout a Corpo Libero'
        ? 'Da ponte glutei, allontana i talloni con piccoli passi e ritorna mantenendo il bacino controllato: uscita e ritorno valgono una ripetizione. Accorcia il percorso se perdi il controllo. Registra 0 kg se non usi sovraccarico.'
        : ex.pattern === 'squat' ? 'Mantieni il tronco stabile, controlla la discesa e usa una profondità ripetibile senza perdere la posizione.'
        : ex.pattern === 'hinge' ? 'Porta indietro il bacino, mantieni il carico vicino e limita il movimento all’escursione che controlli.'
        : ex.pattern === 'isolation' ? 'Usa un’escursione controllata e ripetibile, senza slanci.'
        : 'Mantieni appoggi stabili ed esecuzione controllata, senza compensi.';
    return (isDeload ? '🛡️ Scarico: riduci il lavoro, senza inseguire record. ' : '') +
        cue + ` Target RPE ${rpe}: circa ${rir} ripetizioni in riserva (stima soggettiva).` +
        (HIGH_REP_EXERCISES[ex.name] ? ' Valuta il progresso con ripetizioni, tecnica e RPE a parità di carico, senza dedurre stalli dal solo e1RM.' : '');
}

export function getTemplateForDays(daysPerWeek = 3, splitPreference = 'auto') {
    if (!['auto', 'upperlower', 'fullbody'].includes(splitPreference)) {
        throw new Error('Struttura settimanale MyCoatch non valida.');
    }
    if (daysPerWeek === 3) {
        // Con tre sedute si preferisce la Full Body: i quattro fondamentali
        // restano distribuiti nella settimana, senza tre lower consecutivi.
        return [
            {
                name: 'Full Body A (Panca, dorsali, quadricipiti)',
                slots: [
                    { muscle: 'Petto', pattern: 'horizontal_push', anchor: 'bench' },
                    { muscle: 'Back_Lats', pattern: 'vertical_pull' },
                    // Fondamentale della seduta anche se terzo nella lista:
                    // non duplicare l'anchor squat riservato a Full Body C.
                    { muscle: 'Quadricipiti', pattern: 'squat', priorityProtected: true },
                    { muscle: 'Spalle', pattern: 'isolation' },
                    { muscle: 'Bicipiti', pattern: 'isolation' },
                    { muscle: 'Polpacci', pattern: 'isolation', optional: true }
                ]
            },
            {
                name: 'Full Body B (Hip hinge, spinta verticale, dorso)',
                slots: [
                    { muscle: 'Femorali', pattern: 'hinge', anchor: 'hinge' },
                    { muscle: 'Spalle', pattern: 'vertical_push', anchor: 'military' },
                    { muscle: 'Back_Thickness', pattern: 'horizontal_pull' },
                    { muscle: 'Petto', pattern: 'isolation' },
                    { muscle: 'Tricipiti', pattern: 'isolation' },
                    { muscle: 'Core', pattern: 'isolation', optional: true }
                ]
            },
            {
                name: 'Full Body C (Squat, petto, dorsali)',
                slots: [
                    { muscle: 'Quadricipiti', pattern: 'squat', anchor: 'squat' },
                    { muscle: 'Petto', pattern: 'horizontal_push' },
                    { muscle: 'Back_Lats', pattern: 'vertical_pull' },
                    { muscle: 'Glutei', pattern: 'hip_thrust', optional: true },
                    { muscle: 'Bicipiti', pattern: 'isolation' },
                    { muscle: 'Core', pattern: 'isolation', optional: true }
                ]
            }
        ];
    }
    if (daysPerWeek !== 4) throw new Error('MyCoatch supporta 3 o 4 giorni a settimana.');

    // Opzione esplicita: quattro Full Body con due esposizioni distinte per
    // ciascun fondamentale. Il template Upper/Lower precedente resta invariato.
    if (splitPreference === 'fullbody') return [
        {
            name: 'Full Body A (RDL forza, panca volume)',
            slots: [
                { muscle: 'Femorali', pattern: 'hinge', anchor: 'hinge', repIntent: 'strength' },
                { muscle: 'Petto', pattern: 'horizontal_push', anchor: 'bench', repIntent: 'volume' },
                { muscle: 'Back_Lats', pattern: 'vertical_pull' },
                { muscle: 'Spalle', pattern: 'isolation', shoulderHeadIsolation: 'posteriore', prefer: ['Alzate Posteriori con Manubri', 'Face Pull ai Cavi'] },
                { muscle: 'Polpacci', pattern: 'isolation' },
                { muscle: 'Core', pattern: 'isolation', optional: true }
            ]
        },
        {
            name: 'Full Body B (squat forza, military volume)',
            slots: [
                { muscle: 'Quadricipiti', pattern: 'squat', anchor: 'squat', repIntent: 'strength' },
                { muscle: 'Spalle', pattern: 'vertical_push', anchor: 'military', repIntent: 'volume' },
                { muscle: 'Back_Thickness', pattern: 'horizontal_pull' },
                { muscle: 'Femorali', pattern: 'isolation', optional: true },
                { muscle: 'Spalle', pattern: 'isolation', shoulderHeadIsolation: 'laterale', prefer: ['Alzate Laterali con Manubri', 'Alzate Laterali ai Cavi'] },
                { muscle: 'Bicipiti', pattern: 'isolation' }
            ]
        },
        {
            name: 'Full Body C (RDL volume, military forza)',
            slots: [
                { muscle: 'Femorali', pattern: 'hinge', anchor: 'hinge', repIntent: 'volume' },
                { muscle: 'Spalle', pattern: 'vertical_push', anchor: 'military', repIntent: 'strength' },
                { muscle: 'Back_Lats', pattern: 'vertical_pull' },
                { muscle: 'Tricipiti', pattern: 'isolation' },
                { muscle: 'Spalle', pattern: 'isolation', shoulderHeadIsolation: 'laterale', prefer: ['Alzate Laterali con Manubri', 'Alzate Laterali ai Cavi'] },
                { muscle: 'Polpacci', pattern: 'isolation', optional: true }
            ]
        },
        {
            name: 'Full Body D (squat volume, panca forza)',
            slots: [
                { muscle: 'Quadricipiti', pattern: 'squat', anchor: 'squat', repIntent: 'volume' },
                { muscle: 'Petto', pattern: 'horizontal_push', anchor: 'bench', repIntent: 'strength' },
                { muscle: 'Back_Thickness', pattern: 'horizontal_pull' },
                { muscle: 'Spalle', pattern: 'isolation', shoulderHeadIsolation: 'posteriore', prefer: ['Alzate Posteriori con Manubri', 'Face Pull ai Cavi'] },
                { muscle: 'Bicipiti', pattern: 'isolation' },
                { muscle: 'Core', pattern: 'isolation', optional: true }
            ]
        }
    ];

    return [
        {
            name: 'Upper A (Priorità panca, dorsali)',
            slots: [
                { muscle: 'Petto', pattern: 'horizontal_push', anchor: 'bench' },
                { muscle: 'Back_Lats', pattern: 'vertical_pull' },
                { muscle: 'Petto', pattern: 'isolation' },
                { muscle: 'Spalle', pattern: 'isolation', shoulderHeadIsolation: 'laterale', prefer: [
                    'Alzate Laterali con Manubri', 'Alzate Laterali ai Cavi'
                ] },
                { muscle: 'Bicipiti', pattern: 'isolation' }
            ]
        },
        {
            name: 'Lower A (Priorità squat, femorali)',
            slots: [
                { muscle: 'Quadricipiti', pattern: 'squat', anchor: 'squat' },
                { muscle: 'Femorali', pattern: 'isolation', optional: true },
                { muscle: 'Quadricipiti', pattern: 'squat', prefer: [
                    'Bulgarian Split Squat con Manubri', 'Affondi con Manubri',
                    'Goblet Squat con Manubrio', 'Front Squat'
                ] },
                { muscle: 'Glutei', pattern: 'hip_thrust', optional: true },
                { muscle: 'Polpacci', pattern: 'isolation' },
                { muscle: 'Core', pattern: 'isolation', optional: true }
            ]
        },
        {
            name: 'Upper B (Priorità military press, richiamo petto e dorso)',
            slots: [
                { muscle: 'Spalle', pattern: 'vertical_push', anchor: 'military' },
                { muscle: 'Back_Thickness', pattern: 'horizontal_pull' },
                { muscle: 'Petto', pattern: 'horizontal_push', prefer: [
                    'Panca Inclinata con Manubri', 'Panca Inclinata con Bilanciere',
                    'Push-up a Terra'
                ] },
                // I tricipiti hanno la priorità sui richiami facoltativi del dorso:
                // la spinta verticale non sostituisce sempre serie dirette di estensione.
                { muscle: 'Tricipiti', pattern: 'isolation' },
                { muscle: 'Back_Lats', pattern: 'vertical_pull', optional: true },
                { muscle: 'Spalle', pattern: 'isolation', shoulderHeadIsolation: 'posteriore', prefer: [
                    'Alzate Posteriori con Manubri', 'Face Pull ai Cavi',
                    'Reverse Fly ai Cavi'
                ], optional: true }
            ]
        },
        {
            name: 'Lower B (Priorità stacco rumeno o convenzionale)',
            slots: [
                { muscle: 'Femorali', pattern: 'hinge', anchor: 'hinge' },
                { muscle: 'Quadricipiti', pattern: 'squat', prefer: [
                    'Front Squat', 'Goblet Squat con Manubrio',
                    'Bulgarian Split Squat con Manubri'
                ] },
                { muscle: 'Femorali', pattern: 'isolation', optional: true },
                { muscle: 'Polpacci', pattern: 'isolation' },
                { muscle: 'Core', pattern: 'isolation', optional: true }
            ]
        }
    ];
}

export function applySpecializationFocus(exercises, historicalData) {
    return exercises.map(ex => {
        const exHistory = historicalData.byExercise?.[canonicalExerciseKey(ex.name)];
        
        if (exHistory && exHistory.status === "possible_stall") {
            return {
                ...ex,
                noteOverride: "Possibile stallo: verifica recupero, aderenza e tecnica prima di cambiare il programma."
            };
        }
        return ex;
    });
}

/** @deprecated Usa analyzeTrainingHistory per lo storico completo. */
export function analyzePreviousMesocycle(lastMesocycle) {
    return analyzeCompletedMesocycle(lastMesocycle);
}

