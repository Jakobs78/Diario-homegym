import {test,expect} from '@playwright/test';
const done=(weight,reps=10,rpe=8)=>({weight,reps,rpe,isLocked:true,completed:true});
const lift=(name='Panca Piana con Bilanciere',logs=[{},{},{}])=>({name,set:'3 set',setsCount:3,reps:'8-10',rpe:8,targetRpe:8,kgMin:0,kgMax:0,rest:'120s',sets:[{},{},{}],loggedSets:logs});
async function open(page,{name='Panca Piana con Bilanciere',ballast=50}={}){
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>r.request().url().startsWith('http://127.0.0.1:4173')?r.continue():r.abort());
 await page.route('**/js/config.js',r=>r.fulfill({contentType:'application/javascript',body:`export const CONFIG={STORAGE_KEY:'workoutApp_data',APP_VERSION:'isolated-ballast'};export const supabase={auth:{getUser:async()=>({data:{user:null}}),getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},from(){throw Error('Remote forbidden');}};`}));
 await page.addInitScript(()=>localStorage.setItem('dev_banner_closed','true'));await page.goto('/index.html');await expect(page.locator('#open-tools-btn')).toBeAttached();
 await page.evaluate(async({old,current})=>{
  const {state}=await import('/js/state.js');state.currentUser=null;state.currentYear=2026;state.activeWeek=2;state.activeDay=1;state.activeMesocycleIndex=0;
  state.workoutData={athlete:{loadingSteps:{bodyweight:1},userDefaults:{userAge:49,equipmentConfigured:true}},history:{years:{2026:{mesocycles:[{id:'ballast-test',weeks:[{weekNumber:1,days:[{dayNumber:1,date:'2026-11-01',exercises:[old]}]},{weekNumber:2,days:[{dayNumber:1,exercises:[current]}]}]}]}}}};
  for(const [k,v] of Object.entries({year:'2026',meso:'0',week:'2',day:'1'}))localStorage.setItem('ui_active_'+k,v);
  await(await import('/js/storage.js')).saveAndSync(state.workoutData);(await import('/js/ui.js')).renderWorkoutList();document.getElementById('auth-overlay').style.display='none';
 },{old:lift(name,[done(ballast),done(ballast),done(ballast)]),current:lift(name)});
 return errors;
}
test('last-session tint differs from the card in light and dark themes, below warmup',async({page},info)=>{
 const errors=await open(page);await page.setViewportSize({width:390,height:844});
 const card=page.locator('.ex-card'),history=card.locator('.exercise-history-box');
 const order=await history.evaluate(h=>h.previousElementSibling.classList.contains('exercise-warmups'));expect(order).toBe(true);
 for(const dark of [false,true]){
  await page.evaluate(d=>document.body.classList.toggle('dark-mode',d),dark);
  const colors=await card.evaluate(c=>[getComputedStyle(c).backgroundColor,getComputedStyle(c.querySelector('.exercise-history-box')).backgroundColor]);expect(colors[0]).not.toBe(colors[1]);
  await card.locator('.exercise-warmups > summary').click();await history.scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath(dark?'history-dark.png':'history-light.png')});
 }
 expect(errors).toEqual([]);
});
test('warmup closes only after its last valid confirmation and stays closed across work confirmation and reload',async({page})=>{
 const errors=await open(page),panel=page.locator('.exercise-warmups');
 const count=await panel.locator('.warmup-check').count();expect(count).toBeGreaterThan(1);
 for(let i=0;i<count;i++){
  if(!await panel.locator('.warmup-weight').nth(i).inputValue())await panel.locator('.warmup-weight').nth(i).fill('20');
  await panel.locator('.warmup-check').nth(i).check();
  if(i<count-1)await expect(panel).toHaveAttribute('open','');
 }
 await expect(panel).not.toHaveAttribute('open','');
 await page.locator('.set-lock-check').first().check();await expect(panel).not.toHaveAttribute('open','');
 await page.evaluate(async()=>{await(await import('/js/journalStore.js')).flushJournalStorage();});await page.reload();await page.evaluate(()=>document.getElementById('auth-overlay').style.display='none');
 await expect(panel).not.toHaveAttribute('open','');await panel.locator('summary').click();await expect(panel.locator('.warmup-check:checked')).toHaveCount(count);expect(errors).toEqual([]);
});
test('skip closes and remembers warmup; restoring explicitly reopens it',async({page})=>{
 const errors=await open(page),panel=page.locator('.exercise-warmups');
 await panel.getByRole('button',{name:'Salta avvicinamento',exact:true}).click();await expect(panel).not.toHaveAttribute('open','');
 await page.evaluate(async()=>{await(await import('/js/journalStore.js')).flushJournalStorage();});await page.reload();await page.evaluate(()=>document.getElementById('auth-overlay').style.display='none');
 await expect(panel).not.toHaveAttribute('open','');await panel.locator('summary').click();await panel.getByRole('button',{name:'Ripristina avvicinamento',exact:true}).click();await expect(panel).toHaveAttribute('open','');expect(errors).toEqual([]);
});
test('zero-load completion invites ballast, and the actual chosen ballast fills remaining sets',async({page})=>{
 const errors=await open(page,{name:'Trazioni alla Sbarra (Pull-up)',ballast:0});
 await expect(page.locator('.coach-adaptive-notes')).toContainText('Puoi introdurre una zavorra');await expect(page.locator('.set-kg').first()).toHaveValue('0');
 await page.locator('.set-kg').first().fill('5');await page.locator('.set-reps').first().fill('8');await page.locator('.set-lock-check').first().check();
 await expect(page.locator('.set-kg').nth(1)).toHaveValue('5');await expect(page.locator('.target-box')).toContainText('Zavorra proposta: 5 kg');expect(errors).toEqual([]);
});
test('ballast increment is saved and drives future suggestions without changing actual history',async({page})=>{
 const errors=await open(page,{name:'Trazioni alla Sbarra (Pull-up)',ballast:5});
 await expect(page.locator('.set-kg').first()).toHaveValue('6');await expect(page.locator('.coach-adaptive-notes')).toContainText('Ho aumentato la zavorra');
 await page.locator('#open-tools-btn').click();const equipment=page.locator('.equipment-settings');await equipment.locator('summary').click();
 await expect(page.locator('#equipment-step-bodyweight')).toHaveValue('1');await page.locator('#equipment-step-bodyweight').fill('2.5');
 await page.locator('#homegym-equipment-form .equipment-plate-pairs').evaluateAll(fields=>fields.forEach(field=>{if(!field.value)field.value='0';}));
 await page.locator('#homegym-equipment-form').evaluate(f=>f.requestSubmit());await expect(page.locator('#homegym-equipment-status')).toContainText('salvat');
 await page.locator('#close-tools-btn').click();
 await page.evaluate(async()=>{(await import('/js/ui.js')).renderWorkoutList();});await expect(page.locator('.set-kg').first()).toHaveValue('7.5');
 const actual=await page.evaluate(async()=>{const {state}=await import('/js/state.js');return {step:state.workoutData.athlete.loadingSteps.bodyweight,old:state.workoutData.history.years[2026].mesocycles[0].weeks[0].days[0].exercises[0].loggedSets.map(s=>s.weight)};});expect(actual).toEqual({step:2.5,old:[5,5,5]});expect(errors).toEqual([]);
});
test('legacy SUPERSERIE tags and current wording still import as paired exercises',async({page})=>{
 const errors=await open(page);
 const result=await page.evaluate(async()=>{
  const {state}=await import('/js/state.js'),{importWorkoutPlan}=await import('/js/csvHandler.js');
  const results=[];
  for(const note of ['[SUPERSERIE] superset: esegui con il prossimo esercizio.','Superserie con curl: 90 s dopo la coppia.']){
   state.workoutData={history:{years:{2026:{mesocycles:[]}}}};state.activeMesocycleIndex=0;
   const csv='Settimana;Giorno;Blocco;Esercizio;Set;Reps;RPE;Recupero;Note\n1;1;1;Alzate Laterali con Manubri;2;12-20;8;90s;'+note+'\n1;1;2;Curl Manubri su Panca Inclinata;2;10-15;8;90s;Panca 45°.\n';
   const imported=await importWorkoutPlan(csv),es=state.workoutData.history.years[2026].mesocycles[0].weeks[0].days[0].exercises;
   results.push({ok:imported.success,types:es.map(e=>e.groupType),same:es[0].groupBase===es[1].groupBase,last:es.map(e=>e.isGroupLast)});
  }
  return results;
 });
 expect(result).toEqual([1,2].map(()=>({ok:true,types:['superset','superset'],same:true,last:[false,true]})));expect(errors).toEqual([]);
});
