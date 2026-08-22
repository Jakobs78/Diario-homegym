// gestisce solo la connessione al database supabase, non contiene logica
// js/supabaseClient.js
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = 'https://fcuywiijylvgrutwioak.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_z5K-2II8twK6ruPfk4Tp0g_MlFnZy7B';

// Esportiamo il client già inizializzato
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
