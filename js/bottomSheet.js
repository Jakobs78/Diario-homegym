//  - Gestione dei pannelli a scomparsa (Bottom Sheet) e modali

export function setupBottomSheet({ modalId, openBtnId, closeBtnId, onSelect }) {
    const modal = document.getElementById(modalId);
    const openBtn = document.getElementById(openBtnId);
    const closeBtn = document.getElementById(closeBtnId);

    if (!modal) return null;

    const openSheet = () => {
        modal.classList.remove('hidden');
    };

    const closeSheet = () => {
        modal.classList.add('hidden');
    };

    if (openBtn) {
        openBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            openSheet();
        });
    }

    if (closeBtn) {
        closeBtn.addEventListener('click', closeSheet);
    }

    // Chiusura cliccando sullo sfondo scuro esterno al pannello
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeSheet();
        }
    });

    // Gestione click sulle voci del menu (.sheet-item con data-subtab o data-action)
    modal.querySelectorAll('.sheet-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.stopPropagation();
            const value = item.dataset.subtab || item.dataset.action;
            if (value && typeof onSelect === 'function') {
                onSelect(value);
            }
            closeSheet();
        });
    });

    return { openSheet, closeSheet };
}