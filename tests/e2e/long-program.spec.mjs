import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';

test('26-week programme: import/CSV round trip, session sequence, AI download and durable reload',async({page},testInfo)=>{
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/*',route=>route.request().url().startsWith('http://127.0.0.1:4173')?route.continue():route.abort());
 await page.route('**/js/config.js',route=>route.fulfill({contentType:'application/javascript',body:`
 export const CONFIG={STORAGE_KEY:'workoutApp_data',APP_VERSION:'isolated'};
 export const supabase={auth:{getUser:async()=>({data:{user:null}}),getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},from(){throw Error('Remote access forbidden');}};`}));
 await page.addInitScript(()=>{localStorage.setItem('dev_banner_closed','true');});
 await page.goto('/index.html');
 await expect(page.locator('#open-tools-btn')).toBeAttached();
 const result=await page.evaluate(async()=>{
  const {state}=await import('/js/state.js');
  const {MyCoatch}=await import('/mycoatch/index.js');
  const {importWorkoutPlan}=await import('/js/csvHandler.js');
  const {renderWorkoutList}=await import('/js/ui.js');
  const {flushJournalStorage}=await import('/js/journalStore.js');
  state.currentYear=2026;state.currentUser=null;state.workoutData={history:{years:{2026:{mesocycles:[]}}}};
  window.confirm=()=>true;
  const p=MyCoatch.generateNextFromHistory({},{durationWeeks:6,programWeeks:26,daysPerWeek:4,maxSessionMinutes:60,deloadWeek:false});
  const csv=MyCoatch.exportAsCSV();
  const imported=await importWorkoutPlan(csv,{generatedPlan:p});
  const first=state.workoutData.history.years[2026].mesocycles[0];
  const before=JSON.stringify(state.workoutData);
  const invalid=await importWorkoutPlan(csv.replace(';26;6',';24;6'));
  const unchanged=JSON.stringify(state.workoutData)===before;
  const second=await importWorkoutPlan(csv);
  const plan=state.workoutData.history.years[2026].mesocycles[1];
  for(const day of plan.weeks[0].days.slice(0,3))for(const ex of day.exercises)
   ex.loggedSets=ex.sets.map(()=>({weight:'20',reps:'8',rpe:'8',isLocked:true,performedAt:'2026-01-01'}));
  await (await import('/js/storage.js')).saveAndSync(state.workoutData);
  await flushJournalStorage();renderWorkoutList();
  document.getElementById('auth-overlay').style.display='none';
  return {imported:imported.success,second:second.success,invalid:invalid.success,unchanged,
   firstWeeks:first.weeks.length,firstReport:first.coachReport===undefined,blocks:plan.program.blocks.length,lastLocalWeek:plan.weeks.at(-1).weekInMesocycle};
 });
 expect(result).toEqual({imported:true,second:true,invalid:false,unchanged:true,firstWeeks:26,firstReport:true,blocks:5,lastLocalWeek:2});
 await expect(page.locator('#resume-training-btn')).toHaveText(/Inizia Lower B.* – settimana 1/);
 await page.locator('#resume-training-btn').click();
 expect(await page.evaluate(async()=>{const {state}=await import('/js/state.js');return [state.activeWeek,state.activeDay];})).toEqual([1,4]);
 await page.screenshot({path:testInfo.outputPath('long-program.png'),fullPage:false});
 const download=page.waitForEvent('download');
 await page.evaluate(async()=>{
  const {state}=await import('/js/state.js');const {createMesocycleClosurePanel}=await import('/js/mesocycleClosureUI.js');
  const panel=createMesocycleClosurePanel(state.workoutData.history.years[2026].mesocycles[1],state.workoutData);
  document.body.append(panel);[...panel.querySelectorAll('button')].find(b=>b.textContent==='File AI con prompt e solo programma').click();
 });
 const file=await download,text=await readFile(await file.path(),'utf8');
 expect(text).toContain('Prompt da seguire');expect(text).toContain('homegym-ai-exchange');expect(text).not.toContain('"observedSets":');
 await page.reload();
 await expect(page.locator('#resume-training-btn')).toHaveText(/Inizia Lower B.* – settimana 1/);
 expect(await page.evaluate(async()=>{
  const {getFromLocalStorage}=await import('/js/storage.js');
  return getFromLocalStorage().history.years[2026].mesocycles[1].program.totalWeeks;
 })).toBe(26);
 expect(errors).toEqual([]);
});
