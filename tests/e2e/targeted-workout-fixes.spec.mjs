import {test,expect} from '@playwright/test';
const set=(reps,rpe=8.5)=>({weight:21,reps,rpe,isLocked:true,completed:true,performedAt:'2026-10-29T17:00:00Z'});
function fixture(reps=[12,11,11]){
 const push=logs=>({name:'Pushdown ai Cavi con Corda',set:'3 set',reps:'10-12',rpe:8.5,targetRpe:8.5,rest:'90s',sets:[{},{},{}],loggedSets:logs,notes:'Gomiti fermi lungo il busto.'});
 return {athlete:{loadingSteps:{machine:1},availableLoads:{machine:[21,22]}},history:{years:{2026:{mesocycles:[{name:'Prova mirata',weeks:[
  {weekNumber:2,days:[{dayNumber:3,date:'2026-10-29',exercises:[push(reps.map(r=>set(r)))]}]},
  {weekNumber:3,days:[{dayNumber:3,isPaused:true,accumulatedSeconds:1200,date:'2026-11-04',exercises:[
   {name:'Panca Piana con Bilanciere',set:'2 set',reps:'6-8',rpe:8,kgMin:'50',kgMax:'50',rest:'180s',sets:[{},{}],loggedSets:[{},{}]},push([{},{},{}])]}]}
 ]}]}}}};
}
async function open(page,data){
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>r.request().url().startsWith('http://127.0.0.1:4173')?r.continue():r.abort());
 await page.route('**/js/config.js',r=>r.fulfill({contentType:'application/javascript',body:`export const CONFIG={STORAGE_KEY:'workoutApp_data',APP_VERSION:'targeted-test'};export const supabase={auth:{getUser:async()=>({data:{user:null}}),getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},from(){throw Error('Production forbidden');}};`}));
 await page.addInitScript(()=>localStorage.setItem('dev_banner_closed','true'));
 await page.goto('/index.html');await expect(page.locator('#open-tools-btn')).toBeAttached();
 await page.evaluate(async data=>{
  const {state}=await import('/js/state.js');state.currentUser=null;state.workoutData=data;state.currentYear='2026';state.activeMesocycleIndex=0;state.activeWeek=3;state.activeDay=3;
  for(const [key,value] of Object.entries({year:'2026',meso:'0',week:'3',day:'3'}))localStorage.setItem('ui_active_'+key,value);
  await(await import('/js/storage.js')).saveAndSync(data);
  (await import('/js/ui.js')).renderWorkoutList();document.getElementById('auth-overlay').style.display='none';
 },data);
 return errors;
}
test('header disappears downwards and returns upwards on mobile without changing the session',async({page})=>{
 await page.setViewportSize({width:390,height:844});const errors=await open(page,fixture());
 await page.evaluate(()=>window.scrollTo(0,900));
 await expect(page.locator('.app-header-container')).toHaveClass(/header-scroll-hidden/);
 await expect.poll(()=>page.locator('.app-header-container').evaluate(el=>el.getBoundingClientRect().bottom)).toBeLessThanOrEqual(0);
 await page.evaluate(()=>window.scrollBy(0,-20));
 await page.waitForTimeout(250);
 await expect(page.locator('.app-header-container')).toHaveClass(/header-scroll-hidden/);
 await page.evaluate(()=>window.scrollBy(0,12));
 await page.waitForTimeout(100);
 await page.evaluate(()=>window.scrollBy(0,-25));
 await page.waitForTimeout(250);
 await expect(page.locator('.app-header-container')).toHaveClass(/header-scroll-hidden/);
 await page.evaluate(()=>window.scrollBy(0,-200));
 await expect(page.locator('.app-header-container')).not.toHaveClass(/header-scroll-hidden/);
 await expect(page.locator('#resume-training-btn')).toBeInViewport();expect(errors).toEqual([]);
});
test('pushdown 21 kg 12/11/11 at RPE 8.5: second/third targets 12 and near-completion advice',async({page})=>{
 const errors=await open(page,fixture());const card=page.locator('.ex-card[data-ex="1"]');
 await expect(card.locator('.set-reps[data-set="1"]')).toHaveValue('12');
 await expect(card.locator('.set-reps[data-set="2"]')).toHaveValue('12');
 await expect(card.locator('.set-kg[data-set="1"]')).toHaveValue('21');
 await expect(card.locator('.coach-adaptive-notes')).toContainText('Manca poco');
 await expect(card.locator('.coach-adaptive-notes')).toContainText('Cerca di chiudere tutte le serie');
 await card.locator('.set-lock-check[data-set="0"]').check();
 await expect(card.locator('.set-reps[data-set="1"]')).toHaveValue('12');
 await expect(card.locator('.coach-adaptive-notes')).toContainText('Cerca di chiudere tutte le serie');
 expect(errors).toEqual([]);
});
test('warmup disclosure stays closed after a working-set check and reload, even when legacy ID is assigned',async({page})=>{
 const errors=await open(page,fixture());const card=page.locator('.ex-card[data-ex="0"]');
 await expect(card.locator('.exercise-warmups')).toHaveAttribute('open','');
 await card.locator('.exercise-warmups > summary').click();
 await expect(card.locator('.exercise-warmups')).not.toHaveAttribute('open','');
 await card.locator('.set-kg[data-set="0"]').fill('50');
 await card.locator('.set-reps[data-set="0"]').fill('8');
 await card.locator('.set-rpe[data-set="0"]').fill('8');
 await card.locator('.set-lock-check[data-set="0"]').check();
 await expect(card.locator('.exercise-warmups')).not.toHaveAttribute('open','');
 await page.evaluate(async()=>{await(await import('/js/journalStore.js')).flushJournalStorage();});
 await page.reload();
 await expect(page.locator('.ex-card[data-ex="0"] .exercise-warmups')).not.toHaveAttribute('open','');
 expect(errors).toEqual([]);
});
test('all series reach 12 within RPE: display the available 22 kg and explain the increase',async({page})=>{
 const errors=await open(page,fixture([12,12,12]));const card=page.locator('.ex-card[data-ex="1"]');
 await expect(card.locator('.set-kg[data-set="0"]')).toHaveValue('22');
 await expect(card.locator('.coach-adaptive-notes')).toContainText('aumentato il carico');
 await expect(card.locator('.coach-adaptive-notes')).toContainText('22 kg');
 expect(errors).toEqual([]);
});
