import test from 'node:test';
import assert from 'node:assert/strict';
globalThis.localStorage={getItem:()=>null,setItem:()=>{},removeItem:()=>{}};
const {getTrainingCalendarEntries}=await import('../js/analytics.js');
test('calendar includes performed sessions and archived repeats, never empty scheduled days',()=>{
 const diary={history:{years:{'2026':{mesocycles:[{name:'Meso 1',weeks:[
  {weekNumber:1,days:[
   {dayName:'Upper A',date:'2026-10-12',completed:true,totalDurationMinutes:49,
    exercises:[],sessionArchives:[{sessionDate:'2026-10-02',totalDurationMinutes:54}]},
   {dayName:'Lower A',completed:false,exercises:[]}
  ]}
 ]}]}}}};
 assert.deepEqual(getTrainingCalendarEntries(diary).map(x=>x.date),[
  '2026-10-12','2026-10-02'
 ]);
 assert.equal(getTrainingCalendarEntries(diary)[1].duration,54);
});
