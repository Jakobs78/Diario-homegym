import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const ORIGIN = 'http://127.0.0.1:4173';

const HEADER = 'Settimana;Giorno;Blocco;Esercizio;Set;Reps;KgMin;KgMax;RPE;Recupero;Note;Topset';

// Non usa dati del proprietario e non effettua alcuna richiesta a Supabase.
const sample = (kg, reps, rpe) => ({
  weight: String(kg), reps: String(reps), rpe: String(rpe), isLocked: true, completed: true
});
const week = (weekNumber, weight) => ({
  weekNumber,
  days: [{
    dayNumber: 1,
    dayName: 'Upper A',
    sessionCompletedAt: new Date(Date.now()-(3-weekNumber)*7*86400000).toISOString(),
    exercises: [{
      block: 1, name: 'Panca Piana con Bilanciere', set: '1 set',
      reps: '6-8', kgMin: String(weight), kgMax: String(weight),
      rpe: '@8', targetRpe: '@8', recupero: '180s',
      notes: 'Test sintetico', loggedSets: [sample(weight, 8, 8)]
    }]
  }]
});
const fixture = {
  athlete: { email: 'test-e2e@invalid.example' },
  history: { years: {
    2025: { mesocycles: [{ name: 'Primo mesociclo', weeks: [week(1, 70)] }] },
    2026: { mesocycles: [{
      name: 'Secondo mesociclo',
      weeks: [week(1, 72.5), week(2, 75), week(3, 77.5)]
    }] }
  }}
};

const offlineConfig = `
import {journalStorage} from './journalStore.js';
window.testJournal=journalStorage;
export const CONFIG = { STORAGE_KEY: 'workoutApp_data', APP_VERSION: 'e2e-isolated' };
export const supabase = {
  auth: {
    async getUser() { return { data: { user: null } }; },
    async getSession() { return { data: { session: null } }; },
    onAuthStateChange() {
      return { data: { subscription: { unsubscribe() {} } } };
    },
    async signOut() { return { error: null }; }
  },
  from() { throw new Error('E2E security violation: remote Supabase queried'); },
  functions: { invoke() { throw new Error('Unexpected function call'); } }
};
`;

async function openIsolatedApp(page) {
  const remoteRequests = [];
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('request', request => {
    if (request.url().includes('supabase.co')) remoteRequests.push(request.url());
  });
  await page.route('**/*', async route => {
    if (route.request().url().startsWith(ORIGIN)) return route.continue();
    return route.abort(); // Non contattare CDN, Supabase o la produzione.
  });
  await page.route('**/js/config.js', route =>
    route.fulfill({ status: 200, contentType: 'application/javascript', body: offlineConfig }));
  await page.addInitScript(seed => {
    // Il caricamento JS dell'app usa jsPDF anche senza effettuare esportazioni PDF.
    // Questa e' una dipendenza simulata, non si esegue alcuna funzione PDF.
    window.jspdf = { jsPDF: class OfflineFakePdf {} };
    localStorage.setItem('workoutApp_data', JSON.stringify(seed));
    localStorage.setItem('dev_banner_closed', 'true');
  }, fixture);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    const auth = document.getElementById('auth-overlay');
    if (auth) auth.style.display = 'none';
  });
  await expect(page.locator('#open-tools-btn')).toBeVisible();
  // Aspetta il rendering del mesociclo: certifica che main.js e gli event listener siano stati inizializzati.
  try {
    await expect(page.locator('#meso-display')).toHaveText('1', { timeout: 15000 });
  } catch (error) {
    const diagnostics = await page.evaluate(async () => {
      const raw = window.testJournal?.getItem('workoutApp_data');
      let currentState;
      try {
        const module = await import('/js/state.js');
        currentState = { activeYear: module.state.currentYear,
          workoutYears: Object.keys(module.state.workoutData?.history?.years || {}),
          currentUser: module.state.currentUser?.email || null };
      } catch (importError) { currentState = { error: String(importError) }; }
      return {
        localStorageBytes: raw?.length || 0,
        currentState,
        appText: document.getElementById('workout-list-container')?.textContent?.slice(0, 400),
        mainScript: Boolean(document.querySelector('script[src="js/main.js"]'))
      };
    });
    throw new Error('Browser initialization failure: ' +
      JSON.stringify({ diagnostics, pageErrors }, null, 2) + '\\n' + error.message);
  }
  assert.deepEqual(remoteRequests, []);
  return { remoteRequests, pageErrors };
}


