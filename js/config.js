// config.js
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Inserisci i tuoi dati Supabase
const SUPABASE_URL = 'https://ircdhfsojwqyuqjsmmen.supabase.co';
const SUPABASE_KEY = 'sb_publishable_i4dAZknYu0hXZYJ_peerpg_JT7bxvYg';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

export const CONFIG = {
    STORAGE_KEY: 'workoutApp_data',
    APP_VERSION: '1.0.0'
};