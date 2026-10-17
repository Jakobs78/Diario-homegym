import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const ORIGIN = 'http://127.0.0.1:4173';

test('backup integrale disponibile prima della cancellazione senza dipendere dal CSV', async ({page}) => {
  await openIsolatedApp(page);
  await page.evaluate(async () => {
    const {clearAllData} = await import('/js/storage.js');
    clearAllData();
  });
  const downloading=page.waitForEvent('download');
  await page.locator('#danger-backup-btn').click();
  const download=await downloading;
  const backup=JSON.parse(await readFile(await download.path(),'utf8'));
  expect(backup.format).toBe('homegym-diary-full-backup');
  expect(Object.keys(backup.data.history.years)).toContain('2025');
  await page.locator('#danger-cancel-btn').click();
});
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
    await expect(page.locator('#meso-display')).toHaveText('1', { timeout: 10000 });
  } catch (error) {
    const diagnostics = await page.evaluate(async () => {
      const raw = (window.testJournal || localStorage).getItem('workoutApp_data');
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

async function startCoach(page, minutes = '45') {
  await page.locator('#open-tools-btn').click();
  await page.locator('[data-action="generate-mycoatch-csv"]').click();
  await expect(page.locator('#mycoatch-config-modal')).not.toHaveClass(/hidden/);
  await expect(page.locator('#select-time')).toHaveValue('');
  await page.locator('#select-time').selectOption(minutes);
  await page.locator('#select-days').selectOption('4');
  await page.locator('#input-age').fill('49');
  await page.locator('#select-focus').selectOption('hybrid');
  await page.locator('#mycoatch-experience').selectOption('intermediate');
}

test('percorso reale: tempo scelto, storico multianno, anteprima, download, import e timer superset', async ({ page }) => {
  const monitoring = await openIsolatedApp(page);
  await startCoach(page, '60');

  const dialogues = [];
  page.on('dialog', async dialog => {
    dialogues.push({ type: dialog.type(), text: dialog.message() });
    await dialog.accept();
  });

  const downloadPromise = page.waitForEvent('download', { timeout: 20000 });
  await page.locator('#mycoatch-submit').click();
  const download = await downloadPromise;
  const csv = await readFile(await download.path(), 'utf8');
  assert.ok(download.suggestedFilename().endsWith('.csv'));
  assert.equal(csv.split(/\r?\n/)[0], HEADER);
  const rows = csv.trim().split(/\r?\n/);
  assert.ok(rows.length > 25);
  for (const row of rows.slice(1)) assert.equal(row.split(';').length, 12, row);
  assert.ok(rows.some(row => row.includes('[DURATA STIMATA]')));
  assert.ok(rows.some(row => row.includes('[SUPERSERIE]')));
  assert.ok(dialogues.some(d => d.type === 'confirm' &&
    d.text.includes('2 mesocicli') && d.text.includes('Confermi la proposta')));
  assert.ok(dialogues.some(d => d.type === 'alert' && d.text.includes('successo')));

  const storedAfter = await page.evaluate(() => JSON.parse(window.testJournal.getItem('workoutApp_data')));
  assert.deepEqual(storedAfter, fixture, 'Il download non deve sovrascrivere lo storico');

  // Importazione effettuata con il vero parser della webapp e lo stesso CSV scaricato.
  const imported = await page.evaluate(async content => {
    const { importWorkoutPlan } = await import('/js/csvHandler.js');
    const { state } = await import('/js/state.js');
    const { renderWorkoutList } = await import('/js/ui.js');
    const result = importWorkoutPlan(content);
    if (!result.success) return { result };
    renderWorkoutList();
    const years = state.workoutData.history.years;
    const current = years[new Date().getFullYear()].mesocycles.at(-1);
    const day = current.weeks[0].days[0];
    return {
      result, totalMesocycles: years[new Date().getFullYear()].mesocycles.length,
      exerciseCount: day.exercises.length,
      dayNames: current.weeks[0].days.map(d => d.dayName),
      group: day.exercises.map((ex, index) => ({ index, groupType: ex.groupType,
        isGroupLast: ex.isGroupLast, notes: ex.notes }))
        .filter(ex => ex.groupType === 'superset'),
      recovery: day.exercises.map(ex => ex.recupero)
    };
  }, csv);
  assert.ok(imported.result.success, JSON.stringify(imported));
  assert.equal(imported.totalMesocycles, 2);
  assert.deepEqual(imported.dayNames, ['Upper A', 'Lower A', 'Upper B', 'Lower B']);
  assert.ok(imported.exerciseCount >= 4);
  assert.equal(imported.group.length, 2);
  assert.equal(imported.group[0].isGroupLast, false);
  assert.equal(imported.group[1].isGroupLast, true);
  assert.ok(imported.recovery.every(x => /^\d+s$/.test(x)));

  // Gli stessi checkbox e listener usati dall'utente: prima serie del primo
  // accessorio in superserie non deve avviare il timer; il secondo sì.
  async function completeSet(exIndex) {
    await page.locator(`.set-kg[data-ex="${exIndex}"][data-set="0"]`).fill('10');
    await page.locator(`.set-reps[data-ex="${exIndex}"][data-set="0"]`).fill('12');
    await page.locator(`.set-rpe[data-ex="${exIndex}"][data-set="0"]`).fill('8');
    await page.locator(`.set-lock-check[data-ex="${exIndex}"][data-set="0"]`).check();
  }
  await completeSet(imported.group[0].index);
  await expect(page.locator('#floating-timer')).not.toHaveClass(/active/);
  await completeSet(imported.group[1].index);
  await expect(page.locator('#floating-timer')).toHaveClass(/active/);
  const timerDisplay = await page.locator('#timer-display').textContent();
  assert.match(timerDisplay, /^\d\d:\d\d$/);
  assert.deepEqual(monitoring.remoteRequests, []);
  assert.deepEqual(monitoring.pageErrors, []);
});

test('annullare l\'anteprima non scarica il CSV né modifica lo storico', async ({ page }) => {
  const monitoring = await openIsolatedApp(page);
  await startCoach(page, '60');
  const dialogs = [];
  let downloads = 0;
  page.on('download', () => { downloads++; });
  page.on('dialog', async dialog => {
    dialogs.push(dialog.type());
    if (dialog.type() === 'confirm') await dialog.dismiss();
    else await dialog.accept();
  });
  await page.locator('#mycoatch-submit').click();
  await expect(page.locator('#mycoatch-form-feedback')).toContainText('nessun file CSV scaricato');
  assert.ok(dialogs.includes('confirm'));
  assert.equal(downloads, 0);
  const stored = await page.evaluate(() => JSON.parse(window.testJournal.getItem('workoutApp_data')));
  assert.deepEqual(stored, fixture);
  const active = await page.evaluate(async () => {
    const { MyCoatch } = await import('/mycoatch/index.js');
    return MyCoatch.getActiveMesocycleJSON();
  });
  assert.equal(active, null);
  assert.deepEqual(monitoring.remoteRequests, []);
  assert.deepEqual(monitoring.pageErrors, []);
});

test('durata obbligatoria e numero personalizzato non valido bloccano la generazione', async ({ page }) => {
  await openIsolatedApp(page);
  await startCoach(page, '45');
  await page.locator('#select-time').selectOption('custom');
  await expect(page.locator('#mycoatch-custom-time')).toBeVisible();
  await page.locator('#mycoatch-custom-time').fill('20');
  await page.locator('#mycoatch-submit').click();
  await expect(page.locator('#mycoatch-config-modal')).not.toHaveClass(/hidden/);
  assert.equal(await page.locator('#mycoatch-custom-time').evaluate(el => el.validity.rangeUnderflow), true);
  await page.locator('#mycoatch-custom-time').fill('55');
  assert.equal(await page.locator('#mycoatch-custom-time').evaluate(el => el.checkValidity()), true);
});


test('40 minuti: riequilibrio reale visibile e importabile senza assumere spostamenti fissi', async ({ page }) => {
  const monitoring = await openIsolatedApp(page);
  await startCoach(page, '45');
  await page.locator('#select-time').selectOption('custom');
  await page.locator('#mycoatch-custom-time').fill('40');
  const preview = [];
  page.on('dialog', async dialog => {
    if (dialog.type() === 'confirm') preview.push(dialog.message());
    await dialog.accept();
  });
  const downloaded = page.waitForEvent('download', { timeout: 20000 });
  await page.locator('#mycoatch-submit').click();
  const csv = await readFile(await (await downloaded).path(), 'utf8');
  assert.equal(csv.split(/\r?\n/)[0], HEADER);
  assert.match(csv, /\[VOLUME RIDISTRIBUITO\]/);

  const expected = await page.evaluate(async () => {
    const { MyCoatch } = await import('/mycoatch/index.js');
    const meso = MyCoatch.getActiveMesocycleJSON();
    return {
      moves: meso.weeks[0].volumeBalance.moves,
      recovered: meso.weeks[0].volumeBalance.recoveredSets,
      shortfall: meso.weeks[0].volumeBalance.shortfallSets,
      exerciseCounts: meso.weeks[0].days.map(day =>
        Object.fromEntries(day.exercises.map(ex => [ex.name, ex.setsCount])))
    };
  });
  assert.ok(expected.recovered > 0);
  assert.equal(expected.recovered,
    expected.moves.reduce((sum, move) => sum + move.sets, 0));

  const confirmation = preview.find(message => message.includes('Bilancio volume prima settimana'));
  assert.ok(confirmation, 'La proposta deve mostrare il bilancio settimanale');
  assert.ok(confirmation.includes(`${expected.recovered} recuperate su altri giorni`));
  if (expected.shortfall > 0) {
    assert.ok(confirmation.includes(`restano ${expected.shortfall} serie sotto il template`));
  }
  assert.match(confirmation, /Split programmato: Upper → Lower → Upper → Lower/);
  assert.match(confirmation, /Movimenti cardine:/);
  for (const move of expected.moves) {
    assert.ok(confirmation.includes(`G${move.fromDay} → G${move.toDay}: ${move.sets} serie ${move.muscle}`));
  }

  const imported = await page.evaluate(async csvText => {
    const { importWorkoutPlan } = await import('/js/csvHandler.js');
    const { state } = await import('/js/state.js');
    const result = importWorkoutPlan(csvText);
    if (!result.success) return { result };
    const week = state.workoutData.history.years[new Date().getFullYear()]
      .mesocycles.at(-1).weeks[0];
    return {
      result,
      categories: week.days.map(day =>
        day.exercises.map(ex => ({
          name: ex.name,
          notes: ex.notes,
          count: ex.loggedSets.length,
          group: ex.groupType || null
        }))
      )
    };
  }, csv);
  assert.ok(imported.result.success, JSON.stringify(imported));
  for (const move of expected.moves) {
    // L'importatore del diario applica Title Case ("ai" → "Ai"),
    // quindi confrontiamo l'identità senza attribuire un errore ai maiuscoli.
    const target = imported.categories[move.toDay - 1].find(ex =>
      ex.name.toLocaleLowerCase('it-IT') ===
        move.targetExercise.toLocaleLowerCase('it-IT'));
    assert.ok(target, JSON.stringify(move));
    assert.equal(target.count,
      expected.exerciseCounts[move.toDay - 1][move.targetExercise]);
    assert.ok(target.count >= move.sets);
  }
  assert.deepEqual(monitoring.remoteRequests, []);
  assert.deepEqual(monitoring.pageErrors, []);
});

async function prepareLiveWorkout(page) {
  return page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    const { renderWorkoutList } = await import('/js/ui.js');
    const year = state.workoutData.history.years[new Date().getFullYear()];
    if (!year) throw new Error('Missing synthetic year in browser fixture');
    const day = year.mesocycles[0].weeks[0].days[0];
    day.exercises = [{
      block: 1, name: 'Panca Piana con Bilanciere',
      reps: '6-8', kgMin: '80', kgMax: '80', targetRpe: '@8',
      rpe: '@8', recupero: '180s',
      notes: '[DURATA STIMATA] 32 minuti su 45 disponibili.',
      loggedSets: [0, 1, 2].map(i => ({
        setNumber: i + 1, weight: '', reps: '', rpe: '',
        isLocked: false, completed: false
      }))
    }];
    state.activeMesocycleIndex = 0;
    state.activeWeek = 1;
    state.activeDay = 1;
    renderWorkoutList();
  });
}

test('MyCoatch LIVE usa solo serie reali, suggerisce senza applicare, segue tempo e riapertura', async ({ page }) => {
  const monitoring = await openIsolatedApp(page);
  await prepareLiveWorkout(page);
  await expect(page.locator('#mycoatch-live-disclosure')).toBeVisible();
  await expect(page.locator('#mycoatch-live-panel')).not.toBeVisible();
  await expect(page.locator('.mycoatch-live-count')).toContainText('0/3');
  await expect(page.locator('#mycoatch-live-panel')).toContainText('Serie confermate: 0/3');
  await expect(page.locator('.set-kg[data-set="0"]')).toHaveValue('80');
  await expect(page.locator('.set-reps[data-set="0"]')).toHaveValue('6');
  await expect(page.locator('.set-rpe[data-set="0"]')).toHaveValue('8');
  assert.equal(await page.locator('.set-kg[data-set="0"]').getAttribute('placeholder'), '80');

  // Il CSV precompila, ma non crea serie confermate prima della spunta.
  await expect(page.locator('.set-lock-check[data-set="0"]')).not.toBeChecked();
  await expect(page.locator('#mycoatch-live-panel')).toContainText('Serie confermate: 0/3');

  await page.locator('.set-kg[data-set="0"]').fill('80');
  await page.locator('.set-reps[data-set="0"]').fill('8');
  await page.locator('.set-rpe[data-set="0"]').fill('9.5');
  await page.locator('.set-lock-check[data-set="0"]').check();
  await expect(page.locator('#mycoatch-live-panel')).toContainText('Serie confermate: 1/3');
  await expect(page.locator('#mycoatch-live-guidance')).toContainText('RPE molto alto');
  await expect(page.locator('#mycoatch-live-guidance')).toContainText('Ultima prestazione comparabile');
  await expect(page.locator('#mycoatch-live-guidance')).toContainText('Differenza e1RM');
  await expect(page.locator('#mycoatch-live-toast')).toContainText('RPE molto alto');
  await expect(page.locator('.mycoatch-live-toast .mycoatch-live-apply')).toBeVisible();
  await expect(page.locator('.mycoatch-live-advice-history')).not.toHaveAttribute('open', '');
  await expect(page.locator('.set-kg[data-set="1"]')).toHaveValue('80');
  await expect(page.locator('.set-reps[data-set="1"]')).toHaveValue('8');
  await expect(page.locator('.set-rpe[data-set="1"]')).toHaveValue('8');
  await expect(page.locator('#live-session-timer')).not.toHaveText('0:00');

  await page.locator('.mycoatch-live-toast .mycoatch-live-apply').click();
  await expect(page.locator('#mycoatch-live-toast')).toHaveCount(0);
  await expect(page.locator('.set-kg[data-set="1"]')).toHaveValue('75');
  await expect(page.locator('.set-lock-check[data-set="1"]')).not.toBeChecked();
  await page.locator('.set-reps[data-set="1"]').fill('7');
  await page.locator('.set-rpe[data-set="1"]').fill('8');
  await page.locator('.set-lock-check[data-set="1"]').check();
  await expect(page.locator('#mycoatch-live-panel')).toContainText('Serie confermate: 2/3');

  await page.locator('.set-kg[data-set="2"]').fill('75');
  await page.locator('.set-reps[data-set="2"]').fill('7');
  await page.locator('.set-rpe[data-set="2"]').fill('8');
  await page.locator('.set-lock-check[data-set="2"]').check();
  await expect(page.locator('#mycoatch-live-panel')).toContainText('Serie confermate: 3/3');
  await expect(page.locator('#mycoatch-live-guidance')).toContainText('Seduta completata');

  const completed = await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    const day = state.workoutData.history.years[new Date().getFullYear()]
      .mesocycles[0].weeks[0].days[0];
    return { completed: day.completed, duration: day.totalDurationMinutes,
      stamps: day.exercises[0].loggedSets.map(s => s.completedAt || null) };
  });
  assert.equal(completed.completed, true);
  assert.ok(completed.duration > 0);
  assert.ok(completed.stamps.every(Boolean));

  // Correggere una serie riapre la sessione anche dopo l'ultimo check.
  await page.locator('.set-lock-check[data-set="2"]').uncheck();
  await expect(page.locator('#mycoatch-live-panel')).toContainText('Serie confermate: 2/3');
  const reopened = await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    const day = state.workoutData.history.years[new Date().getFullYear()]
      .mesocycles[0].weeks[0].days[0];
    return { completed: day.completed, stamp: day.exercises[0].loggedSets[2].completedAt,
      elapsed: day.accumulatedSeconds };
  });
  assert.equal(reopened.completed, false);
  assert.equal(reopened.stamp, undefined);
  assert.ok(reopened.elapsed >= 0);
  assert.deepEqual(monitoring.remoteRequests, []);
  assert.deepEqual(monitoring.pageErrors, []);
});

