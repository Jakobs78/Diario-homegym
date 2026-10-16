// mycoatch/mycoatch-adapter.js
import { MyCoatch, downloadMesocycleCSV } from './index.js';
import { CONFIG } from '../js/config.js';
import { state } from '../js/state.js';
import { pullDataFromSupabase } from '../js/sync.js';
import { formatCoachReview } from './mesocycleComparison.js';

/**
 * Adapter per l'estrazione dello storico e la generazione diretta del CSV.
 */
export async function generateAndDownloadMesocycleCSV(options = {}) {
    try {
        // La durata è un dato obbligatorio, mai un default silenzioso.
        const minutes = Number(options.maxSessionMinutes);
        if (!Number.isInteger(minutes) || minutes < 25 || minutes > 180) {
            throw new Error('Prima di generare la scheda, scegli quanto tempo hai per ogni allenamento.');
        }
        // Lo stato già autenticato della webapp è la prima fonte di verità.
        // Mai interrogare la tabella Supabase senza filtro sull'utente.
        const hasHistory = data =>
            Boolean(data?.history?.years && Object.values(data.history.years)
                .some(year => Array.isArray(year?.mesocycles) && year.mesocycles.length));

        let userHistory = hasHistory(state.workoutData) ? state.workoutData : null;
        if (!userHistory) {
            const rawLocalData = localStorage.getItem(CONFIG.STORAGE_KEY);
            if (rawLocalData) {
                const local = JSON.parse(rawLocalData);
                if (hasHistory(local)) userHistory = local;
            }
        }
        if (!userHistory && state.currentUser) {
            const remote = await pullDataFromSupabase(state.currentUser);
            if (hasHistory(remote)) userHistory = remote;
        }
        userHistory ||= {};

        // 2. Generazione del mesociclo tramite l'engine adattivo
        const newMesocycle = MyCoatch.generateNextFromHistory(userHistory, options);

        if (!newMesocycle) {
            throw new Error("Impossibile generare il mesociclo. Verificare i dati di input.");
        }

        // Un confronto leggibile precede sempre il download.
        const preview = formatCoachReview(
            newMesocycle.coachReport.comparison, newMesocycle.coachReport
        );
        if (!window.confirm(preview)) {
            MyCoatch.clearProposal();
            return {
                success: false,
                cancelled: true,
                message: 'Proposta non accettata: nessun file CSV scaricato e nessun dato storico modificato.'
            };
        }

        // 3. Generazione e download del file CSV sul device
        const result = downloadMesocycleCSV();

        if (!result.success) {
            throw new Error(result.message);
        }

        return {
            success: true,
            message: "Mesociclo generato con successo e calibrato sui tuoi parametri! Il file CSV è stato scaricato.",
            mesocycleId: newMesocycle.id
        };

    } catch (error) {
        console.error("Errore durante la generazione CSV con MyCoatch:", error);
        return {
            success: false,
            message: `Errore durante la creazione del CSV: ${error.message}`
        };
    }
}

/**
 * Apre la configurazione MyCoatch. La scelta del tempo e' obbligatoria a ogni generazione.
 * Il submit convalida i dati in js/main.js prima di chiamare l'adapter.
 */
export async function createVisualCoachProposal(options={}) {
    const minutes=Number(options.maxSessionMinutes);
    if(!Number.isInteger(minutes)||minutes<25||minutes>180)
        throw Error('Indica il tempo reale della seduta.');
    const hasHistory=data=>Boolean(data?.history?.years &&
        Object.values(data.history.years).some(year=>year?.mesocycles?.length>0));
    let history=hasHistory(state.workoutData)?state.workoutData:null;
    if(!history){
        try{
            const raw=localStorage.getItem(CONFIG.STORAGE_KEY);
            const local=raw?JSON.parse(raw):null;
            if(hasHistory(local))history=local;
        }catch { /* No assumption about corrupted browser cache */ }
    }
    if(!history&&state.currentUser){
        const remote=await pullDataFromSupabase(state.currentUser);
        if(hasHistory(remote))history=remote;
    }
    const proposal=MyCoatch.generateNextFromHistory(history||{},options);
    return {
        proposal,csv:MyCoatch.exportAsCSV(),
        review:formatCoachReview(proposal.coachReport.comparison,proposal.coachReport)
    };
}

export function clearVisualCoachProposal(){MyCoatch.clearProposal();}

export function downloadVisualCoachProposal(){return downloadMesocycleCSV();}

/** Opens MyCoatch configuration. */
export function startCoachChatAndGenerate() {
    const modal = document.getElementById('mycoatch-config-modal');
    if (!modal) {
        alert('Configurazione MyCoatch non disponibile. Ricarica la pagina.');
        return;
    }

    // Non riutilizzare automaticamente una durata precedente.
    const time = document.getElementById('select-time');
    if (time) time.value = '';
    const custom = document.getElementById('mycoatch-custom-time');
    if (custom) {
        custom.value = '';
        custom.disabled = true;
        custom.required = false;
    }
    document.getElementById('mycoatch-custom-time-wrap')?.classList.add('hidden');
    const feedback = document.getElementById('mycoatch-form-feedback');
    if (feedback) feedback.textContent = '';

    modal.classList.remove('hidden');
    time?.focus();
}
