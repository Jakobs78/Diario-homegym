import { normalizeAthleteProfile } from './athleteProfile.js';

const clone=value=>JSON.parse(JSON.stringify(value));
const savedRecord=data=>data?.athlete?.mycoatchProfileJournal || null;

/** Never replace past versions. A save with identical settings creates no revision. */
export function stageProfileRevision(data, raw, at=new Date()) {
    const profile=normalizeAthleteProfile(raw);
    if(!profile)throw Error('Completa il profilo atleta prima di salvarlo.');
    if(!data || typeof data!=='object')throw Error('Diario atleta non valido.');
    const journal=savedRecord(data);
    const history=Array.isArray(journal?.versions) ? clone(journal.versions) : [];
    if(history.some(x=>!Number.isInteger(x.version)||x.version<1||
        !x.profile||typeof x.profile!=='object'))throw Error('Cronologia profilo non valida.');
    const latest=history.at(-1);
    const effective=latest?.profile || null;
    if(effective && JSON.stringify(effective)===JSON.stringify(profile))
        return { changed:false,version:latest.version, profile:clone(profile),journal:clone(journal) };
    const version=(latest?.version || 0)+1;
    const timestamp=at.toISOString();
    return {
        changed:true,version,profile:clone(profile),
        journal:{schemaVersion:1,currentVersion:version,
            versions:[...history,{version,savedAt:timestamp,profile:clone(profile)}]}
    };
}

/** Commit only after the calling workflow validates the whole workout plan. */
export function commitProfileRevision(data,staged) {
    if(!staged?.journal)throw Error('Revisione profilo mancante.');
    data.athlete ||= {};
    data.athlete.mycoatchProfileJournal=clone(staged.journal);
    return data.athlete.mycoatchProfileJournal;
}

export function latestSavedProfile(data) {
    const journal=savedRecord(data);
    const entry=journal?.versions?.at(-1);
    return entry?.profile ? clone(entry.profile) : null;
}

/** Immutable value snapshot; no live reference to a mutable athlete profile. */
export function profileSnapshot(staged,{splitPreference='auto',daysPerWeek=null,
    maxSessionMinutes=null,focus=null}={}) {
    if(!staged?.profile||!Number.isInteger(staged.version))throw Error('Profilo non disponibile.');
    return {
        schemaVersion:1,profileVersion:staged.version,
        profile:clone(staged.profile),
        settings:clone({splitPreference,daysPerWeek,maxSessionMinutes,focus})
    };
}
