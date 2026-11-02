/** Practical rep objectives; all callers must first validate completion and RPE. */
export function nextRepTargets(reps,maximum){
    const gaps=reps.map(r=>Math.max(0,maximum-r));
    const close=gaps.some(Boolean)&&Math.max(...gaps)<=2&&gaps.reduce((a,b)=>a+b,0)<=reps.length;
    const next=reps.findIndex(r=>r<maximum);
    return {reps:reps.map((r,i)=>Math.min(maximum,r+(close?gaps[i]:i===next?1:0))),close,
        reason:close?'Mantieni il carico: cerca di chiudere tutte le serie al limite alto del range, rispettando l’RPE. Se raggiungi prima lo sforzo previsto, fermati e registra le reps effettive.':'Mantieni il carico: prova una ripetizione complessiva in più, entro il range e l’RPE previsti; se hai margine puoi progredire senza forzare.'};
}