async function setupPlan(page,kind){
 if(!page.url().includes('/index.html')){await openIsolatedApp(page);page.on('dialog',d=>d.accept());}
 await page.evaluate(async kind=>{
  const {state}=await import('/js/state.js');const {importWorkoutPlan}=await import('/js/csvHandler.js');const {renderWorkoutList}=await import('/js/ui.js');
  state.workoutData={athlete:{},history:{years:{}}};state.currentYear=String(new Date().getFullYear());
  const header='Settimana;Giorno;Blocco;Esercizio;Set;Reps;KgMin;KgMax;RPE;Recupero;Note;Topset';
  const names=kind==='drop'?['Alzate Laterali con Manubri','Calf Raise']:['Curl ai Cavi Bassi','Pushdown ai Cavi','Alzate Laterali con Manubri','Calf Raise'];
  const rows=names.map((name,i)=>`1;1;${i+1};${name};3;10-12;10;10;8;90s;"${i===0?(kind==='drop'?'[DROP_SET] Solo dopo l’ultima serie: riduci il carico di circa 20–25%, esegui altre ripetizioni pulite. Facoltativo.':'[TRISET] Esegui i prossimi tre esercizi in sequenza, poi recupera al termine del gruppo.'):''}";`);
  const result=importWorkoutPlan([header,...rows].join('\n'));if(!result.success)throw Error(result.error);
  renderWorkoutList();
 },kind);
}
async function confirmSet(page,ex,set=0){
 for(const [field,value] of [['kg','10'],['reps','12'],['rpe','8']])await page.locator(`.set-${field}[data-ex="${ex}"][data-set="${set}"]`).fill(value);
 await page.locator(`.set-lock-check[data-ex="${ex}"][data-set="${set}"]`).click();
}

