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
        themeBtn.textContent = theme === 'dark' ? '🌙 Dark' : '☀️ Light';
    }
}