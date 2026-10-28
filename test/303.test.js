import test from 'node:test';import assert from 'node:assert/strict';import {classify,beats,upgrade,tributePlan,canResist,nextLevel} from '../rules.js';
const cs=(r,s='♠')=>[...r].map((rank,i)=>({id:`${i}`,rank,suit:s}));
test('303 rank sum and zero floor',()=>{assert.equal(upgrade([0,1,2,3,4,5]).steps,1);assert.equal(upgrade([0,2,4,1,3,5]).steps,4);assert.equal(upgrade([0,1,3,5,2,4]).steps,0)});
test('joker bombs',()=>{const big=classify(cs('BBB').map(c=>({...c,rank:'BJ'})));const small=classify(cs('SSS').map(c=>({...c,rank:'SJ'})));assert.equal(big.kind,'trijoker');assert.ok(beats(big,classify(cs('33333'))));assert.ok(beats(classify(cs('333333')),big));assert.ok(beats(small,classify(cs('4444'))));assert.equal(classify([...cs('BBB').map(c=>({...c,rank:'BJ'})),...cs('SSS').map(c=>({...c,rank:'SJ'}))]).kind,'heaven')});
test('tribute correspondence and resistance',()=>{assert.deepEqual(tributePlan([0,1,2,3,4,5]),[[3,0],[4,1],[5,2]]);const h=Array.from({length:6},()=>[]);h[3]=[{rank:'BJ'}];h[4]=[{rank:'BJ'}];h[5]=[{rank:'BJ'}];assert.equal(canResist(h,[0,1,2,3,4,5]),true)});
test('wild heart may form a bomb',()=>{const c=[...cs('333'),{id:'wild',rank:'2',suit:'♥'}];assert.equal(classify(c,'2').kind,'bomb')});
test('level progression caps at A',()=>assert.equal(nextLevel('K',3),'A'));
