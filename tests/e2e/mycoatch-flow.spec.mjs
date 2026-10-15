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
  await expect(page.locator('.set-rpe[data-set="1"]')).toHaveValue('9.5');
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
    await expect(page.locator(`.set-reps[data-set="${set}"]`)).toHaveValue('6');
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
    localStorage.setItem('workoutApp_data', JSON.stringify(state.workoutData));
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
    JSON.parse(localStorage.getItem('workoutApp_data')));
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
    localStorage.setItem('workoutApp_data', JSON.stringify(state.workoutData));
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
    localStorage.setItem('workoutApp_data', JSON.stringify(state.workoutData));
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
    localStorage.setItem('workoutApp_data', JSON.stringify(state.workoutData));
    renderWorkoutList();
    return { success: true };
  });
  assert.equal(created.success, true, JSON.stringify(created));

  const before = await page.evaluate(() => localStorage.getItem('workoutApp_data'));
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
  assert.equal(await page.evaluate(() => localStorage.getItem('workoutApp_data')),
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
    localStorage.setItem('workoutApp_data', JSON.stringify(state.workoutData));
    return meso.weeks[0].days.length;
  });
  assert.equal(completed, 4);
  const allBefore = await page.evaluate(() => localStorage.getItem('workoutApp_data'));
  await page.locator('#mycoatch-submit').click();
  assert.ok(previews.some(p => p.includes('Calibrazione della prima settimana registrata') &&
    p.includes('NON significa che le settimane restanti')),
    'Anche quando la calibrazione è pronta non deve dichiarare concluso il blocco');
  assert.equal(await page.evaluate(() => localStorage.getItem('workoutApp_data')),
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

  // L'atleta puo' confermare kg e reps proposti con un SOLO tap:
  // l'RPE mostrato e' una prescrizione, non un dato misurato.
  await check(0).check();
  const first = await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    const current = state.workoutData.history.years[String(new Date().getFullYear())].mesocycles.at(-1);
    return current.weeks[0].days[0].exercises[0].loggedSets;
  });
  assert.equal(first[0].weight,70);
  assert.equal(first[0].reps,'8');
  assert.equal(first[0].rpe,'');
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
  await expect(rpe(2)).toHaveValue('9');
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
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('workoutApp_data')));
  const logged = saved.history.years[String(new Date().getFullYear())].mesocycles.at(-1)
    .weeks[0].days[0].exercises[0].loggedSets;
  assert.equal(logged[0].isLocked,true);
  assert.equal(logged[0].rpe,'');
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
  await expect(rpe(0)).toHaveValue('8'); // solo RPE di programmazione
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
  assert.equal(actual[0].rpe,'');
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
    coords.y + coords.height <= 844, 'toast is visible in mobile viewport');
  await expect(page.locator('.mycoatch-live-advice-history')).not.toHaveAttribute('open', '');

  // Il coach continua a offrire il dettaglio dopo la scadenza.
  await page.clock.fastForward(14999);
  await expect(toast).toBeVisible();
  await page.clock.fastForward(1);
  await expect(toast).toHaveCount(0);
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