test('MyCoatch check-in reale: sonno/energia limitano aumenti, dolore impone cautela senza modificare set', async ({ page }) => {
  const monitoring = await openIsolatedApp(page);
  await prepareLiveWorkout(page);
  await page.locator('#mycoatch-live-disclosure > summary').click();
  const checkin=page.locator('#mycoatch-session-checkin');
  await expect(checkin).toBeVisible();
  await expect(checkin).toHaveAttribute('open','');
  await page.locator('#mycoatch-checkin-form select[name="sleep"]').selectOption('poor');
  await page.locator('#mycoatch-checkin-form select[name="energy"]').selectOption('low');
  await page.locator('#mycoatch-checkin-form select[name="soreness"]').selectOption('ok');
  await page.locator('#mycoatch-checkin-form select[name="pain"]').selectOption('none');
  await page.locator('#mycoatch-checkin-form button[type="submit"]').click();
  await expect(checkin).toContainText('evita incrementi');
  const saved = await page.evaluate(async()=>{
    const {state}=await import('/js/state.js');
    const day=state.workoutData.history.years[new Date().getFullYear()]
      .mesocycles[0].weeks[0].days[0];
    const disk=JSON.parse(window.testJournal.getItem('workoutApp_data'));
    return {memory:day.coachCheckin,disk:disk.history.years[new Date().getFullYear()]
      .mesocycles[0].weeks[0].days[0].coachCheckin};
  });
  assert.equal(saved.memory.sleep,'poor');
  assert.equal(saved.memory.energy,'low');
  assert.deepEqual(saved.memory,saved.disk);

  for(const i of [0,1]){
    await page.locator('.set-kg[data-set="'+i+'"]').fill('80');
    await page.locator('.set-reps[data-set="'+i+'"]').fill('8');
    await page.locator('.set-rpe[data-set="'+i+'"]').fill('7');
    await page.locator('.set-lock-check[data-set="'+i+'"]').check();
  }
  await expect(page.locator('#mycoatch-live-guidance')).toContainText('oggi mantieni il carico');
  await expect(page.locator('.mycoatch-live-apply')).toHaveCount(0);
  await expect(page.locator('.set-kg[data-set="2"]')).toHaveValue('80');
  // Modificare il check-in non trasforma serie future in completate.
  await checkin.locator('select[name="pain"]').selectOption('present');
  await checkin.locator('button[type="submit"]').click();
  await expect(checkin).toContainText('interrompi il movimento');
  await expect(page.locator('#mycoatch-live-guidance')).toContainText('Dolore segnalato');
  await expect(page.locator('.mycoatch-live-apply')).toHaveCount(0);
  const future=await page.evaluate(async()=>{
    const {state}=await import('/js/state.js');
    const day=state.workoutData.history.years[new Date().getFullYear()]
      .mesocycles[0].weeks[0].days[0];
    return day.exercises[0].loggedSets[2];
  });
  assert.equal(future.completed,false);
  assert.deepEqual(monitoring.remoteRequests,[]);
  assert.deepEqual(monitoring.pageErrors,[]);
});

test('MyCoatch autoregolazione: due serie difficili suggeriscono prudenza senza cancellare il piano', async ({page})=>{
  const monitoring=await openIsolatedApp(page);
  await prepareLiveWorkout(page);
  for(const i of [0,1]){
    await page.locator('.set-kg[data-set="'+i+'"]').fill('80');
    await page.locator('.set-reps[data-set="'+i+'"]').fill(i===0?'6':'7');
    await page.locator('.set-rpe[data-set="'+i+'"]').fill('9.5');
    await page.locator('.set-lock-check[data-set="'+i+'"]').check();
  }
  await expect(page.locator('#mycoatch-live-guidance')).toContainText('Più serie confermate con RPE');
  await expect(page.locator('#mycoatch-live-guidance')).toContainText('Nessuna serie viene modificata');
  await expect(page.locator('.set-lock-check[data-set="2"]')).not.toBeChecked();
  const result=await page.evaluate(async()=>{
    const {state}=await import('/js/state.js');
    const day=state.workoutData.history.years[new Date().getFullYear()]
      .mesocycles[0].weeks[0].days[0];
    return {total:day.exercises[0].loggedSets.length,
      valid:day.exercises[0].loggedSets.filter(x=>x.completed).length};
  });
  assert.deepEqual(result,{total:3,valid:2});
  assert.deepEqual(monitoring.remoteRequests,[]);
  assert.deepEqual(monitoring.pageErrors,[]);
});

async function prepareWeeklyReviewFixture(page, { pain=false }={}) {
  await page.evaluate(async (painFlag) => {
    const { state }=await import('/js/state.js');
    const { renderWorkoutList }=await import('/js/ui.js');
    const year=state.workoutData.history.years[new Date().getFullYear()];
    const meso=year.mesocycles[0];
    const completedDay=(number,date)=>({
      dayNumber:number,dayName:'Giorno '+number,
      date,completed:true,
      coachCheckin:{
        checkedAt:date+'T10:00:00Z',
        sleep:'ok',energy:'ok',soreness:'ok',pain:number===1&&painFlag?'present':'none'
      },
      exercises:[{
        name:'Panca Piana con Bilanciere',targetRpe:'@8',
        rpe:'@8',reps:'6-8',kgMin:'80',kgMax:'80',
        loggedSets:[0,1,2].map(()=>({
          weight:'80',reps:'6',rpe:'9.5',
          completed:true,isLocked:true
        }))
      }]
    });
    const newExercise=()=>({
      name:'Panca Piana con Bilanciere',set:'3 set',
      kgMin:'82.5',kgMax:'82.5',reps:'6-8',rpe:'@8',targetRpe:'@8',
      recupero:'180s',
      sets:[0,1,2].map(()=>({
        targetRpe:'@8',weight:'',reps:'',rpe:''
      })),
      loggedSets:[0,1,2].map(()=>({
        weight:'',reps:'',rpe:'',isLocked:false,completed:false
      }))
    });
    meso.weeks=[
      {weekNumber:1,days:[completedDay(1,'2026-10-12'),completedDay(2,'2026-10-14')]},
      {weekNumber:2,days:[{dayNumber:1,dayName:'Giorno 1',
        exercises:[newExercise()]}]}
    ];
    state.activeMesocycleIndex=0;
    state.activeWeek=2;
    state.activeDay=1;
    renderWorkoutList();
  },pain);
}

test('MyCoatch suggerisce la revisione della settimana seguente e applica solo dopo conferma, con undo',async({page})=>{
  const monitoring=await openIsolatedApp(page);
  await prepareWeeklyReviewFixture(page);
  const panel=page.locator('#mycoatch-weekly-review');
  await expect(panel).toBeVisible();
  await expect(panel).toContainText('Revisione settimana 2 da valutare');
  await panel.locator('summary').click();
  await expect(panel).toContainText('2/2 giornate');
  await expect(panel).toContainText('RPE @8 → @7.5');
  await expect(page.locator('.set-kg[data-set="0"]')).toHaveValue('82.5');
  await expect(page.locator('.set-lock-check[data-set="0"]')).not.toBeChecked();
  await panel.locator('.mycoatch-weekly-apply').click();
  await expect(page.locator('#mycoatch-weekly-review')).toContainText('Settimana 2 rivista');
  await expect(page.locator('.set-kg[data-set="0"]')).toHaveValue('');
  await expect(page.locator('.set-rpe[data-set="0"]')).toHaveValue('7.5');
  let saved=await page.evaluate(async()=>{
    const {state}=await import('/js/state.js');
    const m=state.workoutData.history.years[new Date().getFullYear()].mesocycles[0];
    const disk=JSON.parse(window.testJournal.getItem('workoutApp_data'));
    const persisted=disk.history.years[new Date().getFullYear()].mesocycles[0];
    return {source:m.weeks[0].days[0].exercises[0].loggedSets,
      next:m.weeks[1].days[0].exercises[0],
      persistedReview:!!persisted.weeks[1].coachWeeklyReview};
  });
  assert.equal(saved.source[0].weight,'80');
  assert.equal(saved.next.targetRpe,'@7.5');
  assert.equal(saved.next.loggedSets[0].completed,false);
  assert.equal(saved.persistedReview,true);
  await page.locator('.mycoatch-weekly-undo').click();
  await expect(page.locator('#mycoatch-weekly-review')).toContainText('Revisione settimana 2 da valutare');
  await expect(page.locator('.set-kg[data-set="0"]')).toHaveValue('82.5');
  await expect(page.locator('.set-rpe[data-set="0"]')).toHaveValue('8');
  assert.deepEqual(monitoring.remoteRequests,[]);
  assert.deepEqual(monitoring.pageErrors,[]);
});

test('MyCoatch non riduce automaticamente l’RPE quando lo storico segnala dolore',async({page})=>{
  const monitoring=await openIsolatedApp(page);
  await prepareWeeklyReviewFixture(page,{pain:true});
  const panel=page.locator('#mycoatch-weekly-review');
  await expect(panel).toBeVisible();
  await expect(panel).toContainText('Dolore segnalato');
  await panel.locator('summary').click();
  await expect(panel).toContainText('valutazione professionale');
  await expect(panel.locator('.mycoatch-weekly-apply')).toHaveCount(0);
  await expect(page.locator('.set-kg[data-set="0"]')).toHaveValue('82.5');
  assert.deepEqual(monitoring.remoteRequests,[]);
  assert.deepEqual(monitoring.pageErrors,[]);
});

test('MyCoatch LIVE con RPE mancante non inventa massimale o suggerimenti', async ({ page }) => {
  const monitoring = await openIsolatedApp(page);
  await prepareLiveWorkout(page);
  await page.locator('.set-kg[data-set="0"]').fill('80');
  await page.locator('.set-reps[data-set="0"]').fill('8');
  // Un RPE lasciato volontariamente vuoto è consentito, ma MyCoatch non stima la fatica.
  await page.locator('.set-rpe[data-set="0"]').fill('');
  await page.locator('.set-lock-check[data-set="0"]').check();
  await expect(page.locator('#mycoatch-live-guidance')).toContainText('senza RPE');
  await expect(page.locator('#mycoatch-live-panel')).toContainText('RPE misurato: 0/1');
  await expect(page.locator('.mycoatch-live-apply')).toHaveCount(0);
  await expect(page.locator('#mycoatch-live-guidance')).not.toContainText('e1RM stimato');
  assert.deepEqual(monitoring.remoteRequests, []);
  assert.deepEqual(monitoring.pageErrors, []);
});


test('ripetere una seduta archivia la sessione reale prima del nuovo allenamento', async ({ page }) => {
  const monitor = await openIsolatedApp(page);
  await prepareLiveWorkout(page);
  for (let set = 0; set < 3; set++) {
    await page.locator(`.set-kg[data-set="${set}"]`).fill('80');
    await page.locator(`.set-reps[data-set="${set}"]`).fill('8');
    await page.locator(`.set-rpe[data-set="${set}"]`).fill('8');
    await page.locator(`.set-lock-check[data-set="${set}"]`).check();
  }
  await expect(page.locator('#mycoatch-live-panel')).toContainText('Serie confermate: 3/3');
  page.on('dialog', async dialog => await dialog.accept());
  await page.locator('#reset-session-timer-btn').click();
  await expect(page.locator('#mycoatch-live-panel')).toContainText('Serie confermate: 0/3');
  const archives = page.locator('.session-archive-details');
  await expect(archives).toContainText('Sedute precedenti salvate (1)');
  await archives.locator('summary').click();
  await expect(archives).toContainText('80 kg × 8 · RPE 8');
  for (let set = 0; set < 3; set++) {
    await expect(page.locator(`.set-lock-check[data-set="${set}"]`)).not.toBeChecked();
    await expect(page.locator(`.set-kg[data-set="${set}"]`)).toHaveValue('80');
    await expect(page.locator(`.set-reps[data-set="${set}"]`)).toHaveValue('8'); // last archived confirmed set is compatible
    await expect(page.locator(`.set-rpe[data-set="${set}"]`)).toHaveValue('8');
  }
  const result = await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    const day = state.workoutData.history.years[new Date().getFullYear()]
      .mesocycles[0].weeks[0].days[0];
    return {
      started: day.sessionStart,
      completed: day.completed,
      completedAt: day.sessionCompletedAt,
      archives: day.sessionArchives,
      series: day.exercises[0].loggedSets.map(s =>
        ({ weight: s.weight, reps: s.reps, rpe: s.rpe, stamp: s.completedAt }))
    };
  });
  assert.equal(result.completed, false);
  assert.equal(result.started, null);
  assert.equal(result.completedAt, undefined);
  assert.equal(result.archives.length, 1);
  assert.deepEqual(result.archives[0].exercises[0].loggedSets.map(s =>
    [s.weight, s.reps, Number(s.rpe), Boolean(s.isLocked)]),
    [[80, '8', 8, true], [80, '8', 8, true], [80, '8', 8, true]]);
  assert.ok(result.archives[0].exercises[0].loggedSets.every(s => s.completedAt));
  assert.ok(result.series.every(s =>
    s.weight === '' && s.reps === '' && s.rpe === '' && s.stamp === undefined));

  const savingArchive = page.waitForEvent('download');
  await page.evaluate(async () => {
    const { exportToCSV } = await import('/js/csvHandler.js');
    const { state } = await import('/js/state.js');
    exportToCSV(state.workoutData);
  });
  const historicalCsv = await readFile(await (await savingArchive).path(), 'utf8');
  const archival = historicalCsv.split(/\r?\n/).filter(line =>
    line.includes('[archivio S1 G1 #1]'));
  assert.equal(archival.length, 3);
  assert.ok(archival.every(line =>
    line.includes('80') && line.includes('[ARCHIVIO RIPETIZIONE]')));
  assert.ok(archival.every(line => line.split(',')[10] === '"8"'),
    'Esportazione serie completate: RPE reale e non target');
  assert.ok(historicalCsv.split(/\r?\n/).some(line =>
    !line.includes('[archivio ') && line.includes('Panca') &&
    line.split(',')[10] === '""'),
    'L’RPE delle nuove serie vuote non deve essere inventato');

  assert.deepEqual(monitor.remoteRequests, []);
  assert.deepEqual(monitor.pageErrors, []);
});


test('scelta atleta: fondamentali alternativi, controllo attrezzi, CSV e anteprima spiegata', async ({ page }) => {
  const monitoring = await openIsolatedApp(page);
  await startCoach(page, '60');
  await page.locator('#mycoatch-lift-bench')
    .selectOption('Panca Inclinata con Manubri');

  // Non lascia usare un'inclinata senza aver dichiarato la panca inclinabile.
  await page.locator('#mycoatch-submit').click();
  await expect(page.locator('#mycoatch-form-feedback'))
    .toContainText('richiede attrezzatura');
  await expect(page.locator('#mycoatch-config-modal')).not.toHaveClass(/hidden/);
  await page.locator('.mycoatch-accessory-check[value="incline_bench"]').check();

  await page.locator('#mycoatch-lift-squat').selectOption('Front Squat');
  await page.locator('#mycoatch-lift-military')
    .selectOption('Spinte con Manubri da Seduto');
  await page.locator('#mycoatch-lift-hinge')
    .selectOption('Stacco da Terra Convenzionale');

  const previews = [];
  page.on('dialog', async dialog => {
    if (dialog.type() === 'confirm') previews.push(dialog.message());
    await dialog.accept();
  });
  const downloaded = page.waitForEvent('download', { timeout: 20000 });
  await page.locator('#mycoatch-submit').click();
  const csv = await readFile(await (await downloaded).path(), 'utf8');
  const firstWeek = csv.trim().split(/\r?\n/).slice(1).filter(row => row.startsWith('1;'));
  const firstByDay = Object.fromEntries(firstWeek
    .map(row => row.split(';')).filter(parts => parts[2] === '1')
    .map(parts => [Number(parts[1]), parts[3]]));
  assert.deepEqual(firstByDay, {
    1: 'Panca Inclinata con Manubri',
    2: 'Front Squat',
    3: 'Spinte con Manubri da Seduto',
    4: 'Stacco da Terra Convenzionale'
  });
  assert.ok(previews.some(p => p.includes('Movimenti cardine:') &&
    p.includes('Panca Inclinata con Manubri') &&
    p.includes('Stacco da Terra Convenzionale')));
  assert.match(csv, /\[SCELTA MYCOATCH\]/);
  for (const line of csv.trim().split(/\r?\n/).slice(1)) {
    assert.equal(line.split(';').length, 12);
  }
  assert.deepEqual(monitoring.remoteRequests, []);
  assert.deepEqual(monitoring.pageErrors, []);
});


test('prima scheda atleta principiante: questionario, calibrazione guidata, anteprima e CSV senza kg inventati', async ({ page }) => {
  const monitor = await openIsolatedApp(page);
  // Niente allenamenti: simulazione esplicita del primo utilizzo, senza chiamate remote.
  await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    state.workoutData.history.years = {};
    // Resta isolato dalla rete: nessun cambio account, nessun refresh che
    // reinserisca il fixture mediante l'initScript dei test.
    window.testJournal.setItem('workoutApp_data', JSON.stringify(state.workoutData));
  });
  await startCoach(page, '60');
  await page.locator('#mycoatch-experience').selectOption('beginner');
  await page.locator('#mycoatch-priority-muscle').selectOption('Petto');
  await expect(page.locator('#mycoatch-calibration')).toHaveValue('guided');

  const dialogs = [];
  page.on('dialog', async dialog => {
    if (dialog.type() === 'confirm') dialogs.push(dialog.message());
    await dialog.accept();
  });
  const download = page.waitForEvent('download', { timeout: 20000 });
  await page.locator('#mycoatch-submit').click();
  const csv = await readFile(await (await download).path(), 'utf8');
  assert.match(csv, /\[CALIBRAZIONE MYCOATCH\]/);
  assert.match(csv, /\[VOLUME INIZIALE\]/);
  const rows = csv.trim().split(/\r?\n/).slice(1).map(line => line.split(';'));
  assert.ok(rows.length > 10);
  assert.ok(rows.every(row => row.length === 12));
  assert.ok(rows.every(row => Number(row[4]) <= 2));
  assert.ok(rows.every(row => row[6] === '' && row[7] === ''));
  assert.ok(rows.filter(row => Number(row[0]) === 1).every(row => row[8] === '6.5'));
  assert.ok(dialogs.some(text => text.includes('PROFILO INIZIALE: Principiante') &&
    text.includes('PRIMA SETTIMANA DI CALIBRAZIONE') &&
    text.includes('priorità Petto')));
  const stored = await page.evaluate(() =>
    JSON.parse(window.testJournal.getItem('workoutApp_data')));
  assert.deepEqual(stored.history.years, {});
  assert.deepEqual(monitor.remoteRequests, []);
  assert.deepEqual(monitor.pageErrors, []);
});

