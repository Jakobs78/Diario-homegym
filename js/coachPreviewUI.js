import { createVisualCoachProposal, clearVisualCoachProposal,
    downloadVisualCoachProposal } from '../mycoatch/mycoatch-adapter.js';
import { importWorkoutPlan } from './csvHandler.js';
import { renderWorkoutList } from './ui.js';
import { state } from './state.js';
import { equipmentMatchesSnapshot } from '../mycoatch/profileJournal.js';

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
            summary.textContent='Programma '+options.daysPerWeek+' giorni/settimana · '+
                options.maxSessionMinutes+' min per sessione · '+proposal.proposal.weeks.length+
                ' settimane. La scheda esistente rimane intatta finché non applichi.';
            weeks.replaceChildren();
            for(const week of proposal.proposal.weeks){
                const container=create('details',undefined,'mycoatch-preview-week');
                if(week.weekNumber===1)container.open=true;
                container.append(create('summary','Settimana '+week.weekNumber+
                    (week.isDeloadWeek?' · scarico':'')+
                    ' · target RPE '+String(week.targetRpe??'vedi serie')));
                for(const day of week.days||[]){
                    const panel=create('section',undefined,'mycoatch-preview-day');
                    panel.append(create('h4',day.dayName||'Giorno '+day.dayNumber));
                    const ul=create('ul');
                    for(const ex of day.exercises||[]){
                        ul.append(create('li',ex.name+' · '+(ex.setsCount || ex.sets?.length || '?')+
                            ' serie × '+(ex.reps || '?')+' reps · RPE '+String(ex.rpe || '-')+
                            ' · recupero '+String(ex.restTime || ex.rest || '-')));
                    }
                    const duration=Number(day.estimatedMinutes);
                    const budget=Number(day.timeBudgetMinutes);
                    if(Number.isFinite(duration) && Number.isFinite(budget)) {
                        panel.append(create('p','Durata stimata: '+duration+
                            ' min su '+budget+' disponibili (non misurata).'));
                    }
                    panel.append(ul);container.append(panel);
                }
                const volumes=week.weeklyCoverage?.fractionalVolumeByMuscle;
                if(volumes && Object.keys(volumes).length){
                    const breakdown=create('details',undefined,'mycoatch-preview-day');
                    breakdown.append(create('summary','Volume previsto per distretto · stima, non crescita misurata'));
                    const list=create('ul');
                    for(const [muscle,stats] of Object.entries(volumes)){
                        if(!(stats?.directSets>0 || stats?.indirectSetCredits>0))continue;
                        list.append(create('li',muscle+': '+stats.directSets+
                            ' serie dirette + '+stats.indirectSetCredits+
                            ' contributi indiretti = '+stats.fractionalSets+
                            ' equivalenti stimati'));
                    }
                    breakdown.append(list);
                    container.append(breakdown);
                }
                const functions=week.weeklyCoverage?.functionalCoverage;
                if(functions){
                    const details=create('details',undefined,'mycoatch-preview-day');
                    details.append(create('summary','Copertura specifica dopo i tagli per il tempo'));
                    const list=create('ul');
                    for(const value of Object.values(functions)){
                        const original=value.plannedSets === null
                            ? '' : ' (previste '+value.plannedSets+')';
                        list.append(create('li',value.label+': '+
                            value.scheduledSets+' serie dirette programmate'+original+
                            '. Valori descrittivi, non crescita misurata.'));
                    }
                    details.append(list);
                    container.append(details);
                }
                weeks.append(container);
            }
            const deloadReason=proposal.proposal.periodization?.deloadRationale;
            const warnings=proposal.proposal.weeks?.[0]?.weeklyCoverage?.warnings || [];
            explanation.textContent=[proposal.review,
                deloadReason ? 'Scarico: '+deloadReason : '',
                ...warnings.map(w=>'Verifica volume: '+w)
            ].filter(Boolean).join('\n\n');
            feedback.textContent='';
            preview.classList.remove('hidden');
            document.getElementById('mycoatch-preview-apply')?.focus();
        }catch(err){
            proposal=null;acceptedOptions=null;clearVisualCoachProposal();
            const output=document.getElementById('mycoatch-form-feedback');
            if(output)output.textContent=err.message;
        }finally{launch.disabled=false;}
    });
    document.getElementById('mycoatch-preview-apply')?.addEventListener('click',()=>{
        if(!proposal)return;
        if(!equipmentMatchesSnapshot(acceptedOptions?.equipmentAtGeneration,
            state.workoutData?.athlete)){
            feedback.textContent='La configurazione dell’attrezzatura è cambiata dopo l’anteprima. Rigenera la proposta prima di applicarla.';
            return;
        }
        // The same validated CSV parser already tested by existing app E2E.
        const result=importWorkoutPlan(proposal.csv,acceptedOptions);
        if(!result.success){
            feedback.textContent=result.error||'Non è stato possibile applicare la proposta.';
            return;
        }
        close();
        configModal?.classList.add('hidden');
        renderWorkoutList();
        alert('Nuovo mesociclo salvato separatamente. Lo storico precedente è intatto.');
    });
    document.getElementById('mycoatch-preview-download')?.addEventListener('click',()=>{
        if(!proposal)return;
        const result=downloadVisualCoachProposal();
        if(!result.success)feedback.textContent=result.message;
    });
}
