import {test,expect} from '@playwright/test';
async function open(page,{complete=true}={}){
 await page.route('**/*',r=>r.request().url().startsWith('http://127.0.0.1:4173')?r.continue():r.abort());
 await page.route('**/series-review-harness.html',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><span id="sync-status"></span><main id="workout-list-container"></main>'}));
 await page.goto('/series-review-harness.html');
 await page.evaluate(async complete=>{
  window.supabase={createClient:()=>({auth:{getUser:async()=>({data:{user:null}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},from(){throw Error('No remote writes');}})};window.jspdf={jsPDF:class{}};
  const j=await import('/js/journalStore.js');await j.initializeJournalStorage();
  const {state}=await import('/js/state.js');state.currentUser=null;state.currentYear=2026;state.activeMesocycleIndex=0;state.activeWeek=1;state.activeDay=1;
  const done=reps=>({weight:80,reps,rpe:8,isLocked:true,completed:true});
  state.workoutData={athlete:{},history:{years:{2026:{mesocycles:[{weeks:[{weekNumber:1,days:[{dayNumber:1,exercises:[{name:'Panca Piana con Bilanciere',set:'2 set',sets:[{},{}],reps:'6-8',rpe:8,rest:'90s',loggedSets:[done(8),complete?done(4):{weight:80,reps:4,rpe:8}]}]}]}]}]}}}};
  const {renderWorkoutList}=await import('/js/ui.js');renderWorkoutList();await j.flushJournalStorage();
 },complete);
}
test('a discrepancy opens a persistent per-series clarification only after completion; pain annotation preserves actual values',async({page})=>{
 await open(page);await expect(page.locator('.series-review')).toHaveAttribute('open','');
 await page.getByRole('combobox',{name:'Motivo serie 2',exact:true}).selectOption('pain');
 await expect(page.getByRole('combobox',{name:'Motivo serie 2',exact:true})).toHaveValue('pain');
 const result=await page.evaluate(async()=>{
  const {state}=await import('/js/state.js'),{observed}=await import('/mycoatch/setPrescription.js'),j=await import('/js/journalStore.js');await j.flushJournalStorage();
  const ex=state.workoutData.history.years[2026].mesocycles[0].weeks[0].days[0].exercises[0];
  return {kg:ex.loggedSets[1].weight,reps:ex.loggedSets[1].reps,confirmed:ex.loggedSets[1].completed,evidence:observed(ex,1),persisted:JSON.parse(j.journalStorage.getItem('workoutApp_data')).history.years[2026].mesocycles[0].weeks[0].days[0].exercises[0].loggedSets[1].coachReview.reason};
 });expect(result).toEqual({kg:80,reps:4,confirmed:true,evidence:null,persisted:'pain'});
});
test('a pending exercise does not ask prematurely; a completed question can be postponed without losing data',async({page})=>{
 await open(page,{complete:false});await expect(page.locator('.series-review')).not.toHaveAttribute('open','');
 await page.evaluate(async()=>{const {state}=await import('/js/state.js');state.workoutData.history.years[2026].mesocycles[0].weeks[0].days[0].exercises[0].loggedSets[1].completed=true;state.workoutData.history.years[2026].mesocycles[0].weeks[0].days[0].exercises[0].loggedSets[1].isLocked=true;(await import('/js/ui.js')).renderWorkoutList();});
 await expect(page.locator('.series-review')).toHaveAttribute('open','');await page.getByRole('button',{name:'Rispondo dopo',exact:true}).click();
 await expect(page.locator('.series-review')).not.toHaveAttribute('open','');
});
