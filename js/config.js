// config.js
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

// Inserisci i tuoi dati Supabase
const SUPABASE_URL = 'https://fcuywiijylvgrutwioak.supabase.co';
const SUPABASE_KEY = 'sb_publishable_z5K-2II8twK6ruPfk4Tp0g_MlFnZy7B';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

export const CONFIG = {
    STORAGE_KEY: 'workoutApp_data',
    WHITELIST: ['h725-25@hotmail.it'], // Aggiungi le email a cui vuoi permettere l'accesso
    APP_VERSION: '1.0.0'
};