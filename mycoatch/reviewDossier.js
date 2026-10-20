/**
 * Manual MyCoatch review dossier. Read-only; no background AI upload.
 * The summary reuses the same confirmed-set validator as mesocycle closure.
 * Exports only current planned sessions, never copies account identifiers,
 * personal notes, dates, archived repetitions or raw athlete profiles.
 */
import { summarizeMesocycleClosure } from '../js/mesocycleClosure.js';
import { buildMesocycleCoachPdfReport } from '../js/mesocyclePdfCoachReport.js';
import { isWarmupExercise, isWarmupSet, plannedWorkSetCount } from '../js/workoutSemantics.js';
import { validateCompletedSet } from './liveCoach.js';

const isConfirmed = set => set?.isLocked === true || set?.completed === true;
const asText = value => value === null || value === undefined || String(value).trim() === ''
    ? null : String(value);

function safeSettings(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') return null;
    const settings=snapshot.settings;
    if (!settings || typeof settings !== 'object') return null;
    return {
        daysPerWeek: Number.isInteger(settings.daysPerWeek) ? settings.daysPerWeek : null,
        maxSessionMinutes: Number.isInteger(settings.maxSessionMinutes) ? settings.maxSessionMinutes : null,
        splitPreference: asText(settings.splitPreference),
        focus: asText(settings.focus)
    };
}

function summarizeExercise(exercise) {
    const plannedSets=plannedWorkSetCount(exercise);
    const rows=Array.isArray(exercise.loggedSets) ? exercise.loggedSets :
        Array.isArray(exercise.sets) ? exercise.sets : [];
    const observed=[];
    let invalidConfirmed=0;
    for (const [index,set] of rows.entries()) {
        if (isWarmupSet(set) || !isConfirmed(set)) continue;
        const valid=validateCompletedSet(set,exercise,set);
        if(!valid.ok){invalidConfirmed++;continue;}
        if(observed.length>=plannedSets)continue;
        observed.push({
            setNumber: Number.isInteger(Number(set.setNumber)) && Number(set.setNumber)>0
                ? Number(set.setNumber) : index+1,
            weightKg:valid.weight,
            repetitions:valid.numericReps,
            rpeActual:valid.rpe ?? null,
            technique:valid.technique ?? null
        });
    }
    return {
        name:asText(exercise.name) || 'Esercizio senza nome',
        prescription:{
            sets:plannedSets,
            repetitions:asText(exercise.reps ?? exercise.targetReps),
            rpeTarget:asText(exercise.targetRpe ?? exercise.rpeTarget ?? exercise.rpe),
            kgMin:asText(exercise.kgMin),
            kgMax:asText(exercise.kgMax),
            rest:asText(exercise.restTime ?? exercise.recupero ?? exercise.rest),
            topSet:asText(exercise.topset)
        },
        observedSets:observed,
        unconfirmedOrMissingSets:Math.max(0,plannedSets-observed.length),
        invalidConfirmedSets:invalidConfirmed
    };
}

export function buildMesocycleReviewDossier(mesocycle,{at=new Date()}={}) {
    if(!mesocycle || !Array.isArray(mesocycle.weeks))
        throw Error('Mesociclo non valido per il dossier.');
    const when=at instanceof Date?at:new Date(at);
    if(!Number.isFinite(when.getTime()))throw Error('Data del dossier non valida.');
    const review=summarizeMesocycleClosure(mesocycle);
    const report=buildMesocycleCoachPdfReport(mesocycle);
    const snapshot=mesocycle.coachProfileSnapshot;
    const sessions=[...mesocycle.weeks]
        .sort((a,b)=>Number(a.weekNumber)-Number(b.weekNumber))
        .flatMap((week,index)=>(week.days||[]).map((day,dayIndex)=>({
            weekNumber:week.weekNumber ?? index+1,
            dayNumber:day.dayNumber ?? dayIndex+1,
            dayName:asText(day.dayName)||'Giorno '+(dayIndex+1),
            // Work sets exclusively; warm-up prescriptions are not hypertrophy volume.
            exercises:(day.exercises||[])
                .filter(ex=>!isWarmupExercise(ex))
                .map(summarizeExercise)
        })));
    return {
        format:'mycoatch-mesocycle-review-dossier',
        schemaVersion:1,
        generatedAt:when.toISOString(),
        source:'HomeGym Diary · esportazione manuale in sola lettura',
        interpretation:'La progressione prestativa non misura direttamente ipertrofia, fatica o recupero. '+
            'I target RPE sono prescrizioni; rpeActual appare soltanto quando misurato. '+
            'Le serie incomplete o invalide non vengono trasformate in prestazioni.',
        privacy:'Nessun dato account, note libere o profilo grezzo incluso. '+
            'I nomi personalizzati del mesociclo/esercizi possono essere riconoscibili: verifica prima di condividere.',
        mesocycle:{
            name:asText(mesocycle.name)||'Mesociclo',
            status:mesocycle.coachClosure?.status==='closed'?'closed':'in_progress',
            profileVersion:Number.isInteger(snapshot?.profileVersion)
                ? snapshot.profileVersion : null,
            settings:safeSettings(snapshot)
        },
        summary:JSON.parse(JSON.stringify(review)),
        muscleVolume:{
            method:'crediti descrittivi di volume, non ipertrofia misurata',
            rows:report.muscles.map(item=>({
                muscle:item.muscle,direct:item.direct,indirect:item.indirect,
                credited:item.credited,planned:item.planned,
                executionPercent:item.execution
            }))
        },
        sessions
    };
}

