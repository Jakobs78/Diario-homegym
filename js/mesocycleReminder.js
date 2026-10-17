/**
 * Non-invasive completion reminder for the EXISTING guided closure button.
 * Uses the same conservative evidence gate as the closure review, without
 * writing to the journal or altering mesocycle lock state.
 *
 * A click dismisses the animation for the current page session; if the user
 * reloads without closing the block, the reminder can safely appear again.
 */
import { summarizeMesocycleClosure } from './mesocycleClosure.js';

const viewedPrompts = new WeakSet();

function isEligible(mesocycle) {
    if (!mesocycle || typeof mesocycle !== 'object' ||
        mesocycle.locked || mesocycle.coachClosure?.status === 'closed')
        return false;
    return summarizeMesocycleClosure(mesocycle).status === 'complete';
}

/** Start the reminder only after ALL planned working sets are valid and checked. */
export function shouldHighlightMesocycleClosure(mesocycle) {
    return isEligible(mesocycle) && !viewedPrompts.has(mesocycle);
}

/** Opening the guided review acknowledges the prompt, but does NOT close a block. */
export function acknowledgeMesocycleClosurePrompt(mesocycle) {
    if (!isEligible(mesocycle)) return false;
    viewedPrompts.add(mesocycle);
    return true;
}
