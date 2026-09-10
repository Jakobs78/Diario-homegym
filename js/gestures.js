// ==========================================
// MODULI: gestures.js - Gestione dei gesti touch (swipe) orizzontali per le card degli esercizi
// ==========================================

export function enableCardSwipeGesture(cardElement, onSwipeLeft, onSwipeRight) {
    if (!cardElement) return;

    cardElement.style.touchAction = 'pan-y';

    let startX = 0;
    let startY = 0;
    let currentX = 0;
    let currentY = 0;
    let isSwiping = false;

    const MIN_SWIPE_DISTANCE = 120; 

    cardElement.addEventListener('touchstart', (e) => {
        const touch = e.touches[0];
        startX = touch.clientX;
        startY = touch.clientY;
        currentX = startX;
        currentY = startY;
        isSwiping = false;
        
        cardElement.style.transition = 'none';
    }, { passive: true });

    cardElement.addEventListener('touchmove', (e) => {
        const touch = e.touches[0];
        currentX = touch.clientX;
        currentY = touch.clientY;

        const deltaX = currentX - startX;
        const deltaY = currentY - startY;

        const absX = Math.abs(deltaX);
        const absY = Math.abs(deltaY);

        if (!isSwiping && absY > absX) return;

        if (absX > 15 && absX > absY * 1.5) {
            isSwiping = true;
            cardElement.style.transform = `translateX(${deltaX}px)`;
            cardElement.style.opacity = `${1 - Math.min(absX / 300, 0.5)}`;
        }
    }, { passive: true });

    cardElement.addEventListener('touchend', () => {
        cardElement.style.transition = 'transform 0.25s ease-out, opacity 0.25s ease-out';
        const deltaX = currentX - startX;
        const deltaY = currentY - startY;
        const absX = Math.abs(deltaX);
        const absY = Math.abs(deltaY);

        if (isSwiping && absX >= MIN_SWIPE_DISTANCE && absX > absY * 1.5) {
            if (deltaX < 0 && typeof onSwipeLeft === 'function') {
                cardElement.style.transform = 'translateX(-100%)';
                cardElement.style.opacity = '0';
                setTimeout(() => onSwipeLeft(cardElement), 250);
                return;
            } else if (deltaX > 0 && typeof onSwipeRight === 'function') {
                cardElement.style.transform = 'translateX(100%)';
                cardElement.style.opacity = '0';
                setTimeout(() => onSwipeRight(cardElement), 250);
                return;
            }
        }

        cardElement.style.transform = 'translateX(0px)';
        cardElement.style.opacity = '1';
    });
}