// ==========================================
// MODULI: theme.js - Gestione tema visivo Dark/Light, applicazione stili e persistenza nel localStorage
// ==========================================

/**
 * Inizializza il tema salvato nel LocalStorage o imposta il tema Dark di default.
 */
export function initTheme() {
    const savedTheme = localStorage.getItem('app-theme') || 'light';
    applyTheme(savedTheme);
}

/**
 * Alterna il tema tra Light e Dark e salva la preferenza.
 */
export function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    applyTheme(newTheme);
    localStorage.setItem('app-theme', newTheme);
}

function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    const themeBtn = document.getElementById('theme-toggle-btn');
    if (themeBtn) {
        const label=themeBtn.querySelector('.theme-label');
        const help=themeBtn.querySelector('.theme-help');
        if(label)label.textContent=theme==='dark'?'🌙 Tema scuro':'☀️ Tema chiaro';
        if(help)help.textContent=theme==='dark'?'Passa al tema chiaro.':'Passa al tema scuro.';
        themeBtn.setAttribute('aria-label',theme==='dark'?'Attiva tema chiaro':'Attiva tema scuro');
    }
}