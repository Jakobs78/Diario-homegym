/** Performed results stay intact; only their use as coaching evidence changes. */
export const SET_REVIEW_REASONS=Object.freeze({
 calibration:'Carico trovato: serie valida',pain:'Dolore improvviso',
 distraction:'Distrazione',technique:'Problema di esecuzione',
 intentional:'Variazione intenzionale',other:'Altro'
});
export const excludedFromCoaching=set=>['pain','distraction','technique'].includes(set?.coachReview?.reason);
export const painReported=ex=>(ex?.loggedSets||[]).some(s=>(s.isLocked||s.completed)&&!s.isWarmup&&!s.warmup&&!s.is_warmup&&s.coachReview?.reason==='pain');
export const reviewLabel=set=>SET_REVIEW_REASONS[set?.coachReview?.reason]||'';
export function setReview(set,reason,note=''){
 if(!set || !Object.hasOwn(SET_REVIEW_REASONS,reason)&&reason!=='')throw Error('Segnalazione della serie non valida.');
 if(reason)set.coachReview={reason,note:String(note).trim().slice(0,500),at:new Date().toISOString()};
 else delete set.coachReview;
}
export function reviewSummary(ex){
 return (ex?.loggedSets||[]).flatMap((s,i)=>reviewLabel(s)?['Serie '+(i+1)+': '+reviewLabel(s)+(s.coachReview.note?' · '+s.coachReview.note:'')+(excludedFromCoaching(s)?' (esclusa dai calcoli del coaching)':'')]:[]);
}

export const coachingReviewSignature=ex=>JSON.stringify((ex?.loggedSets||[]).map(s=>s?.coachReview?.reason||''));
