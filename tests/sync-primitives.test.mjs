import test from 'node:test';
import assert from 'node:assert/strict';
import {sameJSON,payloadHash,timedQuery} from '../js/syncPrimitives.js';
test('JSONB order is ignored at every depth, while series order and values remain significant',async()=>{
 const a={history:{sets:[{kg:80,reps:6},{kg:81,reps:7}]},name:'A'};
 const b={name:'A',history:{sets:[{reps:6,kg:80},{reps:7,kg:81}]}};
 assert.equal(sameJSON(a,b),true);assert.equal(await payloadHash(a),await payloadHash(b));
 assert.equal(sameJSON(a,{...b,history:{sets:b.history.sets.toReversed()}}),false);
 assert.equal(sameJSON(a,{...b,name:'B'}),false);
});
test('network timeout aborts the underlying request and does not leave a live timer',async()=>{
 let aborted=false;
 const query={abortSignal(signal){return new Promise(resolve=>signal.addEventListener('abort',()=>{aborted=true;resolve({error:{name:'AbortError'}});}));}};
 assert.equal((await timedQuery(query,5)).error.name,'AbortError');assert.equal(aborted,true);
});
