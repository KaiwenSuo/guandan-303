import test from 'node:test';
import assert from 'node:assert/strict';
import {makeDeck,classify,beats} from '../rules.js';
const cards=(ranks,suit='♠')=>[...ranks].map((rank,i)=>({id:String(i),rank,suit}));
test('162 cards with unique IDs',()=>{const d=makeDeck();assert.equal(d.length,162);assert.equal(new Set(d.map(c=>c.id)).size,162)});
test('basic combinations',()=>{assert.equal(classify(cards('33344')).kind,'fullhouse');assert.equal(classify(cards('34567')).kind,'straightflush');assert.equal(classify(cards('3333')).kind,'bomb')});
test('bomb outranks regular hand',()=>assert.ok(beats(classify(cards('3333')),classify(cards('AAAAA'.slice(0,1))))));
test('invalid combinations rejected',()=>assert.equal(classify(cards('3345')),null));
