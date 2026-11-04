// Weights are per individual dumbbell; quantities count pieces, not pairs.
export function normalizeOwnedDumbbells(rows) {
    if(!Array.isArray(rows))return [];
    const seen=new Set();
    return rows.flatMap(row=>{
        const weight=Number(row?.weight),quantity=Number(row?.quantity);
        if(row?.weight===''||row?.quantity===''||row?.quantity==null||
            !Number.isFinite(weight)||weight<=0||weight>700||
            Math.abs(weight*4-Math.round(weight*4))>1e-8||
            !Number.isInteger(quantity)||quantity<0||quantity>24||seen.has(weight))return [];
        seen.add(weight);return [{weight,quantity}];
    }).sort((a,b)=>a.weight-b.weight);
}
export function requiredDumbbells(ex={}) {
    // Unilateral leg exercises can still hold TWO dumbbells.
    const name=String(ex.name||'');
    return /\bmanubrio\b|\bsingle[ -](?:arm|dumbbell)\b|\bone[ -]arm\b|\bgoblet\b/i.test(name)?1:2;
}
export function availableDumbbellLoads(ex,settings={}) {
    if(!Array.isArray(settings.ownedDumbbells))return settings.availableLoads?.dumbbell;
    return normalizeOwnedDumbbells(settings.ownedDumbbells)
        .filter(row=>row.quantity>=requiredDumbbells(ex)).map(row=>row.weight);
}
