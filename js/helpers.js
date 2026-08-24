// Funzioni di utilità: slugify, ecc.
import { CURRENT_YEAR } from './config.js';

export function generateKey(dataId) {
    if (dataId.startsWith(CURRENT_YEAR.toString())) return dataId;
    return `${CURRENT_YEAR}-${dataId}`;
}

export function slugify(text) {
    return text.toString().toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function extractNumber(val) {
    if (!val) return '';
    const match = String(val).match(/\d+(\.\d+)?/);
    return match ? match[0] : '';
}

export function getAutoMuscleGroup(exerciseName) {
    const name = slugify(exerciseName);
    if (name.includes('panca') || name.includes('croci') || name.includes('spinte') || name.includes('chest')) return 'Petto';
    if (name.includes('trazioni') || name.includes('lat') || name.includes('rematore') || name.includes('pulley') || name.includes('dorso')) return 'Dorso';
    if (name.includes('squat') || name.includes('legpress') || name.includes('legextension') || name.includes('affondi')) return 'Quadricipiti';
    if (name.includes('stacco') || name.includes('legcurl') || name.includes('rdl') || name.includes('femorali')) return 'Femorali';
    if (name.includes('military') || name.includes('lento') || name.includes('alzate') || name.includes('spalle') || name.includes('shoulder')) return 'Spalle';
    if (name.includes('curl') || name.includes('bicipiti')) return 'Bicipiti';
    if (name.includes('pushdown') || name.includes('french') || name.includes('tricipiti') || name.includes('dip')) return 'Tricipiti';
    if (name.includes('calf') || name.includes('polpacci')) return 'Polpacci';
    if (name.includes('crunch') || name.includes('plank') || name.includes('addome') || name.includes('legraise')) return 'Addome';
    return 'Altro';
}

export function getExerciseSignature(ex) {
    const nameSlug = slugify(ex.Esercizio);
    let tipoReps = 'fisso';

    if (ex.Reps) {
        const repsStr = String(ex.Reps).toLowerCase().trim();
        if (repsStr.includes('max') || repsStr.includes('cedimento') || repsStr.includes('amrap')) {
            tipoReps = 'max';
        } else if (repsStr.includes('-')) {
            tipoReps = 'range';
        }
    }
    return `${nameSlug}_${tipoReps}`;
}

export function parseRestTime(restStr) {
    if (!restStr) return 90; 
    restStr = String(restStr).toLowerCase().trim();
    
    if (restStr.includes('m')) {
        let mins = 0;
        let secs = 0;
        const minMatch = restStr.match(/(\d+(?:\.\d+)?)\s*(?:m|min)/);
        if (minMatch) mins = parseFloat(minMatch[1]) || 0;
        const secMatch = restStr.match(/(\d+)\s*(?:s|sec)/);
        if (secMatch) secs = parseInt(secMatch[1]) || 0;
        return Math.round((mins * 60) + secs);
    }
    
    if (restStr.includes(':') || restStr.includes("'") || restStr.includes('.')) {
        const parts = restStr.split(/[:'.]/);
        const mins = parseInt(parts[0]) || 0;
        const secs = parseInt(parts[1]) || 0;
        return (mins * 60) + secs;
    }
    
    const cleanNum = parseInt(restStr.replace(/\D/g, ''));
    return !isNaN(cleanNum) ? cleanNum : 90; 
}