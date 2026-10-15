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
    await expect(page.locator('#meso-display')).toHaveText('1', { timeout: 3000 });
  } catch (error) {
    const diagnostics = await page.evaluate(async () => {
      const raw = localStorage.getItem('workoutApp_data');
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
  await startCoach(page);

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

  const storedAfter = await page.evaluate(() => JSON.parse(localStorage.getItem('workoutApp_data')));
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
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('workoutApp_data')));
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
  await expect(page.locator('#mycoatch-live-panel')).toBeVisible();
  await expect(page.locator('#mycoatch-live-panel')).toContainText('Serie confermate: 0/3');
  await expect(page.locator('.set-kg[data-set="0"]')).toHaveValue('');
  await expect(page.locator('.set-reps[data-set="0"]')).toHaveValue('');
  await expect(page.locator('.set-rpe[data-set="0"]')).toHaveValue('');
  assert.equal(await page.locator('.set-kg[data-set="0"]').getAttribute('placeholder'), '80');

  // Nessuna conferma da valori prescritti: le serie devono avere dati realmente inseriti.
  await page.locator('.set-lock-check[data-set="0"]').click();
  await expect(page.locator('.set-lock-check[data-set="0"]')).not.toBeChecked();
  await expect(page.locator('#mycoatch-live-input-error')).toContainText('peso realmente usato');
  await expect(page.locator('#mycoatch-live-panel')).toContainText('Serie confermate: 0/3');

  await page.locator('.set-kg[data-set="0"]').fill('80');
  await page.locator('.set-reps[data-set="0"]').fill('8');
  await page.locator('.set-rpe[data-set="0"]').fill('9.5');
  await page.locator('.set-lock-check[data-set="0"]').check();
  await expect(page.locator('#mycoatch-live-panel')).toContainText('Serie confermate: 1/3');
  await expect(page.locator('#mycoatch-live-guidance')).toContainText('RPE molto alto');
  await expect(page.locator('#mycoatch-live-guidance')).toContainText('Ultima prestazione comparabile');
  await expect(page.locator('#mycoatch-live-guidance')).toContainText('Differenza e1RM');
  await expect(page.locator('.mycoatch-live-apply')).toBeVisible();
  await expect(page.locator('.set-kg[data-set="1"]')).toHaveValue('');
  await expect(page.locator('.set-reps[data-set="1"]')).toHaveValue('');
  await expect(page.locator('.set-rpe[data-set="1"]')).toHaveValue('');
  await expect(page.locator('#live-session-timer')).not.toHaveText('0:00');

  await page.locator('.mycoatch-live-apply').click();
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

test('MyCoatch LIVE con RPE mancante non inventa massimale o suggerimenti', async ({ page }) => {
  const monitoring = await openIsolatedApp(page);
  await prepareLiveWorkout(page);
  await page.locator('.set-kg[data-set="0"]').fill('80');
  await page.locator('.set-reps[data-set="0"]').fill('8');
  await page.locator('.set-lock-check[data-set="0"]').check();
  await expect(page.locator('#mycoatch-live-guidance')).toContainText('senza RPE');
  await expect(page.locator('#mycoatch-live-panel')).toContainText('RPE misurato: 0/1');
  await expect(page.locator('.mycoatch-live-apply')).toHaveCount(0);
  await expect(page.locator('#mycoatch-live-guidance')).not.toContainText('e1RM stimato');
  assert.deepEqual(monitoring.remoteRequests, []);
  assert.deepEqual(monitoring.pageErrors, []);
});


test('ripetere una seduta pulisce serie reali e timestamp, non solo la spunta', async ({ page }) => {
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
  for (let set = 0; set < 3; set++) {
    await expect(page.locator(`.set-lock-check[data-set="${set}"]`)).not.toBeChecked();
    await expect(page.locator(`.set-kg[data-set="${set}"]`)).toHaveValue('');
    await expect(page.locator(`.set-reps[data-set="${set}"]`)).toHaveValue('');
    await expect(page.locator(`.set-rpe[data-set="${set}"]`)).toHaveValue('');
  }
  const result = await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    const day = state.workoutData.history.years[new Date().getFullYear()]
      .mesocycles[0].weeks[0].days[0];
    return {
      started: day.sessionStart,
      completed: day.completed,
      completedAt: day.sessionCompletedAt,
      series: day.exercises[0].loggedSets.map(s =>
        ({ weight: s.weight, reps: s.reps, rpe: s.rpe, stamp: s.completedAt }))
    };
  });
  assert.equal(result.completed, false);
  assert.equal(result.started, null);
  assert.equal(result.completedAt, undefined);
  assert.ok(result.series.every(s =>
    s.weight === '' && s.reps === '' && s.rpe === '' && s.stamp === undefined));
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
  await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem('workoutApp_data'));
    data.history.years = {};
    localStorage.setItem('workoutApp_data', JSON.stringify(data));
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    const auth = document.getElementById('auth-overlay');
    if (auth) auth.style.display = 'none';
  });
  await expect(page.locator('#open-tools-btn')).toBeVisible();
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
  const stored = JSON.parse(localStorage.getItem('workoutApp_data'));
  assert.deepEqual(stored.history.years, {});
  assert.deepEqual(monitor.remoteRequests, []);
  assert.deepEqual(monitor.pageErrors, []);
});

test('prima scheda intermedio senza storico: rispetta esclusioni e convalida carichi di riferimento', async ({ page }) => {
  const monitor = await openIsolatedApp(page);
  await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem('workoutApp_data'));
    data.history.years = {};
    localStorage.setItem('workoutApp_data', JSON.stringify(data));
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    const auth = document.getElementById('auth-overlay');
    if (auth) auth.style.display = 'none';
  });
  await expect(page.locator('#open-tools-btn')).toBeVisible();
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
