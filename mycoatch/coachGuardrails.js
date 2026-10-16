/**
 * MyCoatch — veto espliciti e spiegabili. Le preferenze dell'atleta sono
 * obiettivi, non permessi per saltare lo scarico o intensificare senza dati.
 * Le soglie sono euristiche conservative: nessuna diagnosi medica o misura
 * automatica della tecnica, della crescita o del recupero.
 */
import { assessRecoveryScope, isRegionAffected } from './recoveryScope.js';

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
    const assessment=assessRecoveryScope(history);
    const recoveryRequired=assessment.recoveryRequired;
    const athletePriority=config?.athleteProfile?.priorityMuscle ||
        config?.focusMuscleGroup || null;
    const focusAtRisk=isRegionAffected(assessment,athletePriority);
    const reasons=[];
    if(assessment.scope==='local'){
        reasons.push({
            code:'LOCAL_RECOVERY',decision:'RECUPERO MIRATO',
            reason:'Fatica ripetuta in una regione: RPE prudente e stop a tecniche avanzate, superserie e riallocazione degli accessori coinvolti. Nessuna conclusione di fatica generale.',
            exercises:assessment.recoverySignals
        });
    }
    if(recoveryRequired){
        reasons.push({
            code:'RECOVERY_FIRST',
            decision:'RIPRISTINO PRIORITARIO',
            reason:assessment.scope==='uncertain'
                ? 'Fatica ripetuta senza regione riconoscibile: mantenere il veto globale e chiarire i dati prima di intensificare.'
                : 'Fatica ripetuta in più regioni: scarico iniziale prudenziale e stop all’intensificazione globale. Non è una diagnosi di fatica sistemica.',
            exercises:assessment.recoverySignals
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
    if(athletePriority && (recoveryRequired || focusAtRisk)){
        reasons.push({
            code:'FOCUS_VETO',
            decision:'SPECIALIZZAZIONE RINVIATA',
            reason:'La priorità muscolare richiesta non autorizza ad aggiungere volume quando servono recupero e rivalutazione.',
            muscle:athletePriority
        });
    }
    if(config.useTopset===true){
        const anyEligible=exercises.some(ex=>!isRegionAffected(assessment,ex.category) &&
            authorizeTopset(ex,{
            recoveryRequired,calibrationWeek:onboarding.calibrationWeek,
            experience:onboarding.experience
        }));
        if(!anyEligible){
            reasons.push({
                code:'TOPSET_VETO',
                decision:'TOP SET NON AUTORIZZATO',
                reason:'La richiesta di top set è respinta: servono almeno due settimane confrontabili con tutte le serie completate, RPE misurati entro target e recupero adeguato.'
            });
        } else {
            reasons.push({
                code:'TOPSET_CONDITIONAL',
                decision:'TOP SET SOLTANTO DOVE DOCUMENTATO',
                reason:'La preferenza non autorizza carichi extra: i top set si usano solo su movimenti con storico sufficiente e con peso già verificato.'
            });
        }
    }
    return {
        version:1,
        recoveryRequired,
        recoveryScope:assessment.scope,
        fatiguedMuscles:assessment.fatiguedMuscles,
        fatiguedRegions:assessment.fatiguedRegions,
        evidenceSnapshot:SCIENCE_SNAPSHOT.reviewedOn,
        requestedFocus:athletePriority,
        effectiveFocusMuscle:recoveryRequired || focusAtRisk ? null : athletePriority,
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

