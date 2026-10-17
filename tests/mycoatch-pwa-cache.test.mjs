import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { posix } from 'node:path';

test('PWA caches every necessary JS module for new MyCoatch and prefilled workout cards', async () => {
    const script=await readFile(new URL('../sw.js',import.meta.url),'utf8');
    assert.match(script,/CACHE_NAME\s*=\s*'workout-app-v43-/);
    const routes=[...script.matchAll(/'\/(?:js|mycoatch)\/[^']+\.js'/g)]
        .map(match=>match[0].slice(1,-1));
    for (const module of [
        '/js/setPrefill.js',
        '/js/setVolumeComparison.js',
        '/js/futureLoadReviewUI.js',
        '/mycoatch/futureLoadReview.js',
        '/js/workoutSemantics.js',
        '/mycoatch/loadProposal.js',
        '/js/exerciseCard.js',
        '/js/fullBackup.js',
        '/js/coachPreviewUI.js',
        '/js/config.js',
        '/js/state.js',
        '/js/vendor/supabase.js',
        '/js/vendor/chart.js',
        '/js/vendor/jspdf.js',
        '/js/mesocyclePdfModel.js',
        '/js/workoutEvents.js',
        '/mycoatch/macrocyclePlanner.js',
        '/mycoatch/state.js',
        '/mycoatch/autoregulation.js',
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
        const localUrl=new URL('..'+route,import.meta.url);
        await access(localUrl);
        if(route.includes('/vendor/'))continue;
        const source=await readFile(localUrl,'utf8');
        for(const match of source.matchAll(/\b(?:import|export)\s+(?:[^'";]*?\s+from\s*)?['"](\.[^'"]+\.js)['"]/g)){
            const dependency=posix.normalize(posix.join(posix.dirname(route),match[1]));
            assert.ok(routes.includes(dependency),route+' missing offline dependency '+dependency);
        }
    }
});

