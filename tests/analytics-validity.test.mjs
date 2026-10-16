import test from 'node:test';
import assert from 'node:assert/strict';
globalThis.localStorage={
  getItem:()=>null,setItem:()=>{},removeItem:()=>{}
};
const {filterValidSets,calculateNetVolume,getAllMesocyclesList,extractExercisePRs,filterDaysByRange}
  =await import('../js/analytics.js');

test('analytics ignores drafts even with typed weight and reps',()=>{
  const exercise={name:'Panca',loggedSets:[
    {weight:80,reps:'8',rpe:'8',isLocked:false},
    {weight:75,reps:'7',rpe:'7.5',isLocked:true},
    {weight:70,reps:'8',isLocked:true,isWarmup:true},
    {weight:50,reps:'10+8+6',completed:true}
  ]};
  const [valid]=filterValidSets([exercise]);
  assert.equal(valid.sets.length,2);
  assert.equal(calculateNetVolume(valid.sets),75*7+50*10);
  const prs=extractExercisePRs([{sets:valid.sets}]);
  assert.equal(prs.maxWeight,75);
  assert.equal(prs.maxSetVolume,525);
});
test('analytics traverses year/mesocycle array instead of treating years as mesocycles',()=>{
  const diary={history:{years:{
    '2025':{mesocycles:[{id:'a',name:'Old',weeks:[]}]},
    '2026':{mesocycles:[{id:'b',name:'New',weeks:[]}]}
  }}};
  assert.deepEqual(getAllMesocyclesList(diary).map(x=>x.name),['Old','New']);
  assert.equal(getAllMesocyclesList(diary)[1].sourceYear,'2026');
});
test('recent ranges exclude undated or future planned sessions',()=>{
  const today=new Date().toISOString().slice(0,10);
  const days=[{date:today,completed:true},{dayName:'future undated'}];
  assert.equal(filterDaysByRange(days,'3m').length,1);
});
