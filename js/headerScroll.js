/** Directional header visibility only; never changes workout state or navigation. */
export function initHeaderScroll() {
    const header=document.querySelector('.app-header-container');
    if(!header || header.dataset.scrollReady)return;
    header.dataset.scrollReady='true';
    let anchor=Math.max(0,window.scrollY),scheduled=false;
    const show=()=>header.classList.remove('header-scroll-hidden');
    window.addEventListener('scroll',()=>{
        if(scheduled)return;
        scheduled=true;
        requestAnimationFrame(()=>{
            scheduled=false;
            const y=Math.max(0,window.scrollY);
            if(y<=10){show();anchor=y;return;}
            if(Math.abs(y-anchor)<8)return;
            header.classList.toggle('header-scroll-hidden',y>anchor);
            anchor=y;
        });
    },{passive:true});
    header.addEventListener('focusin',show);
    document.addEventListener('keydown',event=>{if(event.key==='Tab')show();});
}
