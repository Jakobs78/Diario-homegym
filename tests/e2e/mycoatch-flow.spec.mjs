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
  await page.locator('#mycoatch-equipment-confirmed').check();
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
  assert.ok(rows.some(row => row.includes('[SPLIT MYCOATCH]')));
  assert.ok(rows.some(row => row.includes('[DURATA STIMATA]')));
  assert.ok(rows.some(row => row.includes('[SUPERSERIE]')));
  assert.ok(dialogues.some(d => d.type === 'confirm' &&
    d.text.includes('2 mesocicli') && d.text.includes('Vuoi scaricare soltanto il file CSV?')));
  assert.ok(dialogues.some(d => d.type === 'alert' && d.text.includes('successo')));

  const storedAfter = await page.evaluate(() => JSON.parse(window.testJournal.getItem('workoutApp_data')));
  assert.deepEqual(storedAfter, fixture, 'Il download non deve sovrascrivere lo storico');

  // Importazione effettuata con il vero parser della webapp e lo stesso CSV scaricato.
  const imported = await page.evaluate(async content => {
    const { importWorkoutPlan } = await import('/js/csvHandler.js');
    const { state } = await import('/js/state.js');
    const { renderWorkoutList } = await import('/js/ui.js');
    const result = await importWorkoutPlan(content);
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
  assert.doesNotMatch(csv, /\[VOLUME RIDISTRIBUITO\]/);

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

  const confirmation = preview.find(message => message.includes('Controllo delle serie nella prima settimana'));
  assert.ok(confirmation, 'La proposta deve mostrare il bilancio settimanale');
  assert.ok(confirmation.includes(`${expected.recovered} spostate o recuperate su altre sedute`));
  if (expected.shortfall > 0) {
    assert.ok(confirmation.includes(`sono state eliminate ${expected.shortfall} serie`));
  }
  assert.match(confirmation, /Suddivisione delle sedute \(split\): Upper → Lower → Upper → Lower/);
  assert.match(confirmation, /Esercizi principali su cui MyCoatch costruisce la progressione:/);
  for (const move of expected.moves) {
    assert.ok(confirmation.includes(`G${move.fromDay} → G${move.toDay}: ${move.sets} serie ${move.muscle}`));
  }

  const imported = await page.evaluate(async csvText => {
    const { importWorkoutPlan } = await import('/js/csvHandler.js');
    const { state } = await import('/js/state.js');
    const result = await importWorkoutPlan(csvText);
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
    day.completed=false;day.sessionStart=null;day.accumulatedSeconds=0;delete day.sessionCompletedAt;delete day.date;delete day.coachCheckin;
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
  await expect(page.locator('.set-kg[data-set="0"]')).toHaveValue('71.75');
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
  await expect(page.locator('.ex-card .coach-adaptive-notes').first()).toContainText('RPE molto alto');
  await expect(page.locator('.mycoatch-live-toast .mycoatch-live-apply')).toHaveCount(0);
  await expect(page.locator('.set-kg[data-set="1"]')).toHaveValue('80');
  await expect(page.locator('.set-reps[data-set="1"]')).toHaveValue('6');
  await expect(page.locator('.set-rpe[data-set="1"]')).toHaveValue('8');
  await expect(page.locator('#live-session-timer')).not.toHaveText('0:00');

  await expect(page.locator('.mycoatch-live-apply')).toHaveCount(0);
  await expect(page.locator('.set-kg[data-set="1"]')).toHaveValue('80');
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
  await expect(page.locator('.mycoatch-session-summary')).toBeVisible();
  await expect(page.locator('#mycoatch-live-disclosure')).toHaveClass(/is-session-complete/);

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
  await expect(page.locator('#mycoatch-live-disclosure')).not.toHaveClass(/is-session-complete/);
  await expect(page.locator('#mycoatch-session-checkin')).toBeVisible();
  const reopened = await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    const day = state.workoutData.history.years[new Date().getFullYear()]
      .mesocycles[0].weeks[0].days[0];
    return { completed: day.completed, stamp: day.exercises[0].loggedSets[2].completedAt,
      elapsed: day.accumulatedSeconds };
  });
  assert.equal(reopened.completed, false);
  assert.ok(reopened.stamp,'reopening preserves the historical execution timestamp');
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
  await expect(page.locator('.ex-card .coach-adaptive-notes').first()).toContainText('oggi mantieni il carico');
  await expect(page.locator('.mycoatch-live-apply')).toHaveCount(0);
  await expect(page.locator('.set-kg[data-set="2"]')).toHaveValue('80');
  // Modificare il check-in non trasforma serie future in completate.
  await checkin.locator('select[name="pain"]').selectOption('present');
  await checkin.locator('button[type="submit"]').click();
  await expect(checkin).toContainText('interrompi il movimento');
  await expect(page.locator('.ex-card .coach-adaptive-notes').first()).toContainText('Dolore segnalato');
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

test('MyCoatch conserva RPE e struttura durante il mesociclo anche dopo sedute difficili',async({page})=>{
 const monitoring=await openIsolatedApp(page);await prepareWeeklyReviewFixture(page);
 await expect(page.locator('#mycoatch-weekly-review')).toHaveCount(0);
 await expect(page.locator('.set-rpe[data-set="0"]')).toHaveValue('8');
 await expect(page.locator('.set-kg[data-set="0"]')).toHaveValue('80');
 const next=await page.evaluate(async()=>{const {state}=await import('/js/state.js');return state.workoutData.history.years[2026].mesocycles[0].weeks[1].days[0].exercises[0];});
 assert.equal(next.targetRpe,'@8');assert.equal(next.reps,'6-8');assert.equal(next.loggedSets[0].completed,false);
 assert.ok(next.coachSetProposals.length);assert.deepEqual(monitoring.pageErrors,[]);
});

test('MyCoatch conserva il target originale quando lo storico segnala dolore',async({page})=>{
 const monitoring=await openIsolatedApp(page);await prepareWeeklyReviewFixture(page,{pain:true});
 await expect(page.locator('#mycoatch-weekly-review')).toHaveCount(0);
 await expect(page.locator('.set-rpe[data-set="0"]')).toHaveValue('8');
 await expect(page.locator('.set-lock-check[data-set="0"]')).not.toBeChecked();
 assert.deepEqual(monitoring.remoteRequests,[]);assert.deepEqual(monitoring.pageErrors,[]);
});

test('MyCoatch LIVE con RPE mancante non inventa massimale o suggerimenti', async ({ page }) => {
  const monitoring = await openIsolatedApp(page);
  await prepareLiveWorkout(page);
  await page.locator('.set-kg[data-set="0"]').fill('80');
  await page.locator('.set-reps[data-set="0"]').fill('8');
  // Un RPE lasciato volontariamente vuoto è consentito, ma MyCoatch non stima la fatica.
  await page.locator('.set-rpe[data-set="0"]').fill('');
  await page.locator('.set-lock-check[data-set="0"]').check();
  await expect(page.locator('.ex-card .coach-adaptive-notes').first()).toContainText('senza RPE');
  await expect(page.locator('.mycoatch-live-metrics')).toHaveCount(0);
  const rpeCount=await page.evaluate(async()=>{
    const {state}=await import('/js/state.js');const {buildLiveSessionSnapshot}=await import('/mycoatch/liveCoach.js');
    const day=state.workoutData.history.years[new Date().getFullYear()].mesocycles[0].weeks[0].days[0];
    return buildLiveSessionSnapshot(day).rpeRecordedSets;
  });
  expect(rpeCount).toBe(0);
  await expect(page.locator('.mycoatch-live-apply')).toHaveCount(0);
  await expect(page.locator('.ex-card .coach-adaptive-notes').first()).not.toContainText('e1RM stimato');
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
    await expect(page.locator(`.set-kg[data-set="${set}"]`)).toHaveValue('82');
    await expect(page.locator(`.set-reps[data-set="${set}"]`)).toHaveValue('6'); // new load resets the range; last archived confirmed set is compatible
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
  assert.ok(previews.some(p => p.includes('Esercizi principali su cui MyCoatch costruisce la progressione:') &&
    p.includes('Panca Inclinata con Manubri') &&
    p.includes('Stacco da Terra Convenzionale')));
  assert.doesNotMatch(csv, /\[SCELTA MYCOATCH\]/);
  assert.match(csv, /\[SPLIT MYCOATCH\]/);
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
  await page.locator('#mycoatch-load-bench-kg').fill('80');
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
    const result = await importWorkoutPlan(csv);
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
  await page.locator('#mycoatch-load-bench-kg').fill('80');
  await page.locator('#mycoatch-load-bench-reps').fill('8');
  await page.locator('#mycoatch-load-bench-rpe').fill('7');
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
    const missingHeader = await importWorkoutPlan('Settimana;Giorno;Esercizio;Reps\n1;1;Panca;8');
    const invalidLaterRow = await importWorkoutPlan(
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
    const wrong = await importProgressCSV(
      header + '\n' + record(1,80,'SI') + '\n' + record(1,80,'SI')
    );
    const intactAfterError = JSON.stringify(list) === before;
    const passed = await importProgressCSV(
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
    const result = await importWorkoutPlan(MyCoatch.exportAsCSV());
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
    const {state}=await import('/js/state.js');state.workoutData.history.years={};
    const { importWorkoutPlan } = await import('/js/csvHandler.js');
    const { renderWorkoutList } = await import('/js/ui.js');
    const result = await importWorkoutPlan(content);
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
  await expect(reps(2)).toHaveValue('8');
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
    const {state}=await import('/js/state.js');state.workoutData.history.years={};
    const { importWorkoutPlan } = await import('/js/csvHandler.js');
    const { renderWorkoutList } = await import('/js/ui.js');
    const r=await importWorkoutPlan(content);
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
    const result = await importWorkoutPlan(csvContent);
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
  await expect(kg(2)).toHaveValue('72.5'); // usable confirmed block reference, not an invented result
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
  await expect(kg(0)).toHaveValue('72.5');
  await expect(reps(0)).toHaveValue('9'); // confirmed reference = nuova partenza dal range CSV
  await expect(check(0)).not.toBeChecked();

  // Un nuovo mesociclo non eredita i dati del precedente.
  const other = [HEADER,
    '1;1;1;Panca Piana con Bilanciere;2;6-8;60;60;7.5;180s;Nuovo mesociclo;'
  ].join('\n');
  const next = await page.evaluate(async csvContent => {
    const { importWorkoutPlan } = await import('/js/csvHandler.js');
    const { renderWorkoutList } = await import('/js/ui.js');
    const result=await importWorkoutPlan(csvContent);
    if(result.success) renderWorkoutList();
    return result;
  },other);
  assert.equal(next.success,true,JSON.stringify(next));
  await expect(kg(0)).toHaveValue('73.4');
  await expect(reps(0)).toHaveValue('8');
  await expect(check(0)).not.toBeChecked();
  assert.deepEqual(monitor.remoteRequests,[]);
  assert.deepEqual(monitor.pageErrors,[]);
});


test('feedback utile persistente nella card, senza popup a ogni conferma', async ({page})=>{
  const monitor=await openIsolatedApp(page);await page.setViewportSize({width:390,height:844});
  await prepareLiveWorkout(page);await page.clock.install();
  await page.locator('.set-kg[data-set="0"]').fill('80');
  await page.locator('.set-reps[data-set="0"]').fill('8');
  await page.locator('.set-rpe[data-set="0"]').fill('9.5');
  await expect(page.locator('#mycoatch-live-toast')).toHaveCount(0);
  await page.locator('.set-lock-check[data-set="0"]').check();
  const panel=page.locator('.ex-card .exercise-coach-notes').first();
  await expect(panel).toBeVisible();
  await expect(panel.locator('.coach-adaptive-notes')).toContainText('RPE molto alto');
  await expect(panel.locator('summary')).toHaveCount(0);
  await page.clock.fastForward(16000);
  await expect(panel.locator('.coach-adaptive-notes')).toContainText('RPE molto alto');
  await expect(page.locator('#mycoatch-live-toast,.mycoatch-live-advice-history')).toHaveCount(0);
  await page.locator('.set-kg[data-set="1"]').fill('75');
  await page.locator('.set-reps[data-set="1"]').fill('7');
  await page.locator('.set-rpe[data-set="1"]').fill('8');
  await page.locator('.set-lock-check[data-set="1"]').check();
  await expect(panel.locator('.coach-adaptive-notes')).toBeHidden();
  await expect(page.locator('#mycoatch-live-toast')).toHaveCount(0);
  assert.deepEqual(monitor.remoteRequests,[]);assert.deepEqual(monitor.pageErrors,[]);
});

test('errore serie: avviso immediato, chiusura dopo 10 secondi e messaggio inline persistente', async ({ page }) => {
  await openIsolatedApp(page);
  await prepareLiveWorkout(page);
  await page.clock.install();
  await page.locator('.set-kg[data-set="0"]').fill('');
  // La validazione deseleziona correttamente il check: usare click, non check.
  await page.locator('.set-lock-check[data-set="0"]').click();
  await expect(page.locator('.set-lock-check[data-set="0"]')).not.toBeChecked();
  await expect(page.locator('#mycoatch-live-toast')).toContainText('Inserisci il peso');
  await expect(page.locator('#mycoatch-live-toast')).toHaveAttribute('role','alert');
  await page.clock.fastForward(9000);
  await expect(page.locator('#mycoatch-live-toast')).toBeVisible();
  await page.clock.fastForward(1000);
  await expect(page.locator('#mycoatch-live-toast')).toHaveCount(0);
  await expect(page.locator('#mycoatch-live-input-error')).toContainText('Inserisci il peso');
  await page.locator('.set-lock-check[data-set="0"]').click();
  await page.locator('.mycoatch-live-toast-dismiss').click();
  await expect(page.locator('#mycoatch-live-toast')).toHaveCount(0);
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
  await expect(page.locator('#mycoatch-live-toast')).toHaveCount(0);
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
  await expect(page.locator('#mycoatch-preview-summary')).toContainText('senza cancellare i precedenti');
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
  await expect(card.locator('.history-content')).toContainText('72,5');
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
  await expect(card.locator('.history-content')).toContainText('72,5');
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
  const history=card.locator('section.exercise-history-box');
  await expect(history).toBeVisible();
  await expect(history.locator('summary')).toHaveCount(0);
  const rows=card.locator('.history-content tbody tr');
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText('72,5');
  await expect(rows.nth(1)).toContainText('75');
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
    history:parseFloat(getComputedStyle(el.querySelector('.history-content td')).fontSize),
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
  await expect(card.locator('.exercise-exclude-hint')).toHaveText(
    'Doppio clic sulla card (PC) o swipe a sinistra (telefono) per segnare tutto l’esercizio come riscaldamento. W modifica solo una serie.');
  await expect(card.locator('.exercise-exclude-btn')).toHaveCount(0);
  await card.locator('.ex-name').dblclick();
  await expect(page.locator('.ex-card[data-ex="0"]')).toHaveClass(/is-excluded/);
  await page.locator('.ex-card[data-ex="0"] .ex-name').dblclick();
  await expect(page.locator('.ex-card[data-ex="0"]')).not.toHaveClass(/is-excluded/);
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth);
  assert.ok(overflow<=2,'Unexpected horizontal overflow: '+overflow);
});

test('gesture: only left 300px+ toggles; right ignored; inputs cannot trigger',async({page})=>{
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
  // Right swipe never reverses exclusion and does not translate the card.
  const visual=await page.evaluate(()=>{
    const card=document.querySelector('.ex-card[data-ex="0"]');
    const el=card.querySelector('.ex-name');
    const touch=x=>new Touch({identifier:8,target:el,clientX:x,clientY:240,pageX:x,pageY:240});
    el.dispatchEvent(new TouchEvent('touchstart',{bubbles:true,touches:[touch(32)],changedTouches:[touch(32)]}));
    el.dispatchEvent(new TouchEvent('touchmove',{bubbles:true,touches:[touch(342)],changedTouches:[touch(342)]}));
    const during={transform:card.style.transform,opacity:card.style.opacity};
    el.dispatchEvent(new TouchEvent('touchend',{bubbles:true,touches:[],changedTouches:[touch(342)]}));
    return {...during,after:card.style.transform};
  });
  expect(visual).toEqual({transform:'',opacity:'',after:''});
  await expect(page.locator('.ex-card[data-ex="0"]')).toHaveClass(/is-excluded/);
  // A second left swipe still restores the working-exercise state.
  await swipe(342,32);
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
  await expect(kg).toHaveValue('71.75');
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
  assert.deepEqual(result,{weight:71.75,reps:'6',rpe:8,isLocked:true});
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
    {kg:'72.5',reps:'9',rpe:'8',source:'mycoatch_protocol'},
    {kg:'80',reps:'10',rpe:'8',source:'mycoatch_protocol'},
    {kg:'11.94',reps:'12',rpe:'7',source:'mycoatch_protocol'},
    {kg:'90',reps:'5',rpe:'9',source:'current_entry'},
    {kg:'12',reps:'10+8+6',rpe:'8',source:'confirmed_previous_week'},
    {kg:'20',reps:'12',rpe:'8',source:'mycoatch_protocol'}
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
    await card.locator('.ex-name').click();
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


test('all confirmed sets at upper rep range and low RPE can propose a small load step without auto edit',async({page})=>{
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
    await page.locator('.set-reps[data-set="'+i+'"]').fill('8');
    await page.locator('.set-rpe[data-set="'+i+'"]').fill('6');
    await page.locator('.set-lock-check[data-set="'+i+'"]').check();
  }
  await expect(page.locator('#mycoatch-live-panel')).not.toContainText('Il prossimo piano usa soltanto prestazioni confermate');
  await expect(page.locator('#mycoatch-live-panel')).toContainText('Riepilogo fine seduta');
  await expect(page.locator('#mycoatch-live-panel')).toContainText('Sforzo inferiore al previsto nelle serie 1, 2, 3.');
  await expect(page.locator('.mycoatch-live-apply')).toHaveCount(0);
  const state=await page.evaluate(async()=>{
    const {state}=await import('/js/state.js');
    const ex=state.workoutData.history.years[new Date().getFullYear()]
      .mesocycles[0].weeks[0].days[0].exercises[0];
    return {actual:ex.loggedSets.map(s=>[s.weight,s.reps,s.rpe,s.isLocked]),
      prescription:ex.sets,loadingSteps:state.workoutData.athlete.loadingSteps};
  });
  assert.equal(state.actual.length,3);
  assert.ok(state.actual.every(s=>s[0]===80&&s[1]==='8'&&s[2]===6&&s[3]));
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
  await expect(page.locator('#homegym-equipment-status')).toContainText('Attrezzatura salvata sul dispositivo');
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
    await row.locator('.set-reps').fill('8');
    await row.locator('.set-rpe').fill('6');
    await row.locator('.set-lock-check').check();
  }
  await expect(page.locator('#mycoatch-future-load-review')).toHaveCount(0);
  const result=await page.evaluate(async()=>{const {state}=await import('/js/state.js');const m=state.workoutData.history.years[2026].mesocycles[0];return {actual:m.weeks[0].days[0].exercises[0].loggedSets.map(s=>s.weight),future:m.weeks.slice(1).map(w=>w.days[0].exercises[0].coachSetProposals[0].weight),original:m.weeks.slice(1).map(w=>w.days[0].exercises[0].kgMin),ledger:m.coachAdjustments.length};});
  assert.deepEqual(result.actual,[80,80,80]);assert.deepEqual(result.future,[82.5,80]);assert.deepEqual(result.original,['80','80']);assert.ok(result.ledger>0);
  await page.locator('#week-selector').selectOption('2');await expect(page.locator('.set-kg').first()).toHaveValue('82.5');
  await page.locator('#week-selector').selectOption('1');await page.locator('.set-lock-check[data-set="2"]').uncheck();
  await page.locator('#week-selector').selectOption('2');await expect(page.locator('.set-kg').first()).toHaveValue('80');
  assert.deepEqual(monitor.pageErrors,[]);assert.deepEqual(monitor.remoteRequests,[]);
});

test('rimozione account conserva diario, coda e credenziali degli altri utenti',async({page})=>{
 await openIsolatedApp(page);
 const result=await page.evaluate(async()=>{
  const {journalStorage:s,flushJournalStorage}=await import('/js/journalStore.js');
  const {removeAccountLocalData}=await import('/js/storage.js');
  s.setItem('workoutApp_data_owner','B');s.setItem('workoutApp_data','B diary');
  s.setItem('workoutApp_data_user_A','A diary');s.setItem('workoutApp_data_user_B','B diary');
  const action=(id,ownerId)=>({id,ownerId,type:'UPDATE_WORKOUT',timestamp:id==='a'?100:200,
    payload:{athlete:{email:ownerId+'@invalid.example'},history:{years:{}}}});
  s.setItem('workoutApp_data_sync_queue',JSON.stringify([action('a','A'),action('b','B')]));
  localStorage.setItem('auth-sentinel','keep');await flushJournalStorage();
  await removeAccountLocalData({id:'A'});
  return {a:s.getItem('workoutApp_data_user_A'),b:s.getItem('workoutApp_data_user_B'),global:s.getItem('workoutApp_data'),queue:JSON.parse(s.getItem('workoutApp_data_sync_queue')).map(({id,ownerId})=>({id,ownerId})),auth:localStorage.getItem('auth-sentinel')};
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
 assert.match(result.manual,/Guida pratica a HomeGym Diary e MyCoatch/);
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
  const consentArea=page.locator('.mycoatch-meso-closure-confirmations');
  await expect(consentArea).toContainText('Prima di concludere: spunta le conferme');
  await expect(consentArea.locator('.mycoatch-meso-closure-check')).toHaveCount(1);
  await expect(consentArea.locator('.mycoatch-meso-closure-progress')).toContainText('0/1');
  const finish=page.getByRole('button',{name:/Concludi e blocca il mesociclo/});
  await expect(finish).toBeEnabled(); // Always actionable; explains missing consent.
  await expect(finish).toHaveAttribute('data-confirmations-pending','true');
  await finish.click();
  await expect(page.locator('.mycoatch-meso-closure-feedback'))
    .toContainText('spunta la conferma evidenziata');
  await expect(checks.first()).toBeFocused();
  const untouched=await page.evaluate(async()=>{
    const {state}=await import('/js/state.js');
    const m=state.workoutData.history.years['2026'].mesocycles[0];
    return {locked:Boolean(m.locked),closure:m.coachClosure};
  });
  expect(untouched).toEqual({locked:false,closure:undefined});
  await checks.first().check();
  await expect(consentArea.locator('.mycoatch-meso-closure-check')).toHaveClass(/is-confirmed/);
  await expect(consentArea.locator('.mycoatch-meso-closure-progress')).toContainText('1/1');
  await expect(finish).toHaveAttribute('data-confirmations-pending','false');
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
  await page.getByRole('button',{name:/Scarica dossier dettagliato/}).click();
  const file=await d;const text=await readFile(await file.path(),'utf8');
  expect(file.suggestedFilename()).toMatch(/dossier_mycoatch\.md$/);
  expect(text).toMatch(/Sedute complete: 3\/3/);
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
  const consentArea=page.locator('.mycoatch-meso-closure-confirmations');
  await expect(consentArea.locator('.mycoatch-meso-closure-check')).toHaveCount(2);
  await expect(consentArea.locator('.mycoatch-meso-closure-progress')).toContainText('0/2');
  const finish=page.getByRole('button',{name:/Concludi e blocca il mesociclo/});
  await expect(finish).toBeEnabled();
  await expect(finish).toHaveAttribute('data-confirmations-pending','true');
  await finish.click(); // No confirmations means no prompt and no state change.
  await expect(page.locator('.mycoatch-meso-closure-feedback'))
    .toContainText('spunta le conferme evidenziate');
  await expect(boxes.first()).toBeFocused();
  await boxes.first().check();
  await expect(consentArea.locator('.mycoatch-meso-closure-progress')).toContainText('1/2');
  await finish.click();
  await expect(page.locator('.mycoatch-meso-closure-feedback'))
    .toContainText('spunta la conferma evidenziata');
  await expect(boxes.last()).toBeFocused();
  await expect(finish).toHaveAttribute('data-confirmations-pending','true');
  await boxes.last().check();
  await expect(consentArea.locator('.mycoatch-meso-closure-progress')).toContainText('2/2');
  await expect(finish).toHaveAttribute('data-confirmations-pending','false');
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



test('mobile 320px: mandatory closure consent cards stay visible and guide a blocked tap',async({page})=>{
  await page.setViewportSize({width:320,height:720});
  await openIsolatedApp(page);
  await page.evaluate(async()=>{
    const {state}=await import('/js/state.js');
    const {renderWorkoutList}=await import('/js/ui.js');
    state.currentYear='2026';state.activeMesocycleIndex=0;state.activeWeek=1;state.activeDay=1;
    const meso=state.workoutData.history.years['2026'].mesocycles[0];
    meso.weeks[1].days[0].exercises[0].loggedSets[0].isLocked=false;
    meso.weeks[1].days[0].exercises[0].loggedSets[0].completed=false;
    renderWorkoutList();
  });
  await page.locator('#review-close-meso-btn').click();
  const area=page.locator('.mycoatch-meso-closure-confirmations');
  const boxes=area.locator('input[type=checkbox]');
  await expect(boxes).toHaveCount(2);
  for(const box of await area.locator('.mycoatch-meso-closure-check').all()){
    const metrics=await box.evaluate(el=>{
      const box=el.getBoundingClientRect();
      const input=el.querySelector('input').getBoundingClientRect();
      return {boxWidth:box.width,inputWidth:input.width,scrollWidth:el.scrollWidth,clientWidth:el.clientWidth};
    });
    expect(metrics.inputWidth).toBeGreaterThanOrEqual(24);
    expect(metrics.boxWidth).toBeGreaterThan(230);
    expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth+2);
  }
  const btn=page.getByRole('button',{name:/Concludi e blocca il mesociclo/});
  await btn.click();
  await expect(boxes.first()).toBeFocused();
  await expect(area).toHaveClass(/requires-attention/);
  await expect(page.locator('.mycoatch-meso-closure-feedback')).toContainText('spunta le conferme');
  const docWidth=await page.evaluate(()=>document.documentElement.scrollWidth);
  expect(docWidth).toBeLessThanOrEqual(322);
  const untouched=await page.evaluate(async()=>{
    const {state}=await import('/js/state.js');
    return state.workoutData.history.years['2026'].mesocycles[0].coachClosure;
  });
  expect(untouched).toBeUndefined();
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
    const result=await importWorkoutPlan(csv);
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


test('PDF mesociclo: esportazione completa con pagine, note, risultati, archivio e nessuna scrittura',async({page})=>{
  await openIsolatedApp(page);
  const before=await page.evaluate(async()=>{
    const {state}=await import('/js/state.js');
    const m=state.workoutData.history.years['2026'].mesocycles[0];
    m.weeks=[{weekNumber:1,days:[{
      dayName:'Giorno 1', date:'2026-10-17',
      sessionArchives:[{sessionDate:'2026-10-10',exercises:[{
        name:'Squat archivio',notes:'Coach ripetizione',
        userNotes:'Nota ripetizione',loggedSets:[{weight:'81',reps:'5',rpe:'7',isLocked:true}]
      }]}],
      exercises:[{
        name:'Squat',block:1,setsCount:2,reps:'5',targetRpe:'8',
        kgMin:'92.5',kgMax:'97.5',notes:'COACH-MARKER: '+('note molto lunghe. '.repeat(700)),
        userNotes:'PERSONAL-MARKER: buona profondita',
        loggedSets:[
          {weight:'95',reps:'5',rpe:'8.5',isLocked:true},
          {weight:'100',reps:'4',rpe:'9',isLocked:false,dropSegments:[
            {weight:'70',reps:'7',rpe:'9'}]}
        ]
      }]
    }]}];
    window.__beforeMeso=JSON.stringify(m);
    class PdfCapture {
      constructor(){this.pages=[[]];this.current=0;}
      addPage(){this.pages.push([]);this.current=this.pages.length-1;}
      getNumberOfPages(){return this.pages.length;}
      setPage(n){this.current=n-1;}
      setFont(){} setFontSize(){} setTextColor(){} setFillColor(){} setDrawColor(){}
      rect(){} line(){}
      splitTextToSize(str,width){
        const max=Math.max(8,Math.floor(width/2));
        const text=String(str);
        const result=[];
        for(const paragraph of text.split('\\n')){
          const words=paragraph.split(/\\s+/);let line='';
          for(const word of words){
            if(line && (line+' '+word).length>max){result.push(line);line='';}
            if(word.length>max){if(line){result.push(line);line='';}
              for(let i=0;i<word.length;i+=max)result.push(word.slice(i,i+max));
            }else line+=(line?' ':'')+word;
          }
          result.push(line);
        }
        return result;
      }
      text(str,x,y){for(const line of (Array.isArray(str)?str:[str])){
        this.pages[this.current].push({line:String(line),x,y});
      }}
      save(filename){window.__pdfCapture={filename,pages:this.pages};}
    }
    window.jspdf={jsPDF:PdfCapture};
    return window.__beforeMeso;
  });
  await page.locator('#open-tools-btn').click();
  await page.locator('[data-action="export-meso-pdf"]').click();
  const report=await page.evaluate(async()=>{
    const {state}=await import('/js/state.js');
    const m=state.workoutData.history.years['2026'].mesocycles[0];
    return {before:window.__beforeMeso,after:JSON.stringify(m),result:window.__pdfCapture};
  });
  expect(report.after).toBe(before);
  expect(report.result.filename.endsWith('_diario_completo.pdf')).toBe(true);
  expect(report.result.pages.length).toBeGreaterThan(1);
  const lines=report.result.pages.flat().map(x=>x.line).join(' ');
  for(const text of ['MYCOATCH','BILANCIO DI FINE MESOCICLO',
     'LAVORO ATTRIBUITO AI GRUPPI MUSCOLARI (STIMA)','QUOTA','ESEG./PIANO',
     'SERIE ALLENANTI','RPE (sforzo percepito) registrati','Sedute ripetute conservate nello storico',
     'EVIDENZE PER PROGRAMMARE IL PROSSIMO MESOCICLO',
     'Settimana 1','Giorno 1','Squat archivio','Coach ripetizione',
     'Nota ripetizione','Squat','TARGET:','NOTE ALLENATORE','NOTE PERSONALI',
     'COACH-MARKER','PERSONAL-MARKER','95','8.5','100','70 kg',
     'Confermata','Non confermata','Pagina 1'])expect(lines).toContain(text);
  for(const pageLines of report.result.pages)for(const line of pageLines)
    expect(line.y).toBeLessThanOrEqual(290);
});


for (const width of [320, 390, 430]) test('PWA installabile con layout mobile a '+width+'px',async({page})=>{
  await page.setViewportSize({width,height:844});
  const monitoring=await openIsolatedApp(page);
  const manifest = await page.evaluate(async()=>{
    const response=await fetch('/manifest.webmanifest');
    return {ok:response.ok, content:await response.json()};
  });
  expect(manifest.ok).toBe(true);
  expect(manifest.content.display).toBe('standalone');
  expect(manifest.content.icons).toHaveLength(2);
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href','/manifest.webmanifest');
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute('sizes','180x180');
  const iconResponse=await page.request.get('/icons/icon-192.png');
  expect(iconResponse.status()).toBe(200);
  expect(iconResponse.headers()['content-type']).toContain('image/png');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  assert.deepEqual(monitoring.remoteRequests,[]);
  assert.deepEqual(monitoring.pageErrors,[]);
});


test('iPhone: no redundant BLOCCO label; notes open only with text and history collapsible',async({page})=>{
  await page.setViewportSize({width:375,height:812});
  await openIsolatedApp(page);
  await page.evaluate(async()=>{
    const {state}=await import('/js/state.js');
    const {renderWorkoutList}=await import('/js/ui.js');
    const meso=state.workoutData.history.years['2026'].mesocycles[0];
    const day=meso.weeks[1].days[0];
    const base=day.exercises[0];
    base.notes='Presa salda e controllo in discesa.';
    day.exercises.push({...structuredClone(base),name:'Curl Concentrato Singolo',
      notes:'',userNotes:'',loggedSets:[{weight:'',reps:'',rpe:'',isLocked:false}]});
    state.activeWeek=2;state.activeDay=1;renderWorkoutList();
  });
  const first=page.locator('.ex-card[data-ex="0"]');
  const second=page.locator('.ex-card[data-ex="1"]');
  await expect(first.locator('.block-title')).toHaveCount(0);
  await expect(second.locator('.block-title')).toHaveCount(0);
  await first.locator('.ex-name').click();
  await expect(first.locator('.exercise-exclude-hint')).toContainText('swipe');
  await expect(first.locator('section.exercise-coach-notes')).toBeVisible();
  await expect(second.locator('.exercise-coach-heading')).toBeHidden();
  const prev=first.locator('section.exercise-history-box');
  await expect(prev).toBeVisible();
  await expect(prev.locator('summary')).toHaveCount(0);
  const fits=await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1);
  assert.equal(fits,true,'card must not overflow iPhone viewport');
});

test('iPhone: same bench twice weekly with different RPE/reps uses loadable estimate, not copy',async({page})=>{
  await page.setViewportSize({width:375,height:812});
  await openIsolatedApp(page);
  await page.evaluate(async()=>{
    const {state}=await import('/js/state.js');
    const {renderWorkoutList}=await import('/js/ui.js');
    const {canonicalExerciseKey}=await import('/mycoatch/exerciseIdentity.js');
    const meso=state.workoutData.history.years['2026'].mesocycles[0];
    const name='Panca Piana con Bilanciere';
    const source={block:1,name,reps:'7-9',targetRpe:'7',rpe:'7',kgMin:'60',kgMax:'60',
      set:'3 set',sets:[{},{},{}],loggedSets:[0,1,2].map(()=>({
        weight:'60',reps:'8',rpe:'7',isLocked:true,completed:true
      }))};
    const target={block:1,name,reps:'5-7',targetRpe:'8',rpe:'8',kgMin:'',kgMax:'',
      set:'2 set',notes:'Fermo breve al petto.',sets:[{},{}],
      loggedSets:[{weight:'',reps:'',rpe:'',isLocked:false},{weight:'',reps:'',rpe:'',isLocked:false}]};
    meso.weeks[0].days=[
      {dayNumber:1,dayName:'Upper A',completed:true,exercises:[source]},
      {dayNumber:2,dayName:'Upper B',completed:false,exercises:[target]}
    ];
    state.workoutData.athlete ||= {};
    state.workoutData.athlete.barbellAssignments={
      [canonicalExerciseKey(name)]:{weight:10,diameter:29}
    };
    state.workoutData.athlete.plateInventories={'29':{'20':2,'10':2,'5':2,'2.5':2,'1.25':2}};
    state.workoutData.athlete.loadingSteps={barbell:2.5};
    state.activeWeek=1;state.activeDay=2;renderWorkoutList();
  });
  const card=page.locator('.ex-card[data-ex="0"]');
  const first=card.locator('.workout-set-row').first();
  await expect(first.locator('.set-kg')).toHaveValue('62.5');
  await expect(first.locator('.set-reps')).toHaveValue('7');
  await expect(first.locator('.set-rpe')).toHaveValue('8');
  await expect(first).toHaveAttribute('data-prefill-source','mycoatch_protocol');
  await expect(card.locator('.coach-adaptive-notes')).toContainText('massimale stimato');
  await expect(card.locator('section.exercise-coach-notes')).toBeVisible();
  const saved=await page.evaluate(async()=>{
    const {state}=await import('/js/state.js');
    const ex=state.workoutData.history.years['2026'].mesocycles[0].weeks[0].days[1].exercises[0];
    return ex.loggedSets.map(s=>({weight:s.weight,locked:s.isLocked}));
  });
  assert.deepEqual(saved,[{weight:'',locked:false},{weight:'',locked:false}],
    'suggested kg must never become an actual checked performance');
});


test('saved generation settings return editable; cancelled draft and new plan preserve history',async({page})=>{
  const monitor=await openIsolatedApp(page);
  page.on('dialog',dialog=>dialog.accept());
  await startCoach(page,'custom');
  await page.locator('#mycoatch-custom-time').fill('55');
  await page.locator('#mycoatch-split').selectOption('fullbody');
  await page.locator('#mycoatch-deload-choice').selectOption('none');
  await page.locator('#mycoatch-save-profile').click();
  await expect(page.locator('#mycoatch-form-feedback')).toContainText('salvato nel diario');
  await page.locator('#mycoatch-custom-time').fill('45');
  await page.evaluate(async()=>{
    const {startCoachChatAndGenerate}=await import('/mycoatch/mycoatch-adapter.js');
    startCoachChatAndGenerate();
  });
  await expect(page.locator('#select-time')).toHaveValue('custom');
  await expect(page.locator('#mycoatch-custom-time')).toHaveValue('55');
  await expect(page.locator('#mycoatch-split')).toHaveValue('fullbody');
  await page.locator('#mycoatch-split').selectOption('auto');
  await page.locator('#mycoatch-equipment-confirmed').check();
  await page.locator('#mycoatch-preview-btn').click();
  await expect(page.locator('#mycoatch-preview-overlay')).not.toHaveClass(/hidden/);
  await page.locator('#mycoatch-preview-apply').click();
  await expect(page.locator('#mycoatch-preview-overlay')).toHaveClass(/hidden/);
  const saved=await page.evaluate(async()=>{
    const {state}=await import('/js/state.js');
    const meso=state.workoutData.history.years[new Date().getFullYear()].mesocycles.at(-1);
    return {settings:meso.coachProfileSnapshot.settings,day:meso.weeks[0].days[0],
      journal:state.workoutData.athlete.mycoatchProfileJournal};
  });
  expect(saved.settings.maxSessionMinutes).toBe(55);
  expect(saved.settings.splitPreference).toBe('auto');
  expect(saved.day.timeBudgetMinutes).toBe(55);
  expect(saved.day.exercises[0].pattern).toBe('horizontal_push');
  expect(saved.day.exercises[0].loggedSets.every(set=>!set.isLocked)).toBe(true);
  expect(saved.journal.versions[0].settings.splitPreference).toBe('fullbody');
  expect(monitor.pageErrors).toEqual([]);
});

test('protocollo: note sempre visibili fra serie, avanzamento e navigazione',async({page})=>{
  const monitor=await openIsolatedApp(page);
  await page.evaluate(async()=>{
    const {state}=await import('/js/state.js');const {renderWorkoutList}=await import('/js/ui.js');
    const ex=name=>({name,setsCount:2,reps:'5-6',kgMin:'70',kgMax:'70',targetRpe:7,rpe:7,recupero:'180s',notes:'Istruzioni da leggere per tutte le serie',sets:[{},{}],loggedSets:[{},{}]});
    state.workoutData={history:{years:{2026:{mesocycles:[{id:'protocol-active',name:'Protocollo',weeks:[{weekNumber:1,days:[{dayNumber:1,exercises:[ex('Squat con Bilanciere'),ex('Panca Piana con Bilanciere')]}]}]}]}}}};
    state.currentYear='2026';state.activeMesocycleIndex=0;state.activeWeek=1;state.activeDay=1;renderWorkoutList();
  });
  const first=page.locator('.ex-card[data-ex="0"]'),second=page.locator('.ex-card[data-ex="1"]');
  for(const card of [first,second]){
    await expect(card.locator('.note-allenatore-text')).toBeVisible();
    await expect(card.locator('.exercise-coach-notes summary')).toHaveCount(0);
  }
  await first.locator('.set-lock-check').nth(0).check();
  await expect(first.locator('.note-allenatore-text')).toBeVisible();
  await first.locator('.set-lock-check').nth(1).check();
  await expect(first).not.toHaveClass(/is-active-exercise/);await expect(second).toHaveClass(/is-active-exercise/);
  await expect(second.locator('.note-allenatore-text')).toBeVisible();
  await expect(page.locator('#timer-display')).toContainText(/\d/);
  expect(monitor.pageErrors).toEqual([]);expect(monitor.remoteRequests).toEqual([]);
});

test('protocollo: fallimento import non avanza selezione e retry salva senza duplicati',async({page})=>{
  page.on('dialog',dialog=>dialog.accept());
  await openIsolatedApp(page);
  const result=await page.evaluate(async()=>{
    const {state}=await import('/js/state.js');const {importWorkoutPlan}=await import('/js/csvHandler.js');
    const {journalStorage}=await import('/js/journalStore.js');
    const before=JSON.stringify(state.workoutData);const selection=state.activeMesocycleIndex;
    const save=journalStorage.setItem;
    journalStorage.setItem=function(key,value){if(key.endsWith('_sync_queue'))throw Error('quota di prova');return save.call(this,key,value);};
    const csv='Settimana;Giorno;Esercizio;Set;Reps;KgMin;KgMax;RPE;Recupero\n1;1;Squat;3;5-6;70;70;7;180s';
    const failed=await importWorkoutPlan(csv);
    const unchanged=JSON.stringify(state.workoutData)===before&&state.activeMesocycleIndex===selection;
    journalStorage.setItem=save;
    const retried=await importWorkoutPlan(csv);
    return {failed,unchanged,retried,count:state.workoutData.history.years[state.currentYear].mesocycles.length};
  });
  expect(result.failed.success).toBe(false);expect(result.unchanged).toBe(true);expect(result.retried.success).toBe(true);
});

test('protocollo: anteprima import modificabile prima del salvataggio',async({page})=>{
  page.on('dialog',dialog=>dialog.accept());
  const monitor=await openIsolatedApp(page);
  await page.evaluate(async()=>{
    const {importWorkoutPlan}=await import('/js/csvHandler.js');
    window.protocolImport=importWorkoutPlan('Settimana;Giorno;Esercizio;Set;Reps;KgMin;KgMax;RPE;Recupero\n1;1;Squat personale;3;5-6;70;70;7;180s',{review:true});
  });
  const dialog=page.getByRole('dialog',{name:'Controlla e modifica la scheda prima di importare'});
  await expect(dialog).toBeVisible();await dialog.getByLabel(/^Esercizio · Squat Personale$/i).fill('Squat variante personale');
  await dialog.getByRole('button',{name:'Conferma importazione'}).click();
  const saved=await page.evaluate(async()=>{const result=await window.protocolImport;const {state}=await import('/js/state.js');return {result,name:state.workoutData.history.years[state.currentYear].mesocycles.at(-1).weeks[0].days[0].exercises[0].name};});
  expect(saved.result.success).toBe(true);expect(saved.name).toBe('Squat variante personale');expect(monitor.pageErrors).toEqual([]);
});

test('protocollo: squat 70→79 kg fra giorni diversi e warmup escluso dalla proposta',async({page},testInfo)=>{
  const monitor=await openIsolatedApp(page);await page.setViewportSize({width:390,height:844});
  await page.evaluate(async()=>{
    const {state}=await import('/js/state.js');const {renderWorkoutList}=await import('/js/ui.js');
    const source={name:'Squat con Bilanciere',setsCount:3,reps:'5-6',kgMin:'70',kgMax:'70',targetRpe:7,rpe:7,recupero:'180s',notes:'Tronco stabile, discesa controllata.',sets:[{},{},{}],loggedSets:[6.5,6.5,7].map(rpe=>({weight:79,reps:6,rpe,completed:true,isLocked:true,performedAt:'2026-10-20'}))};
    const next={...source,recupero:'150s',loggedSets:[{},{},{}]};
    state.workoutData={athlete:{},history:{years:{2026:{mesocycles:[{id:'photo-case',name:'Verifica squat',weeks:[{weekNumber:1,days:[{dayNumber:1,completed:true,exercises:[source]},{dayNumber:2,exercises:[next]}]}]}]}}}};
    state.currentYear='2026';state.activeMesocycleIndex=0;state.activeWeek=1;state.activeDay=2;renderWorkoutList();
  });
  await expect(page.locator('.set-kg').first()).toHaveValue('79');
  await expect(page.locator('.exercise-history-box')).toContainText('6,5');
  await expect(page.locator('.coach-adaptive-notes')).toContainText('Recupero diverso dalla seduta di riferimento');
  await page.evaluate(async()=>{const {stopTimer}=await import('/js/timer.js');stopTimer();});
  await page.locator('.ex-name').scrollIntoViewIfNeeded();
  await page.screenshot({path:testInfo.outputPath('squat-proposta-mobile.png'),fullPage:true});
  await page.evaluate(async()=>{const {state}=await import('/js/state.js');const {renderWorkoutList}=await import('/js/ui.js');state.workoutData.history.years[2026].mesocycles[0].weeks[0].days[0].exercises[0].isWarmup=true;renderWorkoutList();});
  await expect(page.locator('.exercise-history-box')).toHaveCount(0);await expect(page.locator('.set-kg').first()).toHaveValue('70');
  expect(monitor.pageErrors).toEqual([]);
});

test('protocollo: PDF reale esportato conserva tutti gli esercizi e impagina note lunghe',async({page},testInfo)=>{
  await openIsolatedApp(page);
  const pdf=await page.evaluate(async()=>{
    const {exportMesoToPDF}=await import('/js/mesocycle.js');
    const Real=window.jspdf.jsPDF;
    let captured;
    window.jspdf.jsPDF=function(...args){const doc=new Real(...args);doc.save=()=>{captured={bytes:Array.from(new Uint8Array(doc.output('arraybuffer'))),pages:doc.getNumberOfPages()};};return doc;};
    const exercises=Array.from({length:12},(_,i)=>({name:'Esercizio personalizzato '+(i+1),setsCount:3,reps:'8-12',rpe:8,notes:'Controlla la tecnica e registra le ripetizioni effettive. '.repeat(i===0?25:2),loggedSets:[1,2,3].map(()=>({weight:30,reps:10,rpe:8,isLocked:true,performedAt:'2026-10-20'}))}));
    exportMesoToPDF({name:'Verifica report completo',weeks:[{weekNumber:1,days:[{dayNumber:1,date:'2026-10-20',exercises}]}]});
    window.jspdf.jsPDF=Real;return captured;
  });
  expect(pdf.pages).toBeGreaterThan(1);expect(pdf.bytes.length).toBeGreaterThan(10000);
  const {writeFile}=await import('node:fs/promises');await writeFile(testInfo.outputPath('report-reale.pdf'),Buffer.from(pdf.bytes));
});

// Extended schedule: exercise the real form, CSV, import, archive and menus.
test('8 settimane e 6 giorni: anteprima e importazione preservano il diario e tutti i giorni',async({page})=>{
  const monitor=await openIsolatedApp(page);page.on('dialog',dialog=>dialog.accept());
  await startCoach(page,'60');
  await page.locator('#mycoatch-weeks').fill('8');
  await page.locator('#select-days').selectOption('6');
  await expect(page.locator('#mycoatch-split')).toBeDisabled();
  await page.locator('#mycoatch-equipment-confirmed').uncheck();
  await page.locator('#mycoatch-preview-btn').click();
  await expect(page.locator('#mycoatch-form-feedback')).toContainText('conferma');
  await page.locator('#mycoatch-equipment-confirmed').check();
  const old=await page.evaluate(async()=>{
    const {state}=await import('/js/state.js');
    return JSON.stringify(state.workoutData.history.years);
  });
  await page.locator('#mycoatch-preview-btn').click();
  await expect(page.locator('.mycoatch-preview-week')).toHaveCount(8);
  await expect(page.locator('.mycoatch-preview-day h4')).toHaveCount(48);
  const beforeImport=await page.evaluate(async()=>{
    const {state}=await import('/js/state.js');return JSON.stringify(state.workoutData.history.years);
  });
  assert.equal(beforeImport,old,'preview must not edit the diary');
  const downloading=page.waitForEvent('download');
  await page.locator('#mycoatch-preview-download').click();
  const file=await downloading;const csv=await readFile(await file.path(),'utf8');
  assert.ok(csv.split('\n').some(row=>row.startsWith('8;6;')));
  assert.match(csv,/SPLIT MYCOATCH\] Lower C/);
  assert.doesNotMatch(csv,/Hamstring Walkout|Push-up a Terra/);
  await page.locator('#mycoatch-preview-apply').click();
  await expect(page.locator('#mycoatch-preview-overlay')).toHaveClass(/hidden/);
  const result=await page.evaluate(async()=>{
    const {state}=await import('/js/state.js');
    const m=state.workoutData.history.years[new Date().getFullYear()].mesocycles.at(-1);
    const {summarizeMesocycleClosure}=await import('/js/mesocycleClosure.js');
    const {buildMesocyclePdfOutline}=await import('/js/mesocyclePdfModel.js');
    return {weeks:m.weeks.length,days:m.weeks.at(-1).days.length,
      last:m.weeks.at(-1).days.at(-1).dayName,settings:m.coachProfileSnapshot.settings,
      sessions:summarizeMesocycleClosure(m).plannedSessions,
      pdfWeeks:buildMesocyclePdfOutline(m).filter(r=>r.kind==='week').length,
      oldWeight:state.workoutData.history.years[2025].mesocycles[0].weeks[0].days[0].exercises[0].loggedSets[0].weight};
  });
  expect(result.weeks).toBe(8);expect(result.days).toBe(6);expect(result.last).toBe('Lower C');
  expect(result.settings.durationWeeks).toBe(8);expect(result.sessions).toBe(48);expect(result.pdfWeeks).toBe(8);
  expect(result.oldWeight).toBe('70');
  await page.locator('#week-selector').selectOption('8');
  await expect(page.locator('.day-tabs button')).toHaveCount(6);
  await page.locator('.day-tabs button').last().click();
  await expect(page.locator('.active-day-btn')).toHaveText('Lower C');
  assert.deepEqual(monitor.pageErrors,[]);assert.deepEqual(monitor.remoteRequests,[]);
});

test('CSV esterno: 52 settimane e 7 giorni consultabili su mobile, anche nel report completo',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  const monitor=await openIsolatedApp(page);page.on('dialog',dialog=>dialog.accept());
  const rows=[HEADER];
  for(let w=1;w<=52;w++)for(let d=1;d<=7;d++)
    rows.push(`${w};${d};1;Alzate Laterali con Manubri;1;15-20;5;5;8;60s;Test esterno;;`);
  const imported=await page.evaluate(async csv=>{
    const {importWorkoutPlan}=await import('/js/csvHandler.js');
    return importWorkoutPlan(csv);
  },rows.join('\n'));
  expect(imported.success).toBe(true);
  await page.evaluate(async()=>{const {renderWorkoutList}=await import('/js/ui.js');renderWorkoutList();});
  await expect(page.locator('#week-selector option')).toHaveCount(52);
  await page.locator('#week-selector').selectOption('52');
  await expect(page.locator('.day-tabs button')).toHaveCount(7);
  await page.locator('.day-tabs button').last().click();
  await expect(page.locator('.active-day-btn')).toHaveText('Giorno 7');
  const last=await page.evaluate(async()=>{
    const {state}=await import('/js/state.js');
    const m=state.workoutData.history.years[new Date().getFullYear()].mesocycles.at(-1);
    const {summarizeMesocycleClosure}=await import('/js/mesocycleClosure.js');
    const {buildMesocyclePdfOutline}=await import('/js/mesocyclePdfModel.js');
    return {weeks:m.weeks.length,sessions:summarizeMesocycleClosure(m).plannedSessions,
      pdfDays:buildMesocyclePdfOutline(m).filter(r=>r.kind==='day').length,
      last:m.weeks.at(-1).days.at(-1).dayNumber,
      pageOverflows:document.documentElement.scrollWidth>innerWidth+2};
  });
  expect(last).toEqual({weeks:52,sessions:364,pdfDays:364,last:7,pageOverflows:false});
  assert.deepEqual(monitor.pageErrors,[]);assert.deepEqual(monitor.remoteRequests,[]);
});

test('menu e sottomenu: nessun ID, azione o esercizio duplicato dopo aperture ripetute',async({page})=>{
  await openIsolatedApp(page);
  for(let i=0;i<3;i++){
    await startCoach(page,'60');
    const duplicates=await page.evaluate(()=>{
      const repeated=xs=>xs.filter((x,i)=>xs.indexOf(x)!==i);
      const modal=document.getElementById('mycoatch-config-modal');
      return {ids:repeated([...document.querySelectorAll('[id]')].map(n=>n.id)),
        actions:repeated([...document.querySelectorAll('#tools-modal [data-action]')].map(n=>n.dataset.action)),
        exclusions:repeated([...modal.querySelectorAll('.mycoatch-avoid-check')].map(n=>n.value)),
        misplaced:[...modal.querySelectorAll('.mycoatch-avoid-check')].filter(n=>!n.closest('#mycoatch-avoid-exercises')).length,
        machines:repeated([...modal.querySelectorAll('.mycoatch-machine-check')].map(n=>n.value)),
        options:[...modal.querySelectorAll('select')].flatMap(s=>repeated([...s.options].map(o=>o.value)))};
    });
    expect(duplicates).toEqual({ids:[],actions:[],exclusions:[],misplaced:0,machines:[],options:[]});
    await page.locator('#close-mycoatch-config').click();
  }
});

test('note unificate: istruzioni sicure, aggiornamento singolo, silenzio e focus su mobile',async({page})=>{
  await page.setViewportSize({width:320,height:800});
  const monitor=await openIsolatedApp(page);await prepareLiveWorkout(page);
  await page.evaluate(async()=>{
    const {state}=await import('/js/state.js');
    const {renderExerciseCoachPanel}=await import('/js/exerciseCoachUI.js');
    const ex=state.workoutData.history.years[new Date().getFullYear()].mesocycles[0].weeks[0].days[0].exercises[0];
    ex.notes='Fermo di due secondi. | <img src=x onerror="window.noteInjected=true"> | [DURATA STIMATA] 32 minuti';
    ex.coachSetProposals=[0,1,2].map(()=>({kind:'increase_load',weight:82.5,reps:6,reason:'Tutte le serie al limite alto.',basedOn:[{weight:80,reps:8}]}));
    window.notesBefore=JSON.stringify(ex);
    renderExerciseCoachPanel(document.querySelector('.ex-card'),ex,{prefills:[{weight:82.5},{weight:82.5},{weight:82.5}]});
  });
  const panel=page.locator('.ex-card .exercise-coach-notes').first();
  await expect(panel).toBeVisible();await expect(panel.locator('summary')).toHaveCount(0);
  await expect(panel.locator('.note-allenatore-text')).toContainText('Fermo di due secondi.');
  await expect(panel.locator('.note-allenatore-text')).not.toContainText('DURATA STIMATA');
  await expect(panel.locator('.note-allenatore-text img')).toHaveCount(0);
  await expect(panel.locator('.coach-adaptive-notes p')).toHaveCount(1);
  await expect(panel.locator('.coach-adaptive-notes')).toContainText('Ho aumentato il carico alle serie 1, 2, 3: 82,5 kg');
  const input=page.locator('.ex-card').first().locator('.ex-user-notes');await input.focus();
  const result=await page.evaluate(async()=>{
    const {state}=await import('/js/state.js');const {refreshExerciseCoachPanel}=await import('/js/exerciseCoachUI.js');
    const ex=state.workoutData.history.years[new Date().getFullYear()].mesocycles[0].weeks[0].days[0].exercises[0];
    const card=document.querySelector('.ex-card');const old=card.querySelector('.coach-adaptive-notes p');
    refreshExerciseCoachPanel(card,null);
    return {sameNode:old===card.querySelector('.coach-adaptive-notes p'),unchanged:window.notesBefore===JSON.stringify(ex),injected:!!window.noteInjected,overflow:document.documentElement.scrollWidth>innerWidth+2};
  });
  expect(result).toEqual({sameNode:true,unchanged:true,injected:false,overflow:false});await expect(input).toBeFocused();
  await panel.screenshot({path:'/tmp/notes-mobile-320.png'});
  await page.evaluate(async()=>{
    const {state}=await import('/js/state.js');const {refreshExerciseCoachPanel}=await import('/js/exerciseCoachUI.js');
    const ex=state.workoutData.history.years[new Date().getFullYear()].mesocycles[0].weeks[0].days[0].exercises[0];
    ex.coachSetProposals.forEach(p=>{p.kind='history';p.weight=80;p.reps=8;p.reason='Ripropongo il riferimento.';});
    refreshExerciseCoachPanel(document.querySelector('.ex-card'),{code:'on_track',severity:'ok',message:'Serie confermata.',nextSetIndex:1});
  });
  await expect(panel.locator('.coach-adaptive-notes')).toBeHidden();
  await expect(panel.locator('.note-allenatore-text')).toBeVisible();
  assert.deepEqual(monitor.pageErrors,[]);assert.deepEqual(monitor.remoteRequests,[]);
});

test('superserie: istruzioni sempre fuori dai menu dello storico su schermo piccolo',async({page})=>{
  await page.setViewportSize({width:320,height:800});
  const monitor=await openIsolatedApp(page);await prepareLiveWorkout(page);
  await page.evaluate(async()=>{
    const {state}=await import('/js/state.js');const {renderWorkoutList}=await import('/js/ui.js');
    const day=state.workoutData.history.years[new Date().getFullYear()].mesocycles[0].weeks[0].days[0];
    const a=day.exercises[0];a.groupType='superset';a.groupBase=1;a.block='1a';a.notes='Fermo al petto.';
    const b=structuredClone(a);b.block='1b';b.name='Rematore con Manubri';b.notes='Busto stabile.';day.exercises=[a,b];
    renderWorkoutList();
  });
  await expect(page.locator('.circuit-exercise .exercise-coach-notes')).toHaveCount(2);
  for(const panel of await page.locator('.circuit-exercise .exercise-coach-notes').all())await expect(panel).toBeVisible();
  await expect(page.locator('.circuit-details .exercise-coach-notes')).toHaveCount(0);
  await expect(page.locator('.circuit-exercise').first()).toContainText('Fermo al petto.');
  await expect(page.locator('.circuit-exercise').last()).toContainText('Busto stabile.');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2)).toBe(false);
  assert.deepEqual(monitor.pageErrors,[]);assert.deepEqual(monitor.remoteRequests,[]);
});

test('11 reps confermate: proposta 12-11-11 nelle celle, un solo storico e note unite',async({page},testInfo)=>{
  await page.setViewportSize({width:390,height:844});
  const monitor=await openIsolatedApp(page);
  await page.evaluate(async()=>{
    const {state}=await import('/js/state.js');const {renderWorkoutList}=await import('/js/ui.js');
    const source={name:'Curl Manubri su Panca Inclinata',set:'3 set',reps:'10-12',rpe:8.5,targetRpe:8.5,recupero:'90s',notes:'Gomiti stabili, evita di oscillare.',sets:[{},{},{}],loggedSets:[15,12.5,12.5].map(weight=>({weight,reps:11,rpe:8,isLocked:true,completed:true,performedAt:'2026-10-20'}))};
    const next={...structuredClone(source),loggedSets:[{},{},{}]};
    const days=[{dayNumber:1,date:'2026-10-20',completed:true,exercises:[source]},{dayNumber:2,exercises:[next]}];
    state.workoutData={athlete:{},history:{years:{2026:{mesocycles:[{name:'Progressione reps',weeks:[{weekNumber:1,days}]}]}}}};
    state.currentYear='2026';state.activeMesocycleIndex=0;state.activeWeek=1;state.activeDay=2;renderWorkoutList();
  });
  const card=page.locator('.ex-card').first(),panel=card.locator('.exercise-coach-notes');
  await expect(panel).toBeVisible();await expect(panel.locator('strong')).toHaveText(['Note della scheda','Consigli di MyCoatch']);
  await expect(panel).toContainText('Ho aggiunto una ripetizione alla serie 1: 15 kg × 12 reps.');
  await expect(panel).not.toContainText('Disponibilità del peso');await expect(panel).not.toContainText('precompilati');
  await expect(card.locator('.set-reps').nth(0)).toHaveValue('12');
  await expect(card.locator('.set-reps').nth(1)).toHaveValue('11');
  await expect(card.locator('.set-reps').nth(2)).toHaveValue('11');
  await expect(card.locator('.set-kg').nth(0)).toHaveValue('15');
  await expect(card.locator('.set-kg').nth(1)).toHaveValue('12.5');
  await expect(card.locator('.exercise-history-box')).toHaveCount(1);
  await expect(card.locator('.exercise-history-box')).toContainText('20/10/2026');
  await expect(card.locator('.history-content tbody tr')).toHaveCount(3);
  await expect(card.locator('.exercise-history-box summary,.circuit-details,.coach-exposure-summary')).toHaveCount(0);
  const ordering=await card.evaluate(el=>{
    const selectors=['.exercise-coach-notes','.exercise-history-box','.set-table','.exercise-personal-notes'];
    return selectors.slice(1).every((selector,i)=>Boolean(el.querySelector(selectors[i]).compareDocumentPosition(el.querySelector(selector))&4));
  });expect(ordering).toBe(true);
  await page.evaluate(async()=>{const {stopTimer}=await import('/js/timer.js');stopTimer();});
  const historyWidths=await card.locator('.exercise-history-box').evaluate(el=>({outer:el.clientWidth,table:el.querySelector('table').getBoundingClientRect().width}));
  expect(historyWidths.table).toBeGreaterThan(historyWidths.outer*.85);
  await card.screenshot({path:testInfo.outputPath('curl-note-storico-390.png')});
  await page.setViewportSize({width:320,height:800});await page.evaluate(()=>document.documentElement.setAttribute('data-theme','dark'));
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2)).toBe(true);
  await card.screenshot({path:testInfo.outputPath('curl-note-storico-320-dark.png')});
  const before=await page.evaluate(async()=>{const {state}=await import('/js/state.js');return state.workoutData.history.years[2026].mesocycles[0].weeks[0].days[1].exercises[0].loggedSets;});
  expect(before.every(s=>!s.isLocked&&!s.completed&&!s.weight&&!s.reps)).toBe(true);
  await card.locator('.set-reps').nth(0).fill('11');
  await page.evaluate(async()=>{const {renderWorkoutList}=await import('/js/ui.js');renderWorkoutList();});
  await expect(card.locator('.set-reps').nth(0)).toHaveValue('11');
  await expect(card.locator('.coach-adaptive-notes')).toContainText('Suggerisco 15 kg × 12 reps');
  await expect(card.locator('.coach-adaptive-notes')).not.toContainText('Ho aggiunto');
  assert.deepEqual(monitor.pageErrors,[]);assert.deepEqual(monitor.remoteRequests,[]);
});

test('report finale: confronto per serie, nessun tab ridondante e verde solo a seduta completa',async({page},testInfo)=>{
  await page.setViewportSize({width:390,height:844});const monitor=await openIsolatedApp(page);
  await page.evaluate(async()=>{
    const {state}=await import('/js/state.js');const {renderWorkoutList}=await import('/js/ui.js');
    const ex={name:'Panca Piana con Bilanciere',set:'3 set',reps:'6-8',rpe:8,targetRpe:8,
      sets:[{targetReps:3,targetRpe:8,role:'top'},{targetReps:'6-8',targetRpe:7,role:'backoff'},{targetReps:'6-8',targetRpe:7,role:'backoff'}],
      loggedSets:[{weight:80,reps:3,rpe:8,isLocked:true},{weight:70,reps:8,rpe:8,isLocked:true},{weight:70,reps:6,rpe:'',isLocked:true}]};
    state.workoutData={athlete:{},history:{years:{2026:{mesocycles:[{name:'Verifica report',weeks:[{weekNumber:1,days:[{dayNumber:1,completed:true,exercises:[ex]}]}]}]}}}};
    state.currentYear='2026';state.activeMesocycleIndex=0;state.activeWeek=1;state.activeDay=1;renderWorkoutList();
  });
  const menu=page.locator('#mycoatch-live-disclosure');await expect(menu).toHaveClass(/is-session-complete/);
  await menu.locator('summary').first().click();
  const report=page.locator('.mycoatch-session-summary');await expect(report).toBeVisible();
  await expect(page.locator('#mycoatch-live-panel h3')).toHaveCount(0);
  await expect(page.locator('#mycoatch-session-checkin,.mycoatch-live-metrics,.mycoatch-live-time-estimate')).toHaveCount(0);
  await expect(report).toContainText('Sforzo superiore al previsto nelle serie 2.');
  await expect(report).toContainText('RPE mancante o non valido nelle serie 3.');
  await expect(report.locator('tbody tr')).toHaveCount(3);
  await expect(report.locator('tbody tr').nth(0)).toContainText('3 / 3');
  await expect(report.locator('tbody tr').nth(1)).toContainText('8 / 7');
  await expect(report.locator('tbody tr').nth(2)).toContainText('— / 7');
  await expect(report).not.toContainText('Il prossimo piano');
  await expect(menu.locator('.mycoatch-live-count')).toHaveText('Completata');
  await page.evaluate(async()=>{const {stopTimer}=await import('/js/timer.js');stopTimer();});
  await menu.screenshot({path:testInfo.outputPath('report-390.png')});
  await page.setViewportSize({width:320,height:800});await page.evaluate(()=>document.documentElement.setAttribute('data-theme','dark'));
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2)).toBe(true);
  await menu.screenshot({path:testInfo.outputPath('report-320-dark.png')});
  await menu.locator('summary').first().click();await expect(report).not.toBeVisible();await expect(menu).toHaveClass(/is-session-complete/);
  const green=await menu.locator('summary').first().evaluate(el=>getComputedStyle(el).backgroundColor);
  await page.locator('.set-lock-check[data-set="2"]').uncheck();
  await expect(menu).not.toHaveClass(/is-session-complete/);
  await expect(page.locator('.mycoatch-session-summary')).toHaveCount(0);
  await expect(page.locator('#mycoatch-session-checkin')).toHaveCount(1);
  expect(await menu.locator('summary').first().evaluate(el=>getComputedStyle(el).backgroundColor)).not.toBe(green);
  assert.deepEqual(monitor.remoteRequests,[]);assert.deepEqual(monitor.pageErrors,[]);
});

