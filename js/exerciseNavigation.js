/**
 * Lightweight mobile jump bar. Uses the existing cards and never writes the diary.
 * Scroll listeners are detached before rebuilding the workout view.
 */
let cleanupPrevious=()=>{};
export function createExerciseJumpNavigation(container, exercises) {
    cleanupPrevious();
    cleanupPrevious=()=>{};
    if(!container || !Array.isArray(exercises) || exercises.length<2)return;
    const cards=Array.from(container.querySelectorAll('.ex-card[data-ex]'));
    if(cards.length<2)return;
    const nav=document.createElement('nav');
    nav.className='workout-exercise-nav';
    nav.setAttribute('aria-label','Vai rapidamente a un esercizio della seduta');
    const previous=document.createElement('button');
    previous.type='button';previous.className='workout-jump-button';
    previous.textContent='‹';previous.setAttribute('aria-label','Esercizio precedente');
    const current=document.createElement('span');
    current.className='workout-jump-current';
    current.setAttribute('aria-live','off');
    const next=document.createElement('button');
    next.type='button';next.className='workout-jump-button';
    next.textContent='›';next.setAttribute('aria-label','Esercizio successivo');
    nav.append(previous,current,next);
    container.append(nav);
    let active=0;
    const update=()=>{
        current.textContent=(active+1)+'/'+cards.length+' · '+(exercises[Number(cards[active].dataset.ex)]?.name||'Esercizio');
        previous.disabled=active===0;
        next.disabled=active===cards.length-1;
    };
    const jump=delta=>{
        const target=Math.min(cards.length-1,Math.max(0,active+delta));
        if(target===active)return;
        active=target;update();
        cards[active].scrollIntoView({
            block:'start',
            behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'
        });
    };
    previous.addEventListener('click',()=>jump(-1));
    next.addEventListener('click',()=>jump(1));
    let waiting=false;
    const scroll=()=>{
        if(waiting)return;
        waiting=true;
        requestAnimationFrame(()=>{
            waiting=false;
            if(!nav.isConnected)return;
            // Last card that has crossed the upper portion of the viewport.
            const threshold=Math.max(110,window.innerHeight*.4);
            let closest=0;
            for(let i=0;i<cards.length;i++){
                if(cards[i].getBoundingClientRect().top<=threshold)closest=i;
            }
            if(active!==closest){active=closest;update();}
        });
    };
    window.addEventListener('scroll',scroll,{passive:true});
    const keyboard=(event)=>{
        const editing=event.target.closest?.('.ex-card .set-input, .ex-card .ex-user-notes');
        if(editing)nav.classList.toggle('is-editing',event.type==='focusin');
    };
    container.addEventListener('focusin',keyboard);
    container.addEventListener('focusout',keyboard);
    cleanupPrevious=()=>{
        window.removeEventListener('scroll',scroll);
        container.removeEventListener('focusin',keyboard);
        container.removeEventListener('focusout',keyboard);
    };
    update();scroll();
}
