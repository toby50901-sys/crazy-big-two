import {createEngine} from './engine.js';
import html from '../public/index.html';
const json=(x,status=200)=>new Response(JSON.stringify(x),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
const clean=s=>String(s||'').trim().slice(0,18).replace(/[<>]/g,'');
export default {async fetch(req,env){const u=new URL(req.url);if(u.pathname==='/'||u.pathname==='/index.html')return new Response(html,{headers:{'content-type':'text/html;charset=utf-8'}});if(u.pathname==='/api/create'&&req.method==='POST'){const id=crypto.randomUUID();const stub=env.ROOMS.get(env.ROOMS.idFromName(id));const result=await stub.fetch('https://room/init',{method:'POST',body:await req.text()});const data=await result.json();return json({...data,room:id})}if(u.pathname.startsWith('/api/room/')){const id=u.pathname.split('/')[3];if(!/^[a-f0-9-]{36}$/.test(id))return json({error:'房間代碼無效'},400);const stub=env.ROOMS.get(env.ROOMS.idFromName(id));return stub.fetch(new Request('https://room/'+u.pathname.split('/').slice(4).join('/'),req))}return json({error:'找不到頁面'},404)}};
export class GameRoom {
 constructor(state,env){this.state=state;this.room=null;this.ready=this.state.storage.get('room').then(x=>{this.room=x||null})}
 async fetch(req){await this.ready;const url=new URL(req.url),action=url.pathname.slice(1),data=req.method==='POST'?await req.json().catch(()=>({})):{};let r=this.room;
 if(action==='init'){if(r)return json({error:'房間已存在'},409);const name=clean(data.name)||'房主';const token=crypto.randomUUID();r={seats:[{name,token,bot:false},null,null],scores:[0,0,0],starter:0,game:null,circles:4,roundsPlayed:0,matchDone:false};this.room=r;await this.state.storage.put('room',r);return json({token,seat:0})}
 if(!r)return json({error:'找不到房間'},404);
 const token=req.headers.get('x-player-token')||data.token;const seat=r.seats.findIndex(s=>s&&!s.bot&&s.token===token);const engine=createEngine(r);
 if(action==='join'){if(r.game)return json({error:'遊戲已開始，無法新加入'},409);const empty=r.seats.findIndex(s=>!s);if(empty<0)return json({error:'房間已滿'},409);const newToken=crypto.randomUUID();r.seats[empty]={name:clean(data.name)||'玩家'+(empty+1),token:newToken,bot:false};await this.state.storage.put('room',r);return json({token:newToken,seat:empty})}
 if(seat<0)return json({error:'身分無效，請用原本裝置進入'},403);
 if(action==='state')return json({room:{seats:r.seats.map(s=>s?{name:s.name,bot:s.bot}:null),scores:r.scores,started:!!r.game,circles:r.circles||4,roundsPlayed:r.roundsPlayed||0,matchDone:!!r.matchDone},seat,game:engine.view(seat)});
 if(action==='hints')return json({hints:engine.hints(seat)});
 if(action==='options')return json({options:engine.options(seat,Array.isArray(data.ids)?data.ids:[])});
 if(action==='bot'){if(seat!==0||r.game)return json({error:'只有房主能在開始前調整電腦'},400);const i=Number(data.seat);if(i!==1&&i!==2)return json({error:'座位無效'},400);if(r.seats[i]&&!r.seats[i].bot)return json({error:'已有真人入座'},400);r.seats[i]=data.enabled?{name:i===1?'賭神':'仇笑痴',bot:true}:null}
 else if(action==='start'){if(seat!==0)return json({error:'只有房主能開始'},403);if(r.seats.some(s=>!s))return json({error:'請等三個座位到齊，或加入電腦'},400);if(r.game&&!r.game.done)return json({error:'本局尚未結束'},400);if(r.matchDone)return json({error:'比賽已結束，請重新建立房間'},400);if(!r.game){const circles=Number(data.circles);r.circles=[1,2,4,8].includes(circles)?circles:4;r.roundsPlayed=0;}if(r.game?.done)r.starter=(r.starter+1)%3;engine.begin();engine.runBots()}
 else if(action==='play'){const error=engine.movePlay(seat,Array.isArray(data.ids)?data.ids:[],data.key);if(error)return json({error},400);engine.runBots()}
 else if(action==='pass'){const error=engine.movePass(seat,data.coverId||null);if(error)return json({error},400);engine.runBots()}
 else return json({error:'未知操作'},404);
 await this.state.storage.put('room',r);return json({ok:true})
 }
}
