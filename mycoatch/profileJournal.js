import { normalizeAthleteProfile } from './athleteProfile.js';

const clone=value=>JSON.parse(JSON.stringify(value));
const savedRecord=data=>data?.athlete?.mycoatchProfileJournal || null;

/** Never replace past versions. A save with identical settings creates no revision. */
export function stageProfileRevision(data, raw, at=new Date(), settings=null) {
    const profile=normalizeAthleteProfile(raw);
    if(!profile)throw Error('Completa il profilo atleta prima di salvarlo.');
    if(!data || typeof data!=='object')throw Error('Diario atleta non valido.');
    const journal=savedRecord(data);
    const history=Array.isArray(journal?.versions) ? clone(journal.versions) : [];
    if(history.some(x=>!Number.isInteger(x.version)||x.version<1||
        !x.profile||typeof x.profile!=='object'))throw Error('Cronologia profilo non valida.');
    const latest=history.at(-1);
    const selected=settings ? generationSettings(settings) : latest?.settings || null;
    const effective=latest?.profile || null;
    const baseVersion=latest?.version || 0;
    if(effective && JSON.stringify(effective)===JSON.stringify(profile) &&
        JSON.stringify(latest?.settings || null)===JSON.stringify(selected))
        return { changed:false,baseVersion,version:latest.version,
            profile:clone(profile),journal:clone(journal) };
    const version=(latest?.version || 0)+1;
    const timestamp=at.toISOString();
    return {
        changed:true,baseVersion,version,profile:clone(profile),
        journal:{schemaVersion:1,currentVersion:version,
            versions:[...history,{version,savedAt:timestamp,profile:clone(profile),settings:selected}]}
    };
}

/** Commit only after the calling workflow validates the whole workout plan. */
export function commitProfileRevision(data,staged) {
    if(!staged?.journal || !Number.isInteger(staged.baseVersion))
        throw Error('Revisione profilo mancante.');
    // Another tab or a second proposal may already have saved a newer
    // version. Refuse to overwrite its version history with stale data.
    const currentVersion=savedRecord(data)?.versions?.at(-1)?.version || 0;
    if(currentVersion!==staged.baseVersion)
        throw Error('Il profilo è stato aggiornato altrove: ricarica i dati prima di salvare.');
    data.athlete ||= {};
    data.athlete.mycoatchProfileJournal=clone(staged.journal);
    return data.athlete.mycoatchProfileJournal;
}

/**
 * Read-only check: a saved mesocycle never inherits a newer profile silently.
 * A newer revision with identical content is harmless but still traceable.
 * Imported/legacy mesocycles may have no snapshot at all.
 */
export function assessMesocycleProfileContinuity(mesocycle, data) {
    const snapshot=mesocycle?.coachProfileSnapshot;
    const journal=savedRecord(data);
    const current=journal?.versions?.at(-1);
    const currentVersion=Number.isInteger(current?.version) ? current.version : null;
    if(!snapshot) return {
        status:'legacy_no_snapshot',profileVersion:null,currentVersion,
        message:'Questo mesociclo non possiede uno snapshot MyCoatch: il profilo usato in origine non è verificabile.'
    };
    const profileVersion=snapshot.profileVersion;
    if(!Number.isInteger(profileVersion)||profileVersion<1 || !snapshot.profile)
        return {
            status:'invalid_snapshot',profileVersion:null,currentVersion,
            message:'Snapshot del profilo non valido: nessuna modifica automatica alla scheda.'
        };
    if(currentVersion===null || profileVersion>currentVersion)
        return {
            status:'unverifiable',profileVersion,currentVersion,
            message:'Il profilo originale è archiviato nel mesociclo, ma la versione corrente non è confrontabile.'
        };
    const sameSettings=!current.settings || !snapshot.settings ||
        JSON.stringify(generationSettings(snapshot.settings))===JSON.stringify(generationSettings(current.settings));
    if(JSON.stringify(snapshot.profile)===JSON.stringify(current.profile) && sameSettings)
        return {
            status:'same_profile',profileVersion,currentVersion,
            message:'Il profilo usato per il mesociclo coincide con quello attualmente salvato.'
        };
    if(profileVersion===currentVersion)
        return {
            status:'inconsistent',profileVersion,currentVersion,
            message:'La versione corrente e lo snapshot differiscono: controlla il backup prima di generare una nuova scheda.'
        };
    return {
        status:'updated_since_plan',profileVersion,currentVersion,
        message:'Il profilo attuale (v'+currentVersion+') è diverso da quello usato per questa scheda (v'+profileVersion+'). '+
            'Le serie, i carichi e lo storico del mesociclo restano invariati. Le nuove impostazioni saranno valutate soltanto in una nuova proposta.'
    };
}

