// config.js
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

// Inserisci i tuoi dati Supabase
const SUPABASE_URL = 'IL_TUO_SUPABASE_URL';
const SUPABASE_KEY = 'LA_TUA_SUPABASE_ANON_KEY';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

export const CONFIG = {
    STORAGE_KEY: 'workoutApp_data',
    WHITELIST: ['tua@email.com'], // Aggiungi le email a cui vuoi permettere l'accesso
    APP_VERSION: '1.0.0'
};