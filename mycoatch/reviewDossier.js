/**
 * Manual MyCoatch review dossier. Read-only; no background AI upload.
 * The summary reuses the same confirmed-set validator as mesocycle closure.
 * Exports only current planned sessions, never copies account identifiers,
 * personal notes, dates, archived repetitions or raw athlete profiles.
 */
import { summarizeMesocycleClosure } from '../js/mesocycleClosure.js';
import { buildMesocycleCoachPdfReport } from '../js/mesocyclePdfCoachReport.js';
import { isWarmupExercise, isWarmupSet, plannedWorkSetCount } from '../js/workoutSemantics.js';
import {analysisExerciseRows,formatAnalysisLines} from './mesocycleAnalysis.js';
import {setPrescription} from './setPrescription.js';
import {contributionsForExercise} from './volumeAccounting.js';
import {isExerciseSkipped} from '../js/sessionSkip.js';

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
    const rows=analysisExerciseRows(exercise);
    const safeTarget=index=>{
        const p=setPrescription(exercise,index);
        return {setNumber:index+1,role:p.role,repetitions:p.reps,rpeTarget:p.rpe,weightKg:p.kg,special:Boolean(p.special),technique:asText(exercise.sets?.[index]?.intensityTechnique??(p.special?exercise.groupType:null))};
    };
    const observed=rows.valid.map(row=>({
        setNumber:row.index+1,weightKg:row.weight,repetitions:row.numericReps,
        repetitionsRecorded:asText(row.set.reps??row.set.actualReps),rpeActual:row.rpe??null,
        technique:row.technique??null,prescription:safeTarget(row.index),
        dropSkipped:row.set.dropSkipped===true,
        dropSegments:(row.set.dropSegments||[]).map((drop,index)=>({segment:index+1,
            weightKg:asText(drop.weight),repetitions:asText(drop.reps),rpeActual:asText(drop.rpe)}))
    }));
    const invalidConfirmed=rows.invalid.length;
    return {
        name:asText(exercise.name) || 'Esercizio senza nome',
        muscleClassification:contributionsForExercise(exercise.catalogMapping?.confirmed?exercise.catalogMapping.name:exercise.name,1)?.category??null,
        prescription:{
            sets:plannedSets,
            repetitions:asText(exercise.reps ?? exercise.targetReps),
            rpeTarget:asText(exercise.targetRpe ?? exercise.rpeTarget ?? exercise.rpe),
            kgMin:asText(exercise.kgMin),
            kgMax:asText(exercise.kgMax),
            rest:asText(exercise.restTime ?? exercise.recupero ?? exercise.rest),
            topSet:asText(exercise.topset)
        },
        prescribedSets:Array.from({length:Math.max(exercise.sets?.length||0,exercise.loggedSets?.length||0,parseInt(exercise.setsCount??exercise.set,10)||0)},(_,i)=>i)
            .filter(i=>!isWarmupSet(exercise.sets?.[i])&&!isWarmupSet(exercise.loggedSets?.[i])).map(safeTarget),
        skippedForSession:isExerciseSkipped(exercise),skippedSets:rows.skipped,
        observedSets:observed,
        unconfirmedOrMissingSets:rows.missing,
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
        schemaVersion:2,
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

const range=r=>r?r.min===r.max?String(r.min):r.min+'–'+r.max:'n.d.';
const value=v=>v===null||v===undefined?'n.d.':String(v);

export function formatMesocycleReviewDossierMarkdown(dossier) {
    if(dossier?.format!=='mycoatch-mesocycle-review-dossier')
        throw Error('Dossier MyCoatch non valido.');
    const s=dossier.summary;
    const lines=[
        '# MyCoatch — Rapporto dettagliato del mesociclo',
        '',
        '**Origine:** HomeGym Diary, esportazione volontaria in sola lettura.',
        '**Stato:** '+dossier.mesocycle.status+' · **Versione profilo:** '+
            value(dossier.mesocycle.profileVersion),
        '**Mesociclo:** '+dossier.mesocycle.name,
        '',
        '> '+dossier.interpretation,
        '',
        '## Quanti allenamenti e quante serie hai completato',
        '',
        '- Sedute complete: '+s.completedSessions+'/'+s.plannedSessions+
            '; concluse con esclusioni: '+(s.sessionsWithSkips||0)+'; parziali: '+s.partialSessions+'; non iniziate: '+s.skippedSessions,
        '- Serie valide confermate: '+s.completedSets+'/'+s.plannedSets+
            '; saltate intenzionalmente: '+(s.skippedSets||0)+'; mancanti: '+Math.max(0,s.plannedSets-s.completedSets-(s.skippedSets||0)-s.invalidConfirmedSets)+'; confermate invalide: '+s.invalidConfirmedSets,
        '- RPE effettivi disponibili: '+s.measuredRpeSets+'/'+s.completedSets+
            '; media RPE effettivi: '+value(s.averageRpe),
        '- Aderenza (sole sedute complete senza esclusioni): '+value(s.adherencePercent)+'%; completamento delle serie: '+value(s.setCompletionPercent)+'%.',
        '- Ripetizioni archiviate (escluse dalla copertura): '+s.archivedRepeats,
        '',
        '## Risultati per settimana',
        ''
    ];
    for(const week of s.weeklyResults||[])lines.push(
        '- Settimana '+week.weekNumber+': '+week.completedSets+'/'+week.plannedSets+
        ' serie confermate; RPE misurati '+week.rpeMeasured+'/'+week.completedSets+
        '; media '+value(week.averageRpe)+'.');
    lines.push('',...formatAnalysisLines(s.analysis),'');
    lines.push('','## Lavoro registrato per gruppo muscolare (conteggio stimato, non crescita)','');
    for(const row of dossier.muscleVolume.rows) {
        if(!(row.planned||row.credited))continue;
        lines.push('- '+row.muscle+': lavoro diretto '+row.direct+
            ', crediti indiretti '+row.indirect+', totale attribuito '+row.credited+
            ' (nel programma iniziale: '+row.planned+'). I crediti indiretti non sono serie ulteriori da eseguire.');
    }
    lines.push('','## Per ogni seduta: cosa era previsto e cosa hai realmente registrato','');
    for(const session of dossier.sessions) {
        lines.push('### Settimana '+session.weekNumber+' · '+session.dayName,'');
        for(const ex of session.exercises) {
            const p=ex.prescription;
            lines.push('**'+ex.name+'** · prescritto: '+p.sets+' serie × '+
                value(p.repetitions)+' rip.; RPE target '+value(p.rpeTarget)+
                '; kg prescritti '+value(p.kgMin)+'–'+value(p.kgMax)+'.');
            if(!ex.muscleClassification)lines.push('Classificazione muscolare non disponibile: queste serie non sono attribuite a un muscolo nei conteggi.');
            lines.push('Recupero prescritto: '+value(p.rest)+(p.topSet?' · Top set: '+p.topSet:'')+'.');
            for(const target of ex.prescribedSets||[])lines.push('- Obiettivo serie '+target.setNumber+' ('+target.role+'): '+
                range(target.weightKg)+' kg × '+range(target.repetitions)+' reps @'+range(target.rpeTarget)+(target.technique?' · '+target.technique:'')+'.');
            if(ex.skippedForSession)lines.push('- Esercizio saltato in questa seduta: '+ex.skippedSets+' serie escluse intenzionalmente; eventuali serie già eseguite restano conteggiate. Motivo nelle note personali del diario, escluso da questo export.');
            if(ex.observedSets.length){
                for(const row of ex.observedSets)lines.push('- Serie '+row.setNumber+
                    ': '+row.weightKg+' kg × '+row.repetitions+
                    ' rip.; RPE effettivo '+value(row.rpeActual)+
                    (row.technique?' · tecnica '+row.technique:'')+'.');
                for(const row of ex.observedSets){
                    if(row.repetitionsRecorded!==String(row.repetitions))lines.push('  Reps registrate serie '+row.setNumber+': '+row.repetitionsRecorded+'.');
                    for(const drop of row.dropSegments||[])lines.push('  Scarico '+drop.segment+' della serie '+row.setNumber+': '+value(drop.weightKg)+' kg × '+value(drop.repetitions)+' reps; RPE '+value(drop.rpeActual)+'.');
                    if(row.dropSkipped)lines.push('  Scarichi non eseguiti nella serie '+row.setNumber+'.');
                }
            }else lines.push('- Nessuna serie allenante valida confermata.');
            if(ex.unconfirmedOrMissingSets)lines.push('- Serie mancanti/non confermate: '+
                ex.unconfirmedOrMissingSets+'.');
            if(ex.invalidConfirmedSets)lines.push('- Serie confermate con dati invalidi: '+
                ex.invalidConfirmedSets+'.');
            lines.push('');
        }
    }
    lines.push('## Come interpretare il rapporto e proteggere i dati','',
        '- Il dossier non contiene un giudizio diagnostico o una misura di crescita muscolare.',
        '- Le prestazioni sono soltanto quelle valide e confermate; i target non sono risultati.',
        '- Le sedute ripetute archiviate non sono incluse nei dettagli delle sedute programmate.',
        '- '+dossier.privacy,
        '- Questo file non è un backup e non ripristina il diario.',
        '- Nessun caricamento automatico a ChatGPT o ad altri servizi.');
    return lines.join('\n');
}

export function serializeMesocycleReviewDossierJson(dossier) {
    if(dossier?.format!=='mycoatch-mesocycle-review-dossier')
        throw Error('Dossier MyCoatch non valido.');
    return JSON.stringify(dossier,null,2);
}
