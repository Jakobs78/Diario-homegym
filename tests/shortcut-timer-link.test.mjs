import test from 'node:test';
import assert from 'node:assert/strict';
import {restShortcutUrl,isAppleTouchDevice,REST_SHORTCUT_NAME} from '../js/shortcutTimerLink.js';
test('shortcut passes remaining seconds and the exact agreed name, with safe encoding',()=>{
 const url=new URL(restShortcutUrl(176.2));
 assert.equal(url.protocol,'shortcuts:');assert.equal(url.hostname,'run-shortcut');
 assert.equal(url.searchParams.get('name'),REST_SHORTCUT_NAME);assert.equal(REST_SHORTCUT_NAME,'Recupero palestra');
 assert.equal(url.searchParams.get('input'),'text');assert.equal(url.searchParams.get('text'),'177');
 for(const invalid of [0,-1,NaN,Infinity,90000,'180',null,undefined])assert.equal(restShortcutUrl(invalid),null);
});
test('only Apple touch devices get the optional shortcut controls',()=>{
 assert.ok(isAppleTouchDevice({userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X)'}));
 assert.ok(isAppleTouchDevice({platform:'MacIntel',maxTouchPoints:5}));
 assert.equal(isAppleTouchDevice({platform:'MacIntel',maxTouchPoints:0}),false);
 assert.equal(isAppleTouchDevice({userAgent:'Android',platform:'Linux',maxTouchPoints:5}),false);
 assert.equal(isAppleTouchDevice({userAgent:'Windows',platform:'Win32'}),false);
});
