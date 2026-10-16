import test from 'node:test';
import assert from 'node:assert/strict';
import {buildMesocyclePdfOutline} from '../js/mesocyclePdfModel.js';
test('complete mesocycle outline carries weeks, days, target metrics and coach notes',()=>{
 const rows=buildMesocyclePdfOutline({weeks:[
  {weekNumber:1,days:[{dayName:'Upper A',exercises:[
    {name:'Panca',setsCount:3,reps:'6-8',rpe:'7.5',restTime:'180s',
     kgMin:60,kgMax:65,notes:'Pause 1 sec'},
    {name:'Alzate',sets:[{},{},{}],reps:'12-15',rpe:'8',restTime:'60s'}
  ]}]},
  {weekNumber:2,isDeloadWeek:true,days:[{dayName:'Upper B',exercises:[]}]}
 ]});
 assert.deepEqual(rows.filter(r=>r.kind==='day').map(r=>r.title),['Upper A','Upper B']);
 assert.match(rows[2].text,/3 serie × 6-8 reps/);
 assert.match(rows[2].text,/RPE target 7.5/);
 assert.match(rows[2].text,/180s/);
 assert.equal(rows[2].notes,'Pause 1 sec');
 assert.match(rows.at(-2).title,/scarico/);
});