test('report finale collega soltanto la proposta successiva ai risultati confermati di oggi',async({page})=>{
  const monitor=await openIsolatedApp(page);
  await page.evaluate(async()=>{
    const {state}=await import('/js/state.js');const {renderWorkoutList}=await import('/js/ui.js');
    const ex={name:'Curl Manubri su Panca Inclinata',set:'3 set',reps:'10-12',rpe:8.5,targetRpe:8.5,kgMin:15,kgMax:15,recupero:'90s',sets:[{},{},{}],loggedSets:[{},{},{}]};
    state.workoutData={athlete:{},history:{years:{2026:{mesocycles:[{name:'Report progressione',weeks:[{weekNumber:1,days:[{dayNumber:1,exercises:[ex]},{dayNumber:2,exercises:[structuredClone(ex)]}]}]}]}}}};
    state.currentYear='2026';state.activeMesocycleIndex=0;state.activeWeek=1;state.activeDay=1;renderWorkoutList();
  });
  for(let i=0;i<3;i++){
    await page.locator('.set-kg[data-set="'+i+'"]').fill('15');
    await page.locator('.set-reps[data-set="'+i+'"]').fill('11');
    await page.locator('.set-rpe[data-set="'+i+'"]').fill('8.5');
    await page.locator('.set-lock-check[data-set="'+i+'"]').check();
    await expect(page.locator('#mycoatch-live-toast')).toHaveCount(0);
  }
  const report=page.locator('.mycoatch-session-summary');await expect(report).toBeVisible();
  await expect(report).toContainText('Reps entro l’obiettivo in 3/3 serie.');
  await expect(report).toContainText('RPE entro l’obiettivo in 3/3 serie.');
  await expect(report).toContainText('Proposta per la prossima esposizione · settimana 1, giorno 2');
  await expect(report.locator('.mycoatch-session-next')).toHaveText('Serie 1: 15 kg × 12 reps (+1 ripetizione).');
  const result=await page.evaluate(async()=>{
    const {state}=await import('/js/state.js');const days=state.workoutData.history.years[2026].mesocycles[0].weeks[0].days;
    return {actual:days[0].exercises[0].loggedSets.map(s=>[s.weight,String(s.reps),s.isLocked]),
      next:days[1].exercises[0].coachSetProposals.map(p=>p.reps),logs:days[1].exercises[0].loggedSets};
  });
  expect(result.actual.every(s=>s[0]===15&&s[1]==='11'&&s[2])).toBe(true);
  expect(result.next).toEqual([12,11,11]);expect(result.logs.every(s=>!s.completed&&!s.isLocked)).toBe(true);
  await page.locator('.day-tabs button').nth(1).click();
  await expect(page.locator('#mycoatch-live-disclosure')).not.toHaveClass(/is-session-complete/);
  await expect(page.locator('.set-reps').first()).toHaveValue('12');
  assert.deepEqual(monitor.remoteRequests,[]);assert.deepEqual(monitor.pageErrors,[]);
});
