import {EXERCISE_DATABASE} from './exercisesDB.js';
import {canonicalExerciseKey,normalizeExerciseLabel,applyPersonalExerciseMapping} from './exerciseIdentity.js';

export function importedIdentity(label,data={}){
    const key=normalizeExerciseLabel(label);
    const saved=data.athlete?.exerciseCatalogMappings?.[key];
    if(saved?.custom)return {kind:'custom'};
    if(saved?.confirmed){
        const catalog=EXERCISE_DATABASE.find(ex=>ex.name===saved.name);
        // Preserve explicit historical associations even if the catalog changed.
        return {kind:'saved',catalog:catalog||saved};
    }
    const catalog=EXERCISE_DATABASE.find(ex=>canonicalExerciseKey(ex.name)===canonicalExerciseKey(label));
    return catalog?{kind:'known',catalog}:{kind:'unknown'};
}

/** Suggestions are displayed only: similarity never confirms an association. */
export function importIdentitySuggestions(label,query=''){
    const words=normalizeExerciseLabel(query||label).split(' ').filter(w=>w.length>2);
    return EXERCISE_DATABASE.map(ex=>({ex,score:words.filter(w=>normalizeExerciseLabel(ex.name).includes(w)).length}))
        .filter(item=>item.score>0).sort((a,b)=>b.score-a.score||a.ex.name.localeCompare(b.ex.name,'it'))
        .slice(0,8).map(item=>item.ex);
}

/** Called only on a journal candidate after the whole import is confirmed. */
export function commitImportedIdentities(candidate,plan){
    const decisions=new Map();
    for(const week of plan.weeks||[])for(const day of week.days||[])for(const ex of day.exercises||[]){
        if(ex.importIdentityChoice){
            const key=normalizeExerciseLabel(ex.name);
            const previous=decisions.get(key);
            if(previous&&previous.choice!==ex.importIdentityChoice)throw Error('Associazioni diverse per lo stesso nome: '+ex.name);
            decisions.set(key,{label:ex.name,choice:ex.importIdentityChoice});
        }
    }
    for(const {label,choice} of decisions.values()){
        const catalog=choice==='custom'?{custom:true}:EXERCISE_DATABASE.find(ex=>ex.name===choice);
        if(!catalog)throw Error('Associazione non valida: '+label);
        applyPersonalExerciseMapping(candidate,label,catalog);
    }
    for(const week of plan.weeks||[])for(const day of week.days||[])for(const ex of day.exercises||[])delete ex.importIdentityChoice;
}