test('prima scheda intermedio senza storico: rispetta esclusioni e convalida carichi di riferimento', async ({ page }) => {
  const monitor = await openIsolatedApp(page);
  await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    state.workoutData.history.years = {};
    // Resta isolato dalla rete: nessun cambio account, nessun refresh che
    // reinserisca il fixture mediante l'initScript dei test.
    window.testJournal.setItem('workoutApp_data', JSON.stringify(state.workoutData));
  });
  await startCoach(page, '75');
  await page.locator('#mycoatch-calibration').selectOption('regular');
  await page.locator('.mycoatch-profile-details summary').last().click();
  await page.locator('#mycoatch-load-bench-kg').fill('80');
  // kg da soli non sono una serie reale: errore prima del download.
  await page.locator('#mycoatch-submit').click();
  await expect(page.locator('#mycoatch-form-feedback'))
    .toContainText('kg e ripetizioni reali');
  await page.locator('#mycoatch-load-bench-reps').fill('8');
  await page.locator('#mycoatch-load-bench-rpe').fill('7');
  await page.locator('#mycoatch-load-bench-date').fill(new Date().toISOString().slice(0, 10));
  await page.locator('.mycoatch-profile-details summary').first().click();
  await page.locator('.mycoatch-avoid-check[value="Squat con Bilanciere"]').check();

  const previews = [];
  page.on('dialog', async dialog => {
    if (dialog.type() === 'confirm') previews.push(dialog.message());
    await dialog.accept();
  });
  const downloading = page.waitForEvent('download', { timeout: 20000 });
  await page.locator('#mycoatch-submit').click();
  const csv = await readFile(await (await downloading).path(), 'utf8');
  assert.match(csv, /Panca Piana con Bilanciere/);
  assert.match(csv, /Front Squat|Goblet Squat|Bulgarian Split Squat/);
  assert.doesNotMatch(csv, /;Squat con Bilanciere;/);
  assert.match(csv, /\[RIFERIMENTO ATLETA\] 80 kg/);
  const firstBench = csv.split(/\r?\n/)
    .map(line => line.split(';')).find(row =>
      row[0] === '1' && row[1] === '1' && row[3] === 'Panca Piana con Bilanciere');
  assert.equal(firstBench[6], '80');
  assert.ok(previews.some(s => s.includes('Intermedio') &&
    s.includes('Esercizi esclusi dall’atleta') &&
    s.includes('Carichi dichiarati, NON verificati')));
  assert.deepEqual(monitor.remoteRequests, []);
  assert.deepEqual(monitor.pageErrors, []);
});


test('questionario MyCoatch 3.0 su smartphone: campo esperienza, dettagli e submit raggiungibili', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const monitor = await openIsolatedApp(page);
  await startCoach(page, '45');
  await page.locator('#mycoatch-experience').selectOption('beginner');
  await page.locator('#mycoatch-priority-muscle').selectOption('Quadricipiti');
  const details = page.locator('.mycoatch-profile-details');
  await details.first().locator('summary').click();
  await expect(page.locator('.mycoatch-avoid-check').first()).toBeVisible();
  await details.last().locator('summary').click();
  await expect(page.locator('#mycoatch-load-bench-kg')).toBeVisible();
  await expect(page.locator('#mycoatch-load-bench-date')).toBeVisible();
  await expect(page.locator('#mycoatch-submit')).toBeVisible();
  const geometry = await page.evaluate(() => {
    const sheet = document.querySelector('.mycoatch-config-sheet');
    const grid = document.querySelector('.mycoatch-reference-grid');
    return {
      sheetOverflow: sheet.scrollWidth > sheet.clientWidth + 2,
      gridOverflow: grid.scrollWidth > grid.clientWidth + 2,
      dialogWidth: sheet.getBoundingClientRect().width,
      viewportWidth: innerWidth
    };
  });
  assert.equal(geometry.sheetOverflow, false, JSON.stringify(geometry));
  assert.equal(geometry.gridOverflow, false, JSON.stringify(geometry));
  assert.ok(geometry.dialogWidth <= geometry.viewportWidth + 2, JSON.stringify(geometry));
  assert.deepEqual(monitor.remoteRequests, []);
  assert.deepEqual(monitor.pageErrors, []);
});


test('check-in calibrazione: segue le serie realmente confermate anche passando alla settimana 2', async ({ page }) => {
  const monitor = await openIsolatedApp(page);
  page.on('dialog', async dialog => await dialog.accept());
  const setup = await page.evaluate(async () => {
    const { MyCoatch } = await import('/mycoatch/index.js');
    const { importWorkoutPlan } = await import('/js/csvHandler.js');
    const { renderWorkoutList } = await import('/js/ui.js');
    const { state } = await import('/js/state.js');
    MyCoatch.generateNextFromHistory({ history: { years: {} } }, {
      daysPerWeek: 4, durationWeeks: 4, userAge: 36,
      focus: 'hybrid', maxSessionMinutes: 60,
      athleteProfile: {
        experience: 'beginner', calibration: 'guided',
        priorityMuscle: null, excludedExercises: [], referenceLoads: {}
      }
    });
    const csv = MyCoatch.exportAsCSV();
    const result = importWorkoutPlan(csv);
    if (result.success) renderWorkoutList();
    return { success: result.success, error: result.error,
      currentMesoIndex: state.activeMesocycleIndex };
  });
  assert.equal(setup.success, true, JSON.stringify(setup));
  // MyCoatch e' ripiegato nel nuovo layout: l'atleta puo' aprirlo al tocco.
  await page.locator('.mycoatch-live-trigger').click();
  await expect(page.locator('.mycoatch-calibration-review')).toBeVisible();
  await expect(page.locator('.mycoatch-calibration-review'))
    .toContainText('0/4 fondamentali registrati');
  await expect(page.locator('.mycoatch-calibration-review'))
    .toContainText('Giornate completate: 0/4');

  await page.locator('.set-kg[data-ex="0"][data-set="0"]').fill('40');
  await page.locator('.set-reps[data-ex="0"][data-set="0"]').fill('10');
  await page.locator('.set-rpe[data-ex="0"][data-set="0"]').fill('7');
  await page.locator('.set-lock-check[data-ex="0"][data-set="0"]').check();
  await expect(page.locator('.mycoatch-calibration-review'))
    .toContainText('1/4 fondamentali registrati');
  await expect(page.locator('.mycoatch-calibration-review'))
    .toContainText('Con RPE: 1/1');

  const before = await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    const year = state.workoutData.history.years[new Date().getFullYear()];
    return {
      count: year.mesocycles.length,
      sets: year.mesocycles[state.activeMesocycleIndex]
        .weeks[0].days[0].exercises[0].loggedSets.map(set => ({
          weight: set.weight, completed: set.completed
        }))
    };
  });
  assert.equal(before.sets[0].weight, 40);
  assert.equal(before.sets[0].completed, true);
  assert.ok(!before.sets[1].completed, 'Una serie ancora aperta non deve risultare completata');

  await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    const { renderWorkoutList } = await import('/js/ui.js');
    state.activeWeek = 2;
    state.activeDay = 1;
    renderWorkoutList();
  });
  await expect(page.locator('.mycoatch-calibration-review'))
    .toContainText('1/4 fondamentali registrati');
  const after = await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    const year = state.workoutData.history.years[new Date().getFullYear()];
    return {
      count: year.mesocycles.length,
      saved: year.mesocycles[state.activeMesocycleIndex]
        .weeks[0].days[0].exercises[0].loggedSets[0].weight
    };
  });
  assert.equal(after.count, before.count);
  assert.equal(after.saved, 40);
  assert.deepEqual(monitor.remoteRequests, []);
  assert.deepEqual(monitor.pageErrors, []);
});

test('data dei carichi autodichiarati: senza data non prescrive kg, con data recente sì', async ({ page }) => {
  const monitor = await openIsolatedApp(page);
  await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    state.workoutData.history.years = {};
    window.testJournal.setItem('workoutApp_data', JSON.stringify(state.workoutData));
  });
  await startCoach(page, '75');
  await page.locator('#mycoatch-experience').selectOption('intermediate');
  await page.locator('#mycoatch-calibration').selectOption('regular');
  await page.locator('.mycoatch-profile-details summary').last().click();
  await page.locator('#mycoatch-load-bench-kg').fill('80');
  await page.locator('#mycoatch-load-bench-reps').fill('8');
  await page.locator('#mycoatch-load-bench-rpe').fill('7');
  const previews = [];
  page.on('dialog', async dialog => {
    if (dialog.type() === 'confirm') previews.push(dialog.message());
    await dialog.accept();
  });
  const first = page.waitForEvent('download', { timeout: 20000 });
  await page.locator('#mycoatch-submit').click();
  const firstCsv = await readFile(await (await first).path(), 'utf8');
  const getBench = csv => csv.split(/\r?\n/)
    .map(row => row.split(';')).find(row =>
      row[0] === '1' && row[1] === '1' &&
      row[3] === 'Panca Piana con Bilanciere');
  assert.equal(getBench(firstCsv)[6], '',
    'Un carico senza data non deve apparire come peso prescritto');
  assert.ok(previews.some(s => s.includes('Carichi dichiarati, NON verificati')));
  await startCoach(page, '75');
  await page.locator('#mycoatch-experience').selectOption('intermediate');
  await page.locator('#mycoatch-calibration').selectOption('regular');
  const references = page.locator('.mycoatch-profile-details').last();
  if (await references.evaluate(node => !node.open)) {
    await references.locator('summary').click();
  }
  await page.locator('#mycoatch-load-bench-date').fill(new Date().toISOString().slice(0, 10));
  const second = page.waitForEvent('download', { timeout: 20000 });
  await page.locator('#mycoatch-submit').click();
  const secondCsv = await readFile(await (await second).path(), 'utf8');
  assert.equal(getBench(secondCsv)[6], '80');
  assert.deepEqual(monitor.remoteRequests, []);
  assert.deepEqual(monitor.pageErrors, []);
});


test('import scheda: CSV corrotto lascia storico e selezione attiva intatti', async ({ page }) => {
  const monitor = await openIsolatedApp(page);
  const result = await page.evaluate(async () => {
    const { importWorkoutPlan } = await import('/js/csvHandler.js');
    const { state } = await import('/js/state.js');
    const before = JSON.stringify(state.workoutData);
    const view = [state.activeMesocycleIndex, state.activeWeek, state.activeDay];
    const missingHeader = importWorkoutPlan('Settimana;Giorno;Esercizio;Reps\n1;1;Panca;8');
    const invalidLaterRow = importWorkoutPlan(
      'Settimana;Giorno;Blocco;Esercizio;Set;Reps\n' +
      '1;1;1;Panca Piana con Bilanciere;3;6-8\n' +
      '1;2;1;Squat con Bilanciere;zero;6-8'
    );
    return { missingHeader, invalidLaterRow,
      historyPreserved: JSON.stringify(state.workoutData) === before,
      viewPreserved: JSON.stringify(
        [state.activeMesocycleIndex, state.activeWeek, state.activeDay]
      ) === JSON.stringify(view)
    };
  });
  assert.equal(result.missingHeader.success, false);
  assert.equal(result.invalidLaterRow.success, false);
  assert.match(result.invalidLaterRow.error, /Set non valido/);
  assert.equal(result.historyPreserved, true);
  assert.equal(result.viewPreserved, true);
  assert.deepEqual(monitor.remoteRequests, []);
  assert.deepEqual(monitor.pageErrors, []);
});

test('import storico: record duplicati rifiutati e collisioni di nome salvate separatamente', async ({ page }) => {
  const monitor = await openIsolatedApp(page);
  const outcome = await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    const { importProgressCSV } = await import('/js/csvHandler.js');
    const year = new Date().getFullYear();
    const list = state.workoutData.history.years[year].mesocycles;
    const before = JSON.stringify(list);
    const name = list[0].name;
    const csvSafe = text => '"' + String(text).replaceAll('"','""') + '"';
    const header = 'Mesociclo,Settimana,Giorno,Data,Blocco,Esercizio,Serie,Kg_Reali,Reps_Reali,Completato,Rpe,Recupero,Note_Esercizio';
    const record = (n, kg, completed, rpe = '') => [
      csvSafe(name),1,1,'2026-10-10',1,'Panca Piana con Bilanciere',
      n,kg,8,completed,rpe,'180s','Test sintetico'
    ].join(',');
    const wrong = importProgressCSV(
      header + '\n' + record(1,80,'SI') + '\n' + record(1,80,'SI')
    );
    const intactAfterError = JSON.stringify(list) === before;
    const passed = importProgressCSV(
      header + '\n' + record(1,80,'NO') + '\n' + record(2,82.5,'SI',8)
    );
    const current = state.workoutData.history.years[year].mesocycles;
    const imported = current.at(-1);
    return {
      wrong, intactAfterError, passed,
      originalsUnchanged: JSON.stringify(current.slice(0,-1)) === before,
      name: imported.name,
      sets: imported.weeks[0].days[0].exercises[0].loggedSets
    };
  });
  assert.equal(outcome.wrong.success, false);
  assert.equal(outcome.intactAfterError, true);
  assert.equal(outcome.passed.success, true, outcome.passed.error);
  assert.equal(outcome.originalsUnchanged, true);
  assert.match(outcome.name, /\(importazione 2\)$/);
  assert.equal(outcome.sets.length, 2);
  assert.equal(outcome.sets[0].isLocked, false);
  assert.equal(outcome.sets[0].rpe, '');
  assert.equal(outcome.sets[1].isLocked, true);
  assert.equal(outcome.sets[1].rpe, '8');
  assert.deepEqual(monitor.remoteRequests, []);
  assert.deepEqual(monitor.pageErrors, []);
});


test('anteprima successiva: avvisa se prima settimana calibrata solo in parte e non cancella il diario', async ({ page }) => {
  const monitoring = await openIsolatedApp(page);
  const created = await page.evaluate(async () => {
    const { MyCoatch } = await import('/mycoatch/index.js');
    const { importWorkoutPlan } = await import('/js/csvHandler.js');
    const { state } = await import('/js/state.js');
    const { renderWorkoutList } = await import('/js/ui.js');
    state.workoutData.history.years = {};
    MyCoatch.generateNextFromHistory({ history: { years: {} } }, {
      daysPerWeek: 4, durationWeeks: 4, userAge: 36,
      focus: 'hybrid', maxSessionMinutes: 75,
      athleteProfile: {
        experience: 'beginner', calibration: 'guided',
        priorityMuscle: null, excludedExercises: [], referenceLoads: {}
      }
    });
    const result = importWorkoutPlan(MyCoatch.exportAsCSV());
    if (!result.success) return { success: false, error: result.error };
    const year = state.workoutData.history.years[new Date().getFullYear()];
    const first = year.mesocycles.at(-1).weeks[0].days[0].exercises[0].loggedSets[0];
    Object.assign(first, {
      weight: '40', reps: '8', rpe: '7', isLocked: true, completed: true
    });
    first.completedAt = new Date().toISOString();
    window.testJournal.setItem('workoutApp_data', JSON.stringify(state.workoutData));
    renderWorkoutList();
    return { success: true };
  });
  assert.equal(created.success, true, JSON.stringify(created));

  const before = await page.evaluate(() => window.testJournal.getItem('workoutApp_data'));
  const previews = [];
  page.on('dialog', async dialog => {
    if (dialog.type() === 'confirm') {
      previews.push(dialog.message());
      await dialog.dismiss();
    } else {
      await dialog.accept();
    }
  });
  await startCoach(page, '75');
  await page.locator('#mycoatch-submit').click();
  await expect(page.locator('#mycoatch-form-feedback'))
    .toContainText('nessun dato storico modificato');
  assert.ok(previews.some(p => p.includes('calibrazione NON completata') &&
    p.includes('Riferimenti mancanti: Squat')),
    'La proposta parziale deve dichiarare gli esercizi ancora mancanti');
  assert.equal(await page.evaluate(() => window.testJournal.getItem('workoutApp_data')),
    before, 'L’anteprima annullata non può riscrivere allenamenti esistenti');

  // Simula poi solo serie confermate davvero, come un utente che abbia
  // completato il resto della prima settimana. Nessuna macchina remota.
  const completed = await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    const meso = state.workoutData.history.years[new Date().getFullYear()].mesocycles.at(-1);
    for (const day of meso.weeks[0].days) {
      for (const ex of day.exercises) {
        for (const set of ex.loggedSets) {
          Object.assign(set, {
            weight: '40', reps: '8', rpe: '7', isLocked: true, completed: true
          });
        }
      }
    }
    window.testJournal.setItem('workoutApp_data', JSON.stringify(state.workoutData));
    return meso.weeks[0].days.length;
  });
  assert.equal(completed, 4);
  const allBefore = await page.evaluate(() => window.testJournal.getItem('workoutApp_data'));
  await page.locator('#mycoatch-submit').click();
  assert.ok(previews.some(p => p.includes('Calibrazione della prima settimana registrata') &&
    p.includes('NON significa che le settimane restanti')),
    'Anche quando la calibrazione è pronta non deve dichiarare concluso il blocco');
  assert.equal(await page.evaluate(() => window.testJournal.getItem('workoutApp_data')),
    allBefore);
  assert.deepEqual(monitoring.remoteRequests, []);
  assert.deepEqual(monitoring.pageErrors, []);
});

