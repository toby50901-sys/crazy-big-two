// Adapted from the user's V3.4 rules engine. Room-local state only.
const SUITS=['♣','♦','♥','♠'],RANKS=['3','4','5','6','7','8','9','10','J','Q','K','A','2'];
const LABEL={single:'單張',pair:'對子',triple:'三條',smallSF:'三張小同花順',straight:'順子',full:'葫蘆',four:'鐵支怪物',sf:'同花順怪物',five:'五枚怪物',doublejoker:'雙鬼尾牌'};
const MONSTERS=['four','sf','five'],TIER={four:1,sf:2,five:3};
const rank=c=>RANKS.indexOf(c.r),suit=c=>SUITS.indexOf(c.s),label=c=>c.j?'🃏':c.r+c.s;
function shuffle(a){for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
function makeDeck(){const d=[];for(const r of RANKS)for(const s of SUITS)d.push({id:r+s,r,s});d.push({id:'joker1',j:1},{id:'joker2',j:1});return shuffle(d)}
export function createEngine(room){
let game=room.game,forceCache=new Map();
const NAMES=room.seats.map(s=>s?.name||'空位');
function log(x){game.logs.unshift(x);game.logs.length=Math.min(game.logs.length,75)}
function straightData(vals,n){
 if(new Set(vals).size!==n)return null;
 const v=[...vals].sort((a,b)=>a-b);
 if(n===5){
  // Only ten permitted sequences. J-Q-K-A-2 is NOT a straight.
  const sequences=[
   ['A','2','3','4','5'],['3','4','5','6','7'],['4','5','6','7','8'],
   ['5','6','7','8','9'],['6','7','8','9','10'],['7','8','9','10','J'],
   ['8','9','10','J','Q'],['9','10','J','Q','K'],['10','J','Q','K','A'],
   ['2','3','4','5','6']
  ];
  const k=v.join(',');
  const idx=sequences.findIndex(seq=>seq.map(r=>RANKS.indexOf(r)).sort((a,b)=>a-b).join(',')===k);
  if(idx<0)return null;
  const decisive=idx===9?RANKS.indexOf('2'):RANKS.indexOf(sequences[idx][4]);
  return {order:idx,decisive};
 }
 if(n===3&&v.every((x,i)=>i===0||x===v[i-1]+1))return {order:v[2],decisive:v[2]};
 return null;
}
function candidate(cards,assigned,type,primaryRank,straight){
 const decisive=assigned.filter(c=>rank(c)===primaryRank);
 const decisiveJoker=decisive.some(c=>c.wild);
 const suitPower=decisiveJoker?4:Math.max(...decisive.map(suit));
 const power=(straight?straight.order:primaryRank)*10+suitPower;
 const wild=assigned.find(c=>c.wild)||null;
 // Only the substituted rank and declared hand type matter for most joker hands.
 // In a straight, the decisive card (not a non-decisive joker's suit) determines strength.
 // A straight flush requires the joker to match the suit of the other four cards.
 const key=type+'|'+power+'|'+(wild?.r||'')+'|'+(type==='sf'?(wild?.s||''):'');
 return {type,power,hasJ:cards.some(c=>c.j),decisiveJoker,assigned:wild?{r:wild.r,s:type==='sf'?wild.s:null}:null,key,straightOrder:straight?.order??null};
}
function declarations(cards,final){const n=cards.length,j=cards.filter(c=>c.j).length;if(!n||n>5)return [];if(j===2)return n===2&&final?[{type:'doublejoker',power:999,hasJ:true,key:'doublejoker'}]:[];if(j===1&&n===1&&!final)return [];
const fixed=cards.filter(c=>!c.j),assignments=[];if(j===0)assignments.push(fixed);else for(const r of RANKS)for(const s of SUITS)assignments.push([...fixed,{r,s,wild:true}]);let out=new Map();
for(const a of assignments){let cnt=new Map();for(const c of a)cnt.set(c.r,(cnt.get(c.r)||0)+1);const freq=[...cnt.values()].sort((x,y)=>y-x);const flush=a.every(c=>c.s===a[0].s);const st=straightData(a.map(rank),n);const add=(type,r,straight)=>{const x=candidate(cards,a,type,r,straight);out.set(x.key,x)};
if(n===1)add('single',rank(a[0]));
if(n===2&&freq[0]===2)add('pair',rank(a[0]));
if(n===3){if(freq[0]===3)add('triple',rank(a[0]));if(st&&flush)add('smallSF',st.decisive,st)}
if(n===5){if(freq[0]===5&&j===1)add('five',RANKS.indexOf([...cnt.keys()][0]));else{if(freq[0]===4){const r=[...cnt].find(([r,k])=>k===4)[0];add('four',RANKS.indexOf(r))}if(freq[0]===3&&freq[1]===2){const r=[...cnt].find(([r,k])=>k===3)[0];add('full',RANKS.indexOf(r))}if(st){if(!flush||j===1)add('straight',st.decisive,st);if(flush)add('sf',st.decisive,st)}}}
}
return [...out.values()].sort((a,b)=>(TIER[a.type]||0)-(TIER[b.type]||0)||a.power-b.power)}
function isMonster(e){return MONSTERS.includes(e.type)}
function beat(a,b){if(!b)return true;if(b.type==='single'&&b.spade2)return false;if(isMonster(a)&&!isMonster(b))return true;if(isMonster(b)&&!isMonster(a))return false;if(isMonster(a)&&isMonster(b))return TIER[a.type]>TIER[b.type]||(TIER[a.type]===TIER[b.type]&&(a.power>b.power||(a.power===b.power&&a.decisiveJoker&&b.decisiveJoker)));return a.type===b.type&&(a.power>b.power||(a.power===b.power&&a.decisiveJoker&&b.decisiveJoker))}
function legalOptions(cards,who){if(game.done||!cards.length)return [];const p=game.players[who];if(!game.freeLead&&p.locked)return [];return declarations(cards,cards.length===p.hand.length).filter(x=>game.freeLead||beat(x,game.last))}
// 聽牌頂大：只約束聽牌者的上家。必須從所有可合法壓牌的組合中選最大。
// 自由領牌時延續先前約定：必須領最大的單張。
function topBig(who){
 const cacheKey=who+"|"+game.turn+"|"+game.freeLead+"|"+game.first+"|"+game.players.map(p=>p.hand.map(c=>c.id).join(",")+":"+p.locked).join(";")+"|"+(game.last?.key||"");
 if(forceCache.has(cacheKey))return forceCache.get(cacheKey);
 if(game.done||game.first||game.players[(who+1)%3].hand.length!==1)return null;
 const p=game.players[who];if(!game.freeLead&&p.locked)return null;
 const sizes=game.freeLead?[1]:[1,2,3,5];
 let best=null;
 for(const n of sizes){
  if(n>p.hand.length)continue;
  // 不截斷：否則可能漏掉真正最大的可壓組合。
  for(const cards of combos(p.hand,n,Infinity)){
   for(const e of legalOptions(cards,who)){
    const item={cards,e};
    if(!best||compareForced(item,best)>0)best=item;
   }
  }
 }
 forceCache.set(cacheKey,best);return best;
}
function compareForced(a,b){
 const ta=isMonster(a.e)?TIER[a.e.type]:0,tb=isMonster(b.e)?TIER[b.e.type]:0;
 if(ta!==tb)return ta-tb;
 // 同類牌型按牌型強度；自由領牌只會比較單張。
 if(a.e.type!==b.e.type)return a.cards.length-b.cards.length;
 return a.e.power-b.e.power;
}
function matchesForced(cards,decl,forced){
 return !forced||(cards.length===forced.cards.length&&
 cards.every(c=>forced.cards.some(f=>f.id===c.id))&&decl.key===forced.e.key);
}

function combos(a,k,limit=Infinity){const out=[];function go(start,acc){if(out.length>=limit)return;if(acc.length===k){out.push([...acc]);return}for(let i=start;i<=a.length-(k-acc.length);i++){acc.push(a[i]);go(i+1,acc);acc.pop();if(out.length>=limit)return}}go(0,[]);return out}

function tail(decl,cards){if(isMonster(decl))return 6;if(decl.type==='doublejoker'||decl.type==='single'&&cards[0].j)return 4;if(decl.type==='full'&&!decl.hasJ||decl.type==='straight'&&!decl.hasJ||decl.type==='pair'&&cards.every(c=>c.r==='3'))return 4;if(decl.hasJ||decl.type==='single'&&['2','3'].includes(cards[0].r))return 2;return 0}
function settlement(p,tailMult,tailPoints){
 const jokerCount=[...p.hand,...p.covered].filter(c=>c.j).length;
 const categories=[{label:'普通牌（3～K）',hand:0,covered:0,handPts:0,coveredPts:0,bonus:0},{label:'A',hand:0,covered:0,handPts:0,coveredPts:0,bonus:0},{label:'2',hand:0,covered:0,handPts:0,coveredPts:0,bonus:0},{label:'鬼牌',hand:0,covered:0,handPts:0,coveredPts:0,bonus:0}];
 const cardMultParts=[];
 function addCard(c,covered){
   let cat,base,bonus=0,m=0;
   if(c.j){cat=3;base=jokerCount===2?8:4;m=4}
   else if(c.r==='A'){cat=1;base=2;m=1}
   else if(c.r==='2'){cat=2;base=4;m=c.s==='♠'?4:2}
   else {cat=0;base=1}
   // 蓋牌：每張基礎3點，再加特殊牌加點（A+1、2+4、鬼牌+4/8）
   if(covered){bonus=c.j?(jokerCount===2?8:4):c.r==='A'?1:c.r==='2'?4:0;base=3+bonus}
   const group=categories[cat];group[covered?'covered':'hand']++;group[covered?'coveredPts':'handPts']+=base;group.bonus+=m;
   if(m)cardMultParts.push(`${covered?'蓋牌':'手牌'}${label(c)} +${m}`);
 }
 p.hand.forEach(c=>addCard(c,false));p.covered.forEach(c=>addCard(c,true));
 const handPts=categories.reduce((s,c)=>s+c.handPts,0),coveredPts=categories.reduce((s,c)=>s+c.coveredPts,0);
 const specialMult=categories.reduce((s,c)=>s+c.bonus,0),n=p.hand.length;
 const countMult=n>=15?4+2*Math.floor((n-15)/2):n>=11?2:0;
 const monsterMult=game.monsters*2,rawMult=specialMult+countMult+monsterMult+tailMult;
 const mult=Math.max(1,rawMult),pts=handPts+coveredPts+tailPoints;
 const lines=[...categories.filter(c=>c.hand||c.covered).map(c=>`${c.label}：手牌${c.hand}張 ${c.handPts}點、蓋牌${c.covered}張 ${c.coveredPts}點`),`手牌小計 ${handPts}點｜蓋牌小計 ${coveredPts}點｜尾牌額外 +${tailPoints}點`,`特殊牌倍率：${cardMultParts.length?cardMultParts.join('、'):'無'} → +${specialMult}倍`,`手牌剩${n}張：+${countMult}倍`,`全場怪物${game.monsters}次：+${monsterMult}倍`,`贏家尾牌：+${tailMult}倍`,`總倍率：${rawMult}倍${rawMult<1?'（最低以1倍計）':''} → ${mult}倍`,`（${handPts}＋${coveredPts}＋${tailPoints}）× ${mult} = ${pts*mult}點`];
 return {pts,mult,total:pts*mult,lines};
}

function begin(){const d=makeDeck();game={players:[0,1,2].map(()=>({hand:d.splice(0,13),covered:[],locked:false})),stock:d,turn:room.starter||0,last:null,lastPlayer:-1,passes:0,freeLead:true,first:true,monsters:0,done:false,logs:[],result:'',scoreDetails:[],drawNotice:['','','']};room.game=game;log('新局開始：'+NAMES[game.turn]+'先手');return game}
function end(who,decl,cards){game.done=true;const t=tail(decl,cards),tailPts=t?4:0;const results=game.players.map((p,i)=>i===who?null:settlement(p,t,tailPts));const earned=results.reduce((v,x)=>v+(x?.total||0),0);results.forEach((r,i)=>{if(r)room.scores[i]-=r.total});room.scores[who]+=earned;game.result='🏆 '+NAMES[who]+' 獲勝！';game.scoreDetails=results.map((r,i)=>r?{name:NAMES[i],...r}:null);log(game.result)}
function movePlay(who,ids,key){if(game.done||who!==game.turn)return '還沒輪到你';const hand=game.players[who].hand;const cards=hand.filter(c=>ids.includes(c.id));if(cards.length!==ids.length||!cards.length||cards.length>5)return '手牌選擇無效';const opts=legalOptions(cards,who);const forced=topBig(who);const e=opts.find(x=>x.key===key);if(!e||!matchesForced(cards,e,forced))return '無法出牌，可能需要頂大';const p=game.players[who],old=game.last,wasFree=game.freeLead;p.hand=p.hand.filter(c=>!ids.includes(c.id));if(wasFree&&old&&(old.type!==e.type||e.power<old.power)){for(const q of game.players)q.locked=false;log('🔓 步步高解除')};const spade2=e.type==='single'&&cards.length===1&&cards[0].r==='2'&&cards[0].s==='♠';game.last={...e,spade2,cards};game.lastPlayer=who;game.passes=0;game.freeLead=false;game.first=false;p.locked=false;if(isMonster(e))game.monsters++;log(NAMES[who]+'：'+cards.map(label).join(' ')+' → '+LABEL[e.type]);if(!p.hand.length){end(who,e,cards)}else game.turn=(who+1)%3;return null}
function movePass(who,coverId){if(game.done||who!==game.turn||game.first)return '目前不能過牌';if(topBig(who))return '聽牌頂大：有牌可壓，禁止過牌';const p=game.players[who];if(coverId){if(game.stock.length<2)return '公牌不足2張';const card=p.hand.find(c=>c.id===coverId);if(!card)return '蓋牌無效';p.hand=p.hand.filter(c=>c.id!==coverId);p.covered.push(card);const drawn=[game.stock.pop(),game.stock.pop()];p.hand.push(...drawn);game.drawNotice[who]='蓋牌抽到：'+drawn.map(label).join('、');log(NAMES[who]+' 蓋牌1張、抽2張')}else{if(game.stock.length){const card=game.stock.pop();p.hand.push(card);game.drawNotice[who]='PASS抽到：'+label(card);log(NAMES[who]+' PASS抽1張')}else log(NAMES[who]+' PASS（公牌已空）')}p.locked=true;game.passes++;if(game.passes>=2&&game.lastPlayer>=0){game.turn=game.lastPlayer;game.freeLead=true;game.passes=0;log('兩家PASS，自由領牌')}else game.turn=(who+1)%3;return null}
function aiStep(who){const forced=topBig(who);if(forced)return movePlay(who,forced.cards.map(c=>c.id),forced.e.key);const p=game.players[who];let choices=[];for(const n of [5,3,2,1]){if(n>p.hand.length)continue;for(const cards of combos(p.hand,n,n===5?2000:1500)){for(const e of legalOptions(cards,who)){choices.push({cards,e});if(choices.length>1500)break}if(choices.length>1500)break}}choices.sort((a,b)=>(b.cards.length===p.hand.length)-(a.cards.length===p.hand.length)||b.cards.length-a.cards.length||(isMonster(a.e)?1:0)-(isMonster(b.e)?1:0)||a.e.power-b.e.power);return choices.length?movePlay(who,choices[0].cards.map(c=>c.id),choices[0].e.key):movePass(who,null)}
function runBots(){let guard=0;while(game&&!game.done&&room.seats[game.turn]?.bot&&guard++<120){const error=aiStep(game.turn);if(error){log('電腦無法行動：'+error);break}}}
function view(seat){if(!game)return {phase:'lobby'};const hand=game.players[seat].hand;return {phase:'game',turn:game.turn,first:game.first,freeLead:game.freeLead,done:game.done,hand,covered:game.players[seat].covered.length,counts:game.players.map(p=>p.hand.length),locks:game.players.map(p=>p.locked),stock:game.stock.length,monsters:game.monsters,last:game.last?{...game.last,cards:game.last.cards}:null,lastPlayer:game.lastPlayer,logs:game.logs.slice(0,25),result:game.result,scoreDetails:game.done?game.scoreDetails:[],drawNotice:game.drawNotice[seat],forced:!game.done&&seat===game.turn?(()=>{const f=topBig(seat);return f?{ids:f.cards.map(c=>c.id),key:f.e.key,type:f.e.type}:null})():null}}
function options(seat,ids){if(!game||game.done||game.turn!==seat)return [];const cards=game.players[seat].hand.filter(c=>ids.includes(c.id));if(cards.length!==ids.length)return [];const f=topBig(seat);return legalOptions(cards,seat).filter(e=>matchesForced(cards,e,f)).map(e=>({key:e.key,type:e.type,label:LABEL[e.type],power:e.power,assigned:e.assigned,monster:isMonster(e)}))}
return {begin,view,options,movePlay,movePass,runBots};
}
