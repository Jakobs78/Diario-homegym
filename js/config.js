// ==========================================
// MODULI: config.js - Configurazione del client Supabase e costanti globali dell'applicazione
// ==========================================
// Load the pinned, locally vendored UMD client from index.html.
const createClient = window.supabase?.createClient;
if(typeof createClient!=='function')
    throw Error('Supabase client locale non disponibile. Verifica i file dell’app.');

// Inserisci i tuoi dati Supabase
const SUPABASE_URL = 'https://ircdhfsojwqyuqjsmmen.supabase.co';
const SUPABASE_KEY = 'sb_publishable_i4dAZknYu0hXZYJ_peerpg_JT7bxvYg';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

export const CONFIG = {
    STORAGE_KEY: 'workoutApp_data',
    APP_VERSION: '1.1.0-20261023'
};