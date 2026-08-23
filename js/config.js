// Costanti e config Supabase
export const CURRENT_YEAR = new Date().getFullYear(); 

export const SUPABASE_URL = 'https://fcuywiijylvgrutwioak.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_z5K-2II8twK6ruPfk4Tp0g_MlFnZy7B';
export const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export const STORAGE_KEY_DATA = 'bodybuilding_diary_data';
export const STORAGE_KEY_PLAN = 'bodybuilding_plan_json';