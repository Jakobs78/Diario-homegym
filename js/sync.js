// sync.js
import { supabase } from './config.js';

export async function pushDataToSupabase(email, data) {
    if (!email) return false;
    
    try {
        const { error } = await supabase
            .from('workouts')
            // Assicurati che la tabella si chiami 'workouts' e abbia le colonne email, payload e updated_at
            .upsert({ email: email, payload: data, updated_at: new Date().toISOString() }, { onConflict: 'email' });
        
        if (error) throw error;
        console.log('Sincronizzazione su Supabase avvenuta con successo.');
        return true;
    } catch (error) {
        console.error('Errore durante il salvataggio su Supabase:', error.message);
        return false;
    }
}

export async function pullDataFromSupabase(email) {
    if (!email) return null;

    try {
        const { data, error } = await supabase
            .from('workouts')
            .select('payload')
            .eq('email', email)
            .single();
        
        if (error) {
            // Il codice PGRST116 significa che nessuna riga è stata trovata (utente nuovo)
            if (error.code === 'PGRST116') return null;
            throw error;
        }
        
        console.log('Dati recuperati da Supabase con successo.');
        return data ? data.payload : null;
    } catch (error) {
        console.error('Errore durante il caricamento da Supabase:', error.message);
        return null;
    }
}