test('CSV precompila davvero gli input, il check copia alle serie dopo senza inventare RPE', async ({ page }) => {
  const monitoring = await openIsolatedApp(page);
  page.on('dialog', d => d.accept());

  const csv = [
    HEADER,
    '1;1;1;Panca Piana con Bilanciere;3;8-12;70;70;8;180s;Programma di prova;',
    '1;1;2;Lat Machine con Triangolo;2;8-10;50;50;8;120s;Richiamo;',
  ].join('\n');

  const imported = await page.evaluate(async content => {
    const { importWorkoutPlan } = await import('/js/csvHandler.js');
    const { renderWorkoutList } = await import('/js/ui.js');
    const result = importWorkoutPlan(content);
    if (result.success) renderWorkoutList();
    return result;
  }, csv);
  assert.equal(imported.success, true, JSON.stringify(imported));
  // I valori restano suggeriti ma il paragrafo esplicativo non si ripete su ogni card.
  await expect(page.locator('#workout-list-container')).not.toContainText('Carichi e ripetizioni sono suggeriti dal CSV');
  await expect(page.locator('#workout-list-container')).not.toContainText("L'RPE mostrato è un obiettivo");

  const kg = idx => page.locator(`.set-kg[data-ex="0"][data-set="${idx}"]`);
  const reps = idx => page.locator(`.set-reps[data-ex="0"][data-set="${idx}"]`);
  const rpe = idx => page.locator(`.set-rpe[data-ex="0"][data-set="${idx}"]`);
  const check = idx => page.locator(`.set-lock-check[data-ex="0"][data-set="${idx}"]`);

  await expect(kg(0)).toHaveValue('70');
  await expect(reps(0)).toHaveValue('8');
  await expect(rpe(0)).toHaveValue('8');
  await expect(kg(1)).toHaveValue('70');
  await expect(reps(1)).toHaveValue('8');

  // Nessuna serie viene falsamente completata dall'importazione.
  const before = await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    const current = state.workoutData.history.years[String(new Date().getFullYear())].mesocycles.at(-1);
    return current.weeks[0].days[0].exercises[0].loggedSets.map(set =>
      ({weight:set.weight,reps:set.reps,rpe:set.rpe,isLocked:set.isLocked}));
  });
  assert.ok(before.every(s => !s.isLocked && s.weight === '' && s.reps === '' && s.rpe === ''));

  // Un singolo check attesta kg, reps e RPE visibili; le altre righe restano suggerite.
  await check(0).check();
  const first = await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    const current = state.workoutData.history.years[String(new Date().getFullYear())].mesocycles.at(-1);
    return current.weeks[0].days[0].exercises[0].loggedSets;
  });
  assert.equal(first[0].weight,70);
  assert.equal(first[0].reps,'8');
  assert.equal(first[0].rpe,8);
  assert.equal(first[0].isLocked,true);
  assert.equal(first[1].isLocked,false);
  assert.equal(first[1].weight,'');
  await expect(kg(1)).toHaveValue('70');
  await expect(reps(1)).toHaveValue('8');

  // L'atleta corregge il tiro solo dove serve: cambia carico, reps e RPE.
  await kg(1).fill('72.5');
  await reps(1).fill('9');
  await rpe(1).fill('9');
  await check(1).check();

  await expect(kg(2)).toHaveValue('72.5');
  await expect(reps(2)).toHaveValue('9');
  await expect(rpe(2)).toHaveValue('8'); // priorità al target RPE attuale, non al valore percepito nella serie precedente
  const second = await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    const current = state.workoutData.history.years[String(new Date().getFullYear())].mesocycles.at(-1);
    return current.weeks[0].days[0].exercises[0].loggedSets;
  });
  assert.equal(second[1].weight,72.5);
  assert.equal(second[1].reps,'9');
  assert.equal(second[1].rpe,9);
  assert.equal(second[2].weight,'');
  assert.equal(second[2].rpe,'');

  // Persiste la prestazione reale, non le suggestioni delle altre righe.
  const saved = await page.evaluate(() => JSON.parse(window.testJournal.getItem('workoutApp_data')));
  const logged = saved.history.years[String(new Date().getFullYear())].mesocycles.at(-1)
    .weeks[0].days[0].exercises[0].loggedSets;
  assert.equal(logged[0].isLocked,true);
  assert.equal(logged[0].rpe,8);
  assert.equal(logged[2].weight,'');
  assert.deepEqual(monitoring.remoteRequests,[]);
  assert.deepEqual(monitoring.pageErrors,[]);
});

test('calibrazione CSV senza kg: il check richiede ancora un carico reale', async ({ page }) => {
  await openIsolatedApp(page);
  page.on('dialog', d => d.accept());
  const csv = [
    HEADER,
    '1;1;1;Panca Piana con Bilanciere;2;6-10;;;7.5;180s;Calibrazione;'
  ].join('\n');
  const result = await page.evaluate(async content => {
    const { importWorkoutPlan } = await import('/js/csvHandler.js');
    const { renderWorkoutList } = await import('/js/ui.js');
    const r=importWorkoutPlan(content);
    if (r.success) renderWorkoutList();
    return r;
  },csv);
  assert.equal(result.success,true);
  await expect(page.locator('.set-kg[data-ex="0"][data-set="0"]')).toHaveValue('');
  await expect(page.locator('.set-reps[data-ex="0"][data-set="0"]')).toHaveValue('6');
  await expect(page.locator('.set-rpe[data-ex="0"][data-set="0"]')).toHaveValue('7.5');
  // Il check viene annullato dalla validazione per assenza di kg.
  await page.locator('.set-lock-check[data-ex="0"][data-set="0"]').click();
  await expect(page.locator('.set-lock-check[data-ex="0"][data-set="0"]')).not.toBeChecked();
});


test('settimane successive: riusa soltanto le serie confermate dello stesso mesociclo', async ({ page }) => {
  const monitor = await openIsolatedApp(page);
  page.on('dialog', dialog => dialog.accept());
  const csv = [HEADER,
    '1;1;1;Panca Piana con Bilanciere;3;8-12;70;70;8;180s;Settimana 1;',
    '2;1;1;Panca Piana con Bilanciere;3;8-12;70;70;8;180s;Settimana 2;',
    '3;1;1;Panca Piana con Bilanciere;3;8-12;75;75;8;180s;Progressione CSV;'
  ].join('\n');
  const added = await page.evaluate(async csvContent => {
    const { importWorkoutPlan } = await import('/js/csvHandler.js');
    const { renderWorkoutList } = await import('/js/ui.js');
    const result = importWorkoutPlan(csvContent);
    if (result.success) renderWorkoutList();
    return result;
  }, csv);
  assert.equal(added.success,true,JSON.stringify(added));

  const kg = i => page.locator('.set-kg[data-ex="0"][data-set="' + i + '"]');
  const reps = i => page.locator('.set-reps[data-ex="0"][data-set="' + i + '"]');
  const rpe = i => page.locator('.set-rpe[data-ex="0"][data-set="' + i + '"]');
  const check = i => page.locator('.set-lock-check[data-ex="0"][data-set="' + i + '"]');
  await kg(0).fill('72.5');
  await reps(0).fill('9');
  await check(0).check();
  await kg(1).fill('65');
  await reps(1).fill('10');
  await check(1).check();

  // La settimana 2 parte dai set davvero confermati nelle stesse posizioni.
  await page.locator('#week-selector').selectOption('2');
  await expect(kg(0)).toHaveValue('72.5');
  await expect(reps(0)).toHaveValue('9');
  await expect(kg(1)).toHaveValue('65');
  await expect(reps(1)).toHaveValue('10');
  await expect(kg(2)).toHaveValue('70'); // non eseguito: CSV
  await expect(rpe(0)).toHaveValue('8'); // precompilato ma non ancora confermato
  await expect(check(0)).not.toBeChecked();

  const before = await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    return state.workoutData.history.years[String(new Date().getFullYear())]
      .mesocycles.at(-1).weeks[1].days[0].exercises[0].loggedSets;
  });
  assert.ok(before.every(set => !set.isLocked && set.weight === '' &&
    set.reps === '' && set.rpe === ''));

  await check(0).check();
  const actual = await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    return state.workoutData.history.years[String(new Date().getFullYear())]
      .mesocycles.at(-1).weeks[1].days[0].exercises[0].loggedSets;
  });
  assert.equal(actual[0].weight,72.5);
  assert.equal(actual[0].reps,'9');
  assert.equal(actual[0].rpe,8); // accettato dal check anche senza editing manuale
  assert.equal(actual[0].isLocked,true);
  assert.equal(actual[1].isLocked,false);

  // La settimana 3 prevede 75 kg; la progressione CSV prevale.
  await page.locator('#week-selector').selectOption('3');
  await expect(kg(0)).toHaveValue('75');
  await expect(reps(0)).toHaveValue('8'); // nuovo carico = nuova partenza dal range CSV
  await expect(check(0)).not.toBeChecked();

  // Un nuovo mesociclo non eredita i dati del precedente.
  const other = [HEADER,
    '1;1;1;Panca Piana con Bilanciere;2;6-8;60;60;7.5;180s;Nuovo mesociclo;'
  ].join('\n');
  const next = await page.evaluate(async csvContent => {
    const { importWorkoutPlan } = await import('/js/csvHandler.js');
    const { renderWorkoutList } = await import('/js/ui.js');
    const result=importWorkoutPlan(csvContent);
    if(result.success) renderWorkoutList();
    return result;
  },other);
  assert.equal(next.success,true,JSON.stringify(next));
  await expect(kg(0)).toHaveValue('60');
  await expect(reps(0)).toHaveValue('6');
  await expect(check(0)).not.toBeChecked();
  assert.deepEqual(monitor.remoteRequests,[]);
  assert.deepEqual(monitor.pageErrors,[]);
});


test('feedback MyCoatch flottante: 15 secondi, chiusura manuale e consiglio recuperabile', async ({ page }) => {
  const monitoring = await openIsolatedApp(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await prepareLiveWorkout(page);
  const toast = page.locator('#mycoatch-live-toast');
  await expect(toast).toHaveCount(0);

  // La digitazione NON e' una performance registrata, non apre popup.
  await page.locator('.set-kg[data-set="0"]').fill('80');
  await page.locator('.set-reps[data-set="0"]').fill('8');
  await page.locator('.set-rpe[data-set="0"]').fill('9.5');
  await expect(toast).toHaveCount(0);

  await page.clock.install();
  await page.locator('.set-lock-check[data-set="0"]').check();
  await expect(toast).toBeVisible();
  await expect(toast).toContainText('RPE molto alto');
  const coords = await toast.boundingBox();
  assert.ok(coords && coords.x >= 0 && coords.y >= 0 &&
    coords.y + coords.height <= 844 && coords.y < 260,
    'MyCoatch toast is centered near the top of the mobile viewport, not below the fold');
  await expect(page.locator('.mycoatch-live-advice-history')).not.toHaveAttribute('open', '');

  // Il coach continua a offrire il dettaglio dopo la scadenza.
  // Il test non deve dipendere dal millisecondo esatto: il browser puo'
  // aver consumato qualche ms tra check, layout e assertions.
  await page.clock.fastForward(12000);
  await expect(toast).toBeVisible();
  await page.clock.fastForward(4000);
  await expect(toast).toHaveCount(0);
  await page.locator('.mycoatch-live-trigger').click();
  await page.locator('.mycoatch-live-advice-history > summary').click();
  await expect(page.locator('.mycoatch-live-advice-history .mycoatch-live-advice')).toBeVisible();
  await expect(page.locator('.mycoatch-live-advice-history')).toContainText('RPE molto alto');

  // Nuovo check -> messaggio nuovo e timer riavviato. X chiude subito.
  await page.locator('.set-kg[data-set="1"]').fill('75');
  await page.locator('.set-reps[data-set="1"]').fill('7');
  await page.locator('.set-rpe[data-set="1"]').fill('8');
  await page.locator('.set-lock-check[data-set="1"]').check();
  await expect(toast).toBeVisible();
  await expect(toast).toContainText('serie 2');
  await page.locator('.mycoatch-live-toast-dismiss').click();
  await expect(toast).toHaveCount(0);

  // Uncheck non costituisce una serie nuova e non apre un altro avviso.
  await page.locator('.set-lock-check[data-set="1"]').uncheck();
  await expect(toast).toHaveCount(0);
  assert.deepEqual(monitoring.remoteRequests,[]);
  assert.deepEqual(monitoring.pageErrors,[]);
});

test('errore validazione della serie appare anche vicino all atleta in basso', async ({ page }) => {
  await openIsolatedApp(page);
  await prepareLiveWorkout(page);
  await page.locator('.set-kg[data-set="0"]').fill('');
  // La validazione deseleziona correttamente il check: usare click, non check.
  await page.locator('.set-lock-check[data-set="0"]').click();
  await expect(page.locator('.set-lock-check[data-set="0"]')).not.toBeChecked();
  await expect(page.locator('#mycoatch-live-toast')).toContainText('Inserisci il peso');
  await expect(page.locator('#mycoatch-live-toast')).toHaveAttribute('role','alert');
});


test('shell compatto mobile: navigazione rapida, menu utility e MyCoatch apribile', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const monitoring = await openIsolatedApp(page);
  await prepareLiveWorkout(page);

  const sizes = await page.evaluate(() => {
    const rect = selector => document.querySelector(selector)?.getBoundingClientRect();
    return {
      header: rect('.app-header-container')?.height,
      nav: rect('.unified-header-box')?.height,
      coach: rect('#mycoatch-live-disclosure')?.height,
      firstExerciseTop: rect('.ex-card')?.top,
      width: document.documentElement.scrollWidth,
      viewport: document.documentElement.clientWidth
    };
  });
  assert.ok(sizes.header <= 95, 'Header too tall: ' + JSON.stringify(sizes));
  assert.ok(sizes.nav <= 180, 'Navigator too tall: ' + JSON.stringify(sizes));
  assert.ok(sizes.coach <= 65, 'Coach collapsed row too tall: ' + JSON.stringify(sizes));
  assert.ok(sizes.firstExerciseTop < 435, 'First exercise below the fold: ' + JSON.stringify(sizes));
  assert.ok(sizes.width <= sizes.viewport, 'Unexpected horizontal body scrolling: ' + JSON.stringify(sizes));

  await expect(page.locator('#mycoatch-live-disclosure')).not.toHaveAttribute('open', '');
  await expect(page.locator('.mycoatch-live-count')).toContainText('0/3');

  // Manuale, tema e account sono in Altro, mantenendo le scorciatoie principali.
  await page.locator('#app-utility-menu > summary').click();
  await expect(page.locator('#btn-user-manual')).toBeVisible();
  await expect(page.locator('#theme-toggle-btn')).toBeVisible();
  await expect(page.locator('#user-info-bar')).toBeVisible();
  await page.locator('#theme-toggle-btn').click();
  await expect(page.locator('#app-utility-menu')).not.toHaveAttribute('open', '');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

  await page.locator('#app-utility-menu > summary').click();
  await page.locator('#btn-user-manual').click();
  await expect(page.locator('#manual')).toBeVisible();
  await expect(page.locator('#app-utility-menu')).not.toHaveAttribute('open', '');
  await page.locator('#app-utility-menu > summary').click();
  await page.locator('#btn-user-manual').click();
  await expect(page.locator('#workout-list-container')).toBeVisible();

  await page.locator('.mycoatch-live-trigger').click();
  await expect(page.locator('#mycoatch-live-panel')).toBeVisible();
  await page.locator('.set-kg[data-set="0"]').fill('80');
  await page.locator('.set-reps[data-set="0"]').fill('8');
  await page.locator('.set-rpe[data-set="0"]').fill('8');
  await page.locator('.set-lock-check[data-set="0"]').check();
  await expect(page.locator('.mycoatch-live-count')).toContainText('1/3');
  await expect(page.locator('#mycoatch-live-disclosure')).toHaveAttribute('open', '');
  await expect(page.locator('#mycoatch-live-toast')).toBeVisible();
  assert.deepEqual(monitoring.remoteRequests, []);
  assert.deepEqual(monitoring.pageErrors, []);
});

test('shell compatto su smartphone stretto e navigazione mesocicli/settimane', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  const monitoring = await openIsolatedApp(page);
  const snapshot = await page.evaluate(() => ({
    fullWidth: document.documentElement.scrollWidth,
    viewportWidth: document.documentElement.clientWidth,
    brand: document.querySelector('.app-brand')?.textContent?.trim(),
    currentMeso: document.getElementById('meso-display')?.textContent
  }));
  assert.ok(snapshot.fullWidth <= snapshot.viewportWidth,
    '320px page must not overflow horizontally: ' + JSON.stringify(snapshot));
  assert.match(snapshot.brand, /HomeGym/);
  await expect(page.locator('#week-selector')).toBeVisible();
  await page.locator('#week-selector').selectOption('2');
  await expect(page.locator('#week-selector')).toHaveValue('2');
  await expect(page.locator('#next-meso-btn')).toBeDisabled();
  await expect(page.locator('.day-tabs button.active-day-btn')).toHaveCount(1);
  await expect(page.locator('#open-analytics-btn')).toBeVisible();
  await page.locator('#open-analytics-btn').click();
  await expect(page.locator('#analytics-modal')).not.toHaveClass(/hidden/);
  await page.locator('#close-analytics-btn').click();
  assert.deepEqual(monitoring.remoteRequests, []);
  assert.deepEqual(monitoring.pageErrors, []);
});