const value=v=>v===null||v===undefined?'n.d.':String(v);

export function formatMesocycleReviewDossierMarkdown(dossier) {
    if(dossier?.format!=='mycoatch-mesocycle-review-dossier')
        throw Error('Dossier MyCoatch non valido.');
    const s=dossier.summary;
    const lines=[
        '# MyCoatch — Dossier di revisione del mesociclo',
        '',
        '**Origine:** HomeGym Diary, esportazione volontaria in sola lettura.',
        '**Stato:** '+dossier.mesocycle.status+' · **Versione profilo:** '+
            value(dossier.mesocycle.profileVersion),
        '**Mesociclo:** '+dossier.mesocycle.name,
        '',
        '> '+dossier.interpretation,
        '',
        '## Riepilogo confermato',
        '',
        '- Sedute complete: '+s.completedSessions+'/'+s.plannedSessions+
            '; parziali: '+s.partialSessions+'; non iniziate: '+s.skippedSessions,
        '- Serie valide confermate: '+s.completedSets+'/'+s.plannedSets+
            '; confermate invalide: '+s.invalidConfirmedSets,
        '- RPE effettivi disponibili: '+s.measuredRpeSets+'/'+s.completedSets+
            '; media RPE effettivi: '+value(s.averageRpe),
        '- Ripetizioni archiviate (escluse dalla copertura): '+s.archivedRepeats,
        '',
        '## Risultati per settimana',
        ''
    ];
    for(const week of s.weeklyResults||[])lines.push(
        '- Settimana '+week.weekNumber+': '+week.completedSets+'/'+week.plannedSets+
        ' serie confermate; RPE misurati '+week.rpeMeasured+'/'+week.completedSets+
        '; media '+value(week.averageRpe)+'.');
    lines.push('','## Volume per distretto (descrittivo)','');
    for(const row of dossier.muscleVolume.rows) {
        if(!(row.planned||row.credited))continue;
        lines.push('- '+row.muscle+': lavoro diretto '+row.direct+
            ', crediti indiretti '+row.indirect+', totale attribuito '+row.credited+
            ' (programmato '+row.planned+').');
    }
    lines.push('','## Sedute: prescrizione e risultati distinti','');
    for(const session of dossier.sessions) {
        lines.push('### Settimana '+session.weekNumber+' · '+session.dayName,'');
        for(const ex of session.exercises) {
            const p=ex.prescription;
            lines.push('**'+ex.name+'** · prescritto: '+p.sets+' serie × '+
                value(p.repetitions)+' rip.; RPE target '+value(p.rpeTarget)+
                '; kg prescritti '+value(p.kgMin)+'–'+value(p.kgMax)+'.');
            if(ex.observedSets.length){
                for(const row of ex.observedSets)lines.push('- Serie '+row.setNumber+
                    ': '+row.weightKg+' kg × '+row.repetitions+
                    ' rip.; RPE effettivo '+value(row.rpeActual)+
                    (row.technique?' · tecnica '+row.technique:'')+'.');
            }else lines.push('- Nessuna serie allenante valida confermata.');
            if(ex.unconfirmedOrMissingSets)lines.push('- Serie mancanti/non confermate: '+
                ex.unconfirmedOrMissingSets+'.');
            if(ex.invalidConfirmedSets)lines.push('- Serie confermate con dati invalidi: '+
                ex.invalidConfirmedSets+'.');
            lines.push('');
        }
    }
    lines.push('## Limiti e riservatezza','',
        '- Il dossier non contiene un giudizio diagnostico o una misura di crescita muscolare.',
        '- Le prestazioni sono soltanto quelle valide e confermate; i target non sono risultati.',
        '- Le sedute ripetute archiviate non sono incluse nei dettagli delle sedute programmate.',
        '- '+dossier.privacy,
        '- Nessun caricamento automatico a ChatGPT o ad altri servizi.');
    return lines.join('\n');
}

export function serializeMesocycleReviewDossierJson(dossier) {
    if(dossier?.format!=='mycoatch-mesocycle-review-dossier')
        throw Error('Dossier MyCoatch non valido.');
    return JSON.stringify(dossier,null,2);
}
