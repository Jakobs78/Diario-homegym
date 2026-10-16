import test from 'node:test';
import assert from 'node:assert/strict';
import {escapeHtml,formatExerciseSummary} from '../js/helpers.js';
test('untrusted exercise fields cannot inject tags, attributes or scripts',()=>{
 const unsafe='<img src=x onerror=alert(1)>';
 assert.equal(escapeHtml(unsafe),'&lt;img src=x onerror=alert(1)&gt;');
 assert.equal(escapeHtml('" onfocus="x'),'&quot; onfocus=&quot;x');
 const html=formatExerciseSummary({kgMin:unsafe,kgMax:'100',reps:'6-8',set:'3',
   rpe:'8',rest:'90s'});
 assert.ok(!html.includes('<img'));
 assert.ok(html.includes('&lt;img'));
 assert.ok(html.includes('exercise-weight-highlight'));
});
