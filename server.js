import express from 'express';
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { Server } from 'socket.io';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { classify, beats, makeDeck, sortHand, upgrade, nextLevel, tributePlan, canResist, value } from './rules.js';

const app = express();
app.disable('x-powered-by');
app.use(express.static(join(dirname(fileURLToPath(import.meta.url)), 'public')));
app.get('/health', (_req,res)=>res.json({ok:true}));
const server = createServer(app);
const io = new Server(server, { maxHttpBufferSize: 20000 });
const rooms = new Map();
const MAX_ROOMS=1000;
const safeName = value => String(value ?? '').trim().slice(0,16) || '玩家';
const randomId = () => randomBytes(4).toString('hex').toUpperCase();
const randomToken = () => randomBytes(24).toString('hex');
const active = r => r.players.filter(p=>p && p.connected && p.socketId);
const find = socket => rooms.get(socket.data.roomId);
const sendError = (socket,message) => socket.emit('notice',message);
const current = r => r.players[r.turn];
function publicState(r){
  return { id:r.id, started:r.started, host:r.host, turn:r.turn, winner:r.winner, round:r.round, levels:r.levels, phase:r.phase, result:r.result, tribute:r.tribute?{stage:r.tribute.stage,remaining:r.tribute.pending.map(x=>x.from),requests:r.tribute.requests}:null,
    players:r.players.map((p,i)=>p?{seat:i,name:p.name,team:i%2,connected:p.connected,count:p.hand.length,finished:p.finished}:null),
    last:r.last?{seat:r.last.seat,cards:r.last.cards,type:r.last.type.label}:null,
    passes:r.passes, log:r.log.slice(-12), finishedOrder:r.finishedOrder };
}
function broadcast(r){
  io.to(r.id).emit('state',publicState(r));
  for(const p of r.players) if(p?.socketId) io.to(p.socketId).emit('hand',p.hand);
}
function addLog(r,text){r.log.push(text);if(r.log.length>80)r.log.shift()}
function nextSeat(r,from){for(let i=1;i<=6;i++){let n=(from+i)%6;if(r.players[n]&&!r.players[n].finished)return n}return from}
function resetTrick(r){r.last=null;r.passes=0;r.passed.clear()}
function advance(r){
  if(!r.last){r.turn=nextSeat(r,r.turn);return}
  const eligible=r.players.filter(p=>p&&!p.finished&&p.seat!==r.last.seat);
  if(eligible.every(p=>r.passed.has(p.seat))){
    const leader=r.players[r.last.seat];
    const from=r.last.seat;
    resetTrick(r);
    r.turn=leader&&!leader.finished?from:nextSeat(r,from);
    addLog(r,'新一轮出牌');
  } else r.turn=nextSeat(r,r.turn);
}
function checkWinner(r){
 if(r.finishedOrder.length<5)return false;
 const missing=r.players.find(p=>!p.finished);
 if(missing){missing.finished=true;r.finishedOrder.push(missing.seat)}
 const result=upgrade(r.finishedOrder);r.winner=result.team;r.result=result;
 // A team has exactly the next three completed rounds to win once.
 // A qualifying round must be led by that team, gain >=1 step, and have no last-place teammate.
 for(let team=0;team<2;team++){
  if(r.aWindow[team]>0){
   if(team===result.team&&result.steps>=1&&result.noLast){r.matchWinner=team;}
   else r.aWindow[team]--;
  }
 }
 const old=r.levels[result.team],next=nextLevel(old,result.steps);
 r.levels[result.team]=next;
 // Reaching A opens a fresh three-round window, beginning NEXT round.
 if(old!=='A'&&next==='A')r.aWindow[result.team]=3;
 // If an A-window expired, a team must reach A again to get another chance.
 addLog(r,`${result.team===0?'红':'蓝'}队头游，名次${result.positions.join('、')}，升级${result.steps}级，当前级牌${next}`);
 if(r.matchWinner!==null)addLog(r,`${result.team===0?'红':'蓝'}队在打到A后的三局内达成升级且无人末游，整场获胜`);
 return true;
}
function finishTrick(r){const leader=r.last?.seat??r.turn;resetTrick(r);r.turn=r.players[leader]&&!r.players[leader].finished?leader:nextSeat(r,leader)}
function prepareTribute(r){
 const order=r.finishedOrder;
 if(!r.round||order.length!==6){r.phase='play';return}
 const plans=tributePlan(order).map(([from,to])=>({from,to}));
 const hands=r.players.map(p=>p.hand);
 if(canResist(hands,order)){r.phase='tribute';r.tribute={stage:'resist',pending:plans,requests:[]};addLog(r,'三名贡牌者合计至少3张大王，可以选择抗贡');}
 else{r.phase='tribute';r.tribute={stage:'offer',pending:plans,requests:[]};addLog(r,'请四游、五游、末游依次进贡');}
}
function beginDeal(r){
 const deck=makeDeck();for(let i=0;i<6;i++){r.players[i].hand=sortHand(deck.slice(i*27,(i+1)*27));r.players[i].finished=false}
 r.round++;r.started=true;r.winner=null;r.result=null;r.finishedOrder=[];r.log=[];resetTrick(r);
 r.turn=r.round===1?0:r.finishedOrder[0]??0;
 prepareTribute(r);if(r.phase==='play')addLog(r,'第一局开始，1号玩家先出');
 r.updated=Date.now();broadcast(r);
}
function joinRoom(socket,{id,name,token},cb){
  const r=rooms.get(String(id||'').trim().toUpperCase());
  if(!r)return cb({error:'房间不存在或已过期'});
  let p=token?r.players.find(x=>x&&x.token===token):null;
  if(p){
    if(p.socketId&&p.socketId!==socket.id){const old=io.sockets.sockets.get(p.socketId);old?.leave(r.id);old?.disconnect(true)}
    p.socketId=socket.id;p.connected=true;
  }else{
    if(r.started)return cb({error:'对局已开始，请使用原来的设备或重连凭证返回'});
    const seat=r.players.findIndex(x=>x===null);
    if(seat<0)return cb({error:'房间已满（6人）'});
    p={seat,team:seat%2,name:safeName(name),token:randomToken(),socketId:socket.id,connected:true,hand:[],finished:false};
    r.players[seat]=p;
    addLog(r,`${p.name} 加入了房间`);
  }
  socket.data.roomId=r.id;socket.data.token=p.token;
  socket.join(r.id);r.updated=Date.now();
  cb({id:r.id,seat:p.seat,token:p.token});
  broadcast(r);
}
io.on('connection',socket=>{
  socket.on('create',(data={},cb=()=>{})=>{
    if(socket.data.roomId)return cb({error:'请先离开当前房间'});
    if(rooms.size>=MAX_ROOMS)return cb({error:'服务器房间数量已满'});
    let id=randomId();while(rooms.has(id))id=randomId();
    const r={id,players:Array(6).fill(null),host:0,started:false,turn:0,winner:null,last:null,passes:0,passed:new Set(),round:0,log:[],finishedOrder:[],levels:['2','2'],aWindow:[0,0],matchWinner:null,phase:'lobby',tribute:null,result:null,updated:Date.now()};
    rooms.set(id,r);joinRoom(socket,{id,name:data.name},cb);
  });
  socket.on('join',(data={},cb=()=>{})=>{
    if(socket.data.roomId)return cb({error:'请先离开当前房间'});
    joinRoom(socket,data,cb);
  });
  socket.on('start',()=>{
    const r=find(socket),p=r?.players.find(x=>x?.token===socket.data.token);
    if(!r||!p||p.seat!==r.host)return sendError(socket,'只有房主可以开局');
    if(r.players.some(x=>!x||!x.connected))return sendError(socket,'需要6名玩家全部在线');
    if(r.matchWinner!==null)return sendError(socket,'整场比赛已结束，请创建新房间');
    const previousOrder=[...r.finishedOrder];
    const deck=makeDeck();for(let i=0;i<6;i++){r.players[i].hand=sortHand(deck.slice(i*27,(i+1)*27));r.players[i].finished=false}
    r.round++;r.started=true;r.winner=null;r.result=null;r.log=[];resetTrick(r);
    r.turn=r.round===1?0:previousOrder[0];r.finishedOrder=[];
    if(r.round>1){const plans=tributePlan(previousOrder).map(([from,to])=>({from,to}));r.phase='tribute';r.tribute={stage:canResist(r.players.map(p=>p.hand),previousOrder)?'resist':'offer',pending:plans,requests:[],resistVotes:[],previousOrder};addLog(r,'等待进贡或抗贡');}
    else{r.phase='play';r.tribute=null;addLog(r,'首局开始，1号玩家先出')}
    r.updated=Date.now();broadcast(r);
  });
  socket.on('play',(ids)=>{
    const r=find(socket);if(!r||!r.started||r.winner!==null||r.phase!=='play')return;
    const p=current(r);
    if(!p||p.token!==socket.data.token)return sendError(socket,'还没轮到你出牌');
    if(!Array.isArray(ids)||!ids.length||ids.length>27||new Set(ids).size!==ids.length)return sendError(socket,'请选择有效的牌');
    const selected=p.hand.filter(c=>ids.includes(c.id));
    if(selected.length!==ids.length)return sendError(socket,'你没有这些牌');
    const type=classify(selected,r.levels[p.team]);
    if(!type)return sendError(socket,'不支持的牌型，请重新选择');
    if(!beats(type,r.last?.type))return sendError(socket,'牌型或点数无法压过上一手');
    p.hand=p.hand.filter(c=>!ids.includes(c.id));
    r.last={seat:p.seat,cards:selected,type};r.passes=0;r.passed.clear();
    addLog(r,`${p.name} 出了 ${type.label}（${selected.length}张）`);
    if(!p.hand.length){p.finished=true;r.finishedOrder.push(p.seat);addLog(r,`${p.name} 已出完全部手牌`)}
    if(!checkWinner(r))advance(r);
    r.updated=Date.now();broadcast(r);
  });
  socket.on('pass',()=>{
    const r=find(socket);if(!r||!r.started||r.winner!==null||r.phase!=='play')return;
    const p=current(r);
    if(!p||p.token!==socket.data.token)return sendError(socket,'还没轮到你');
    if(!r.last)return sendError(socket,'新一轮必须出牌');
    r.passed.add(p.seat);r.passes=r.passed.size;addLog(r,`${p.name} 选择不出`);
    advance(r);r.updated=Date.now();broadcast(r);
  });
  socket.on('resist',(vote)=>{
    const r=find(socket),t=r?.tribute,p=r?.players.find(x=>x?.token===socket.data.token);
    if(!r||r.phase!=='tribute'||t?.stage!=='resist'||!p||!t.pending.some(x=>x.from===p.seat))return;
    if(t.resistVotes.some(x=>x.seat===p.seat))return;
    t.resistVotes.push({seat:p.seat,vote:!!vote});
    if(t.resistVotes.length===3){if(t.resistVotes.some(x=>x.vote)){r.phase='play';r.turn=t.previousOrder[0];r.tribute=null;addLog(r,'抗贡成功，由上局头游先出');}
      else{t.stage='offer';addLog(r,'无人抗贡，开始进贡')}}broadcast(r);
  });
  socket.on('tributeCard',(id)=>{
    const r=find(socket),t=r?.tribute,p=r?.players.find(x=>x?.token===socket.data.token);
    if(!r||r.phase!=='tribute'||!p||!t)return;
    if(t.stage==='offer'){
      const plan=t.pending[0];if(!plan||plan.from!==p.seat)return sendError(socket,'尚未轮到你进贡');
      const eligible=p.hand.filter(c=>c.rank!=='SJ'&&c.rank!=='BJ');
      const max=Math.max(...eligible.map(c=>value(c.rank)));
      const c=p.hand.find(c=>c.id===id);if(!c||c.rank==='SJ'||c.rank==='BJ'||value(c.rank)!==max)return sendError(socket,'必须进贡手中点数最大的非王牌');
      p.hand=p.hand.filter(x=>x.id!==id);r.players[plan.to].hand.push(c);t.requests.push({...plan,card:c.id});t.pending.shift();addLog(r,`${p.name} 已向${r.players[plan.to].name}进贡`);
      if(!t.pending.length){t.stage='return';t.pending=[...t.requests].map(x=>({from:x.to,to:x.from}));}
    }else if(t.stage==='return'){
      const plan=t.pending[0];if(!plan||plan.from!==p.seat)return sendError(socket,'尚未轮到你还贡');
      const c=p.hand.find(c=>c.id===id);if(!c||c.rank==='SJ'||c.rank==='BJ'||value(c.rank)>value('T'))return sendError(socket,'还贡只能选择10及以下的非王牌');
      p.hand=p.hand.filter(x=>x.id!==id);r.players[plan.to].hand.push(c);t.pending.shift();addLog(r,`${p.name} 已还贡`);
      if(!t.pending.length){r.phase='play';r.turn=t.previousOrder[0];r.tribute=null;addLog(r,'进贡还贡结束，由上局头游先出');}
    }else return;
    r.players.forEach(x=>x.hand=sortHand(x.hand));broadcast(r);
  });
  socket.on('leave',()=>{
    const r=find(socket);if(!r)return;
    const p=r.players.find(x=>x?.token===socket.data.token);if(!p)return;
    if(r.started&&r.winner===null)return sendError(socket,'对局中请使用断线重连，不支持中途退出座位');
    r.players[p.seat]=null;socket.leave(r.id);socket.data.roomId=null;socket.data.token=null;
    if(r.host===p.seat)r.host=r.players.findIndex(Boolean);
    if(r.players.every(x=>!x))rooms.delete(r.id);else broadcast(r);
  });
  socket.on('disconnect',()=>{
    const r=find(socket);if(!r)return;
    const p=r.players.find(x=>x?.token===socket.data.token);
    if(p&&p.socketId===socket.id){p.connected=false;p.socketId=null;r.updated=Date.now();broadcast(r)}
  });
});
// In-memory rooms: restart clears state. Inactive rooms expire after 12 hours.
const cleanup=setInterval(()=>{const now=Date.now();for(const [id,r] of rooms)if(now-r.updated>12*60*60*1000)rooms.delete(id)},60*60*1000);
cleanup.unref();
server.listen(Number(process.env.PORT)||3000,'0.0.0.0',()=>console.log('Six-player Guandan listening'));