test('circuito: recupero solo a giro completo, anche confermando C prima di A e B',async({page})=>{
 await setupPlan(page,'group');
 await expect(page.locator('.circuit-card')).toHaveCount(1);
 await expect(page.locator('.circuit-card .workout-set-row:visible')).toHaveCount(3);
 await confirmSet(page,2);await expect(page.locator('#floating-timer')).not.toHaveClass(/active/);
 await confirmSet(page,0);await expect(page.locator('#floating-timer')).not.toHaveClass(/active/);
 await confirmSet(page,1);await expect(page.locator('#floating-timer')).toHaveClass(/active/);
 await expect(page.locator('.circuit-rounds button[aria-pressed="true"]')).toHaveText('Giro 2');
 await page.locator('.circuit-rounds button').first().click();
 await expect(page.locator('.circuit-card .set-lock-check:visible').first()).toBeChecked();
});
test('giro futuro non confermabile prima del corrente',async({page})=>{
 await setupPlan(page,'group');await page.getByRole('button',{name:'Giro 2',exact:true}).click();
 await confirmSet(page,0,1);
 await expect(page.locator('.set-lock-check[data-ex="0"][data-set="1"]')).not.toBeChecked();
 await expect(page.locator('#floating-timer')).not.toHaveClass(/active/);
});
test('dropset: pause normali, scarichi reali, conferma unica e persistenza dopo ricaricamento',async({page})=>{
 await setupPlan(page,'drop');
 const card=page.locator('.ex-card[data-ex="0"]');
 await expect(card.locator('.badge-tech')).toHaveCount(1);
 await expect(card.locator('.plates-disclosure')).toHaveCount(0);
 await confirmSet(page,0,0);await expect(page.locator('#floating-timer')).toHaveClass(/active/);
 await confirmSet(page,0,1);
 await page.evaluate(async()=>{(await import('/js/timer.js')).stopTimer();});
 await confirmSet(page,0,2);await expect(card.locator('.set-lock-check[data-set="2"]')).not.toBeChecked();
 await expect(page.locator('#floating-timer')).not.toHaveClass(/active/);
 await card.locator('.drop-input[data-field="weight"]').fill('7.5');
 await card.locator('.drop-input[data-field="reps"]').fill('8');
 await card.locator('.drop-add').click();
 await card.locator('.drop-input[data-segment="1"][data-field="weight"]').fill('5');
 await card.locator('.drop-input[data-segment="1"][data-field="reps"]').fill('6');
 await expect(page.locator('#floating-timer')).not.toHaveClass(/active/);
 await card.locator('.set-lock-check[data-set="2"]').check();
 await expect(page.locator('#floating-timer')).toHaveClass(/active/);
 await page.evaluate(async()=>{await (await import('/js/journalStore.js')).flushJournalStorage();});
 await page.reload();
 await expect(page.locator('.ex-card[data-ex="0"] .drop-input[data-segment="1"][data-field="weight"]')).toHaveValue('5');
 const result=await page.evaluate(async()=>{
  const {state}=await import('/js/state.js');const ex=Object.values(state.workoutData.history.years)[0].mesocycles[0].weeks[0].days[0].exercises[0];
  return {count:ex.loggedSets.length,base:ex.loggedSets[2].reps,drops:ex.loggedSets[2].dropSegments,locked:ex.loggedSets[2].isLocked};
 });
 expect(result.count).toBe(3);expect(result.base).toBe('12');expect(result.drops.map(s=>s.weight)).toEqual([7.5,5]);expect(result.locked).toBe(true);
});
test('dropset non eseguito non inventa scarichi e consente conferma della base',async({page})=>{
 await setupPlan(page,'drop');const card=page.locator('.ex-card[data-ex="0"]');
 await card.locator('.drop-skip').check();await confirmSet(page,0,2);
 await expect(card.locator('.set-lock-check[data-set="2"]')).toBeChecked();
 expect(await page.evaluate(async()=>{
  const {state}=await import('/js/state.js');const set=Object.values(state.workoutData.history.years)[0].mesocycles[0].weeks[0].days[0].exercises[0].loggedSets[2];
  return {skip:set.dropSkipped,drops:set.dropSegments};
 })).toEqual({skip:true,drops:[]});
});
test('bilanciere leggero disponibile a richiesta, manubri pesanti senza calcolatore',async({page})=>{
 await setupPlan(page,'drop');await page.evaluate(async()=>{
  const {state}=await import('/js/state.js');const {renderWorkoutList}=await import('/js/ui.js');
  const day=Object.values(state.workoutData.history.years)[0].mesocycles[0].weeks[0].days[0];
  day.exercises[0].name='Panca Piana con Bilanciere';delete day.exercises[0].isDropset;day.exercises[0].notes='';
  day.exercises[0].kgMin='30';day.exercises[0].kgMax='30';
  day.exercises[1].name='Spinte con Manubri';day.exercises[1].kgMin='40';day.exercises[1].kgMax='40';
  state.workoutData.athlete ||= {};
  state.workoutData.athlete.ownedBarbells=[{weight:20,diameter:'50'}];
  state.workoutData.athlete.defaultBarbell={weight:20,diameter:'50'};
  state.workoutData.athlete.plateInventories={'50':{'5':1}};
  renderWorkoutList();
 });
 const card=page.locator('.ex-card[data-ex="0"]');
 await expect(card.locator('.plates-disclosure')).not.toHaveAttribute('open','');
 await card.locator('.set-kg[data-set="0"]').fill('35');
 await expect(card.locator('.plates-disclosure')).not.toHaveAttribute('open','');
 await card.locator('.set-kg[data-set="0"]').fill('36');
 await expect(card.locator('.plates-disclosure')).toHaveAttribute('open','');
 await card.locator('.set-kg[data-set="0"]').fill('30');
 await expect(card.locator('.plates-disclosure')).not.toHaveAttribute('open','');
 await card.locator('.plates-disclosure summary').click();
 await expect(card.locator('.bar-select')).toHaveValue('20|50');
 await expect(card.locator('.plates-badge')).toContainText('5 kg/lato');
 await expect(page.locator('.ex-card[data-ex="1"] .plates-disclosure')).toHaveCount(0);
});
for(const [device,width,height] of [['smartphone',390,844],['tablet',768,1024],['pc',1440,1000]])test('gruppi e dropset leggibili su '+device,async({page})=>{
 await page.setViewportSize({width,height});await setupPlan(page,'group');
 await page.locator('.circuit-card').scrollIntoViewIfNeeded();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 const box=await page.locator('.circuit-card').boundingBox();console.log('CIRCUIT_HEIGHT',device,box.height);
 if(width===390)expect(box.height).toBeLessThan(1000);
 await page.screenshot({path:'../../outputs/nuovo-triset-'+device+'.png'});
 await setupPlan(page,'drop');await page.locator('.ex-card[data-ex="0"]').scrollIntoViewIfNeeded();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:'../../outputs/nuovo-dropset-'+device+'.png'});
});

