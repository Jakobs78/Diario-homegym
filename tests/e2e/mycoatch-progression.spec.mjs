import { test, expect } from '@playwright/test';
import assert from 'node:assert/strict';

const ORIGIN = 'http://127.0.0.1:4173';
const offlineConfig = `
import {journalStorage} from './journalStore.js';
window.testJournal=journalStorage;
export const CONFIG = { STORAGE_KEY: 'workoutApp_data', APP_VERSION: 'e2e-progression' };
export const supabase = {
  auth: {
    async getUser() { return { data: { user: null } }; },
    async getSession() { return { data: { session: null } }; },
    onAuthStateChange() {
      return { data: { subscription: { unsubscribe() {} } } };
    },
    async signOut() { return { error: null }; }
  },
  from() { throw new Error('No real Supabase permitted in this test'); },
  functions: { invoke() { throw new Error('Unexpected Supabase function call'); } }
};`;

const fixture = {
  athlete: { email: 'fake-coach@invalid.example' },
  history: { years: { '2026': {
    mesocycles: [{ name: 'Storico sintetico', weeks: [1, 2].map(weekNumber => ({
      weekNumber,
      days: [{
        dayNumber: 1, dayName: 'Upper A',
        sessionCompletedAt: new Date(Date.now()-(2-weekNumber)*7*86400000).toISOString(),
        exercises: [{
          name: 'Panca Piana con Bilanciere', set: '2 set',
          reps: '6-8', targetRpe: '@8', rpe: '@8',
          loggedSets: [1, 2].map(setNumber => ({
            setNumber, weight: '80', reps: '7', rpe: '7.5',
            isLocked: true, completed: true
          }))
        }]
      }]
    })) }]
  } } }
};

test('UI browser reale: propone prima +1 rep, poi +kg, senza dati inventati né scritture', async ({ page }) => {
  const external = [];
  const errors = [];
  page.on('request', req => {
    if (req.url().includes('supabase.co')) external.push(req.url());
  });
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', async route => {
    if (route.request().url().startsWith(ORIGIN)) return route.continue();
    return route.abort();
  });
  await page.route('**/js/config.js', route =>
    route.fulfill({ status: 200, contentType: 'application/javascript', body: offlineConfig }));
  await page.addInitScript(seed => {
    window.jspdf = { jsPDF: class FakePdf {} };
    localStorage.setItem('workoutApp_data', JSON.stringify(seed));
    localStorage.setItem('dev_banner_closed', 'true');
  }, fixture);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#open-tools-btn')).toBeVisible();
  await expect(page.locator('#meso-display')).toHaveText('1');

  const check = await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    const { MyCoatch } = await import('/mycoatch/index.js');
    const { formatCoachReview } = await import('/mycoatch/mesocycleComparison.js');
    const baseline = JSON.stringify(state.workoutData);
    const localBaseline = window.testJournal.getItem('workoutApp_data');
    const config = {
      userAge: 36, daysPerWeek: 4, maxSessionMinutes: 75,
      durationWeeks: 4, focus: 'hybrid'
    };
    const describe = () => {
      const meso = MyCoatch.generateNextFromHistory(state.workoutData, config);
      const decision = meso.coachReport.decisions.byExercise[
        'panca piana con bilanciere'];
      return {
        decision, first: meso.weeks[0].days[0].exercises[0],
        review: formatCoachReview(meso.coachReport.comparison, meso.coachReport),
        csv: MyCoatch.exportAsCSV()
      };
    };
    const reps = describe();
    const history = state.workoutData.history.years[2026].mesocycles[0];
    for (const week of history.weeks)
      for (const set of week.days[0].exercises[0].loggedSets)
        set.reps = '8';
    const loads = describe();

    // Restore our synthetic seed to check no generation side-effects.
    const afterLoad = JSON.stringify(state.workoutData);
    for (const week of history.weeks)
      for (const set of week.days[0].exercises[0].loggedSets)
        set.rpe = '';
    const noRpe = describe();

    return {
      reps, loads, noRpe, baseline,
      afterLoad, localUnchanged: window.testJournal.getItem('workoutApp_data') === localBaseline
    };
  });

  assert.equal(check.reps.decision.action, 'build_reps');
  assert.equal(check.reps.decision.plannedKg, 80);
  assert.equal(check.reps.decision.plannedRepGoal, 8);
  assert.equal(check.reps.first.kgMin, '80');
  assert.match(check.reps.first.notes, /prova 8 ripetizioni/);
  assert.match(check.reps.review, /PROGRESSIONE FONDATA SUI DATI/);

  assert.equal(check.loads.decision.action, 'increase_load');
  assert.equal(check.loads.decision.plannedKg, 82.5);
  assert.equal(check.loads.first.kgMin, '82.5');
  assert.match(check.loads.review, /piccoli incrementi di carico/);
  assert.match(check.loads.csv.split('\n')[0],
    /^Settimana;Giorno;Blocco;Esercizio;Set;Reps;KgMin;KgMax;RPE;Recupero;Note;Topset$/);
  assert.ok(check.loads.csv.trim().split('\n').slice(1)
    .every(row => row.split(';').length === 12));

  assert.equal(check.noRpe.decision.action, 'maintain');
  assert.equal(check.noRpe.first.kgMin, '80');
  assert.match(check.noRpe.review, /RPE insufficienti/);
  assert.equal(check.localUnchanged, true);
  assert.ok(check.afterLoad.includes('"reps":"8"'),
    'Le modifiche al fixture sintetico esistono soltanto nella memoria della pagina.');
  assert.deepEqual(external, []);
  assert.deepEqual(errors, []);
});

