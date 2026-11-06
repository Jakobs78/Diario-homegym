import {test,expect} from '@playwright/test';
const exercise=()=>({name:'Panca Piana con Bilanciere',set:'2 set',setsCount:2,reps:'6-8',rpe:8,rest:'180s',kgMin:'50',kgMax:'50',sets:[{},{}],loggedSets:[{},{}]});
const days=()=>Array.from({length:4},(_,i)=>({dayNumber:i+1,dayName:['Upper A','Lower A','Upper B','Lower B'][i],exercises:[exercise()]}));
const fixture=()=>({
 activeTrainingPlan:{mesocycleId:'current'},
 history:{years:{
  2025:{mesocycles:[{id:'past',name:'Passato',locked:true,weeks:[{weekNumber:1,days:days()}]}]},
  2026:{mesocycles:[
   {id:'other',name:'Altra scheda',weeks:[{weekNumber:1,days:days()}]},
   {id:'current',name:'Programma attivo',weeks:[{weekNumber:3,days:days()}]}
  ]}
 }}
});
async function open(page,data){
 await page.route('**/*',r=>r.request().url().startsWith('http://127.0.0.1:4173')?r.continue():r.abort());
 await page.route('**/js/config.js',r=>r.fulfill({contentType:'application/javascript',body:`export const CONFIG={STORAGE_KEY:'workoutApp_data',APP_VERSION:'resume-test'};export const supabase={auth:{getUser:async()=>({data:{user:null}}),getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},from(){throw Error('Production forbidden');}};`}));
 await page.addInitScript(()=>localStorage.setItem('dev_banner_closed','true'));
 await page.goto('/index.html');
 await expect(page.locator('#open-tools-btn')).toBeAttached();
 await page.evaluate(async data=>{
  const {state}=await import('/js/state.js'),{saveAndSync}=await import('/js/storage.js');
  state.currentUser=null;state.workoutData=data;state.currentYear='2025';state.activeMesocycleIndex=0;state.activeWeek=1;state.activeDay=1;
  await saveAndSync(data);
  (await import('/js/ui.js')).renderWorkoutList();document.getElementById('auth-overlay').style.display='none';
 },data);
}
test('one tap returns from history/analysis to the paused day across dates, preserving sets and pause',async({page},info)=>{
 const data=fixture(),d=data.history.years[2026].mesocycles[1].weeks[0].days[3];
 d.isPaused=true;d.accumulatedSeconds=900;d.date='2026-11-01';
 d.exercises[0].loggedSets=[{weight:50,reps:8,rpe:8,isLocked:true},{}];
 await open(page,data);
 await expect(page.locator('#resume-training-btn')).toHaveText('Riprendi D – settimana 3');
 await page.evaluate(()=>window.scrollTo(0,document.body.scrollHeight));
 await expect(page.locator('.app-header-container')).toHaveClass(/header-scroll-hidden/);
 await page.evaluate(()=>window.scrollBy(0,-200));
 await expect(page.locator('.app-header-container')).not.toHaveClass(/header-scroll-hidden/);
 await expect(page.locator('#resume-training-btn')).toBeInViewport();
 await page.locator('#review-close-meso-btn').click();
 await expect(page.locator('#mesocycle-analysis-view')).toBeVisible();
 await page.locator('#resume-training-btn').click();
 expect(await page.evaluate(async()=>{const {state}=await import('/js/state.js');const d=state.workoutData.history.years[2026].mesocycles[1].weeks[0].days[3];return {year:state.currentYear,meso:state.activeMesocycleIndex,week:state.activeWeek,day:state.activeDay,paused:d.isPaused,seconds:d.accumulatedSeconds,start:d.sessionStart??null,weight:d.exercises[0].loggedSets[0].weight,locked:d.exercises[0].loggedSets[0].isLocked};})).toEqual({year:'2026',meso:1,week:3,day:4,paused:true,seconds:900,start:null,weight:50,locked:true});
 await expect(page.locator('#pause-session-timer-btn')).toContainText('Riprendi');
 await page.setViewportSize({width:320,height:740});
 await expect(page.locator('#resume-training-btn')).toBeInViewport();
 await page.screenshot({path:info.outputPath('resume-mobile.png')});
 await page.reload();
 await expect(page.locator('#resume-training-btn')).toHaveText('Riprendi D – settimana 3');
});
test('untouched day shows Inizia, starting/pausing persists Riprendi, completion advances to next day',async({page})=>{
 await open(page,fixture());
 await expect(page.locator('#resume-training-btn')).toHaveText('Inizia A – settimana 3');
 await page.locator('#resume-training-btn').click();
 await page.locator('#start-workout-session').click();
 await expect(page.locator('#resume-training-btn')).toHaveText('Riprendi A – settimana 3');
 await page.locator('#pause-session-timer-btn').click();
 await page.reload();
 await expect(page.locator('#resume-training-btn')).toHaveText('Riprendi A – settimana 3');
 await page.evaluate(async()=>{
  const {state}=await import('/js/state.js');const d=state.workoutData.history.years[2026].mesocycles[1].weeks[0].days[0];
  d.exercises[0].loggedSets=[0,1].map(()=>({weight:50,reps:8,rpe:8,isLocked:true}));
  (await import('/js/ui.js')).renderWorkoutList();
 });
 await expect(page.locator('#resume-training-btn')).toHaveText('Inizia B – settimana 3');
});
test('explicit programme selection is retained when browsing other plans and after reload',async({page})=>{
 await open(page,fixture());
 await page.evaluate(async()=>{const {state}=await import('/js/state.js');state.currentYear='2026';state.activeMesocycleIndex=0;(await import('/js/ui.js')).renderWorkoutList();});
 await page.locator('#use-training-plan-btn').click();
 await expect(page.locator('#resume-training-btn')).toHaveText('Inizia A – settimana 1');
 await page.evaluate(async()=>{const {state}=await import('/js/state.js');state.activeMesocycleIndex=1;state.activeWeek=3;(await import('/js/ui.js')).renderWorkoutList();});
 await expect(page.locator('#resume-training-btn')).toHaveText('Inizia A – settimana 1');
 await page.reload();
 await expect(page.locator('#resume-training-btn')).toHaveText('Inizia A – settimana 1');
});
