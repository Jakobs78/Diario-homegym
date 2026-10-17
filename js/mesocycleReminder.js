/**
 * Non-invasive completion reminder for the EXISTING guided closure button.
 * Starts when the last visible set of the last programmed day is confirmed,
 * even if other sets remain unchecked. The guided review reports those gaps.
 * No journal writes or changes to mesocycle lock state.
 *
 * A click dismisses the animation for the current page session; if the user
 * reloads without closing the block, the reminder can safely appear again.
 */
const viewedPrompts = new WeakSet();

function isEligible(mesocycle) {
    if (!mesocycle || typeof mesocycle !== 'object' ||
        mesocycle.locked || mesocycle.coachClosure?.status === 'closed')
        return false;
    // The final day is the last day of the highest-numbered week.
    // Match the last checkbox rendered by exerciseCard.js, not the closure
    // report's all-sets-complete check (which must remain independent).
    const weeks = Array.isArray(mesocycle.weeks) ? mesocycle.weeks : [];
    const lastWeek = [...weeks].sort((a, b) =>
        Number(a.weekNumber) - Number(b.weekNumber)).at(-1);
    const lastDay = Array.isArray(lastWeek?.days) ? lastWeek.days.at(-1) : null;
    const exercises = Array.isArray(lastDay?.exercises) ? lastDay.exercises : [];
    const lastExerciseWithCheckbox = [...exercises].reverse().find(ex =>
        Array.isArray(ex?.loggedSets) && ex.loggedSets.length > 0);
    const lastSet = lastExerciseWithCheckbox?.loggedSets.at(-1);
    return lastSet?.isLocked === true || lastSet?.completed === true;
}

/** Prompt after the last checkbox of the final day is checked, even if other sets are missing. */
export function shouldHighlightMesocycleClosure(mesocycle) {
    if (!isEligible(mesocycle)) {
        if (mesocycle && typeof mesocycle === 'object') viewedPrompts.delete(mesocycle);
        return false;
    }
    return !viewedPrompts.has(mesocycle);
}

/** Opening the guided review acknowledges the prompt, but does NOT close a block. */
export function acknowledgeMesocycleClosurePrompt(mesocycle) {
    if (!isEligible(mesocycle)) return false;
    viewedPrompts.add(mesocycle);
    return true;
}
