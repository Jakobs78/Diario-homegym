import {test,expect} from '@playwright/test';
const performed=(reps=10,rpe=9)=>({weight:50,reps,rpe,isLocked:true,completed:true});
const exercise=logs=>({name:'Panca Piana con Bilanciere',set:'3 set',setsCount:3,reps:'8-10',targetRpe:8,rpe:8,rest:'120s',sets:[{},{},{}],loggedSets:logs});
async function open(page,rpe=9){
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>r.request().url().startsWith('http://127.0.0.1:4173')?r.continue():r.abort());
 await page.route('**/js/config.js',r=>r.fulfill({contentType:'application/javascript',body:`export const CONFIG={STORAGE_KEY:'workoutApp_data',APP_VERSION:'rpe-pulley-test'};export const supabase={auth:{getUser:async()=>({data:{user:null}}),getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},from(){throw Error('Remote forbidden');}};`}));
 await page.addInitScript(()=>localStorage.setItem('dev_banner_closed','true'));await page.goto('/index.html');await expect(page.locator('#open-tools-btn')).toBeAttached();
 await page.evaluate(async({old,next})=>{
  const {state}=await import('/js/state.js');state.currentUser=null;state.currentYear=2026;state.activeWeek=2;state.activeDay=1;state.activeMesocycleIndex=0;
  state.workoutData={athlete:{userDefaults:{userAge:49,equipmentConfigured:true}},history:{years:{2026:{mesocycles:[{weeks:[{weekNumber:1,days:[{dayNumber:1,exercises:[old]}]},{weekNumber:2,days:[{dayNumber:1,isPaused:true,accumulatedSeconds:1000,exercises:[next]}]}]}]}}}};
  (await import('/js/ui.js')).renderWorkoutList();document.getElementById('auth-overlay').style.display='none';
 },{old:exercise([performed(10,rpe),performed(10,rpe),performed(10,rpe)]),next:exercise([{},{},{}])});
 return errors;
}
for(const rpe of [7,8])test('RPE '+rpe+': increase reason comes first and only action is bold',async({page})=>{
 const errors=await open(page,rpe),notes=page.locator('.coach-adaptive-notes');
 expect(Number(await page.locator('.set-kg').first().inputValue())).toBeGreaterThan(50);
 await expect(notes).toContainText('Visto che hai raggiunto il massimo delle ripetizioni');
 await expect(notes.locator('strong').first()).toHaveText(/^Ho aumentato il carico alle serie 1, 2, 3: .* kg × 8 reps\.$/);
 const lead=await notes.locator('p').first().evaluate(p=>p.firstChild.textContent);expect(lead).toMatch(/^Visto che/);
 expect(errors).toEqual([]);
});
test('hard previous sets propose 9 reps, manual edit survives, live confirmation adapts remaining work',async({page},info)=>{
 const errors=await open(page);await page.setViewportSize({width:390,height:844});
 const card=page.locator('.ex-card'),notes=card.locator('.coach-adaptive-notes');
 await expect(card.locator('.set-kg').first()).toHaveValue('50');await expect(card.locator('.set-reps').first()).toHaveValue('9');
 await expect(notes).toContainText('Mantieni il carico');await expect(notes).not.toContainText('Ho ridotto il carico');
 await card.locator('.set-reps').first().fill('10');await card.locator('.set-rpe').first().fill('9');
 await card.locator('.set-lock-check').first().check();
 await expect(card.locator('.set-kg').nth(1)).toHaveValue('50');await expect(card.locator('.set-reps').nth(1)).toHaveValue('9');
 await expect(notes).toContainText('La serie appena conclusa');
 await expect(notes).not.toContainText('Se la tecnica lo richiede');
 await card.locator('.set-reps').nth(1).fill('8');await card.locator('.set-rpe').nth(1).fill('9');await card.locator('.set-lock-check').nth(1).check();
 expect(Number(await card.locator('.set-kg').nth(2).inputValue())).toBeLessThan(50);
 await expect(notes).toContainText('Ho ridotto il carico');
 await expect(notes).not.toContainText('Se la tecnica lo richiede');
 const actual=await page.evaluate(async()=>{const {state}=await import('/js/state.js');return state.workoutData.history.years[2026].mesocycles[0].weeks[1].days[0].exercises[0].loggedSets.slice(0,2).map(s=>[s.weight,s.reps,s.rpe]);});
 expect(actual).toEqual([[50,'10',9],[50,'8',9]]);
 await notes.scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath('rpe-correction-mobile.png')});expect(errors).toEqual([]);
});
test('U-bar is recognized on CSV import, remains separate from triangle and appears in equipment choices',async({page})=>{
 const errors=await open(page);
 const result=await page.evaluate(async()=>{
  const {state}=await import('/js/state.js'),{importWorkoutPlan}=await import('/js/csvHandler.js');
  state.workoutData={history:{years:{2026:{mesocycles:[]}}}};state.activeMesocycleIndex=0;
  const csv='Settimana;Giorno;NomeSeduta;Blocco;Esercizio;Set;Reps;RPE;Recupero;Note\n1;1;Upper A;1;Pulley Basso con Triangolo;3;8-12;8;120s;Busto stabile.\n2;1;Upper A;1;Pulley Basso con Barra a U;3;8-12;8;120s;Presa neutra.\n';
  const imported=await importWorkoutPlan(csv),{catalogExercise}=await import('/mycoatch/catalogLookup.js');
  const exercises=state.workoutData.history.years[2026].mesocycles[0].weeks.map(w=>w.days[0].exercises[0]);
  (await import('/js/userDefaultsUI.js')).openUserDefaults();
  return {success:imported.success,ids:exercises.map(e=>catalogExercise(e)?.id)};
 });
 expect(result).toEqual({success:true,ids:['pulley_basso_con_triangolo','pulley_basso_con_barra_a_u']});
 await expect(page.locator('#user-defaults-dialog')).toContainText('Barra a U per cavo');expect(errors).toEqual([]);
});