test('diametro memorizzato: i dischi da 29 mm non completano il bilanciere da 50 mm',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await setupPlan(page,'drop');
 await page.evaluate(async()=>{
  const {state}=await import('/js/state.js');const {renderWorkoutList}=await import('/js/ui.js');
  const day=Object.values(state.workoutData.history.years)[0].mesocycles[0].weeks[0].days[0];
  Object.assign(day.exercises[0],{name:'Panca Piana con Bilanciere',isDropset:false,notes:'',kgMin:'72.5',kgMax:'72.5'});
  state.workoutData.athlete ||= {};
  state.workoutData.athlete.platePairs={'1.25':9};
  state.workoutData.athlete.plateInventories={'50':{'20':1,'5':1},'29':{'25':1,'1.25':1}};
  state.workoutData.athlete.ownedBarbells=[{weight:20,diameter:'50'},{weight:20,diameter:'29'}];
  state.workoutData.athlete.defaultBarbell={weight:20,diameter:'50'};
  renderWorkoutList();
 });
 const card=page.locator('.ex-card[data-ex="0"]');
 await expect(card.locator('.bar-select')).toHaveValue('20|50');
 await expect(card.locator('.plates-badge')).toContainText('Combinazione incompleta');
 await card.locator('.bar-select').selectOption('20|29');
 await expect(card.locator('.plates-badge')).not.toContainText('Combinazione incompleta');
 await expect(card.locator('.plates-badge')).toContainText('25 + 1.25');
 await page.evaluate(async()=>{await (await import('/js/journalStore.js')).flushJournalStorage();});
 await page.reload();
 await expect(card.locator('.bar-select')).toHaveValue('20|29');
 await expect(card.locator('.plates-badge')).toContainText('26.25 kg/lato');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.evaluate(()=>{document.getElementById('auth-overlay').style.display='none';});
 await card.locator('.plates-disclosure').scrollIntoViewIfNeeded();
 await page.screenshot({path:'../../outputs/dischi-diametro-smartphone.png'});
});

for(const [device,width,height] of [['telefono',390,844],['tablet',768,1024],['pc',1440,1000]])test('manuale aggiornato navigabile su '+device,async({page})=>{
 await page.setViewportSize({width,height});await openIsolatedApp(page);
 await page.locator('#app-utility-menu summary').click();
 await page.locator('#btn-user-manual').click();
 const manual=page.locator('#manual-content');
 await expect(manual).toBeVisible();
 await expect(manual.locator('.manual-section')).toHaveCount(17);
 for(const link of await manual.locator('[data-manual-target]').all()){
  const id=await link.getAttribute('data-manual-target');
  await link.click();await expect(page.locator('#'+id)).toHaveAttribute('open','');
 }
 await manual.locator('[data-manual-target="manual-attrezzatura"]').click();
 await expect(page.locator('#manual-attrezzatura')).toContainText('25, 20, 15, 10, 5, 2,5, 2, 1,25, 1 e 0,5 kg');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:'../../outputs/manuale-'+device+'.png'});
 await page.locator('#app-utility-menu summary').click();
 await page.locator('#btn-user-manual').click();
 await expect(page.locator('#manual')).toHaveClass(/d-none/);
});

