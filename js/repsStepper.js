/** One-repetition controls for the athlete's editable set result.
 * The programmed target is only a starting reference when the field is empty.
 * Never turn a compound dropset prescription into a guessed ordinary number.
 */
const integerReps = raw => {
    const text=String(raw ?? '').trim();
    if(!/^\d{1,2}$/.test(text))return null;
    const reps=Number(text);
    return reps>=1 && reps<=99 ? reps : null;
};
const firstTargetReps = raw => {
    const text=String(raw ?? '').trim();
    const range=text.match(/^(\d{1,2})\s*(?:-|–|a)\s*(\d{1,2})$/i);
    if(range && Number(range[1])<=Number(range[2]))
        return integerReps(range[1]);
    return integerReps(text);
};

export function stepReps(current,direction,prescribed=null) {
    if(direction!==1 && direction!==-1)return null;
    const text=String(current??'').trim();
    // A filled, non-standard field must not be silently interpreted as the
    // beginning of a range or a dropset: the athlete can edit it manually.
    const base=text==='' ? firstTargetReps(prescribed) : integerReps(text);
    if(base===null)return null;
    return String(Math.min(99,Math.max(1,base+direction)));
}