test('MyCoatch visual preview: all weeks shown and diary changes only after explicit apply', async ({ page })=>{
  const monitoring=await openIsolatedApp(page);
  await startCoach(page,'60');
  page.on('dialog',async dialog=>dialog.accept());
  await page.locator('#mycoatch-preview-btn').click();
  await expect(page.locator('#mycoatch-preview-overlay')).not.toHaveClass(/hidden/);
  await expect(page.locator('.mycoatch-preview-week')).toHaveCount(4);
  await expect(page.locator('#mycoatch-preview-summary')).toContainText('scheda esistente rimane intatta');
  const before=await page.evaluate(()=>JSON.parse(window.testJournal.getItem('workoutApp_data')));
  assert.deepEqual(before,fixture);
  await page.locator('#mycoatch-preview-apply').click();
  await expect(page.locator('#mycoatch-preview-overlay')).toHaveClass(/hidden/);
  const updated=await page.evaluate(()=>{
    const d=JSON.parse(window.testJournal.getItem('workoutApp_data'));
    const mesos=d.history.years[new Date().getFullYear()].mesocycles;
    return {count:mesos.length,first:mesos[0].name,last:mesos.at(-1).name,days:mesos.at(-1).weeks[0].days.map(x=>x.dayName)};
  });
  assert.equal(updated.count,2);
  assert.deepEqual(updated.days,['Upper A','Lower A','Upper B','Lower B']);
  assert.deepEqual(monitoring.pageErrors,[]);
});

test('analytics mesocycle selector isolates Macro/Micro across years',async({page})=>{
  await page.addInitScript(()=>{window.Chart=class {constructor(){}destroy(){}};});
  const monitoring=await openIsolatedApp(page);
  await page.locator('#open-analytics-btn').click();
  await page.locator('[data-subtab="subtab-macro"]').click();
  const select=page.locator('#analytics-meso-select');
  await expect(select).toBeVisible();
  await expect(select.locator('option')).toHaveCount(2);
  const options=await select.locator('option').evaluateAll(options=>
    options.map(option=>({value:option.value,text:option.textContent})));
  assert.ok(options[0].text.includes('Primo mesociclo'));
  assert.ok(options[1].text.includes('Secondo mesociclo'));
  await select.selectOption(options[0].value);
  await expect(page.locator('#kpi-volume')).toHaveText('0.6 Ton');
  await select.selectOption(options[1].value);
  await expect(page.locator('#kpi-volume')).toHaveText('1.8 Ton');
  await page.locator('#open-analytics-btn').click();
  await page.locator('[data-subtab="subtab-micro"]').click();
  await expect(select).toHaveValue(options[1].value);
  assert.deepEqual(monitoring.pageErrors,[]);
});

test('signed-in local snapshots are isolated by account id',async({page})=>{
  await openIsolatedApp(page);
  const result=await page.evaluate(async()=>{
    const {state}=await import('/js/state.js');
    const {saveToLocalStorage,getFromLocalStorageForUser}=await import('/js/storage.js');
    const original=state.currentUser;
    state.currentUser={id:'athlete-A',email:'a@invalid.example'};
    saveToLocalStorage({history:{years:{'2025':{mesocycles:[]}}},updatedAt:'2025-01-01T00:00:00Z'});
    const a=getFromLocalStorageForUser({id:'athlete-A'});
    const b=getFromLocalStorageForUser({id:'athlete-B'});
    state.currentUser={id:'athlete-B',email:'b@invalid.example'};
    saveToLocalStorage({history:{years:{'2026':{mesocycles:[]}}}});
    const aStill=getFromLocalStorageForUser({id:'athlete-A'});
    const bNow=getFromLocalStorageForUser({id:'athlete-B'});
    state.currentUser=original;
    return {a:Object.keys(a.history.years),b:Object.keys(b.history.years),
      aStill:Object.keys(aStill.history.years),bNow:Object.keys(bNow.history.years)};
  });
  assert.deepEqual(result,{a:['2025'],b:[],aStill:['2025'],bNow:['2026']});
});


test('punto 3: mobile card keeps previous performance, per-set plates, coach notes and real set confirmation',async({page})=>{
  await page.setViewportSize({width:375,height:812});
  const monitoring=await openIsolatedApp(page);
  await page.evaluate(async()=>{
    const {state}=await import('/js/state.js');
    const {renderWorkoutList}=await import('/js/ui.js');
    const meso=state.workoutData.history.years['2026'].mesocycles[0];
    const day=meso.weeks[1].days[0];
    const base=day.exercises[0];
    base.notes='Scapole stabili e fermo al petto. '+ 'Controlla la tecnica. '.repeat(18);
    base.loggedSets=[0,1,2].map(()=>({weight:'',reps:'',rpe:'',isLocked:false,completed:false}));
    day.exercises.push({
      ...base,name:'Rematore bilanciere',
      notes:'Busto stabile',loggedSets:[{weight:'',reps:'',rpe:'',isLocked:false}]
    });
    state.activeWeek=2;state.activeDay=1;
    state.workoutData.athlete ||= {};
    state.workoutData.athlete.ownedBarbells=[{weight:20,diameter:'50'},{weight:15,diameter:'50'}];
    state.workoutData.athlete.defaultBarbell={weight:20,diameter:'50'};
    renderWorkoutList();
  });
  const card=page.locator('.ex-card[data-ex="0"]');
  await expect(card.locator('.history-content')).toContainText('72.5kg');
  await expect(card.locator('.exercise-coach-notes')).toBeVisible();
  await expect(card.locator('.exercise-coach-notes .note-allenatore-text')).toContainText('Scapole stabili');
  await expect(card.locator('.ex-user-notes')).toBeVisible();
  await expect(card.locator('.workout-set-row.is-active-set')).toHaveAttribute('data-set-index','0');
  await expect(page.locator('.workout-exercise-nav')).toHaveCount(0);
  await expect(card.locator('.workout-confirm-set')).toHaveCount(0);
  await expect(page.locator('#toggle-lock-meso-btn')).toBeVisible();

  const secondKg=card.locator('.set-kg[data-set="1"]');
  await secondKg.fill('85');
  await expect(card.locator('.workout-set-row.is-active-set')).toHaveAttribute('data-set-index','1');
  await page.evaluate(async()=>{
    const {state}=await import('/js/state.js');state.workoutData.athlete ||= {};
    state.workoutData.athlete.plateInventories={'50':{'20':2,'10':2,'5':2,'2.5':2}};
  });
  await card.locator('.bar-select').selectOption('15|50');
  await expect(card.locator('.plates-badge')).toContainText('35 kg/lato');
  await card.locator('.bar-select').selectOption('20|50');
  await expect(card.locator('.plates-badge')).toContainText('32.5 kg/lato');
  await card.locator('.set-kg[data-set="0"]').fill('80');
  await card.locator('.set-reps[data-set="0"]').fill('8');
  await card.locator('.set-rpe[data-set="0"]').fill('8');
  await card.locator('.ex-user-notes').fill('Ricordare fermo al petto');
  await card.locator('.set-lock-check[data-set="0"]').check();
  const first=await page.evaluate(async()=>{
    const {state}=await import('/js/state.js');
    const day=state.workoutData.history.years['2026'].mesocycles[0].weeks[1].days[0];
    return {sets:day.exercises[0].loggedSets.map(s=>({locked:s.isLocked,weight:s.weight,reps:s.reps,rpe:s.rpe})),
      prev:state.workoutData.history.years['2026'].mesocycles[0].weeks[0].days[0].exercises[0].loggedSets[0].weight};
  });
  assert.equal(first.sets[0].locked,true);
  assert.equal(Number(first.sets[0].weight),80);
  assert.equal(first.sets[0].reps,'8');
  assert.equal(Number(first.sets[0].rpe),8);
  assert.equal(first.sets[1].locked,false);
  assert.equal(first.prev,'72.5'); // preceding synthetic week is unchanged
  await expect(card.locator('.workout-set-row.is-active-set')).toHaveAttribute('data-set-index','1');
  await expect(card.locator('.exercise-coach-notes')).toBeVisible();
  await expect(card.locator('.ex-user-notes')).toHaveValue('Ricordare fermo al petto');
  await expect(card.locator('.history-content')).toContainText('72.5kg');
  assert.deepEqual(monitoring.remoteRequests,[]);
  assert.deepEqual(monitoring.pageErrors,[]);
});

test('scheda mobile: storico uno sotto l’altro, note sopra i set, testo leggibile e niente riga ridondante',async({page})=>{
  await page.setViewportSize({width:375,height:812});
  const monitoring=await openIsolatedApp(page);
  await page.evaluate(async()=>{
    const {state}=await import('/js/state.js');
    const {renderWorkoutList}=await import('/js/ui.js');
    const meso=state.workoutData.history.years['2026'].mesocycles[0];
    const prior=meso.weeks[0].days[0].exercises[0];
    prior.loggedSets=[
      {weight:'72.5',reps:'8',rpe:'8',isLocked:true,completed:true},
      {weight:'75',reps:'7',rpe:'9',isLocked:true,completed:true}
    ];
    state.activeWeek=2;
    state.activeDay=1;
    renderWorkoutList();
  });
  const card=page.locator('.ex-card[data-ex="0"]');
  const rows=card.locator('.history-content > div');
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText('72.5kg');
  await expect(rows.nth(1)).toContainText('75kg');
  const boxes=await rows.evaluateAll(nodes=>nodes.map(n=>{
    const r=n.getBoundingClientRect();
    return {top:r.top,bottom:r.bottom};
  }));
  assert.ok(boxes[1].top >= boxes[0].bottom,
    'ogni serie precedente deve iniziare sotto quella prima');
  const target=await card.locator('.target-box').evaluate(el=>el.compareDocumentPosition(
    el.closest('.ex-card').querySelector('.exercise-coach-notes')));
  assert.ok(target & 4,'note dopo il target');
  const beforeSets=await card.locator('.exercise-coach-notes').evaluate(el=>el.compareDocumentPosition(
    el.closest('.ex-card').querySelector('.set-table')));
  assert.ok(beforeSets & 4,'note prima della tabella');
  await expect(card.locator('.workout-set-status, .active-set-label')).toHaveCount(0);
  const sizes=await card.evaluate(el=>({
    history:parseFloat(getComputedStyle(el.querySelector('.history-content > div')).fontSize),
    tableHeading:parseFloat(getComputedStyle(el.querySelector('.set-table th')).fontSize),
    tableInput:parseFloat(getComputedStyle(el.querySelector('.set-kg')).fontSize)
  }));
  assert.ok(sizes.history>=14,JSON.stringify(sizes));
  assert.ok(sizes.tableHeading>=12,JSON.stringify(sizes));
  assert.ok(sizes.tableInput>=17,JSON.stringify(sizes));
  await expect(card.locator('.workout-set-row.is-active-set')).toHaveCount(1);
  assert.deepEqual(monitoring.pageErrors,[]);
});

test('mobile 320px: meso lock always visible, no nav, exclusion by double-click only',async({page})=>{
  await page.setViewportSize({width:320,height:760});
  await openIsolatedApp(page);
  const lock=page.locator('#toggle-lock-meso-btn');
  await expect(lock).toBeVisible();
  await expect(page.locator('.meso-more-actions')).toHaveCount(0);
  await expect(page.locator('.workout-exercise-nav')).toHaveCount(0);
  page.on('dialog',dialog=>dialog.accept());
  await lock.click();
  await expect(page.locator('#toggle-lock-meso-btn')).toContainText('Sblocca mesociclo');
  await page.locator('#toggle-lock-meso-btn').click();
  await expect(page.locator('#toggle-lock-meso-btn')).toContainText('Blocca mesociclo');
  const card=page.locator('.ex-card[data-ex="0"]');
  await expect(card.locator('.exercise-exclude-hint')).toContainText('Doppio click o swipe per escludere');
  await expect(card.locator('.exercise-exclude-btn')).toHaveCount(0);
  await card.locator('.ex-name').dblclick();
  await expect(page.locator('.ex-card[data-ex="0"]')).toHaveClass(/is-excluded/);
  await page.locator('.ex-card[data-ex="0"] .ex-name').dblclick();
  await expect(page.locator('.ex-card[data-ex="0"]')).not.toHaveClass(/is-excluded/);
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth);
  assert.ok(overflow<=2,'Unexpected horizontal overflow: '+overflow);
});

test('gesture: 299px ignores, 310px toggles, reverse toggles back, inputs cannot trigger',async({page})=>{
  await page.setViewportSize({width:375,height:780});
  await openIsolatedApp(page);
  const swipe=async(x1,x2,selector='.ex-name')=>page.evaluate(([start,end,sel])=>{
    const el=document.querySelector('.ex-card[data-ex="0"] '+sel);
    const pt=x=>new Touch({identifier:7,target:el,clientX:x,clientY:240,pageX:x,pageY:240});
    el.dispatchEvent(new TouchEvent('touchstart',{bubbles:true,touches:[pt(start)],changedTouches:[pt(start)]}));
    el.dispatchEvent(new TouchEvent('touchmove',{bubbles:true,touches:[pt(end)],changedTouches:[pt(end)]}));
    el.dispatchEvent(new TouchEvent('touchend',{bubbles:true,touches:[],changedTouches:[pt(end)]}));
  },[x1,x2,selector]);
  await swipe(340,41);
  await expect(page.locator('.ex-card[data-ex="0"]')).not.toHaveClass(/is-excluded/);
  await swipe(342,32);
  await expect(page.locator('.ex-card[data-ex="0"]')).toHaveClass(/is-excluded/);
  await swipe(32,342);
  await expect(page.locator('.ex-card[data-ex="0"]')).not.toHaveClass(/is-excluded/);
  await swipe(342,32,'.set-kg');
  await expect(page.locator('.ex-card[data-ex="0"]')).not.toHaveClass(/is-excluded/);
});

test('checkbox explicitly accepts kg, reps and prefilled RPE and recheck edits for MyCoatch',async({page})=>{
  const monitoring=await openIsolatedApp(page);
  await prepareLiveWorkout(page);
  const kg=page.locator('.set-kg[data-set="0"]');
  const reps=page.locator('.set-reps[data-set="0"]');
  const rpe=page.locator('.set-rpe[data-set="0"]');
  const check=page.locator('.set-lock-check[data-set="0"]');
  await expect(kg).toHaveValue('80');
  await expect(reps).toHaveValue('6');
  await expect(rpe).toHaveValue('8');
  await expect(page.locator('.workout-confirm-set')).toHaveCount(0);
  // Prima del check, l'RPE visualizzato è solo una proposta e MyCoatch lo ignora.
  const initial=await page.evaluate(async()=>{
    const {state}=await import('/js/state.js');
    const {assessExerciseLive}=await import('/mycoatch/liveCoach.js');
    const ex=state.workoutData.history.years[new Date().getFullYear()].mesocycles[0].weeks[0].days[0].exercises[0];
    return {observed:ex.loggedSets[0].rpe,coaching:assessExerciseLive(ex,0)};
  });
  assert.equal(initial.observed,'');
  assert.equal(initial.coaching,null);
  await check.check();  // no text-input event sent
  await expect(check).toBeChecked();
  let result=await page.evaluate(async()=>{
    const {state}=await import('/js/state.js');
    const s=state.workoutData.history.years[new Date().getFullYear()].mesocycles[0].weeks[0].days[0].exercises[0].loggedSets[0];
    return {weight:s.weight,reps:s.reps,rpe:s.rpe,isLocked:s.isLocked};
  });
  assert.deepEqual(result,{weight:80,reps:'6',rpe:8,isLocked:true});
  await expect(page.locator('#mycoatch-live-panel')).toContainText('Serie confermate: 1/3');
  await check.uncheck();
  await expect(page.locator('#mycoatch-live-panel')).toContainText('Serie confermate: 0/3');
  const afterUncheck=await page.evaluate(async()=>{
    const {state}=await import('/js/state.js');
    const {assessExerciseLive}=await import('/mycoatch/liveCoach.js');
    const ex=state.workoutData.history.years[new Date().getFullYear()].mesocycles[0].weeks[0].days[0].exercises[0];
    return assessExerciseLive(ex,0);
  });
  assert.equal(afterUncheck,null);
  await expect(kg).toBeEnabled();
  await expect(reps).toBeEnabled();
  await expect(rpe).toBeEnabled();
  await kg.fill('85');
  await reps.fill('8');
  await rpe.fill('9');
  await check.check();
  result=await page.evaluate(async()=>{
    const {state}=await import('/js/state.js');
    const s=state.workoutData.history.years[new Date().getFullYear()].mesocycles[0].weeks[0].days[0].exercises[0].loggedSets[0];
    return {weight:s.weight,reps:s.reps,rpe:s.rpe,isLocked:s.isLocked};
  });
  assert.deepEqual(result,{weight:85,reps:'8',rpe:9,isLocked:true});
  assert.deepEqual(monitoring.remoteRequests,[]);
  assert.deepEqual(monitoring.pageErrors,[]);
});


