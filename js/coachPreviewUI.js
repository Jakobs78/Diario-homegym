import { createVisualCoachProposal, clearVisualCoachProposal,
    downloadVisualCoachProposal } from '../mycoatch/mycoatch-adapter.js';
import { importWorkoutPlan } from './csvHandler.js';
import { renderWorkoutList } from './ui.js';
import { state } from './state.js';
import { equipmentMatchesSnapshot, proposalEvidenceFingerprint } from '../mycoatch/profileJournal.js';

/** Show actual week/day/exercise proposal before any journal modification. */
export function initCoachPreview(readCoachOptions,configModal) {
    const preview=document.getElementById('mycoatch-preview-overlay');
    const launch=document.getElementById('mycoatch-preview-btn');
    const summary=document.getElementById('mycoatch-preview-summary');
    const weeks=document.getElementById('mycoatch-preview-weeks');
    const explanation=document.getElementById('mycoatch-preview-explanation');
    const feedback=document.getElementById('mycoatch-preview-error');
    if(!preview||!launch)return;
    let proposal=null;
    let acceptedOptions=null;
    let evidenceAtGeneration=null;
    const create=(tag,content,cls)=>{
        const node=document.createElement(tag);
        if(cls)node.className=cls;
        if(content!==undefined)node.textContent=String(content);
        return node;
    };
    const close=()=>{
        proposal=null;acceptedOptions=null;clearVisualCoachProposal();
        preview.classList.add('hidden');
        launch.focus();
    };
    for(const id of ['mycoatch-preview-close','mycoatch-preview-cancel']){
        document.getElementById(id)?.addEventListener('click',close);
    }
    preview.addEventListener('click',ev=>{if(ev.target===preview)close();});
    document.addEventListener('keydown',ev=>{
        if(ev.key==='Escape'&&!preview.classList.contains('hidden'))close();
    });
    launch.addEventListener('click',async()=>{
        let options;
        try { options=readCoachOptions(); }
        catch(err){
            const output=document.getElementById('mycoatch-form-feedback');
            if(output)output.textContent=err.message;
            return;
        }
        launch.disabled=true;
        try{
            proposal=await createVisualCoachProposal(options);
            acceptedOptions=structuredClone({...options,
                equipmentAtGeneration:proposal.equipmentSnapshot || {}});
            summary.textContent='Proposta di allenamento: '+options.daysPerWeek+' giorni/settimana · '+
                options.maxSessionMinutes+' min per sessione · '+proposal.proposal.weeks.length+
                ' settimane. Controlla gli esercizi e lo scarico: "Scarica CSV" crea soltanto un file, mentre "Importa la proposta nel diario" aggiunge un nuovo mesociclo senza cancellare i precedenti.';
            weeks.replaceChildren();
            for(const week of proposal.proposal.weeks){
                const container=create('details',undefined,'mycoatch-preview-week');
                if(week.weekNumber===1)container.open=true;
                container.append(create('summary','Settimana '+week.weekNumber+
                    (week.isDeloadWeek?' · scarico':'')+
                    ' · fatica programmata (RPE) '+String(week.targetRpe??'vedi le serie')));
                for(const day of week.days||[]){
                    const panel=create('section',undefined,'mycoatch-preview-day');
                    panel.append(create('h4',day.dayName||'Giorno '+day.dayNumber));
                    const ul=create('ul');
                    for(const ex of day.exercises||[]){
                        ul.append(create('li',ex.name+' · '+(ex.setsCount || ex.sets?.length || '?')+
                            ' serie × '+(ex.reps || '?')+' ripetizioni · RPE obiettivo '+String(ex.rpe || '-')+
                            ' · recupero '+String(ex.restTime || ex.rest || '-')));
                    }
                    const duration=Number(day.estimatedMinutes);
                    const budget=Number(day.timeBudgetMinutes);
                    if(Number.isFinite(duration) && Number.isFinite(budget)) {
                        panel.append(create('p','Tempo indicativo: '+duration+
                            ' min su '+budget+' disponibili. Il tempo reale può variare per riscaldamento, preparazione e recuperi.'));
                    }
                    panel.append(ul);container.append(panel);
                }
                for(const change of week.volumeBalance?.coverageRepairs || []){
                    container.append(create('p','Copertura settimanale: '+change.added+
                        (change.replaced?' al posto di '+change.replaced:' aggiunto')+
                        '. '+change.reason));
                }
                const volumes=week.weeklyCoverage?.fractionalVolumeByMuscle;
                if(volumes && Object.keys(volumes).length){
                    const breakdown=create('details',undefined,'mycoatch-preview-day');
                    breakdown.append(create('summary','Serie per gruppo muscolare: lavoro diretto e contributo indiretto'));
                    const list=create('ul');
                    for(const [muscle,stats] of Object.entries(volumes)){
                        if(!(stats?.directSets>0 || stats?.indirectSetCredits>0))continue;
                        list.append(create('li',muscle+': '+stats.directSets+
                            ' serie dirette + '+stats.indirectSetCredits+
                            ' contributi indiretti = '+stats.fractionalSets+
                            ' crediti teorici (non serie aggiuntive da eseguire)'));
                    }
                    breakdown.append(list);
                    container.append(breakdown);
                }
                const functions=week.weeklyCoverage?.functionalCoverage;
                if(functions){
                    const details=create('details',undefined,'mycoatch-preview-day');
                    details.append(create('summary','Movimenti specifici previsti dopo gli adattamenti ai minuti disponibili'));
                    const list=create('ul');
                    for(const value of Object.values(functions)){
                        const original=value.plannedSets === null
                            ? '' : ' (previste '+value.plannedSets+')';
                        list.append(create('li',value.label+': '+
                            value.scheduledSets+' serie dirette programmate'+original+
                            '. Questo conteggio non misura la crescita muscolare.'));
                    }
                    details.append(list);
                    container.append(details);
                }
                weeks.append(container);
            }
            const deloadReason=proposal.proposal.periodization?.deloadRationale;
            const warnings=proposal.proposal.weeks?.[0]?.weeklyCoverage?.warnings || [];
            explanation.textContent=[proposal.review,
                deloadReason ? 'Motivo della scelta sullo scarico: '+deloadReason : '',
                ...warnings.map(w=>'Attenzione alla distribuzione delle serie: '+w)
            ].filter(Boolean).join('\n\n');
            evidenceAtGeneration=proposalEvidenceFingerprint(state.workoutData);
            feedback.textContent='';
            preview.classList.remove('hidden');
            document.getElementById('mycoatch-preview-apply')?.focus();
        }catch(err){
            proposal=null;acceptedOptions=null;clearVisualCoachProposal();
            const output=document.getElementById('mycoatch-form-feedback');
            if(output)output.textContent=err.message;
        }finally{launch.disabled=false;}
    });
    document.getElementById('mycoatch-preview-apply')?.addEventListener('click',async()=>{
        if(!proposal)return;
        if(evidenceAtGeneration!==proposalEvidenceFingerprint(state.workoutData)){feedback.textContent='Il diario o il profilo sono cambiati dopo questa anteprima: genera una nuova proposta.';return;}
        if(!equipmentMatchesSnapshot(acceptedOptions?.equipmentAtGeneration,
            state.workoutData?.athlete)){
            feedback.textContent='Hai modificato l’attrezzatura disponibile dopo la creazione dell’anteprima. Genera una nuova proposta, così MyCoatch può escludere esercizi che non puoi eseguire.';
            return;
        }
        // The same validated CSV parser already tested by existing app E2E.
        const result=await importWorkoutPlan(proposal.csv,{...acceptedOptions,generatedPlan:proposal.proposal});
        if(!result.success){
            feedback.textContent=result.error||'Non è stato possibile applicare la proposta.';
            return;
        }
        close();
        configModal?.classList.add('hidden');
        renderWorkoutList();
        alert('Nuovo programma importato come mesociclo separato. Le schede e le prestazioni precedenti rimangono nel diario.');
    });
    document.getElementById('mycoatch-preview-download')?.addEventListener('click',()=>{
        if(!proposal)return;
        const result=downloadVisualCoachProposal();
        if(!result.success)feedback.textContent=result.message;
    });
}
