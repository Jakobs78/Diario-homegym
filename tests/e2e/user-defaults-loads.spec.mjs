import {test,expect} from '@playwright/test';
async function open(page){
 await page.route('**/*',r=>r.request().url().startsWith('http://127.0.0.1:4173')?r.continue():r.abort());
 await page.route('**/js/config.js',r=>r.fulfill({contentType:'application/javascript',body:`export const CONFIG={STORAGE_KEY:'workoutApp_data',APP_VERSION:'isolated'};export const supabase={auth:{getUser:async()=>({data:{user:null}}),getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},from(){throw Error('Remote forbidden');}};`}));
 await page.addInitScript(()=>localStorage.setItem('dev_banner_closed','true'));await page.goto('/index.html');await expect(page.locator('#open-tools-btn')).toBeAttached();
 await page.evaluate(()=>document.getElementById('auth-overlay').style.display='none');
}
test('first-use request saves editable per-user defaults and retains the existing inventory',async({page},info)=>{
 await open(page);
 await page.evaluate(async()=>{const {state}=await import('/js/state.js');state.workoutData={history:{years:{}},athlete:{ownedDumbbells:[{weight:20,quantity:2}]}};(await import('/js/ui.js')).renderWorkoutList();});
 await page.locator('#user-defaults-prompt button').click();const dialog=page.locator('#user-defaults-dialog');
 await dialog.locator('[name=userAge]').fill('49');
 await dialog.locator('[name=availableEquipment][value=dumbbell]').check();await dialog.locator('[name=availableAccessories][value=incline_bench]').check();await dialog.locator('[name=equipmentConfirmed]').check();
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:info.outputPath('personal-defaults-mobile.png')});
 await dialog.getByRole('button',{name:'Salva e configura pesi',exact:true}).click();await expect(dialog).toHaveCount(0);
 await expect(page.locator('.equipment-settings')).toHaveAttribute('open','');await expect(page.locator('.equipment-dumbbell-weight').first()).toHaveValue('20');await page.locator('#close-tools-btn').click();await expect(page.locator('#user-defaults-prompt')).toHaveCount(0);
 await page.evaluate(async()=>{(await import('/mycoatch/mycoatch-adapter.js')).startCoachChatAndGenerate();});
 await expect(page.locator('#input-age')).toHaveValue('49');await expect(page.locator('.mycoatch-base-equipment-check[value=dumbbell]')).toBeChecked();await expect(page.locator('.mycoatch-base-equipment-check[value=barbell]')).not.toBeChecked();
 await page.locator('#close-mycoatch-config').click();await page.reload();await page.evaluate(()=>document.getElementById('auth-overlay').style.display='none');
 await expect(page.locator('#user-defaults-prompt')).toHaveCount(0);
 const saved=await page.evaluate(async()=>{const {state}=await import('/js/state.js');return {age:state.workoutData.athlete.userDefaults.userAge,owned:state.workoutData.athlete.ownedDumbbells};});expect(saved).toEqual({age:49,owned:[{weight:20,quantity:2}]});
 await page.locator('#open-tools-btn').click();await page.locator('#edit-user-defaults').click();
 await page.locator('#user-defaults-dialog [name=userAge]').fill('50');await page.locator('#user-defaults-dialog').getByRole('button',{name:'Salva profilo',exact:true}).click();await expect(page.locator('#user-defaults-dialog')).toHaveCount(0);
 await page.evaluate(async()=>{(await import('/mycoatch/mycoatch-adapter.js')).startCoachChatAndGenerate();});await expect(page.locator('#input-age')).toHaveValue('50');
});
test('an unavailable target remains proposed; manual weight confirmation stays the user’s choice',async({page},info)=>{
 await open(page);await page.evaluate(async()=>{
  const {state}=await import('/js/state.js');const e={name:'Curl ai Cavi Bassi',reps:'10-12',rpe:8,recupero:'90s',set:'2 set',setsCount:2,sets:[{},{}],loggedSets:[{},{}]};const old=structuredClone(e);old.loggedSets=[1,2].map(()=>({weight:20,reps:12,rpe:8,isLocked:true}));
  state.currentYear=2026;state.activeWeek=2;state.activeDay=1;state.activeMesocycleIndex=0;state.workoutData={athlete:{loadingSteps:{machine:1},availableLoads:{machine:[20,24]},userDefaults:{userAge:49,equipmentConfigured:true}},history:{years:{2026:{mesocycles:[{id:'x',weeks:[{weekNumber:1,days:[{dayNumber:1,exercises:[old]}]},{weekNumber:2,days:[{dayNumber:1,exercises:[e]}]}]}]}}}};(await import('/js/ui.js')).renderWorkoutList();
 });
 const proposed=await page.locator('.set-kg').first().inputValue();expect(Number(proposed)).toBeGreaterThan(20);expect(Number(proposed)).toBeLessThan(24);await expect(page.locator('.target-box')).toContainText('Carico proposto: '+proposed.replace('.',',')+' kg');await expect(page.locator('.exercise-load-availability')).toContainText('non presente');
 await page.locator('.set-kg').first().fill('22');await page.locator('.set-lock-check').first().check();
 expect(await page.evaluate(async()=>{const {state}=await import('/js/state.js');return state.workoutData.history.years[2026].mesocycles[0].weeks[1].days[0].exercises[0].loggedSets[0].weight;})).toBe(22);
 await page.setViewportSize({width:390,height:844});await page.locator('.target-box').scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath('unavailable-target-mobile.png')});
});
test('switching user closes an open profile editor before it can save stale defaults',async({page})=>{
 await open(page);await page.locator('#user-defaults-prompt button').click();await page.locator('#user-defaults-dialog [name=userAge]').fill('49');
 await page.evaluate(async()=>{const {state}=await import('/js/state.js');state.currentUser={id:'different-user'};state.workoutData={athlete:{userDefaults:{userAge:60,equipmentConfigured:true}},history:{years:{}}};(await import('/js/ui.js')).renderWorkoutList();});
 await expect(page.locator('#user-defaults-dialog')).toHaveCount(0);
 expect(await page.evaluate(async()=>{const {state}=await import('/js/state.js');return state.workoutData.athlete.userDefaults.userAge;})).toBe(60);
});
