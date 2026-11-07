/** Small, user-owned mutable defaults; workout snapshots and logs stay unchanged. */
export const DEFAULT_KEYS=Object.freeze(['userAge','availableEquipment','availableAccessories','availableMachines','cableSetup']);
export function userDefaults(data={}){
 const settings=data?.athlete?.mycoatchProfileJournal?.versions?.at(-1)?.settings||{};
 return {...settings,...(data?.athlete?.userDefaults||{})};
}
export function saveUserDefaults(data,values,{confirmed=false}={}){
 const age=Number(values.userAge);
 if(!Number.isInteger(age)||age<18||age>100)throw Error('Inserisci un’età da 18 a 100 anni.');
 const selected=Object.fromEntries(DEFAULT_KEYS.filter(k=>values[k]!==undefined).map(k=>[k,structuredClone(values[k])]));
 for(const key of ['availableEquipment','availableAccessories','availableMachines']){
  if(selected[key]!==undefined&&(!Array.isArray(selected[key])||selected[key].some(v=>typeof v!=='string')))throw Error('Dotazione non valida.');
 }
 data.athlete ||= {};
 data.athlete.userDefaults={...(data.athlete.userDefaults||{}),...selected,userAge:age,
  ...(confirmed?{equipmentConfigured:true}:{})};
 return data.athlete.userDefaults;
}
export function needsUserSetup(data){
 const d=userDefaults(data),age=Number(d.userAge);
 return !Number.isInteger(age)||age<18||age>100||!(d.equipmentConfigured===true||Array.isArray(d.availableEquipment));
}
