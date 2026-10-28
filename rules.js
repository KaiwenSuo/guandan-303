import { randomInt } from 'node:crypto';
export const ranks='3456789TJQKA2';
export const value=r=>r==='SJ'?13:r==='BJ'?14:ranks.indexOf(r);
export function makeDeck(){const d=[];for(let p=0;p<3;p++){for(const suit of ['♠','♥','♣','♦'])for(const rank of ranks)d.push({id:`${p}-${suit}-${rank}`,rank,suit});for(const rank of ['SJ','BJ'])d.push({id:`${p}-${rank}`,rank,suit:'🃏'})}for(let i=d.length-1;i>0;i--){const j=randomInt(i+1);[d[i],d[j]]=[d[j],d[i]]}return d}
export function sortHand(h){return [...h].sort((a,b)=>value(a.rank)-value(b.rank)||a.suit.localeCompare(b.suit))}
const seq=arr=>arr.every((x,i)=>!i||x===arr[i-1]+1);
function straightValue(groups,each){if(groups.length!==5||!groups.every(x=>x[1]===each))return null;const v=groups.map(x=>value(x[0])).sort((a,b)=>a-b);if(seq(v)&&v.at(-1)<=11)return v.at(-1);if(v.join(',')==='0,1,2,11,12')return 3;return null}
function basic(cards){const n=cards.length;if(!n)return null;const count=new Map();for(const c of cards)count.set(c.rank,(count.get(c.rank)||0)+1);const groups=[...count];const top=Math.max(...groups.map(([r])=>value(r)));
if(n===6&&count.get('BJ')===3&&count.get('SJ')===3)return {kind:'heaven',tier:100,size:6,power:0,label:'六王天王炸'};
if(n===3&&groups.length===1&&['BJ','SJ'].includes(groups[0][0]))return {kind:'trijoker',tier:groups[0][0]==='BJ'?75:55,size:3,power:top,label:groups[0][0]==='BJ'?'三大王炸':'三小王炸'};
if(n===1)return {kind:'single',tier:0,power:top,label:'单张'};
if(n===2&&groups.length===1)return {kind:'pair',tier:0,power:top,label:'对子'};
if(n===3&&groups.length===1)return {kind:'triple',tier:0,power:top,label:'三张'};
if(n>=4&&groups.length===1&&!['SJ','BJ'].includes(groups[0][0]))return {kind:'bomb',tier:n>=6?80+n: n===5?65:45,size:n,power:top,label:`${n}张炸弹`};
if(n===5&&groups.length===2&&groups.some(x=>x[1]===3)&&groups.some(x=>x[1]===2))return {kind:'fullhouse',tier:0,power:value(groups.find(x=>x[1]===3)[0]),label:'三带二'};
if(n===5&&groups.length===5){const v=straightValue(groups,1);if(v!==null){const flush=cards.every(c=>c.suit===cards[0].suit);return {kind:flush?'straightflush':'straight',tier:flush?70:0,power:v,label:flush?'同花顺':'顺子'}}}
if(n===6&&groups.length===3&&groups.every(x=>x[1]===2)){const v=groups.map(x=>value(x[0])).sort((a,b)=>a-b);if(seq(v)&&v.at(-1)<=11)return {kind:'pairrun',tier:0,power:v.at(-1),label:'三连对'}}
if(n===6&&groups.length===2&&groups.every(x=>x[1]===3)){const v=groups.map(x=>value(x[0])).sort((a,b)=>a-b);if(v[1]===v[0]+1&&v[1]<=11)return {kind:'triplerun',tier:0,power:v[1],label:'钢板'}}
return null}
// A heart of the current level is wild (except for joker identity); search legal substitutions.
export function classify(cards,level='2'){if(!Array.isArray(cards)||!cards.length)return null;const wild=cards.filter(c=>c.rank===level&&c.suit==='♥');if(!wild.length)return basic(cards);const fixed=cards.filter(c=>!(c.rank===level&&c.suit==='♥'));let best=null;const choices=[...ranks];function visit(i,sub){if(i===wild.length){const t=basic([...fixed,...sub]);if(t&&(!best||t.tier>best.tier||(t.tier===best.tier&&t.power>best.power)))best=t;return}for(const rank of choices){for(const suit of ['♠','♥','♣','♦']){if(rank!==level&&suit!=='♠'&&suit!==fixed[0]?.suit)continue;visit(i+1,[...sub,{...wild[i],rank,suit}])}}}visit(0,[]);return best?{...best,label:best.label+(wild.length?'（红心配）':'')}:null}
export function beats(a,b){if(!a)return false;if(!b)return true;if(a.tier!==b.tier)return a.tier>b.tier;if(a.tier>0)return a.power>b.power;return a.kind===b.kind&&a.power>b.power}
export function upgrade(orderedSeats){if(orderedSeats.length!==6||new Set(orderedSeats).size!==6)throw Error('必须有六个不同名次');const team=orderedSeats[0]%2;const positions=orderedSeats.map((s,i)=>s%2===team?i+1:null).filter(Boolean);return {team,positions,steps:Math.max(0,10-positions.reduce((a,b)=>a+b,0)),noLast:orderedSeats[5]%2!==team}}
export function nextLevel(level,steps){const path='23456789TJQKA';return path[Math.min(path.length-1,path.indexOf(level)+steps)]}
export function tributePlan(order){return [[order[3],order[0]],[order[4],order[1]],[order[5],order[2]]]}
export function canResist(hands,order){return order.slice(3).reduce((n,seat)=>n+hands[seat].filter(c=>c.rank==='BJ').length,0)>=3}
