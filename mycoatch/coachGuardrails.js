/**
 * MyCoatch — veto espliciti e spiegabili. Le preferenze dell'atleta sono
 * obiettivi, non permessi per saltare lo scarico o intensificare senza dati.
 * Le soglie sono euristiche conservative: nessuna diagnosi medica o misura
 * automatica della tecnica, della crescita o del recupero.
 */
import { canonicalExerciseKey } from './exerciseIdentity.js';

export const SCIENCE_SNAPSHOT = Object.freeze({
    reviewedOn:'2026-10-16',
    automaticLiteratureUpdates:false,
    sources:Object.freeze([
        Object.freeze({
            doi:'10.1007/s40279-025-02344-w', year:2026, topic:'weekly_volume',
            takeaway:'Il volume ha una relazione dose-risposta con rendimenti decrescenti; le serie indirette meritano un conteggio distinto.'
        }),
        Object.freeze({
            doi:'10.1007/s40279-025-02176-8', year:2025, topic:'supersets',
            takeaway:'Superset efficienti nel tempo, senza superiorità dimostrata per ipertrofia; l’RPE può aumentare.'
        }),
        Object.freeze({
            doi:'10.1186/s40798-023-00620-5', year:2023, topic:'dropsets',
            takeaway:'Dropset utili per efficienza; superiorità dell’ipertrofia rispetto alle serie tradizionali non dimostrata.'
        }),
        Object.freeze({
            doi:'10.1007/s40279-022-01784-y', year:2023, topic:'failure',
            takeaway:'Allenarsi al cedimento muscolare momentaneo non è dimostrato superiore in modo sistematico.'
        })
    ])
});

export function evaluateCoachingGuardrails(config={}, history={}, onboarding={}) {
    const exercises=Object.values(history?.byExercise || {});
    const repeatedFatigue=exercises.filter(ex =>
        ex?.fatigueConcern === true &&
        Number(ex?.progressionEvidence?.distinctWeeks || 0) >= 2);
    const recoveryRequired=repeatedFatigue.length>0;
    const athletePriority=config?.athleteProfile?.priorityMuscle ||
        config?.focusMuscleGroup || null;
    const vetoedMuscles=new Set(repeatedFatigue.map(ex=>ex.category).filter(Boolean));
    const reasons=[];
    if(recoveryRequired){
        reasons.push({
            code:'RECOVERY_FIRST',
            decision:'RIPRISTINO PRIORITARIO',
            reason:'Fatica ripetuta in almeno due settimane distinte: scarico nella prima settimana, niente nuove specializzazioni né tecniche avanzate finché il recupero non è stato verificato.',
            exercises:repeatedFatigue.map(ex=>ex.name).filter(Boolean)
        });
        if(config.deloadWeek===false ||
            (Number.isInteger(config.deloadWeek) && config.deloadWeek>1)){
            reasons.push({
                code:'DELOAD_VETO',
                decision:'RICHIESTA NON ACCOLTA',
                reason:'La richiesta di evitare o rinviare lo scarico non prevale su segnali di fatica ripetuti.'
            });
        }
    }
    if(athletePriority && (recoveryRequired || vetoedMuscles.has(athletePriority))){
        reasons.push({
            code:'FOCUS_VETO',
            decision:'SPECIALIZZAZIONE RINVIATA',
            reason:'La priorità muscolare richiesta non autorizza ad aggiungere volume quando servono recupero e rivalutazione.',
            muscle:athletePriority
        });
    }
    if(config.useTopset===true && (recoveryRequired ||
        onboarding.calibrationWeek || onboarding.experience==='beginner')){
        reasons.push({
            code:'TOPSET_VETO',
            decision:'TOP SET NON AUTORIZZATO',
            reason:'Un top set opzionale non è prioritario in recupero, durante la calibrazione o per un principiante.'
        });
    }
    return {
        version:1,
        recoveryRequired,
        evidenceSnapshot:SCIENCE_SNAPSHOT.reviewedOn,
        requestedFocus:athletePriority,
        effectiveFocusMuscle:recoveryRequired ? null : athletePriority,
        allowNewAdvancedTechniques:!recoveryRequired,
        reasons
    };
}

/** Top set: carico di riferimento solo se due settimane comparabili sono
 * realmente concluse con RPE misurati e non oltre target. Mai al cedimento. */
export function authorizeTopset(exerciseHistory,{recoveryRequired=false,
    isDeload=false,calibrationWeek=false,experience=null}={}) {
    if(recoveryRequired || isDeload || calibrationWeek ||
        experience==='beginner' || exerciseHistory?.fatigueConcern) return false;
    const weeks=new Map();
    for(const ex of exerciseHistory?.exposures || []){
        if(!ex?.weekId || ex.isDeload) continue;
        weeks.set(ex.weekId,ex);
    }
    const lastTwo=[...weeks.values()].slice(-2);
    return lastTwo.length===2 && lastTwo.every(ex =>
        ex.completedSets>=2 && ex.completedSets===ex.plannedSets &&
        ex.allRpeMeasured===true && ex.allRpeWithinTarget===true &&
        ex.allStraightSets===true && ex.avgRpe!==null && ex.avgRpe<=8.5);
}

/** Nessuna tecnica addizionale su lavoro diretto di distretti con fatica
 * documentata, anche se il profilo richiede 'più intensità'. */
export function allowMuscleIntensification(category,guardrails) {
    if(guardrails?.recoveryRequired) return false;
    return true;
}
