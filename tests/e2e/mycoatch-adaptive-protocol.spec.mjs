import {test,expect} from '@playwright/test';
const origin='http://127.0.0.1:4173';
const done=()=>({weight:'80',reps:'12',rpe:'8',isLocked:true,completed:true});
const exercise=complete=>({name:'Panca Piana con Bilanciere',block:'1',set:'3 set',reps:'8-12',targetRpe:'8',rpe:'8',kgMin:'70',kgMax:'70',rest:'180s',notes:'Nota originale',userNotes:'Nota personale',sets:[{},{},{}],loggedSets:complete?[done(),done(),done()]:[{},{},{}]});
const seed={athlete:{},history:{years:{2026:{mesocycles:[{name:'Protocollo sintetico',locked:false,weeks:[1,2,3].map(n=>({weekNumber:n,days:[{dayNumber:1,dayName:'Upper A',exercises:[exercise(n===1)]}]}))}]}}}};
const config=`export const CONFIG={STORAGE_KEY:'workoutApp_data',APP_VERSION:'adaptive-test'};
export const supabase={auth:{async getUser(){return {data:{user:null}}},async getSession(){return {data:{session:null}}},onAuthStateChange(){return {data:{subscription:{unsubscribe(){}}}}}},from(){throw Error('No production data allowed')}};`;
async function open(page){
 await page.route('**/*',route=>route.request().url().startsWith(origin)?route.continue():route.abort());
 await page.route('**/js/config.js',route=>route.fulfill({contentType:'application/javascript',body:config}));
 await page.addInitScript(seed=>{
  if(!localStorage.getItem('homegym-journal-v2-ready'))localStorage.setItem('workoutApp_data',JSON.stringify(seed));
  localStorage.setItem('dev_banner_closed','true');localStorage.setItem('ui_active_year','2026');
 },seed);
 await page.goto('/index.html');
 await expect(page.locator('#meso-display')).toHaveText('1');
 await page.evaluate(()=>{document.querySelector('#auth-overlay')?.remove()});
 await page.getByRole('combobox',{name:'Seleziona settimana',exact:true}).selectOption('2');
 await expect(page.locator('.set-kg').first()).toHaveValue('82');
}
test('automatic next-exposure proposal persists offline and reload never adds a second increase',async({page,context})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await open(page);
 await expect(page.locator('.coach-adaptive-notes')).toContainText('Tutte le serie');
 await expect(page.locator('.set-reps').first()).toHaveValue('8');
 await expect(page.locator('.set-lock-check').first()).not.toBeChecked();
 await context.setOffline(true);
 await page.evaluate(async()=>{
  const {state}=await import('/js/state.js');const {saveAndSync}=await import('/js/storage.js');
  await saveAndSync(state.workoutData,'PROTOCOL_OFFLINE_TEST');
 });
 await context.setOffline(false);await page.reload();
 await expect(page.locator('.set-kg').first()).toHaveValue('82');
 const result=await page.evaluate(async()=>{
  const {state}=await import('/js/state.js');const m=state.workoutData.history.years[2026].mesocycles[0];
  return {source:m.weeks[0].days[0].exercises[0].loggedSets[0].weight,
   future:m.weeks[2].days[0].exercises[0].coachSetProposals[0].weight,
   original:m.weeks[1].days[0].exercises[0].kgMin};
 });
 expect(result).toEqual({source:'80',future:80,original:'70'});expect(errors).toEqual([]);
});
test('manual draft remains intact when corrected source changes the future recommendation',async({page})=>{
 await open(page);await page.locator('.set-kg').first().fill('77');
 await page.evaluate(async()=>{
  const {state}=await import('/js/state.js');const {saveAndSync}=await import('/js/storage.js');
  state.workoutData.history.years[2026].mesocycles[0].weeks[0].days[0].exercises[0].loggedSets[2].reps='10';
  await saveAndSync(state.workoutData,'PROTOCOL_CORRECTION_TEST');
  const {renderWorkoutList}=await import('/js/ui.js');renderWorkoutList();
 });
 await expect(page.locator('.set-kg').first()).toHaveValue('77');
 await expect(page.locator('.ex-user-notes').first()).toHaveValue('Nota personale');
 await expect(page.locator('.note-allenatore-text').first()).toContainText('Nota originale');
 const result=await page.evaluate(async()=>{
  const {state}=await import('/js/state.js');return state.workoutData.history.years[2026].mesocycles[0].weeks[1].days[0].exercises[0].coachSetProposals[0].weight;
 });
 expect(result).toBe(80);
});

test('CSV mixed series preserve independent kg reps and RPE targets without creating results',async({page})=>{
 await open(page);page.on('dialog',dialog=>dialog.accept());
 const csv='Settimana;Giorno;Blocco;Esercizio;Set;Reps;KgMin;KgMax;RPE;Recupero;Note;Topset;RepsPerSerie;RPEPerSerie;KgMinPerSerie;KgMaxPerSerie\n1;1;1;Panca Piana con Bilanciere;3;6-8;;;8;180s;Schema misto;;3/6-8/6-8;8/8/8;100/80/80;105/85/85';
 await page.evaluate(async csv=>{const {importWorkoutPlan}=await import('/js/csvHandler.js');window.mixedSeriesImport=importWorkoutPlan(csv,{review:true});},csv);
 await expect(page.locator('.import-series-targets')).toContainText('Serie 1: 3 reps');
 await page.getByRole('button',{name:'Conferma importazione',exact:true}).click();
 const result=await page.evaluate(async()=>{
  const outcome=await window.mixedSeriesImport;
  const {state}=await import('/js/state.js');const ex=state.workoutData.history.years[2026].mesocycles.at(-1).weeks[0].days[0].exercises[0];
  return {success:outcome.success,targets:ex.sets.map(s=>({reps:s.targetReps,rpe:s.targetRpe,min:s.kgMin,max:s.kgMax})),actual:ex.loggedSets.map(s=>({weight:s.weight,confirmed:s.isLocked}))};
 });
 expect(result.success).toBe(true);
 expect(result.targets).toEqual([{reps:'3',rpe:'8',min:'100',max:'105'},{reps:'6-8',rpe:'8',min:'80',max:'85'},{reps:'6-8',rpe:'8',min:'80',max:'85'}]);
 expect(result.actual).toEqual([{weight:'',confirmed:false},{weight:'',confirmed:false},{weight:'',confirmed:false}]);
});

test('starting and navigating a session keeps its already suggested load without updating every week',async({page})=>{
 await open(page);await page.getByRole('button',{name:'Inizia seduta',exact:true}).click();
 await expect(page.locator('.set-kg').first()).toHaveValue('82');
 await page.getByRole('combobox',{name:'Seleziona settimana',exact:true}).selectOption('3');
 await expect(page.locator('.set-kg').first()).toHaveValue('80');
 await page.getByRole('combobox',{name:'Seleziona settimana',exact:true}).selectOption('2');
 await expect(page.locator('.set-kg').first()).toHaveValue('82');
});