test('all six exercise cards prefill by current prescription or comparable confirmed history only',async({page})=>{
  await page.setViewportSize({width:375,height:812});
  const monitoring=await openIsolatedApp(page);
  await page.evaluate(async()=>{
    const {state}=await import('/js/state.js');
    const {renderWorkoutList}=await import('/js/ui.js');
    const meso=state.workoutData.history.years['2026'].mesocycles[0];
    const done=(weight,reps,rpe,more={})=>({weight:String(weight),reps:String(reps),
      rpe:String(rpe),isLocked:true,completed:true,...more});
    const empty=(extra={})=>({weight:'',reps:'',rpe:'',isLocked:false,completed:false,...extra});
    const ex=(name,kg,reps='8-12',rpe='@8',opts={})=>({
      name,block:1,kgMin:String(kg),kgMax:String(kg),reps,targetRpe:rpe,rpe,
      notes:'Obiettivo tecnico: movimento controllato.',userNotes:'',
      loggedSets:[empty(),empty()],...opts
    });
    meso.weeks[0].days[0].exercises=[
      ex('Panca Bilanciere',70,'8-12','@8',{loggedSets:[done(72.5,9,9),done(72.5,8,9)]}),
      ex('Rematore Bilanciere',80,'8-12','@8',{loggedSets:[done(80,10,9)]}),
      ex('Curl manubri',12.5,'10-12','@8',{loggedSets:[done(12.5,12,9)]}),
      ex('Panca topset',70,'8-10','@8',{topset:'1x5 @90kg',
        loggedSets:[done(90,5,9),done(70,8,8)]}),
      ex('Curl drop set',12,'10-12','@8',{isDropset:true,groupType:'dropset',groupBase:5,
        loggedSets:[done(12,'10+8+6',8,{intensityTechnique:'DROP_SET'})]})
    ];
    meso.weeks[1].days[0].exercises=[
      ex('Panca Bilanciere',70),
      ex('Rematore Bilanciere',85),
      ex('Curl manubri',12.5,'10-12','@7'),
      ex('Panca topset',70,'8-10','@8',{topset:'1x5 @90kg',
        loggedSets:[done(90,5,9),empty()]}),
      ex('Curl drop set',12,'10-12','@8',{isDropset:true,groupType:'dropset',groupBase:5,
        loggedSets:[empty({intensityTechnique:'DROP_SET'})]}),
      ex('Croci macchina',20,'12-15','@8',{userNotes:'Tieni gomiti morbidi'})
    ];
    state.activeWeek=2;state.activeDay=1;
    renderWorkoutList();
  });
  const expected=[
    {kg:'72.5',reps:'9',rpe:'8',source:'confirmed_previous_week'},
    {kg:'85',reps:'8',rpe:'8',source:'csv_target'},
    {kg:'12.5',reps:'10',rpe:'7',source:'csv_target'},
    {kg:'90',reps:'5',rpe:'9',source:'current_entry'},
    {kg:'12',reps:'10+8+6',rpe:'8',source:'confirmed_previous_week'},
    {kg:'20',reps:'12',rpe:'8',source:'csv_target'}
  ];
  await expect(page.locator('.ex-card')).toHaveCount(expected.length);
  await expect(page.locator('.workout-confirmation-help')).toHaveCount(1);
  await expect(page.locator('.ex-card .workout-rpe-hint')).toHaveCount(0);
  for(let i=0;i<expected.length;i++){
    const card=page.locator('.ex-card[data-ex="'+i+'"]');
    const setIndex=i===3?0:0;
    const row=card.locator('.workout-set-row[data-set-index="'+setIndex+'"]');
    await expect(row.locator('.set-kg')).toHaveValue(expected[i].kg);
    await expect(row.locator('.set-reps')).toHaveValue(expected[i].reps);
    await expect(row.locator('.set-rpe')).toHaveValue(expected[i].rpe);
    await expect(row).toHaveAttribute('data-prefill-source',expected[i].source);
    await expect(card.locator('.exercise-coach-notes .note-allenatore-text')).toBeVisible();
    await expect(card.locator('.ex-user-notes')).toBeVisible();
  }
  // A heavy top set never preloads its weight into a back-off.
  const backoff=page.locator('.ex-card[data-ex="3"] .workout-set-row[data-set-index="1"]');
  await expect(backoff.locator('.set-kg')).toHaveValue('70');
  await expect(backoff.locator('.set-reps')).toHaveValue('8');
  await expect(backoff.locator('.set-rpe')).toHaveValue('8');
  // Every draft is still absent from the actual workout history.
  const before=await page.evaluate(async()=>{
    const {state}=await import('/js/state.js');
    return state.workoutData.history.years['2026'].mesocycles[0].weeks[1].days[0].exercises
      .map(ex=>({name:ex.name,sets:ex.loggedSets.map(s=>({checked:!!(s.isLocked||s.completed),
        kg:s.weight,reps:s.reps,rpe:s.rpe}))}));
  });
  assert.ok(before.every((ex,i)=>i===3 || ex.sets.every(s=>!s.checked && s.kg==='' && s.reps==='' && s.rpe==='')));
  assert.deepEqual(monitoring.remoteRequests,[]);
  assert.deepEqual(monitoring.pageErrors,[]);
});


test('multi-device: a changed cloud row blocks stale offline updates until a chosen version wins',async({page})=>{
  const monitoring=await openIsolatedApp(page);
  const initial=await page.evaluate(async()=>{
    const {supabase}=await import('/js/config.js');
    const {state}=await import('/js/state.js');
    const {pullDataFromSupabase}=await import('/js/sync.js');
    const {saveToLocalStorage,getCloudRevision}=await import('/js/storage.js');
    const user={id:'fake-two-devices',email:'sync-e2e@invalid.example'};
    state.currentUser=user;
    const payload=structuredClone(state.workoutData);
    payload.athlete.email='base@invalid.example';
    payload.updatedAt='2026-10-16T18:00:00.000Z';
    saveToLocalStorage(payload,{preserveUpdatedAt:true});
    window.__testCloudRow={
      email:user.email,payload:structuredClone(payload),
      updated_at:'2026-10-16T18:00:00.000Z'
    };
    supabase.from=table=>{
      if(table!=='workouts')throw Error('Unexpected remote table '+table);
      let mode='read',proposed=null;
      const filters={};
      const query={
        select(){return query;},
        eq(k,v){filters[k]=v;return query;},
        update(p){mode='update';proposed=p;return query;},
        insert(p){mode='insert';proposed=p;return query;},
        async maybeSingle(){
          const row=window.__testCloudRow;
          if(mode==='read')return {data:row?structuredClone(row):null,error:null};
          if(mode==='update'){
            if(!row || filters.email!==row.email || filters.updated_at!==row.updated_at)
              return {data:null,error:null};
            window.__testCloudRow={...structuredClone(proposed)};
            return {data:{updated_at:window.__testCloudRow.updated_at},error:null};
          }
          if(row)return {data:null,error:{code:'23505',message:'duplicate email'}};
          window.__testCloudRow={...structuredClone(proposed)};
          return {data:{updated_at:window.__testCloudRow.updated_at},error:null};
        }
      };
      return query;
    };
    await pullDataFromSupabase(user); // establish CAS revision from the cloud
    return {revision:getCloudRevision(user),user};
  });
  assert.equal(initial.revision,'2026-10-16T18:00:00.000Z');

  const observed=await page.evaluate(async()=>{
    const {state}=await import('/js/state.js');
    const {saveAndSync,processSyncQueue,getSyncConflict,hasPendingSync}=await import('/js/storage.js');
    // MacBook changed the server AFTER the smartphone read it.
    window.__testCloudRow.updated_at='2026-10-16T18:03:00.000Z';
    window.__testCloudRow.payload.athlete.email='edited-on-mac@invalid.example';
    const local=structuredClone(state.workoutData);
    local.athlete.email='edited-on-phone@invalid.example';
    await saveAndSync(local);
    await processSyncQueue();
    return {
      remote:window.__testCloudRow.payload.athlete.email,
      local:state.workoutData.athlete.email,
      conflict:getSyncConflict(state.currentUser),
      queued:hasPendingSync()
    };
  });
  assert.equal(observed.remote,'edited-on-mac@invalid.example');
  assert.equal(observed.local,'edited-on-phone@invalid.example');
  assert.equal(observed.conflict.remoteRevision,'2026-10-16T18:03:00.000Z');
  assert.equal(observed.queued,true);
  const warning=page.locator('#sync-conflict-panel');
  await expect(warning).toBeVisible();
  await expect(page.locator('#sync-status')).toContainText('Conflitto');
  await expect(warning.getByRole('button',{name:/Backup di questo dispositivo/})).toBeVisible();
  await expect(warning.getByRole('button',{name:/Backup della versione cloud/})).toBeVisible();

  const backupLocal=page.waitForEvent('download');
  await warning.getByRole('button',{name:/Backup di questo dispositivo/}).click();
  await expect((await backupLocal).suggestedFilename()).toContain('locale');
  const backupCloud=page.waitForEvent('download');
  await warning.getByRole('button',{name:/Backup della versione cloud/}).click();
  await expect((await backupCloud).suggestedFilename()).toContain('cloud');
  page.on('dialog',dialog=>dialog.accept());
  await warning.getByRole('button',{name:/Usa i dati di questo dispositivo/}).click();
  await expect(warning).toHaveCount(0);
  const resolved=await page.evaluate(async()=>{
    const {state}=await import('/js/state.js');
    const {getSyncConflict,hasPendingSync,getCloudRevision}=await import('/js/storage.js');
    return {
      remote:window.__testCloudRow.payload.athlete.email,
      local:state.workoutData.athlete.email,
      version:getCloudRevision(state.currentUser),
      conflict:getSyncConflict(state.currentUser),
      queued:hasPendingSync()
    };
  });
  assert.equal(resolved.remote,'edited-on-phone@invalid.example');
  assert.equal(resolved.local,'edited-on-phone@invalid.example');
  assert.equal(resolved.conflict,null);
  assert.equal(resolved.queued,false);
  assert.ok(resolved.version);
  assert.deepEqual(monitoring.remoteRequests,[]);
  assert.deepEqual(monitoring.pageErrors,[]);
});

test('warm-up marked by deliberate gesture stays in history but never blocks session completion',async({page})=>{
  const monitor=await openIsolatedApp(page);
  await prepareLiveWorkout(page);
  await page.evaluate(async()=>{
    const {state}=await import('/js/state.js');
    const {renderWorkoutList}=await import('/js/ui.js');
    const ex=state.workoutData.history.years[new Date().getFullYear()].mesocycles[0]
      .weeks[0].days[0].exercises[0];
    const day=state.workoutData.history.years[new Date().getFullYear()].mesocycles[0]
      .weeks[0].days[0];
    day.exercises.push({
      ...ex,name:'Warmup con bilanciere',block:2,
      isWarmup:true,isExcluded:true,
      loggedSets:[{weight:'20',reps:'10',rpe:'6',isLocked:false,completed:false}],
      sets:[{targetKg:'20',targetReps:'10',targetRpe:'6'}]
    });
    renderWorkoutList();
  });
  await expect(page.locator('.ex-card[data-ex="1"]')).toContainText('RISCALDAMENTO');
  await expect(page.locator('#mycoatch-live-panel')).toContainText('Serie confermate: 0/3');
  const originalPlan=await page.evaluate(async()=>{
    const {state}=await import('/js/state.js');
    return JSON.stringify(state.workoutData.history.years[new Date().getFullYear()]
      .mesocycles[0].weeks[0].days[0].exercises[0].sets);
  });
  for(let idx=0;idx<3;idx++){
    await page.locator('.ex-card[data-ex="0"] .set-lock-check[data-set="'+idx+'"]').check();
  }
  const state=await page.evaluate(async()=>{
    const {state}=await import('/js/state.js');
    const day=state.workoutData.history.years[new Date().getFullYear()]
      .mesocycles[0].weeks[0].days[0];
    return {
      completed:day.completed,
      warmup:day.exercises[1].loggedSets[0],
      plan:JSON.stringify(day.exercises[0].sets)
    };
  });
  assert.equal(state.completed,true);
  assert.equal(state.warmup.isLocked,false);
  assert.equal(state.warmup.weight,'20');
  assert.equal(state.plan,originalPlan);
  assert.deepEqual(monitor.remoteRequests,[]);
  assert.deepEqual(monitor.pageErrors,[]);
});


test('all confirmed sets at RPE 6 versus target 8 give a real next-session load proposal, not an automatic edit',async({page})=>{
  const monitor=await openIsolatedApp(page);
  await prepareLiveWorkout(page);
  await page.evaluate(async()=>{
    const {state}=await import('/js/state.js');
    const {renderWorkoutList}=await import('/js/ui.js');
    state.workoutData.athlete.loadingSteps={barbell:2.5,dumbbell:1,machine:2.5};
    const ex=state.workoutData.history.years[new Date().getFullYear()]
      .mesocycles[0].weeks[0].days[0].exercises[0];
    ex.targetRpe='@8';
    renderWorkoutList();
  });
  for(let i=0;i<3;i++){
    await page.locator('.set-kg[data-set="'+i+'"]').fill('80');
    await page.locator('.set-reps[data-set="'+i+'"]').fill('6');
    await page.locator('.set-rpe[data-set="'+i+'"]').fill('6');
    await page.locator('.set-lock-check[data-set="'+i+'"]').check();
  }
  await expect(page.locator('#mycoatch-live-panel')).toContainText('Prossima seduta');
  await expect(page.locator('#mycoatch-live-panel')).toContainText('80 → 82.5 kg');
  await expect(page.locator('#mycoatch-live-panel')).toContainText('Riepilogo fine seduta');
  await expect(page.locator('#mycoatch-live-panel')).toContainText('RPE 6 percepito / 8 previsto');
  await expect(page.locator('#mycoatch-live-toast')).toContainText('80 → 82.5 kg');
  const state=await page.evaluate(async()=>{
    const {state}=await import('/js/state.js');
    const ex=state.workoutData.history.years[new Date().getFullYear()]
      .mesocycles[0].weeks[0].days[0].exercises[0];
    return {actual:ex.loggedSets.map(s=>[s.weight,s.reps,s.rpe,s.isLocked]),
      prescription:ex.sets,loadingSteps:state.workoutData.athlete.loadingSteps};
  });
  assert.equal(state.actual.length,3);
  assert.ok(state.actual.every(s=>s[0]===80&&s[1]==='6'&&s[2]===6&&s[3]));
  assert.deepEqual(state.loadingSteps,{barbell:2.5,dumbbell:1,machine:2.5});
  assert.ok(!JSON.stringify(state.prescription||[]).includes('82.5'));
  assert.deepEqual(monitor.remoteRequests,[]);
  assert.deepEqual(monitor.pageErrors,[]);
});

test('W on a single row removes only that row from MyCoatch effective volume, not the journal',async({page})=>{
  const monitor=await openIsolatedApp(page);
  await prepareLiveWorkout(page);
  const button=page.locator('.ex-card[data-ex="0"] .set-warmup-toggle[data-set="0"]');
  await expect(button).toHaveAttribute('aria-pressed','false');
  await button.click();
  await expect(page.locator('.ex-card[data-ex="0"] .set-warmup-toggle[data-set="0"]'))
    .toHaveAttribute('aria-pressed','true');
  await expect(page.locator('#mycoatch-live-panel')).toContainText('Serie confermate: 0/2');
  await page.locator('.set-lock-check[data-set="0"]').check();
  await expect(page.locator('#mycoatch-live-panel')).toContainText('Serie confermate: 0/2');
  const saved=await page.evaluate(async()=>{
    const {state}=await import('/js/state.js');
    const ex=state.workoutData.history.years[new Date().getFullYear()]
      .mesocycles[0].weeks[0].days[0].exercises[0];
    return ex.loggedSets[0];
  });
  assert.equal(saved.isWarmup,true);
  assert.equal(saved.isLocked,true);
  await page.locator('.ex-card[data-ex="0"] .set-warmup-toggle[data-set="0"]').click();
  await expect(page.locator('#mycoatch-live-panel')).toContainText('Serie confermate: 1/3');
  assert.deepEqual(monitor.remoteRequests,[]);
  assert.deepEqual(monitor.pageErrors,[]);
});

test('year selector switches historical mesocycles and lock to the selected year without modifying other years',async({page})=>{
  const monitor=await openIsolatedApp(page);
  await page.evaluate(async()=>{
    const {state}=await import('/js/state.js');
    const {renderWorkoutList}=await import('/js/ui.js');
    const copy=structuredClone(state.workoutData.history.years['2026']);
    copy.mesocycles[0].weeks[0].days[0].exercises[0].name='Panca anno 2025';
    state.workoutData.history.years['2025']=copy;
    state.currentYear='2026';
    renderWorkoutList();
  });
  await expect(page.locator('#workout-year-select')).toBeVisible();
  await page.locator('#workout-year-select').selectOption('2025');
  await expect(page.locator('.ex-card[data-ex="0"]')).toContainText('Panca anno 2025');
  await expect(page.locator('#toggle-lock-meso-btn')).toBeVisible();
  const info=await page.evaluate(async()=>{
    const {state}=await import('/js/state.js');
    const {getActiveMesocycleObject}=await import('/js/mesocycle.js');
    return {year:state.currentYear,meso:getActiveMesocycleObject(),
      selected:localStorage.getItem('ui_active_year')};
  });
  assert.equal(info.year,'2025');
  assert.equal(info.selected,'2025');
  assert.ok(info.meso?.weeks?.length>0);
  await page.locator('#workout-year-select').selectOption('2026');
  await expect(page.locator('.ex-card[data-ex="0"]')).not.toContainText('Panca anno 2025');
  assert.deepEqual(monitor.remoteRequests,[]);
  assert.deepEqual(monitor.pageErrors,[]);
});

