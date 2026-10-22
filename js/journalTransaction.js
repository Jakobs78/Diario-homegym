import {state} from './state.js';
import {saveAndSync} from './storage.js';
/** Build isolated candidates; a failed save must not poison the next retry. */
export async function commitJournalCandidate(candidate,action='UPDATE_WORKOUT') {
    const before=state.workoutData;
    try {
        const result=await saveAndSync(candidate,action);
        if(result===false)throw Error('Salvataggio locale non completato. La modifica non è confermata: riprova o esporta un backup.');
        state.workoutData=candidate;
        return candidate;
    } catch(error) {state.workoutData=before;throw error;}
}
export async function editJournal(edit,action) {
    const candidate=structuredClone(state.workoutData);
    await edit(candidate);
    return commitJournalCandidate(candidate,action);
}
