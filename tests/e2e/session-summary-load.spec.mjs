import {test,expect} from '@playwright/test';
test('session-level muscles update on check; load summary matches proposals and manual entries',async({page},info)=>{
 await page.route('**/*',r=>r.request().url().startsWith('http://127.0.0.1:4173')?r.continue():r.abort());
 await page.route('**/js/config.js',r=>r.fulfill({contentType:'application/javascript',body:`export const CONFIG={STORAGE_KEY:'workoutApp_data',APP_VERSION:'isolated'};export const supabase={auth:{getUser:async()=>({data:{user:null}}),getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},from(){throw Error('Remote forbidden');}};`}));
 await page.addInitScript(()=>localStorage.setItem('dev_banner_closed','true'));
 await page.goto('/index.html');await expect(page.locator('#open-tools-btn')).toBeAttached();
 await page.evaluate(async()=>{
  const {state}=await import('/js/state.js');const {renderWorkoutList}=await import('/js/ui.js');
  state.currentYear=2026;state.currentUser=null;state.activeWeek=2;state.activeDay=1;state.activeMesocycleIndex=0;
  const exercise={name:'Curl ai Cavi Bassi',set:'2 set',setsCount:2,reps:'8-12',rpe:8,recupero:'90s',kgMin:'',kgMax:'',sets:[{},{}],loggedSets:[{},{}]};
  const previous=structuredClone(exercise);previous.loggedSets=[1,2].map(()=>({weight:'21',reps:'10',rpe:'8',isLocked:true}));
  state.workoutData={history:{years:{2026:{mesocycles:[{id:'test',name:'Test',weeks:[
   {weekNumber:1,days:[{dayNumber:1,dayName:'Upper A',exercises:[previous]}]},
   {weekNumber:2,days:[{dayNumber:1,dayName:'Upper A',exercises:[exercise]}]}
  ]}]}}}};
  document.getElementById('auth-overlay').style.display='none';renderWorkoutList();
 });
 const target=page.locator('.ex-card .target-box');
 await expect(page.locator('.set-kg').first()).toHaveValue('21');
 await expect(target).toContainText('Carico proposto: 21 kg');await expect(target).not.toContainText('Kg liberi');
 await expect(page.locator('.ex-card details summary',{hasText:'Muscoli coinvolti'})).toHaveCount(0);
 await page.locator('.mycoatch-live-disclosure > summary').click();await page.locator('.session-muscle-details > summary').click();
 await expect(page.locator('.session-muscle-details')).toContainText('0 serie confermate su 2 previste');
 await page.locator('.set-kg').nth(0).fill('22');await page.locator('.set-kg').nth(1).fill('22');
 await expect(target).toContainText('Carico impostato: 22 kg');
 await page.locator('.set-lock-check').first().check();
 await expect(page.locator('.session-muscle-details')).toHaveAttribute('open','');
 await expect(page.locator('.session-muscle-details')).toContainText('1 serie confermate su 2 previste');
 await expect(target).toContainText('22 kg');
 const unchanged=await page.evaluate(async()=>{const {state}=await import('/js/state.js');const e=state.workoutData.history.years[2026].mesocycles[0].weeks[1].days[0].exercises[0];return {kgMin:e.kgMin,kgMax:e.kgMax,checked:e.loggedSets.filter(s=>s.isLocked).length};});
 expect(unchanged).toEqual({kgMin:'',kgMax:'',checked:1});
 await page.setViewportSize({width:390,height:844});await page.locator('.session-muscle-details').scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath('session-muscles-mobile.png'),fullPage:false});
});