test('personal equipment stock and minimum increments are saved into full workout data',async({page})=>{
  const monitor=await openIsolatedApp(page);
  await page.locator('#open-tools-btn').click();
  const details=page.locator('.equipment-settings');
  await expect(details.locator('summary')).toBeVisible();
  await details.locator('summary').click();
  await page.locator('#equipment-step-barbell').fill('1.25');
  await page.locator('#equipment-step-dumbbell').fill('0.5');
  await page.locator('#equipment-step-machine').fill('2.5');
  await page.locator('#equipment-bar-weight').fill('15');
  const fields=page.locator('.equipment-plate-pairs');
  for(const field of await fields.all())await expect(field).toHaveValue('');
  await page.locator('#homegym-equipment-form button[type="submit"]').click();
  assert.equal(await page.evaluate(async()=>{
    const {state}=await import('/js/state.js');return state.workoutData.athlete.plateInventories;
  }),undefined,'an incomplete inventory must not be saved as zero or default stock');
  for(const field of await fields.all())await field.fill('0');
  await page.locator('.equipment-plate-pairs[data-diameter="50"][data-plate="5"]').fill('2');
  await page.locator('#homegym-equipment-form button[type="submit"]').click();
  const values=await page.evaluate(async()=>{
    const {state}=await import('/js/state.js');
    return {loadingSteps:state.workoutData.athlete.loadingSteps,
      plateInventories:state.workoutData.athlete.plateInventories,
      barbellWeight:state.workoutData.athlete.barbellWeight};
  });
  assert.equal(values.loadingSteps.barbell,1.25);
  assert.equal(values.loadingSteps.dumbbell,.5);
  assert.equal(values.barbellWeight,15);
  assert.equal(values.plateInventories['50']['20'],0);
  assert.equal(values.plateInventories['50']['5'],2);
  await details.locator('summary').click();
  await details.locator('summary').click();
  await expect(page.locator('#equipment-bar-weight')).toHaveValue('15');
  await expect(page.locator('.equipment-plate-pairs[data-diameter="50"][data-plate="5"]')).toHaveValue('2');
  await page.evaluate(async()=>{
    const {state}=await import('/js/state.js');state.workoutData.athlete.plateInventories={'50':{'5':1},'29':{}};
  });
  await details.locator('summary').click();
  await details.locator('summary').click();
  await expect(page.locator('.equipment-plate-pairs[data-diameter="50"][data-plate="20"]')).toHaveValue('0');
  await expect(page.locator('.equipment-plate-pairs[data-diameter="50"][data-plate="5"]')).toHaveValue('1');
  await expect(page.locator('#equipment-bar-weight')).toHaveValue('15');
  assert.deepEqual(monitor.remoteRequests,[]);
  assert.deepEqual(monitor.pageErrors,[]);
});

test('offline save queue coalesces newer full snapshots for the same athlete',async({page})=>{
  const monitor=await openIsolatedApp(page);
  const observed=await page.evaluate(async()=>{
    const {state}=await import('/js/state.js');
    const {CONFIG}=await import('/js/config.js');
    const {saveAndSync,hasPendingSync}=await import('/js/storage.js');
    state.currentUser=null;
    window.testJournal.removeItem(CONFIG.STORAGE_KEY+'_sync_queue');
    for(let i=1;i<=4;i++){
      state.workoutData.athlete.email='iteration-'+i+'@invalid.example';
      await saveAndSync(state.workoutData);
    }
    const queue=JSON.parse(window.testJournal.getItem(CONFIG.STORAGE_KEY+'_sync_queue'));
    return {count:queue.length,payload:queue[0].payload.athlete.email,
      pending:hasPendingSync()};
  });
  assert.equal(observed.count,1);
  assert.equal(observed.payload,'iteration-4@invalid.example');
  assert.equal(observed.pending,true);
  assert.deepEqual(monitor.remoteRequests,[]);
  assert.deepEqual(monitor.pageErrors,[]);
});


test('no recovery timer after the final working set of a day, even with a pending warmup',async({page})=>{
  const monitor=await openIsolatedApp(page);
  await prepareLiveWorkout(page);
  await page.evaluate(async()=>{
    const {state}=await import('/js/state.js');
    const {renderWorkoutList}=await import('/js/ui.js');
    const day=state.workoutData.history.years['2026'].mesocycles[0].weeks[0].days[0];
    day.exercises.push({
      name:'Warmup',isWarmup:true,isExcluded:true,block:2,
      reps:'10',kgMin:'20',kgMax:'20',targetRpe:'@6',
      loggedSets:[{weight:'20',reps:'10',rpe:'6',isLocked:false,completed:false}]
    });
    renderWorkoutList();
  });
  for(let i=0;i<3;i++){
    await page.locator('.ex-card[data-ex="0"] .set-lock-check[data-set="'+i+'"]').check();
    if(i<2)await expect(page.locator('#floating-timer')).toHaveClass(/active/);
  }
  await expect(page.locator('#floating-timer')).not.toHaveClass(/active/);
  const result=await page.evaluate(async()=>{
    const {state}=await import('/js/state.js');
    const day=state.workoutData.history.years['2026'].mesocycles[0].weeks[0].days[0];
    return {
      completed:day.completed,
      warmupChecked:day.exercises[1].loggedSets[0].isLocked,
      deadline:sessionStorage.getItem('homegym_rest_timer_deadline_v1')
    };
  });
  assert.equal(result.completed,true);
  assert.equal(result.warmupChecked,false);
  assert.equal(result.deadline,null);
  assert.deepEqual(monitor.remoteRequests,[]);
  assert.deepEqual(monitor.pageErrors,[]);
});

test('locked mesocycle remains browsable but cannot reset, repeat or edit saved workouts',async({page})=>{
  const monitor=await openIsolatedApp(page);
  await prepareLiveWorkout(page);
  await page.locator('.set-lock-check[data-set="0"]').check();
  await expect(page.locator('#reset-session-timer-btn')).toBeVisible();
  const before=await page.evaluate(async()=>{
    const {state}=await import('/js/state.js');
    return JSON.stringify(state.workoutData.history.years['2026'].mesocycles[0]);
  });
  await page.locator('#toggle-lock-meso-btn').click();
  await expect(page.locator('#toggle-lock-meso-btn')).toContainText('Sblocca');
  await expect(page.locator('.set-lock-check[data-set="1"]')).toBeDisabled();
  await expect(page.locator('.ex-user-notes')).toBeDisabled();
  await expect(page.locator('#reset-session-timer-btn')).toHaveClass(/is-hidden/);
  await expect(page.locator('#pause-session-timer-btn')).toHaveClass(/is-hidden/);
  // Even directly exposed module actions must reject a delete of a locked mesocycle.
  const blocked=await page.evaluate(async()=>{
    const {state}=await import('/js/state.js');
    const {deleteCurrentMesocycle}=await import('/js/mesocycle.js');
    const oldWindowConfirm=window.confirm;
    window.confirm=()=>{throw Error('Locked mesocycle must not enter delete dialog');};
    try{deleteCurrentMesocycle();}finally{window.confirm=oldWindowConfirm;}
    return {count:state.workoutData.history.years['2026'].mesocycles.length,
      locked:state.workoutData.history.years['2026'].mesocycles[0].locked};
  });
  assert.equal(blocked.count,1);
  assert.equal(blocked.locked,true);
  await page.locator('#week-selector').selectOption('2');
  await expect(page.locator('#toggle-lock-meso-btn')).toContainText('Sblocca');
  await page.locator('#week-selector').selectOption('1');
  const after=await page.evaluate(async()=>{
    const {state}=await import('/js/state.js');
    const meso=structuredClone(state.workoutData.history.years['2026'].mesocycles[0]);
    delete meso.locked;
    return JSON.stringify(meso);
  });
  const expected=JSON.parse(before);delete expected.locked;
  assert.deepEqual(JSON.parse(after),expected);
  await page.locator('#toggle-lock-meso-btn').click();
  await expect(page.locator('.set-lock-check[data-set="1"]')).toBeEnabled();
  assert.deepEqual(monitor.remoteRequests,[]);
  assert.deepEqual(monitor.pageErrors,[]);
});

test('sound button uses a user gesture and rest still plays 5 short beeps and a long final beep',async({page})=>{
  // Replace actual speaker output with a deterministic WebAudio observation.
  await page.addInitScript(()=>{
    window.__beepEvents=[];
    class AudioContextFake {
      constructor(){this.state='running';this.currentTime=0;this.destination={};}
      createOscillator(){
        const osc={value:0,type:'sine',onended:null};
        osc.frequency={setValueAtTime(f){osc.value=f;}};
        osc.connect=()=>{};osc.disconnect=()=>{};
        osc.start=()=>{window.__beepEvents.push(osc.value);};
        osc.stop=()=>{};
        return osc;
      }
      createGain(){
        return {gain:{setValueAtTime(){},exponentialRampToValueAtTime(){},value:0},
          connect(){},disconnect(){}};
      }
      resume(){return Promise.resolve();}
      close(){this.state='closed';return Promise.resolve();}
    }
    window.AudioContext=AudioContextFake;
    window.webkitAudioContext=AudioContextFake;
  });
  const monitor=await openIsolatedApp(page);
  await page.evaluate(async()=>{
    const {startTimer}=await import('/js/timer.js');
    startTimer('6s');
  });
  await expect(page.locator('#floating-timer')).toHaveClass(/active/);
  await page.locator('#timer-test-audio').click();
  await expect(page.locator('#timer-audio-status')).toContainText('Test audio richiesto');
  await page.evaluate(()=>{window.__beepEvents=[];});
  await page.waitForTimeout(6600);
  await expect(page.locator('#floating-timer')).not.toHaveClass(/active/);
  const tones=await page.evaluate(()=>window.__beepEvents);
  assert.equal(tones.filter(n=>n===880).length,5,JSON.stringify(tones));
  assert.equal(tones.filter(n=>n===1700).length,1,JSON.stringify(tones));
  assert.deepEqual(monitor.remoteRequests,[]);
  assert.deepEqual(monitor.pageErrors,[]);
});


test('per-set volume badges persist inside kg cells, including week 1 of next year and neutral results',async({page})=>{
  const monitor=await openIsolatedApp(page);
  await prepareLiveWorkout(page);
  await page.evaluate(async()=>{
    const {state}=await import('/js/state.js');
    const {renderWorkoutList}=await import('/js/ui.js');
    const old=state.workoutData.history.years['2025'].mesocycles[0]
      .weeks[0].days[0].exercises[0];
    old.loggedSets=[0,1,2].map(()=>({
      weight:'70',reps:'8',rpe:'8',isLocked:true,completed:true
    }));
    renderWorkoutList();
  });
  const r=i=>page.locator('.ex-card[data-ex="0"] .workout-set-row[data-set-index="'+i+'"]');
  await expect(r(0).locator('.set-trend-badge')).toHaveCount(0);
  for(const [i,kg] of [[0,'80'],[1,'70'],[2,'60']]){
    await r(i).locator('.set-kg').fill(kg);
    await r(i).locator('.set-reps').fill('8');
    await r(i).locator('.set-rpe').fill('8');
    await r(i).locator('.set-lock-check').check();
  }
  await expect(r(0).locator('.set-trend-badge')).toContainText('▲ +14,29%');
  await expect(r(0).locator('.set-trend-badge')).toContainText('+80 kg·rep');
  await expect(r(1).locator('.set-trend-badge')).toContainText('= 0%');
  await expect(r(2).locator('.set-trend-badge')).toContainText('▼ -14,29%');
  await r(1).locator('.set-warmup-toggle').click();
  await expect(r(1).locator('.set-trend-badge')).toHaveCount(0);
  const inside=await r(0).locator('.td-kg-container').evaluate(td=>{
    const badge=td.querySelector('.set-trend-badge');
    return {exists:!!badge,parent:badge?.parentElement?.className,canSee:badge?.getBoundingClientRect().height>0};
  });
  assert.equal(inside.exists,true);
  assert.match(inside.parent,/kg-input-wrapper/);
  assert.equal(inside.canSee,true);
  assert.deepEqual(monitor.remoteRequests,[]);
  assert.deepEqual(monitor.pageErrors,[]);
});

test('MyCoatch previews, approves and undoes load increases only for untouched future sessions',async({page})=>{
  const monitor=await openIsolatedApp(page);
  await prepareLiveWorkout(page);
  await page.evaluate(async()=>{
    const {state}=await import('/js/state.js');
    const {renderWorkoutList}=await import('/js/ui.js');
    const meso=state.workoutData.history.years['2026'].mesocycles[0];
    const template=structuredClone(meso.weeks[0].days[0].exercises[0]);
    template.loggedSets=template.loggedSets.map(set=>({
      ...set,weight:'',reps:'',rpe:'',isLocked:false,completed:false
    }));
    for(const w of meso.weeks.slice(1)){
      const day=w.days[0];
      day.exercises=[structuredClone(template)];
      day.completed=false;day.sessionStart=null;day.accumulatedSeconds=0;
      delete day.date;delete day.sessionCompletedAt;delete day.coachCheckin;
    }
    state.workoutData.athlete.loadingSteps={barbell:2.5};
    renderWorkoutList();
  });
  for(let i=0;i<3;i++){
    const row=page.locator('.ex-card[data-ex="0"] .workout-set-row[data-set-index="'+i+'"]');
    await row.locator('.set-kg').fill('80');
    await row.locator('.set-reps').fill('6');
    await row.locator('.set-rpe').fill('6');
    await row.locator('.set-lock-check').check();
  }
  const review=page.locator('#mycoatch-future-load-review');
  await expect(review).toBeVisible();
  await review.locator('summary').click();
  await expect(review).toContainText('80 → 82.5 kg');
  await expect(review.locator('.mycoatch-future-load-targets li')).toHaveCount(2);
  const before=await page.evaluate(async()=>{
    const {state}=await import('/js/state.js');
    const m=state.workoutData.history.years['2026'].mesocycles[0];
    return {
      source:JSON.stringify(m.weeks[0].days[0].exercises[0]),
      future:m.weeks.slice(1).map(w=>w.days[0].exercises[0].kgMin)
    };
  });
  assert.deepEqual(before.future,['80','80']);
  await review.locator('.mycoatch-future-load-apply').click();
  await expect(review).toContainText('Aggiorna solo le prossime sedute');
  const after=await page.evaluate(async()=>{
    const {state}=await import('/js/state.js');
    const m=state.workoutData.history.years['2026'].mesocycles[0];
    return {source:JSON.stringify(m.weeks[0].days[0].exercises[0]),
      future:m.weeks.slice(1).map(w=>w.days[0].exercises[0].kgMin),
      log:m.coachFutureLoadReviews};
  });
  assert.equal(after.source,before.source,'historical performed sets unchanged');
  assert.deepEqual(after.future,['82.5','82.5']);
  assert.equal(after.log.length,1);
  await page.locator('#week-selector').selectOption('2');
  await expect(page.locator('.ex-card[data-ex="0"] .set-kg[data-set="0"]'))
    .toHaveValue('82.5');
  await page.locator('#week-selector').selectOption('1');
  const applied=page.locator('#mycoatch-future-load-review');
  await applied.locator('summary').click();
  await applied.locator('.mycoatch-future-load-undo').click();
  const reverted=await page.evaluate(async()=>{
    const {state}=await import('/js/state.js');
    const m=state.workoutData.history.years['2026'].mesocycles[0];
    return {future:m.weeks.slice(1).map(w=>w.days[0].exercises[0].kgMin),
      undoneAt:m.coachFutureLoadReviews[0].undoneAt};
  });
  assert.deepEqual(reverted.future,['80','80']);
  assert.ok(reverted.undoneAt);
  assert.deepEqual(monitor.remoteRequests,[]);
  assert.deepEqual(monitor.pageErrors,[]);
});


test('rimozione account conserva diario, coda e credenziali degli altri utenti',async({page})=>{
 await openIsolatedApp(page);
 const result=await page.evaluate(async()=>{
  const {journalStorage:s,flushJournalStorage}=await import('/js/journalStore.js');
  const {removeAccountLocalData}=await import('/js/storage.js');
  s.setItem('workoutApp_data_owner','B');s.setItem('workoutApp_data','B diary');
  s.setItem('workoutApp_data_user_A','A diary');s.setItem('workoutApp_data_user_B','B diary');
  s.setItem('workoutApp_data_sync_queue',JSON.stringify([{id:'a',ownerId:'A'},{id:'b',ownerId:'B'}]));
  localStorage.setItem('auth-sentinel','keep');await flushJournalStorage();
  await removeAccountLocalData({id:'A'});
  return {a:s.getItem('workoutApp_data_user_A'),b:s.getItem('workoutApp_data_user_B'),global:s.getItem('workoutApp_data'),queue:JSON.parse(s.getItem('workoutApp_data_sync_queue')),auth:localStorage.getItem('auth-sentinel')};
 });
 expect(result).toEqual({a:null,b:'B diary',global:'B diary',queue:[{id:'b',ownerId:'B'}],auth:'keep'});
});

test('archivio precedente ai quattro anni resta consultabile e nel backup',async({page})=>{
 await openIsolatedApp(page);
 await page.evaluate(async()=>{
  const {state}=await import('/js/state.js');const {renderWorkoutList}=await import('/js/ui.js');
  state.workoutData.history.years['2020']=structuredClone(state.workoutData.history.years['2025']);
  renderWorkoutList();
 });
 expect(await page.locator('#workout-year-select option').allTextContents()).not.toContain('2020');
 await page.locator('#history-archive-toggle').click();
 await page.locator('#workout-year-select').selectOption('2020');
 await expect(page.locator('.ex-card').first()).toBeVisible();
 await page.locator('#history-archive-toggle').click();
 expect(await page.locator('#workout-year-select option').allTextContents()).not.toContain('2020');
 expect(await page.evaluate(async()=>Boolean((await import('/js/state.js')).state.workoutData.history.years['2020']))).toBe(true);
});

