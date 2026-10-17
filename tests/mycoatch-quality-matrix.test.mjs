import test from 'node:test';
import assert from 'node:assert/strict';
import { generateSmartMesocycle, getTemplateForDays } from '../mycoatch/engine.js';
import { estimateDayMinutes } from '../mycoatch/timeEstimator.js';
import { EXERCISE_DATABASE } from '../mycoatch/exercisesDB.js';

const names = new Set(EXERCISE_DATABASE.map(ex => ex.name));
const goals = ['hybrid', 'strength', 'hypertrophy'];
const minutes = [35, 40, 45, 50, 60, 75, 90];
const levels = ['beginner', 'intermediate', 'advanced'];

test('stress: 126 profili non inventano kg e mantengono quattro ancore e vincoli di tempo', () => {
    let scenarios = 0;
    for (const daysPerWeek of [3, 4]) {
        const expectedAnchors = getTemplateForDays(daysPerWeek)
            .flatMap(day => day.slots).filter(slot => slot.anchor).length;
        assert.equal(expectedAnchors, 4);
        for (const maxSessionMinutes of minutes) for (const focus of goals)
            for (const experience of levels) {
                const config = {
                    daysPerWeek, durationWeeks: 4, maxSessionMinutes,
                    focus, athleteProfile: {
                        experience, calibration: 'guided',
                        priorityMuscle: null, excludedExercises: [], referenceLoads: {}
                    }
                };
                const meso = generateSmartMesocycle(config);
                scenarios++;
                assert.equal(meso.weeks.length, 4);
                for (const week of meso.weeks) {
                    assert.equal(week.days.length, daysPerWeek);
                    assert.equal(week.weeklyCoverage.anchors.length, expectedAnchors);
                    assert.equal(week.weeklyCoverage.allPriorityLiftsPresent, true,
                        JSON.stringify({ daysPerWeek, maxSessionMinutes, focus,
                            experience, week: week.weekNumber,
                            anchors: week.weeklyCoverage.anchors }));
                    for (const day of week.days) {
                        assert.ok(day.exercises.length > 0);
                        assert.ok(day.estimatedMinutes <= maxSessionMinutes,
                            JSON.stringify({ config, week: week.weekNumber, day: day.dayNumber }));
                        assert.equal(day.estimatedMinutes, estimateDayMinutes(day.exercises));
                        assert.equal(new Set(day.exercises.map(ex => ex.name)).size,
                            day.exercises.length, 'No accidental identical moves twice per day');
                        for (const ex of day.exercises) {
                            assert.ok(names.has(ex.name), ex.name);
                            assert.equal(ex.setsCount, ex.sets.length);
                            assert.ok(ex.setsCount >= 1);
                            assert.equal(ex.kgMin, '', 'Unprofiled athlete has no historical kg');
                            assert.equal(ex.kgMax, '', 'No invented kg from time/focus');
                            assert.ok(ex.sets.every(set =>
                                set.completed === false && set.actualKg === '' &&
                                set.actualReps === ''), 'All future sets are unperformed');
                        }
                    }
                }
                assert.ok(meso.weeks[3].days.every(day =>
                    day.exercises.every(ex => ex.rpe === '6.5')));
            }
    }
    assert.equal(scenarios, 126);
});

test('stress: generated four-week plans never modify the supplied athlete settings object', () => {
    const config = {
        focus: 'hypertrophy', durationWeeks: 4, daysPerWeek: 4,
        maxSessionMinutes: 60,
        availableAccessories: ['rack', 'flat_bench', 'incline_bench'],
        preferredLifts: { bench: 'Panca Inclinata con Manubri' },
        athleteProfile: {
            experience: 'beginner', calibration: 'guided',
            priorityMuscle: 'Petto', excludedExercises: [], referenceLoads: {}
        }
    };
    const before = JSON.stringify(config);
    const plan = generateSmartMesocycle(config);
    assert.equal(JSON.stringify(config), before);
    assert.ok(plan.weeks.every(w =>
        w.days[0].exercises[0].name === 'Panca Inclinata con Manubri'));
});

