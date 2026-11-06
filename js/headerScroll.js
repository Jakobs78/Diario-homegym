/** Directional header visibility only; never changes workout state or navigation. */
export function initHeaderScroll() {
    const header=document.querySelector('.app-header-container');
    if(!header || header.dataset.scrollReady)return;
    header.dataset.scrollReady='true';
    let previous=Math.max(0,window.scrollY),distance=0,direction=0,scheduled=false;
    const show=()=>header.classList.remove('header-scroll-hidden');
    window.addEventListener('scroll',()=>{
        if(scheduled)return;
        scheduled=true;
        requestAnimationFrame(()=>{
            scheduled=false;
            const y=Math.max(0,window.scrollY);
            const delta=y-previous;previous=y;
            if(y<=10){show();distance=0;direction=0;return;}
            if(delta===0)return;
            const nextDirection=Math.sign(delta);
            distance=nextDirection===direction?distance+Math.abs(delta):Math.abs(delta);
            direction=nextDirection;
            // Revealing requires a deliberate upward gesture, not a tiny correction.
            const threshold=direction<0?80:24;
            if(distance<threshold)return;
            header.classList.toggle('header-scroll-hidden',direction>0);
        });
    },{passive:true});
    header.addEventListener('focusin',show);
    document.addEventListener('keydown',event=>{if(event.key==='Tab')show();});
}