test('bilancieri impostati una volta: scelta automatica e layout compatto a 320px',async({page})=>{
 await page.setViewportSize({width:320,height:812});
 await openIsolatedApp(page);
 await page.locator('#open-tools-btn').click();
 await page.locator('.equipment-settings summary').click();
 const rows=page.locator('.equipment-barbell-row');
 await page.locator('#equipment-add-barbell').click();
 await rows.nth(0).locator('.equipment-bar-weight').fill('9');
 await rows.nth(0).locator('.equipment-bar-diameter').selectOption('29');
 await page.locator('#equipment-add-barbell').click();
 await rows.nth(1).locator('.equipment-bar-weight').fill('20');
 await rows.nth(1).locator('.equipment-bar-diameter').selectOption('50');
 await rows.nth(1).locator('.equipment-bar-default').check();
 await page.locator('.equipment-plate-pairs').evaluateAll(inputs=>inputs.forEach(el=>el.value='0'));
 await page.locator('#homegym-equipment-form button[type="submit"]').click();
 await expect(page.locator('#homegym-equipment-status')).toContainText('Attrezzatura salvata');
 const stored=await page.evaluate(async()=>{
   const {state}=await import('/js/state.js');
   return {bars:state.workoutData.athlete.ownedBarbells,preferred:state.workoutData.athlete.defaultBarbell};
 });
 expect(stored).toEqual({bars:[{weight:9,diameter:'29'},{weight:20,diameter:'50'}],
   preferred:{weight:20,diameter:'50'}});
 await page.locator('#close-tools-btn').click();
 const card=page.locator('.ex-card').first();
 await expect(card.locator('.bar-select')).toHaveValue('20|50');
 await card.locator('.plates-disclosure').evaluate(node=>node.open=true);
 const positions=await card.evaluate(node=>{
   const a=node.querySelector('.bar-select-label').getBoundingClientRect();
   const b=node.querySelector('.bar-select').getBoundingClientRect();
   return {sameRow:Math.abs(a.top-b.top)<20,
     inside:b.right<=innerWidth+1 && b.left>=0,
     barWidth:b.width};
 });
 expect(positions.sameRow).toBe(true);
 expect(positions.inside).toBe(true);
 expect(positions.barWidth).toBeGreaterThan(100);
 await card.locator('.bar-select').selectOption('9|29');
 const assigned=await page.evaluate(async()=>{
   const {state}=await import('/js/state.js');
   const {canonicalExerciseKey}=await import('/mycoatch/exerciseIdentity.js');
   const exercise=Object.values(state.workoutData.history.years)[0].mesocycles[0].weeks[0].days[0].exercises[0];
   return state.workoutData.athlete.barbellAssignments?.[canonicalExerciseKey(exercise.name)];
 });
 expect(assigned).toEqual({weight:9,diameter:'29'});
});


test('RPE +/-0,5 mobile: la spunta salva solo il valore percepito, non cambia il target',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await setupPlan(page,'drop');
 const card=page.locator('.ex-card[data-ex="1"]');
 const field=card.locator('.set-rpe[data-set="0"]');
 await expect(field).toHaveValue('8');
 await expect(card.locator('.rpe-target-label').first()).toHaveText('Ob. 8');
 await card.locator('.rpe-step-btn[data-set="0"][data-direction="1"]').click();
 await expect(field).toHaveValue('8.5');
 await card.locator('.rpe-step-btn[data-set="0"][data-direction="1"]').click();
 await expect(field).toHaveValue('9');
 await expect(card.locator('.rpe-target-label').first()).toHaveText('Ob. 8');
 await card.locator('.set-kg[data-set="0"]').fill('10');
 await card.locator('.set-reps[data-set="0"]').fill('12');
 await card.locator('.set-lock-check[data-set="0"]').check();
 const confirmed=await page.evaluate(async()=>{
  const {state}=await import('/js/state.js');
  const ex=Object.values(state.workoutData.history.years)[0].mesocycles[0].weeks[0].days[0].exercises[1];
  return {rpe:ex.loggedSets[0].rpe,target:ex.rpe,locked:ex.loggedSets[0].isLocked};
 });
 expect(Number(confirmed.rpe)).toBe(9);
 expect(String(confirmed.target)).toBe('8');
 expect(confirmed.locked).toBe(true);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});


test('REPS +/-1: prefill editable, check confirms actual reps without editing target',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await setupPlan(page,'drop');
 const card=page.locator('.ex-card[data-ex="1"]');
 const reps=card.locator('.set-reps[data-set="0"]');
 const nextReps=card.locator('.set-reps[data-set="1"]');
 await expect(reps).toHaveValue('10');
 await expect(nextReps).toHaveValue('10');
 await card.locator('.reps-step-btn[data-set="0"][data-direction="1"]').click();
 await expect(reps).toHaveValue('11');
 await card.locator('.reps-step-btn[data-set="0"][data-direction="1"]').click();
 await expect(reps).toHaveValue('12');
 await card.locator('.reps-step-btn[data-set="0"][data-direction="-1"]').click();
 await expect(reps).toHaveValue('11');
 await expect(nextReps).toHaveValue('10');
 await expect(reps).not.toHaveClass(/text-placeholder-active/);
 const draft=await page.evaluate(async()=>{
   const {state}=await import('/js/state.js');
   const ex=Object.values(state.workoutData.history.years)[0].mesocycles[0].weeks[0].days[0].exercises[1];
   return {actual:ex.loggedSets[0].reps,locked:ex.loggedSets[0].isLocked||false,target:ex.reps};
 });
 expect(draft).toEqual({actual:'11',locked:false,target:'10-12'});
 await card.locator('.set-kg[data-set="0"]').fill('10');
 await card.locator('.set-lock-check[data-set="0"]').check();
 const confirmed=await page.evaluate(async()=>{
   const {state}=await import('/js/state.js');
   const ex=Object.values(state.workoutData.history.years)[0].mesocycles[0].weeks[0].days[0].exercises[1];
   return {actual:ex.loggedSets[0].reps,locked:ex.loggedSets[0].isLocked,target:ex.reps};
 });
 expect(confirmed).toEqual({actual:'11',locked:true,target:'10-12'});
 await expect(page.locator('.ex-card[data-ex="1"] .reps-step-btn[data-set="0"][data-direction="1"]')).toBeDisabled();
});

