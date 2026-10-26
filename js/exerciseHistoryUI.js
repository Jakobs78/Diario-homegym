import {confirmed,warm} from '../mycoatch/setPrescription.js';

// One read-only view of the latest exposure; never mix it with coach advice.
export function previousSessionMarkup(exposure,escape) {
    if(!exposure)return '';
    const rows=(exposure.exercise.loggedSets||[]).flatMap((s,index)=>
        confirmed(s)&&!warm(s)&&!warm(exposure.exercise.sets?.[index])&&String(s.weight??'').trim()&&String(s.reps??'').trim()
            ? [{index,weight:s.weight,reps:s.reps,rpe:s.rpe}] : []);
    if(!rows.length)return '';
    const decimal=value=>escape(String(value??'').replace('.',','));
    const date=/^(\d{4})-(\d{2})-(\d{2})/.exec(String(exposure.date??''));
    const s=exposure.source;
    const when=date?`${date[3]}/${date[2]}/${date[1]}`:'';
    const location=s?`Settimana ${s.weekNumber} · giorno ${s.dayIndex+1}`:'';
    return `<section class="exercise-history-box" aria-label="Ultima seduta registrata">
        <h4>Ultima seduta${when?' · '+escape(when):''}</h4>
        ${location?`<p class="exercise-history-location">${escape(location)}</p>`:''}
        <table class="history-content"><thead><tr><th scope="col">Serie</th><th scope="col">kg</th><th scope="col">Reps</th><th scope="col">RPE</th></tr></thead>
        <tbody>${rows.map(s=>`<tr><th scope="row">${s.index+1}</th><td>${decimal(s.weight)}</td><td>${escape(s.reps)}</td><td>${String(s.rpe??'').trim()?decimal(s.rpe):'—'}</td></tr>`).join('')}</tbody></table>
    </section>`;
}
