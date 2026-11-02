/** Comparison policy, not a physiological equivalence threshold. No journal writes. */
export function recoverySeconds(ex){
    const raw=String(ex?.restTime??ex?.rest??ex?.recupero??'').trim().toLowerCase().replace(/,/g,'.');
    const clock=raw.match(/^(\d+):([0-5]\d)(?:\s*(?:min|minuti|m))?$/);
    if(clock)return Number(clock[1])*60+Number(clock[2]);
    const match=raw.match(/^(\d+(?:\.\d+)?)\s*(s|sec|secondi|secondo|seconds|min|minuti|minuto|minutes|m|['’]|["”])?$/);
    return match?Number(match[1])*(/^(min|minuti|minuto|minutes|m|['’])$/.test(match[2]||'')?60:1):null;
}
export function recoveryKey(ex){
    const seconds=recoverySeconds(ex);
    return seconds===null?String(ex?.restTime??ex?.rest??ex?.recupero??'').trim().toLowerCase().replace(/\s+/g,' '):String(seconds);
}
export function recoveryContext(previous,current){
    const from=recoverySeconds(previous),to=recoverySeconds(current);
    const technique=ex=>ex?.groupType||'straight';
    const sameTechnique=technique(previous)===technique(current);
    const equal=recoveryKey(previous)===recoveryKey(current);
    const similar=from>0&&to>0&&Math.min(from,to)>=150&&Math.abs(from-to)<=30&&Math.abs(from-to)/Math.min(from,to)<=0.2;
    const longer=from>0&&to>from;
    const allowProgression=sameTechnique&&(equal||similar||longer);
    const label=seconds=>seconds===null?'non indicato':seconds+' s';
    let message='';
    if(!sameTechnique)message='Tecnica diversa: verifica il carico nel nuovo gruppo prima di trasferire la progressione.';
    else if(!equal&&!similar)message='Recupero precedente '+label(from)+', attuale '+label(to)+'. '+(longer?'La pausa più lunga non blocca da sola la progressione: verifica comunque reps e RPE.':'Mantieni il riferimento e verifica reps e RPE con il nuovo recupero prima di aumentare.');
    return {from,to,allowProgression,message,rank:!sameTechnique?3:equal||similar?0:longer?1:2};
}
