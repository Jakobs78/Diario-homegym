// Gestione Dark/light Mode
// js/theme.js
export function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark mode' ? 'light mode' : 'dark mode';
    
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('preferred_theme', newTheme);
    
    updateThemeButtonText(newTheme);
}

export function updateThemeButtonText(theme) {
    const btn = document.getElementById('theme-toggle-btn');
    if (btn) {
        btn.innerText = theme === 'dark mode' ? '☀️ Light mode' : '🌙 Dark mode';
    }
}

export function initTheme() {
    const savedTheme = localStorage.getItem('preferred_theme') || 'light mode';
    document.documentElement.setAttribute('data-theme', savedTheme);
    updateThemeButtonText(savedTheme);
}