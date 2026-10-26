import {buildSessionExerciseFeedback,feedbackRange} from '../mycoatch/sessionFeedback.js';
const node=(tag,className,text)=>{const el=document.createElement(tag);if(className)el.className=className;if(text!==undefined)el.textContent=text;return el;};
const decimal=value=>String(value).replace('.',',');

export function createSessionFeedback(day,history,readiness){
    const report=node('section','mycoatch-session-summary');
    report.setAttribute('aria-label','Riepilogo conclusivo seduta');
    report.append(node('h4','','✅ Riepilogo fine seduta'));
    if(day.coachCheckin&&['stop','caution'].includes(readiness?.level)){
        report.append(node('p','mycoatch-session-warning','Check-in registrato: '+readiness.message));
    }
    for(const item of buildSessionExerciseFeedback(day,history)){
        const article=node('article','mycoatch-session-exercise');article.append(node('h5','',item.name));
        article.append(node('p','mycoatch-session-summary-exercise',item.messages.join(' ')));
        const table=node('table','mycoatch-session-comparison');table.setAttribute('aria-label','Confronto per serie · '+item.name);
        const head=document.createElement('thead'),tr=document.createElement('tr');
        for(const title of ['Serie','Reps fatte / obiettivo','RPE percepito / obiettivo']){const th=node('th','',title);th.scope='col';tr.append(th);}head.append(tr);table.append(head);
        const body=document.createElement('tbody');
        for(const row of item.rows){
            const tr=document.createElement('tr'),th=node('th','',String(row.index+1)+(row.target.role==='top'?' · Top set':row.target.role==='backoff'?' · Back-off':''));th.scope='row';tr.append(th);
            tr.append(node('td','',row.actualReps+' / '+feedbackRange(row.target.reps)));
            tr.append(node('td','',(row.rpe===null?'—':decimal(row.rpe))+' / '+feedbackRange(row.target.rpe)));body.append(tr);
        }table.append(body);article.append(table);
        if(item.next){
            article.append(node('p','mycoatch-session-next-title','Proposta per la prossima esposizione · settimana '+item.next.weekNumber+', giorno '+item.next.dayNumber));
            const list=document.createElement('ul');list.className='mycoatch-session-next';
            for(const change of item.next.changes){
                const delta=[];
                if(change.weightDelta)delta.push((change.weightDelta>0?'+':'')+decimal(Math.round(change.weightDelta*100)/100)+' kg');
                if(change.repsDelta)delta.push((change.repsDelta>0?'+':'')+change.repsDelta+(Math.abs(change.repsDelta)===1?' ripetizione':' ripetizioni'));
                list.append(node('li','','Serie '+(change.index+1)+': '+decimal(change.weight)+' kg × '+change.reps+' reps ('+delta.join(', ')+').'+(change.manual?' Valori manuali mantenuti.':'')));
            }article.append(list);
        }report.append(article);
    }
    return report;
}
