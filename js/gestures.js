// Esclusione dai massimali con gesto deliberato: almeno 300px orizzontali.
// Un gesto verticale o iniziato su controlli non può mai escludere esercizi.
export function enableCardSwipeGesture(cardElement, onSwipeLeft, onSwipeRight) {
    if (!cardElement) return;
    const MIN_SWIPE_DISTANCE=300;
    let startX=0,startY=0,currentX=0,currentY=0,tracking=false,swiping=false;

    const interactive='input, select, button, textarea, a, label, summary, details';
    const reset=()=>{
        cardElement.style.transition='';
        cardElement.style.transform='';
        cardElement.style.opacity='';
        tracking=false;
        swiping=false;
    };
    cardElement.addEventListener('touchstart', event=>{
        const touch=event.touches?.[0];
        if (!touch || event.touches.length!==1 || event.target.closest?.(interactive)) {
            tracking=false;
            return;
        }
        startX=currentX=touch.clientX;
        startY=currentY=touch.clientY;
        tracking=true;
        swiping=false;
    },{passive:true});
    cardElement.addEventListener('touchmove',event=>{
        if(!tracking)return;
        const touch=event.touches?.[0];
        if(!touch || event.touches.length!==1){reset();return;}
        currentX=touch.clientX;currentY=touch.clientY;
        const dx=currentX-startX,dy=currentY-startY;
        const absX=Math.abs(dx),absY=Math.abs(dy);
        if(absY>absX && !swiping)return;
        if(absX>30 && absX>absY*2){
            swiping=true;
            // Prevent exaggerated visual displacement; the 300px threshold is still strict.
            cardElement.style.transition='none';
            cardElement.style.transform='translateX('+Math.max(-300,Math.min(300,dx))+'px)';
            cardElement.style.opacity=String(1-Math.min(absX/300,.5));
        }
    },{passive:true});
    cardElement.addEventListener('touchend',event=>{
        if(!tracking)return;
        const point=event.changedTouches?.[0];
        if(point){currentX=point.clientX;currentY=point.clientY;}
        const dx=currentX-startX,dy=currentY-startY;
        const qualifies=swiping && Math.abs(dx)>=MIN_SWIPE_DISTANCE && Math.abs(dx)>Math.abs(dy)*1.5;
        const handler=dx<0?onSwipeLeft:onSwipeRight;
        reset();
        if(qualifies && typeof handler==='function') handler(cardElement);
    },{passive:true});
    cardElement.addEventListener('touchcancel',reset,{passive:true});
}