export function latestSavedProfile(data) {
    const journal=savedRecord(data);
    const entry=journal?.versions?.at(-1);
    return entry?.profile ? clone(entry.profile) : null;
}

export function generationSettings(options={}) {
    const fields=['userAge','daysPerWeek','maxSessionMinutes','focus','splitPreference',
        'deloadWeek','preferredLifts','availableEquipment','availableAccessories','cableSetup'];
    return Object.fromEntries(fields.filter(key=>options[key]!==undefined)
        .map(key=>[key,clone(options[key])]));
}

export function latestSavedSettings(data) {
    const settings=savedRecord(data)?.versions?.at(-1)?.settings;
    return settings ? clone(settings) : null;
}

/**
 * Only load-building fields belong to a mesocycle equipment snapshot.
 * Keep free-text athlete fields, account identity and the profile journal out.
 * Captures the configuration used for the proposal, not a live reference.
 */
export function snapshotEquipmentState(athlete = {}) {
    const source=athlete && typeof athlete==='object' && !Array.isArray(athlete)
        ? athlete : {};
    const allowed=['barbellWeight','ownedBarbells','defaultBarbell',
        'loadingSteps','plateInventories','platePairs','barbellAssignments','availableLoads','loadLimits','stationConfigurations'];
    return Object.fromEntries(allowed.filter(key=>source[key]!==undefined)
        .map(key=>[key,clone(source[key])]));
}

/** A previously previewed prescription must not outlive equipment edits. */
export function equipmentMatchesSnapshot(captured, athlete) {
    return JSON.stringify(snapshotEquipmentState(captured)) ===
        JSON.stringify(snapshotEquipmentState(athlete));
}

/**
 * Snapshot v2: athlete profile plus the DECISION-RELEVANT generation settings
 * and owned loading equipment as resolved when the preview was generated.
 * v1 snapshots remain readable; no automatic migration or historical write.
 */
export function profileSnapshot(staged,{
    splitPreference='auto',daysPerWeek=null,maxSessionMinutes=null,focus=null,
    userAge=null,preferredLifts={},availableEquipment=[],
    availableAccessories=[],cableSetup=null,deloadWeek=null,
    equipmentAtGeneration:previewEquipment={}
}={},equipmentAtGeneration=null) {
    if(!staged?.profile||!Number.isInteger(staged.version))
        throw Error('Profilo non disponibile.');
    const settings={
        splitPreference,daysPerWeek,maxSessionMinutes,focus,
        userAge:Number.isInteger(Number(userAge)) && userAge !== null
            ? Number(userAge) : null,
        preferredLifts:preferredLifts || {},
        availableEquipment:Array.isArray(availableEquipment) ? availableEquipment : [],
        availableAccessories:Array.isArray(availableAccessories) ? availableAccessories : [],
        cableSetup,
        deloadWeek:typeof deloadWeek === 'boolean' ||
            Number.isInteger(deloadWeek) ? deloadWeek : null
    };
    return {
        schemaVersion:2,profileVersion:staged.version,
        profile:clone(staged.profile),
        settings:clone(settings),
        equipment:snapshotEquipmentState(equipmentAtGeneration ?? previewEquipment)
    };
}

export function proposalEvidenceFingerprint(data){
    return JSON.stringify({history:data?.history,profile:data?.athlete?.mycoatchProfileJournal,equipment:snapshotEquipmentState(data?.athlete)});
}
