import {recentPainReports} from './limitationsReview.js';
// mycoatch/mycoatch-adapter.js
import { MyCoatch, downloadMesocycleCSV } from './index.js';
import { getFromLocalStorageForUser } from '../js/storage.js';
import { state } from '../js/state.js';
import { latestSavedProfile, latestSavedSettings, snapshotEquipmentState } from './profileJournal.js';
import { pullDataFromSupabase } from '../js/sync.js';
import { formatCoachReview } from './mesocycleComparison.js';
import { locateClosedMesocycle } from './closureHandoff.js';

// UI-only locator; never store workout data in global/module state.
let selectedClosure = null;
const withClosure = options => selectedClosure ? { ...options, closureSource: selectedClosure } : options;

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
            const local = getFromLocalStorageForUser(state.currentUser);
            if (local) {
                if (hasHistory(local)) userHistory = local;
            }
        }
        if (!userHistory && state.currentUser) {
            const remote = await pullDataFromSupabase(state.currentUser);
            if (hasHistory(remote)) userHistory = remote;
        }
        userHistory ||= {};

        // 2. Generazione del mesociclo tramite l'engine adattivo
        const newMesocycle = MyCoatch.generateNextFromHistory(userHistory, withClosure(options));

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
            const local=getFromLocalStorageForUser(state.currentUser);
            if(hasHistory(local))history=local;
        }catch { /* No assumption about corrupted browser cache */ }
    }
    if(!history&&state.currentUser){
        const remote=await pullDataFromSupabase(state.currentUser);
        if(hasHistory(remote))history=remote;
    }
    const equipmentSnapshot=snapshotEquipmentState(
        history?.athlete || state.workoutData?.athlete || {});
    const proposal=MyCoatch.generateNextFromHistory(history||{},withClosure(options));
    return {
        proposal,equipmentSnapshot,csv:MyCoatch.exportAsCSV(),
        review:formatCoachReview(proposal.coachReport.comparison,proposal.coachReport)
    };
}

export function clearVisualCoachProposal(){MyCoatch.clearProposal();}

export function downloadVisualCoachProposal(){return downloadMesocycleCSV();}

/** Opens MyCoatch configuration. */
export function startCoachChatAndGenerate(mesocycleOrEvent = null) {
    selectedClosure = locateClosedMesocycle(state.workoutData,
        mesocycleOrEvent?.coachClosure?.status === 'closed' ? mesocycleOrEvent : null);
    if (mesocycleOrEvent?.coachClosure?.status === 'closed' && !selectedClosure) {
        alert('Il mesociclo concluso non è più presente nello storico attivo. Ricarica il report.');
        return;
    }
    const modal = document.getElementById('mycoatch-config-modal');
    if (!modal) {
        alert('Configurazione MyCoatch non disponibile. Ricarica la pagina.');
        return;
    }

    // A cancelled preview must not supply the defaults for the next request.
    document.getElementById('mycoatch-config-form')?.reset();
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

    const saved=latestSavedProfile(state.workoutData);
    const settings=latestSavedSettings(state.workoutData);
    const set=(id,value)=>{const node=document.getElementById(id);if(node)node.value=value??'';};
    if(settings){
        for(const [key,id] of Object.entries({userAge:'input-age',daysPerWeek:'select-days',
            focus:'select-focus',splitPreference:'mycoatch-split',cableSetup:'mycoatch-cable-setup'}))
            if(settings[key]!==undefined)set(id,settings[key]);
        set('mycoatch-deload-choice',settings.deloadWeek===true?'last':settings.deloadWeek===false?'none':'auto');
        const minutes=Number(settings.maxSessionMinutes);
        if(time && Number.isInteger(minutes)){
            const standard=[...time.options].some(option=>option.value===String(minutes));
            time.value=standard?String(minutes):'custom';
            time.dispatchEvent(new Event('change'));
            if(!standard && custom)custom.value=String(minutes);
        }
        document.querySelectorAll('.mycoatch-base-equipment-check').forEach(input=>{input.checked=Array.isArray(settings.availableEquipment)?settings.availableEquipment.includes(input.value):input.defaultChecked;});
        document.querySelectorAll('.mycoatch-accessory-check').forEach(node=>{
            node.checked=settings.availableAccessories?.includes(node.value)===true;
        });
        for(const lift of ['bench','squat','military','hinge'])
            set('mycoatch-lift-'+lift,settings.preferredLifts?.[lift] || 'auto');
    }
    if(saved){
        set('mycoatch-experience',saved.experience);
        set('mycoatch-calibration',saved.calibration);
        set('mycoatch-priority-muscle',saved.priorityMuscle);
        document.querySelectorAll('.mycoatch-avoid-check').forEach(node=>{
            node.checked=saved.excludedExercises?.includes(node.value)===true;
        });
        for(const lift of ['bench','squat','military','hinge']){
            const ref=saved.referenceLoads?.[lift]||{};
            for(const part of ['kg','reps','rpe'])set('mycoatch-load-'+lift+'-'+part,ref[part]);
            set('mycoatch-load-'+lift+'-date',ref.performedOn);
        }
    }
    document.getElementById('mycoatch-limitations-review')?.remove();
    const reports=recentPainReports(state.workoutData);
    if(reports.length){
        const section=document.createElement('fieldset');section.id='mycoatch-limitations-review';
        const legend=document.createElement('legend');legend.textContent='Rivaluta le limitazioni prima del nuovo mesociclo';section.append(legend);
        const description=document.createElement('p');description.textContent=reports.slice(0,5).map(x=>x.checkedAt.slice(0,10)+' · '+(x.movement||x.dayName)+' · '+x.location).join(' | ');section.append(description);
        const label=document.createElement('label'),check=document.createElement('input');check.type='checkbox';check.id='mycoatch-limitations-confirmed';
        label.append(check,document.createTextNode(' Ho rivalutato le segnalazioni: ho selezionato gli esercizi da evitare se il problema è ancora presente, oppure il problema è risolto.'));section.append(label);
        document.getElementById('mycoatch-config-form')?.append(section);
    }
    modal.classList.remove('hidden');
    time?.focus();
}

