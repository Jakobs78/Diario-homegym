import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeOwnedDumbbells,availableDumbbellLoads} from '../mycoatch/dumbbellInventory.js';
import {resolveNearbyLoad,resolvePlannedLoad} from '../mycoatch/loadProposal.js';
import {snapshotEquipmentState,equipmentMatchesSnapshot} from '../mycoatch/profileJournal.js';
const row={name:'Rematore con Manubrio a Un Braccio',equipment:'dumbbell'};
const press={name:'Panca Inclinata con Manubri',equipment:'dumbbell'};
const stock={ownedDumbbells:[{weight:20,quantity:2},{weight:30,quantity:1},{weight:35,quantity:0}],availableLoads:{dumbbell:[20,30,35,50]}};
test('inventory validates pieces, deduplicates weights, preserves zero and sorts',()=>{
 assert.deepEqual(normalizeOwnedDumbbells([{weight:30,quantity:1},{weight:20,quantity:2},{weight:30,quantity:2},{weight:35,quantity:0},{weight:10,quantity:''},{weight:-1,quantity:2},{weight:12,quantity:1.5}]),stock.ownedDumbbells);
});
test('one-arm rows can use a single piece; paired and unilateral leg exercises need two',()=>{
 assert.deepEqual(availableDumbbellLoads(row,stock),[20,30]);
 assert.deepEqual(availableDumbbellLoads(press,stock),[20]);
 assert.deepEqual(availableDumbbellLoads({name:'Bulgarian Split Squat con Manubri',unilateral:true},stock),[20]);
 assert.deepEqual(availableDumbbellLoads({name:'Goblet Squat con Manubrio'},stock),[20,30]);
 assert.equal(resolvePlannedLoad(row,30,stock).weight,30);
 assert.equal(resolvePlannedLoad(press,30,stock).weight,30);
 assert.equal(resolveNearbyLoad(row,32,stock,{min:30.01}).weight,null);
});
test('unknown legacy quantities retain old behavior; an empty confirmed inventory proves no stock',()=>{
 assert.deepEqual(availableDumbbellLoads(row,{availableLoads:{dumbbell:[20,30]}}),[20,30]);
 assert.equal(availableDumbbellLoads(row,{}),undefined);
 assert.deepEqual(availableDumbbellLoads(row,{ownedDumbbells:[],availableLoads:{dumbbell:[30]}}),[]);
 assert.equal(resolvePlannedLoad(row,30,{ownedDumbbells:[]}).weight,30);
});
test('quantities are copied into generation snapshots and invalidate stale previews',()=>{
 const snapshot=snapshotEquipmentState(stock);
 assert.deepEqual(snapshot.ownedDumbbells,stock.ownedDumbbells);
 const edited=structuredClone(stock);edited.ownedDumbbells[1].quantity=2;
 assert.equal(equipmentMatchesSnapshot(snapshot,edited),false);
 assert.equal(snapshot.ownedDumbbells[1].quantity,1);
});
