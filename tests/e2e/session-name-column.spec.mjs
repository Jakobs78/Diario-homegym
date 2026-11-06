import {test,expect} from '@playwright/test';
test('dedicated session names, legacy compatibility, export and atomic conflict rejection',async({page})=>{
 await page.route('**/*',r=>r.request().url().startsWith('http://127.0.0.1:4173')?r.continue():r.abort());
 await page.route('**/js/config.js',r=>r.fulfill({contentType:'application/javascript',body:`export const CONFIG={STORAGE_KEY:'workoutApp_data',APP_VERSION:'isolated'};export const supabase={auth:{getUser:async()=>({data:{user:null}}),getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},from(){throw Error('Remote access forbidden');}};`}));
 await page.goto('/index.html');
 await expect(page.locator('#open-tools-btn')).toBeAttached();
 const result=await page.evaluate(async()=>{
  const {state}=await import('/js/state.js');const {importWorkoutPlan,parseCSV}=await import('/js/csvHandler.js');const {MyCoatch}=await import('/mycoatch/index.js');
  state.currentYear=2026;state.currentUser=null;window.confirm=()=>true;
  const reset=()=>{state.workoutData={history:{years:{2026:{mesocycles:[]}}}};state.activeMesocycleIndex=0;};reset();
  reset();const head='Settimana;Giorno;Blocco;Esercizio;Set;Reps;RPE;Recupero;Note;NomeSeduta\n';
  const row=(b,name)=>`1;1;${b};Curl con Bilanciere EZ;2;8-12;8;90s;[SPLIT MYCOATCH] Upper A;${name}\n`;
  const start=await importWorkoutPlan(head+row(1,'Braccia personalizzate')+row(2,''));if(!start.success)throw Error('custom: '+start.error);
  const custom=state.workoutData.history.years[2026].mesocycles[0].weeks[0].days[0].dayName;
  const before=JSON.stringify(state.workoutData);const bad=await importWorkoutPlan(head+row(1,'Upper A')+row(2,'Upper B'));const atomic=JSON.stringify(state.workoutData)===before;
  reset();const old=await importWorkoutPlan(head.replace(';NomeSeduta','')+row(1,'').replace(/;\n$/,'\n'));if(!old.success)throw Error('legacy: '+old.error);const legacy=state.workoutData.history.years[2026].mesocycles[0].weeks[0].days[0].dayName;
  MyCoatch.generateNextFromHistory({},{durationWeeks:6,daysPerWeek:4,maxSessionMinutes:60,deloadWeek:false});const exported=MyCoatch.exportAsCSV();reset();const rt=await importWorkoutPlan(exported);if(!rt.success)throw Error('roundtrip: '+rt.error);
  return {custom,rejected:!bad.success,atomic,legacy,exportColumn:exported.split('\n')[0].includes(';NomeSeduta'),clean:!exported.includes('[SPLIT MYCOATCH]'),roundTrip:rt.success,exportNames:state.workoutData.history.years[2026].mesocycles[0].weeks[0].days.map(d=>d.dayName.split(' (')[0])};
 });
 expect(result).toEqual({custom:'Braccia personalizzate',rejected:true,atomic:true,legacy:'Upper A',exportColumn:true,clean:true,roundTrip:true,exportNames:['Upper A','Lower A','Upper B','Lower B']});
});