test('mobile reps controls fit and every gesture instruction begins at left edge',async({page})=>{
 for(const width of [320,390]){
   await page.setViewportSize({width,height:844});
   await setupPlan(page,'drop');
   const card=page.locator('.ex-card[data-ex="0"]');
   const hint=card.locator('.exercise-exclude-hint');
   await expect(hint).toContainText('Doppio clic sulla card');
   const layout=await card.evaluate(element=>{
     const hint=element.querySelector('.exercise-exclude-hint');
     const rect=element.getBoundingClientRect();
     const h=hint.getBoundingClientRect();
     const steppers=[...element.querySelectorAll('.reps-stepper,.rpe-stepper')];
     return {hintOffset:h.left-rect.left,align:getComputedStyle(hint).textAlign,
       controlsWithinCard:steppers.every(node=>{
         const r=node.getBoundingClientRect();
         return r.left>=rect.left-1 && r.right<=rect.right+1;
       }),
       noPageOverflow:document.documentElement.scrollWidth<=window.innerWidth+1};
   });
   expect(layout.hintOffset).toBeGreaterThanOrEqual(0);
   expect(layout.hintOffset).toBeLessThan(30);
   expect(layout.align).toBe('left');
   expect(layout.controlsWithinCard).toBe(true);
   expect(layout.noPageOverflow).toBe(true);
 }
});


test('REPS shows unchanged prescribed targets for equal and different series, on mobile and after confirmation',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await setupPlan(page,'drop');
  const card=page.locator('.ex-card[data-ex="1"]');
  await expect(card.locator('.reps-target-label')).toHaveText(['Ob. 10-12','Ob. 10-12','Ob. 10-12']);
  await page.evaluate(async()=>{
    const {state}=await import('/js/state.js');
    const {renderWorkoutList}=await import('/js/ui.js');
    const ex=Object.values(state.workoutData.history.years)[0].mesocycles[0].weeks[0].days[0].exercises[1];
    ex.sets[0].targetReps='5-6';
    ex.sets[1].targetReps='8-10';
    ex.sets[2].targetReps='10-12';
    renderWorkoutList();
  });
  const updated=page.locator('.ex-card[data-ex="1"]');
  await expect(updated.locator('.reps-target-label')).toHaveText(['Ob. 5-6','Ob. 8-10','Ob. 10-12']);
  await updated.locator('.set-reps[data-set="0"]').fill('6');
  await updated.locator('.set-kg[data-set="0"]').fill('10');
  await updated.locator('.set-rpe[data-set="0"]').fill('8');
  await updated.locator('.set-lock-check[data-set="0"]').check();
  await expect(updated.locator('.reps-target-label')).toHaveText(['Ob. 5-6','Ob. 8-10','Ob. 10-12']);
  await expect(updated.locator('.set-reps[data-set="0"]')).toHaveValue('6');
  await expect(updated.locator('.reps-step-btn[data-set="0"][data-direction="1"]')).toBeDisabled();
  for(const width of [320,390]){
    await page.setViewportSize({width,height:844});
    const layout=await updated.evaluate(card=>({
      labels:[...card.querySelectorAll('.reps-target-label')].every(l=>l.getBoundingClientRect().width>0 && l.getBoundingClientRect().height>0),
      noOverflow:document.documentElement.scrollWidth<=innerWidth+1,
      repsInside:[...card.querySelectorAll('.td-reps-stepper')].every(cell=>{
        const label=cell.querySelector('.reps-target-label');
        const c=cell.getBoundingClientRect(),r=label.getBoundingClientRect();
        return r.left>=c.left-1 && r.right<=c.right+1;
      })
    }));
    expect(layout).toEqual({labels:true,noOverflow:true,repsInside:true});
  }
});
