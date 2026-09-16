// ==========================================
// MODULI: bannerSviluppo.js - Iniezione dinamica e gestione del banner di avviso della versione beta
// ==========================================

export function initDevBanner() {
    // Evita di ricrearlo se esiste già
    if (document.getElementById('dev-warning-banner')) return;

    // 1. Iniettiamo gli stili CSS via codice così non devi toccare i file CSS
    const style = document.createElement('style');
    style.textContent = `
        .dev-banner {
            background: linear-gradient(135deg, #f59e0b, #d97706);
            color: #fff;
            padding: 10px 16px;
            font-size: 13px;
            font-weight: 500;
            text-align: center;
            position: relative;
            z-index: 1000;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .dev-banner-content {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 12px;
            max-width: 1200px;
            margin: 0 auto;
        }
        .dev-banner button {
            background: transparent;
            border: none;
            color: #fff;
            cursor: pointer;
            font-size: 14px;
            padding: 2px 6px;
            opacity: 0.8;
            transition: opacity 0.2s;
        }
        .dev-banner button:hover {
            opacity: 1;
        }
    `;
    document.head.appendChild(style);

    // 2. Se l'utente lo aveva già chiuso, non mostriamo nulla
    if (localStorage.getItem('dev_banner_closed') === 'true') {
        return;
    }

    // 3. Creiamo l'elemento HTML del banner
    const banner = document.createElement('div');
    banner.id = 'dev-warning-banner';
    banner.className = 'dev-banner';
    banner.innerHTML = `
        <div class="dev-banner-content">
            <span>🚧 <strong>Versione beta in sviluppo:</strong> Questa webapp è in fase di evoluzione e continui aggiornamenti. Usala senza problemi, provala, ma non affidarti alla memorizzazione dello storico perché potrebbe essere sovrascritto o cancellato. Potrebbe anche succedere che loggandoti la webapp ti dia errori o utente non conosciuto. Devi eliminare l'account e ricrearne un altro. Ciò è dovuto a causa degli aggiornamenti che apporterò pian piano. <br>GRAZIE per testare questa webapp per 45 giorni. Chiudi pure questo avviso</span>
            <button id="close-dev-banner" aria-label="Chiudi avviso">✖</button>
        </div>
    `;

    // Inseriamo il banner in cima al body (o prima di un elemento specifico se preferisci)
    document.body.prepend(banner);

    // 4. Gestione della chiusura
    const closeBtn = document.getElementById('close-dev-banner');
    closeBtn?.addEventListener('click', () => {
        banner.style.transition = 'opacity 0.3s ease, height 0.3s ease';
        banner.style.opacity = '0';
        setTimeout(() => {
            banner.remove();
        }, 300);
        localStorage.setItem('dev_banner_closed', 'true');
    });
}