test('risoluzione cloud in ritardo conserva modifiche locali anche con timestamp identico',async({page})=>{
 await openIsolatedApp(page);
 await page.evaluate(async()=>{
  const {state}=await import('/js/state.js');const {supabase}=await import('/js/config.js');
  const {recordSyncConflict,saveAndSync}=await import('/js/storage.js');
  state.currentUser={id:'race-user',email:'race@invalid.example'};
  await saveAndSync(state.workoutData);
  const remote=structuredClone(state.workoutData);remote.athlete.email='remote@invalid.example';
  recordSyncConflict(state.currentUser,{remote,remoteRevision:'2026-10-17T10:00:00Z'});
  supabase.from=()=>{const query={select(){return query;},eq(){return query;},maybeSingle(){
   window.raceStarted=true;
   return new Promise(resolve=>{window.finishRace=()=>resolve({data:{payload:remote,updated_at:'2026-10-17T10:00:00Z'},error:null});});
  }};return query;};
 });
 page.on('dialog',dialog=>dialog.accept());
 await page.locator('#sync-conflict-panel').getByRole('button',{name:'Usa la versione cloud'}).click();
 await expect.poll(()=>page.evaluate(()=>window.raceStarted)).toBe(true);
 await page.evaluate(async()=>{
  const {state}=await import('/js/state.js');
  // Deliberately keep updatedAt unchanged to reproduce the old race.
  state.workoutData.athlete.email='new-local@invalid.example';window.finishRace();
 });
 await expect(page.locator('.sync-conflict-status')).toContainText('Nessuna modifica locale sostituita');
 const result=await page.evaluate(async()=>{
  const {state}=await import('/js/state.js');const {getSyncConflict,hasPendingSync}=await import('/js/storage.js');
  return {email:state.workoutData.athlete.email,conflict:Boolean(getSyncConflict()),queued:hasPendingSync()};
 });
 expect(result).toEqual({email:'new-local@invalid.example',conflict:true,queued:true});
});

test('refinement: smartphone confirms a bodyweight set with explicit zero and shows updated guidance',async({page})=>{
 await page.setViewportSize({width:375,height:812});
 const monitoring=await openIsolatedApp(page);
 await prepareLiveWorkout(page);
 await page.evaluate(async()=>{
  const {state}=await import('/js/state.js');
  const {renderWorkoutList}=await import('/js/ui.js');
  const day=state.workoutData.history.years[new Date().getFullYear()].mesocycles[0].weeks[0].days[0];
  Object.assign(day.exercises[0],{name:'Hamstring Walkout A Corpo Libero',kgMin:'',kgMax:'',reps:'6-10'});
  renderWorkoutList();
 });
 await page.locator('.set-kg[data-set="0"]').fill('0');
 await page.locator('.set-reps[data-set="0"]').fill('8');
 await page.locator('.set-rpe[data-set="0"]').fill('8');
 await page.locator('.set-lock-check[data-set="0"]').check();
 await expect(page.locator('.set-lock-check[data-set="0"]')).toBeChecked();
 const result=await page.evaluate(async()=>{
  const {renderManualView}=await import('/js/manual.js');renderManualView();
  const {parseCSV}=await import('/js/csvHandler.js');
  const {MyCoatch}=await import('/mycoatch/index.js');
  MyCoatch.generateNextFromHistory({history:{years:{}}},{daysPerWeek:4,durationWeeks:4,maxSessionMinutes:60,userAge:49});
  return {manual:document.querySelector('#manual-content').textContent,
   columns:parseCSV(MyCoatch.exportAsCSV()).map(row=>row.length)};
 });
 assert.match(result.manual,/versione 47/);
 assert.match(result.manual,/cinque minuti/);
 assert.ok(result.columns.every(count=>count===12));
 assert.deepEqual(monitoring.pageErrors,[]);
 assert.deepEqual(monitoring.remoteRequests,[]);
});


test('chiusura guidata integrata: blocca il ciclo, conserva i dati, esporta report e permette riapertura esplicita', async ({page}) => {
  await openIsolatedApp(page);
  const before=await page.evaluate(async()=>{
    const {state}=await import('/js/state.js');
    const {renderWorkoutList}=await import('/js/ui.js');
    state.currentYear='2026';state.activeMesocycleIndex=0;state.activeWeek=1;state.activeDay=1;
    renderWorkoutList();
    return JSON.stringify(state.workoutData.history.years);
  });
  await page.locator('#review-close-meso-btn').click();
  await expect(page.locator('#mesocycle-closure-panel')).toHaveAttribute('open','');
  await expect(page.locator('#mesocycle-closure-panel')).toContainText('Sedute complete: 3/3');
  const checks=page.locator('#mesocycle-closure-panel input[type=checkbox]');
  await expect(checks).toHaveCount(1);
  const finish=page.getByRole('button',{name:/Concludi e blocca il mesociclo/});
  await expect(finish).toBeDisabled();
  await checks.first().check();
  await expect(finish).toBeEnabled();
  page.on('dialog', dialog=>dialog.accept());
  await finish.click();
  await expect(page.locator('#toggle-lock-meso-btn')).toContainText('Sblocca');
  await expect(page.locator('#review-close-meso-btn')).toContainText('Report fine mesociclo');
  const closed=await page.evaluate(async()=>{
    const {state}=await import('/js/state.js');
    const m=state.workoutData.history.years['2026'].mesocycles[0];
    const stored=JSON.parse(window.testJournal.getItem('workoutApp_data'))
      .history.years['2026'].mesocycles[0];
    return {locked:m.locked,closure:m.coachClosure,storedLocked:stored.locked,
      storedClosure:stored.coachClosure,years:JSON.stringify(state.workoutData.history.years)};
  });
  expect(closed.locked).toBe(true);
  expect(closed.storedLocked).toBe(true);
  expect(closed.closure.status).toBe('closed');
  expect(closed.storedClosure.status).toBe('closed');
  const d=page.waitForEvent('download');
  await page.getByRole('button',{name:/Esporta report per ChatGPT/}).click();
  const file=await d;const text=await readFile(await file.path(),'utf8');
  expect(file.suggestedFilename()).toMatch(/report_mycoatch\.txt$/);
  expect(text).toMatch(/Sedute completate: 3\/3/);
  expect(text).not.toContain('test-e2e@invalid.example');
  expect(text).not.toContain('private-athlete-id');
  await page.getByRole('button',{name:/Prepara il prossimo mesociclo/}).click();
  await expect(page.locator('#mycoatch-config-modal')).not.toHaveClass(/hidden/);
  // Real browser handoff, not just a unit-level locator: the selected
  // concluded block must reach the generated proposal and leave logs intact.
  const handoff=await page.evaluate(async()=>{
    const {state}=await import('/js/state.js');
    const {createVisualCoachProposal}=await import('/mycoatch/mycoatch-adapter.js');
    const before=JSON.stringify(state.workoutData.history.years);
    const source=state.workoutData.history.years['2026'].mesocycles[0];
    const result=await createVisualCoachProposal({
      durationWeeks:4,daysPerWeek:4,maxSessionMinutes:60,userAge:49,focus:'hybrid'
    });
    return {
      expected:source.name,
      actual:result.proposal.coachReport.closureHandoff?.name,
      comparison:result.proposal.coachReport.comparison.previousName,
      intact:before===JSON.stringify(state.workoutData.history.years),
      confirmed:result.proposal.coachReport.closureHandoff?.review?.completedSets
    };
  });
  expect(handoff.actual).toBe(handoff.expected);
  expect(handoff.comparison).toBe(handoff.expected);
  expect(handoff.confirmed).toBeGreaterThan(0);
  expect(handoff.intact).toBe(true);
  await page.locator('#close-mycoatch-config').click();
  await page.locator('#toggle-lock-meso-btn').click();
  await expect(page.locator('#toggle-lock-meso-btn')).toContainText('Blocca');
  const reopened=await page.evaluate(async()=>{
    const {state}=await import('/js/state.js');
    return state.workoutData.history.years['2026'].mesocycles[0];
  });
  expect(reopened.locked).toBe(false);
  expect(reopened.coachClosure).toBeUndefined();
  // Only closure/lock metadata changes; all original exercises and sets remain.
  const initial=JSON.parse(before)['2026'].mesocycles[0];
  expect(reopened.weeks).toEqual(initial.weeks);
});

test('mesociclo parziale: doppio consenso obbligatorio e chiusura non automatica',async({page})=>{
  await openIsolatedApp(page);
  await page.evaluate(async()=>{
    const {state}=await import('/js/state.js');
    const {renderWorkoutList}=await import('/js/ui.js');
    state.currentYear='2026';state.activeMesocycleIndex=0;state.activeWeek=1;state.activeDay=1;
    const m=state.workoutData.history.years['2026'].mesocycles[0];
    m.weeks[1].days[0].exercises[0].loggedSets[0].isLocked=false;
    m.weeks[1].days[0].exercises[0].loggedSets[0].completed=false;
    renderWorkoutList();
  });
  await page.locator('#review-close-meso-btn').click();
  await expect(page.locator('#mesocycle-closure-panel')).toContainText('Sedute complete: 2/3');
  const boxes=page.locator('#mesocycle-closure-panel input[type=checkbox]');
  await expect(boxes).toHaveCount(2);
  const finish=page.getByRole('button',{name:/Concludi e blocca il mesociclo/});
  await boxes.first().check();
  await expect(finish).toBeDisabled();
  await boxes.last().check();
  await expect(finish).toBeEnabled();
  let confirmCalls=0;
  page.on('dialog',async d=>{
    if(d.type()==='confirm'){confirmCalls++;await d.dismiss();}
    else await d.accept();
  });
  await finish.click();
  expect(confirmCalls).toBe(1);
  const after=await page.evaluate(async()=>{
    const {state}=await import('/js/state.js');
    const m=state.workoutData.history.years['2026'].mesocycles[0];
    return {locked:m.locked,closure:m.coachClosure,checked:m.weeks[1].days[0].exercises[0].loggedSets[0].isLocked};
  });
  expect(after.locked).toBeFalsy();
  expect(after.closure).toBeUndefined();
  expect(after.checked).toBe(false);
});


test('smartphone: l’ultima spunta dell’ultimo giorno evidenzia MyCoatch anche con esercizi incompleti',async({page})=>{
  await page.setViewportSize({width:375,height:812});
  const monitoring=await openIsolatedApp(page);
  await page.evaluate(async()=>{
    const {state}=await import('/js/state.js');
    const {renderWorkoutList}=await import('/js/ui.js');
    state.currentYear='2026';
    state.activeMesocycleIndex=0;
    state.activeWeek=3;
    state.activeDay=1;
    const meso=state.workoutData.history.years['2026'].mesocycles[0];
    const finalDay=meso.weeks[2].days[0];
    const unconfirmed=structuredClone(finalDay.exercises[0]);
    unconfirmed.name='Esercizio finale da verificare';
    unconfirmed.loggedSets=[{weight:'',reps:'',rpe:'',isLocked:false,completed:false}];
    finalDay.exercises.unshift(unconfirmed);
    const lastSet=finalDay.exercises[1].loggedSets[0];
    lastSet.isLocked=false;
    lastSet.completed=false;
    renderWorkoutList();
  });
  const button=page.locator('#review-close-meso-btn');
  await expect(button).not.toHaveClass(/meso-closure-attention/);
  await expect(button.locator('.meso-guided-closure-text')).not.toBeVisible();
  await page.locator('.set-lock-check[data-ex="1"][data-set="0"]').check();
  await expect(button).toHaveClass(/meso-closure-attention/);
  await expect(button.locator('.meso-guided-closure-text')).toBeVisible();
  await expect(button).toContainText('MyCoatch');
  await expect(button).toHaveAttribute('aria-label',/serie non confermate/);
  const accent=await button.evaluate(el=>({
    animation:getComputedStyle(el).animationName,
    width:el.getBoundingClientRect().width
  }));
  assert.notEqual(accent.animation,'none');
  assert.ok(accent.width>=92 && accent.width<=105,JSON.stringify(accent));
  await button.click();
  await expect(button).not.toHaveClass(/meso-closure-attention/);
  await expect(page.locator('#mesocycle-closure-panel')).toHaveAttribute('open','');
  await expect(page.locator('#mesocycle-closure-panel')).toContainText('Sedute da verificare');
  await expect(page.locator('#mesocycle-closure-panel')).toContainText('NON è completamente registrato');
  const stateAfter=await page.evaluate(async()=>{
    const {state}=await import('/js/state.js');
    const meso=state.workoutData.history.years['2026'].mesocycles[0];
    return {
      locked:meso.locked,
      closure:meso.coachClosure,
      unchecked:meso.weeks[2].days[0].exercises[0].loggedSets[0].isLocked,
      lastChecked:meso.weeks[2].days[0].exercises[1].loggedSets[0].isLocked
    };
  });
  assert.equal(Boolean(stateAfter.locked),false);
  assert.equal(stateAfter.closure,undefined);
  assert.equal(stateAfter.unchecked,false);
  assert.equal(stateAfter.lastChecked,true);
  assert.deepEqual(monitoring.remoteRequests,[]);
  assert.deepEqual(monitoring.pageErrors,[]);
});

test('last real checkbox starts closure pulse; review click dismisses without locking data', async ({page}) => {
  await openIsolatedApp(page);
  await page.evaluate(async () => {
    const {state}=await import('/js/state.js');
    const {renderWorkoutList}=await import('/js/ui.js');
    state.currentYear='2026';
    state.activeMesocycleIndex=0;
    state.activeWeek=3;
    state.activeDay=1;
    const set=state.workoutData.history.years['2026'].mesocycles[0]
      .weeks[2].days[0].exercises[0].loggedSets[0];
    set.isLocked=false;
    set.completed=false;
    renderWorkoutList();
  });
  const nudge=page.locator('#review-close-meso-btn');
  await expect(nudge).not.toHaveClass(/meso-closure-attention/);
  await page.locator('.set-lock-check').check();
  await expect(nudge).toHaveClass(/meso-closure-attention/);
  await expect(nudge).toHaveAttribute('aria-label',/Apri il report MyCoatch/);
  await nudge.click();
  await expect(nudge).not.toHaveClass(/meso-closure-attention/);
  await expect(page.locator('#mesocycle-closure-panel')).toHaveAttribute('open','');
  const untouched=await page.evaluate(async()=>{
    const {state}=await import('/js/state.js');
    const meso=state.workoutData.history.years['2026'].mesocycles[0];
    return {locked:meso.locked,closure:meso.coachClosure,
      confirmed:meso.weeks[2].days[0].exercises[0].loggedSets[0].isLocked};
  });
  expect(untouched.locked).toBeFalsy();
  expect(untouched.closure).toBeUndefined();
  expect(untouched.confirmed).toBe(true);
  // Changing a checked set makes the reminder eligible again only after
  // it is checked for real a second time.
  await page.locator('.set-lock-check').uncheck();
  await expect(nudge).not.toHaveClass(/meso-closure-attention/);
  await page.locator('.set-lock-check').check();
  await expect(nudge).toHaveClass(/meso-closure-attention/);
});

test('import next mesocycle leaves closed predecessor locked and new active meso editable',async({page})=>{
  await openIsolatedApp(page);
  page.on('dialog',d=>d.accept());
  await page.evaluate(async()=>{
    const {state}=await import('/js/state.js');
    const {renderWorkoutList}=await import('/js/ui.js');
    state.currentYear='2026';state.activeMesocycleIndex=0;
    state.activeWeek=1;state.activeDay=1;
    renderWorkoutList();
  });
  await expect(page.locator('#review-close-meso-btn')).toHaveClass(/meso-closure-attention/);
  await page.locator('#review-close-meso-btn').click();
  await page.locator('#mesocycle-closure-panel input[type=checkbox]').check();
  await page.getByRole('button',{name:/Concludi e blocca il mesociclo/}).click();
  await expect(page.locator('#toggle-lock-meso-btn')).toContainText('Sblocca');
  const imported=await page.evaluate(async()=>{
    const {state}=await import('/js/state.js');
    const {importWorkoutPlan}=await import('/js/csvHandler.js');
    const {renderWorkoutList}=await import('/js/ui.js');
    const old=state.workoutData.history.years['2026'].mesocycles[0];
    const originalWeeks=JSON.stringify(old.weeks);
    const csv=[
      'Settimana;Giorno;Blocco;Esercizio;Set;Reps;KgMin;KgMax;RPE;Recupero;Note;Topset',
      '1;1;1;Panca Piana con Bilanciere;2;6-8;60;60;@8;120s;Test;'
    ].join('\n');
    const result=importWorkoutPlan(csv);
    if(result.success)renderWorkoutList();
    const mesos=state.workoutData.history.years['2026'].mesocycles;
    return {result,active:state.activeMesocycleIndex,count:mesos.length,
      priorLocked:mesos[0].locked,priorClosed:mesos[0].coachClosure?.status,
      priorWeeksUnchanged:JSON.stringify(mesos[0].weeks)===originalWeeks,
      nextLocked:mesos.at(-1).locked,nextClosure:mesos.at(-1).coachClosure};
  });
  expect(imported.result.success).toBe(true);
  expect(imported.active).toBe(1);
  expect(imported.count).toBe(2);
  expect(imported.priorLocked).toBe(true);
  expect(imported.priorClosed).toBe('closed');
  expect(imported.priorWeeksUnchanged).toBe(true);
  expect(imported.nextLocked).toBeUndefined();
  expect(imported.nextClosure).toBeUndefined();
  await expect(page.locator('#toggle-lock-meso-btn')).toContainText('Blocca');
  await expect(page.locator('#review-close-meso-btn')).not.toHaveClass(/meso-closure-attention/);
  await page.locator('#prev-meso-btn').click();
  await expect(page.locator('#toggle-lock-meso-btn')).toContainText('Sblocca');
  await expect(page.locator('#review-close-meso-btn')).toHaveAttribute('aria-label','Report fine mesociclo');
  await expect(page.locator('#review-close-meso-btn')).not.toHaveClass(/meso-closure-attention/);
  await page.locator('#next-meso-btn').click();
  await expect(page.locator('#toggle-lock-meso-btn')).toContainText('Blocca');
  await expect(page.locator('#review-close-meso-btn')).toHaveAttribute('aria-label','Concludi mesociclo');
});
