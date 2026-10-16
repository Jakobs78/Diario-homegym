import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';

test('PWA caches every necessary JS module for new MyCoatch and prefilled workout cards', async () => {
    const script=await readFile(new URL('../sw.js',import.meta.url),'utf8');
    assert.match(script,/CACHE_NAME\s*=\s*'workout-app-v22-/);
    const routes=[...script.matchAll(/'\/(?:js|mycoatch)\/[^']+\.js'/g)]
        .map(match=>match[0].slice(1,-1));
    for (const module of [
        '/js/setPrefill.js',
        '/js/exerciseCard.js',
        '/js/fullBackup.js',
        '/js/workoutEvents.js',
        '/mycoatch/macrocyclePlanner.js',
        '/mycoatch/volumeAccounting.js',
        '/mycoatch/periodizationPolicy.js',
        '/mycoatch/sessionSelection.js',
        '/mycoatch/coachGuardrails.js',
        '/mycoatch/recoveryScope.js',
        '/mycoatch/prescriptionPolicy.js',
        '/mycoatch/intensityTechniquePolicy.js',
        '/mycoatch/sessionReadiness.js',
        '/mycoatch/weeklyReview.js',
        '/js/weeklyReviewUI.js'
    ]) assert.ok(routes.includes(module),module+' missing from the offline cache');
    assert.equal(new Set(routes).size,routes.length,'duplicate cache entries');
    for(const route of routes){
        await access(new URL('..'+route,import.meta.url));
    }
});
