/* 創業資源大競標：資料＋引擎（瀏覽器掛在 window.AUC，node 可 require）
   金額單位一律「萬元」。所有估值、真實價值、組合加成都是遊戲設定，用來練習估價與競標判斷，不是真實行情。 */
(function(root){
'use strict';

var CATS = {
  ch:{n:'通路', ic:'🚪', c:'#E8553F', d:'有地方賣東西。沒有任何通路，其他資源的價值打五折。'},
  pp:{n:'人才', ic:'🧑', c:'#2F7DD1', d:'對的人讓資源動起來。'},
  mk:{n:'行銷', ic:'📣', c:'#B04FC0', d:'讓客人知道你。波動通常最大。'},
  eq:{n:'設備', ic:'⚙️', c:'#1E8A5A', d:'產能與效率。價值比較穩。'},
  br:{n:'品牌', ic:'🏷️', c:'#C98A0B', d:'別人學不走的東西。'}
};

// lo/hi＝公開的估值區間；bias＝真實價值大概落在區間的哪裡（0＝下限、1＝上限，不公開）；vol＝波動
var RES = [
  {ic:'🏬', n:'黃金店面', cat:'ch', lo:150, hi:300, bias:.55, vol:.5, d:'捷運出口旁一樓店面，人潮多、租金也高。'},
  {ic:'🏠', n:'巷弄小店面', cat:'ch', lo:80, hi:160, bias:.5, vol:.5, d:'安靜巷子裡的老公寓一樓，靠熟客與口碑。'},
  {ic:'🛍️', n:'百貨專櫃', cat:'ch', lo:100, hi:240, bias:.45, vol:.6, d:'週年慶人潮洶湧，但抽成與裝潢規定很多。'},
  {ic:'🛒', n:'電商旗艦店', cat:'ch', lo:60, hi:220, bias:.42, vol:.9, d:'在大型購物平台開店，全台都買得到，但要會導流量。'},
  {ic:'🏮', n:'夜市攤位', cat:'ch', lo:40, hi:120, bias:.55, vol:.5, d:'週末夜市固定攤位，成本低、翻桌快。'},
  {ic:'👨‍🍳', n:'資深主廚', cat:'pp', lo:80, hi:180, bias:.55, vol:.5, d:'十五年飯店經驗，招牌菜就靠他。'},
  {ic:'🧑‍💼', n:'王牌店長', cat:'pp', lo:70, hi:150, bias:.6, vol:.4, d:'帶人、排班、處理客訴都很有一套。'},
  {ic:'📱', n:'社群小編', cat:'pp', lo:30, hi:90, bias:.5, vol:.6, d:'會拍會寫，粉絲專頁交給她就對了。'},
  {ic:'🧮', n:'會計顧問', cat:'pp', lo:30, hi:70, bias:.6, vol:.25, d:'記帳報稅、成本控管，不起眼但很穩。'},
  {ic:'💻', n:'全端工程師', cat:'pp', lo:60, hi:160, bias:.45, vol:.7, d:'官網、訂位系統、會員 App 一手包。'},
  {ic:'🤳', n:'網紅合作', cat:'mk', lo:40, hi:260, bias:.3, vol:1, d:'百萬粉絲網紅業配一次。可能爆紅，也可能只換來一波按讚。'},
  {ic:'📺', n:'電視節目置入', cat:'mk', lo:80, hi:280, bias:.35, vol:.9, d:'美食節目專題報導，曝光很大，效果很難說。'},
  {ic:'📰', n:'地方媒體專訪', cat:'mk', lo:20, hi:80, bias:.55, vol:.5, d:'在地新聞網與社區報專訪，鄰居客會變多。'},
  {ic:'🔎', n:'關鍵字廣告', cat:'mk', lo:40, hi:120, bias:.5, vol:.6, d:'搜尋「附近美食」第一個就是你，按點擊付費。'},
  {ic:'💌', n:'會員名單三千人', cat:'mk', lo:40, hi:140, bias:.5, vol:.6, d:'前老闆留下的熟客名單，有多少人還會回來呢？'},
  {ic:'🏭', n:'中央廚房', cat:'eq', lo:120, hi:260, bias:.5, vol:.45, d:'一次備好十家店的料，品質一致、成本下降。'},
  {ic:'🧾', n:'POS 收銀系統', cat:'eq', lo:30, hi:70, bias:.6, vol:.25, d:'點餐、庫存、報表一次搞定。'},
  {ic:'🚚', n:'冷鏈物流車', cat:'eq', lo:60, hi:140, bias:.5, vol:.45, d:'冷藏冷凍都能送，宅配與外送不怕壞。'},
  {ic:'☕', n:'頂級咖啡機', cat:'eq', lo:40, hi:100, bias:.5, vol:.35, d:'義大利雙孔咖啡機，一天可以出五百杯。'},
  {ic:'🎨', n:'品牌設計', cat:'br', lo:40, hi:120, bias:.55, vol:.5, d:'Logo、包裝、店面視覺整套設計。'},
  {ic:'📜', n:'獨家配方', cat:'br', lo:50, hi:250, bias:.42, vol:.9, d:'阿嬤傳下來的祕方，好不好賣要市場說了算。'},
  {ic:'®️', n:'註冊商標', cat:'br', lo:30, hi:80, bias:.6, vol:.3, d:'名字被搶註就麻煩了，先登記先贏。'},
  {ic:'🤝', n:'加盟授權', cat:'br', lo:80, hi:220, bias:.4, vol:.8, d:'可以把店開到別的縣市，但要管得動加盟主。'},
  {ic:'🪧', n:'老字號招牌', cat:'br', lo:60, hi:180, bias:.5, vol:.6, d:'六十年老店頂讓的招牌，自帶故事與老客人。'}
];

// 兩兩組合加成（萬）
var COMBOS = [
  {a:5, b:15, v:100, n:'主廚＋中央廚房', d:'量產又不走味'},
  {a:3, b:10, v:90, n:'電商＋網紅', d:'流量直接導進賣場'},
  {a:3, b:17, v:70, n:'電商＋冷鏈物流', d:'生鮮也能宅配全台'},
  {a:3, b:13, v:50, n:'電商＋關鍵字廣告', d:'搜尋就找得到你'},
  {a:3, b:9, v:60, n:'電商＋工程師', d:'自己的官網與會員系統'},
  {a:7, b:10, v:50, n:'小編＋網紅', d:'爆紅之後接得住'},
  {a:7, b:14, v:40, n:'小編＋會員名單', d:'把老客人一個個叫回來'},
  {a:6, b:16, v:50, n:'店長＋POS', d:'數字管理、少出錯'},
  {a:0, b:6, v:70, n:'黃金店面＋王牌店長', d:'人潮進得來也接得住'},
  {a:0, b:11, v:60, n:'黃金店面＋電視置入', d:'看完節目走得到'},
  {a:20, b:21, v:80, n:'獨家配方＋註冊商標', d:'祕方被保護住了'},
  {a:22, b:20, v:70, n:'加盟授權＋獨家配方', d:'有東西可以授權'},
  {a:22, b:8, v:40, n:'加盟授權＋會計顧問', d:'加盟帳算得清楚'},
  {a:19, b:2, v:60, n:'品牌設計＋百貨專櫃', d:'站得上百貨的門面'},
  {a:1, b:18, v:50, n:'巷弄小店＋咖啡機', d:'巷弄咖啡館成形'},
  {a:1, b:23, v:60, n:'巷弄小店＋老字號', d:'老招牌找到新家'},
  {a:4, b:12, v:40, n:'夜市攤位＋地方媒體', d:'在地人排隊'}
];

var FMTS = {
  e:{n:'公開喊價', ic:'🙋', s:'英式拍賣', d:'價格由低往高喊，最後喊價最高的組得標，付自己喊的價錢。倒數中有人加價，倒數就重新開始。'},
  s:{n:'密封出價', ic:'✉️', s:'第一價格密封', d:'每組只能偷偷出一個價，時間到一起開，出最高的組得標，付自己出的價錢。看不到別人出多少。'},
  v:{n:'次高價密封', ic:'🥈', s:'維克里拍賣', d:'一樣偷偷出價、最高的得標，但只要付「第二高」的價錢。照心中真正的價值出價最划算。'},
  d:{n:'荷蘭式降價', ic:'⏬', s:'荷蘭式拍賣', d:'價格從很高開始往下降，第一個按「我要」的組得標，付當下的價錢。等越久越便宜，但可能被搶走。'}
};
var FMT_ORDER = ['e', 's', 'v', 'd'];
var TEAM_COLORS = ['#E8553F', '#2F7DD1', '#1E8A5A', '#C98A0B', '#B04FC0', '#0E9AA7', '#D9468C', '#6B7A1F', '#7A4FB5', '#B5651D', '#3D5A80', '#8C2F39'];

/* ---------- 亂數 ---------- */
function hash(s){ var h = 2166136261 >>> 0; s = String(s); for(var i = 0; i < s.length; i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; }
function rng(seed){ var a = hash(seed); return function(){ a = (a + 0x6D2B79F5) | 0; var t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function cryptoInt(n){
  try{ var c = (root.crypto || (typeof require === 'function' ? require('crypto').webcrypto : null)); var a = new Uint32Array(1); c.getRandomValues(a); return a[0] % n; }catch(e){ return Math.floor(Math.random() * n); }
}
function digits(n){ var s = ''; for(var i = 0; i < n; i++) s += cryptoInt(10); return s; }
var CODE_ABC = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function newRoom(){ var s = ''; for(var i = 0; i < 6; i++) s += CODE_ABC[cryptoInt(CODE_ABC.length)]; return s; }
function shuffle(a, r){ a = a.slice(); for(var i = a.length - 1; i > 0; i--){ var j = Math.floor(r() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
function clamp(v, lo, hi){ return Math.max(lo, Math.min(hi, v)); }
function r10(v){ return Math.round(v / 10) * 10; }

/* ---------- 拍品清單 ---------- */
// 通路刻意比組數少一個：一定有組搶不到店面（稀缺）
function channelCount(teams, size){ return clamp(teams - 1, 1, Math.min(5, size - 1)); }
function makeDeck(cfg, seed){
  var r = rng('deck:' + seed), size = clamp(cfg.size | 0, 4, RES.length), teams = clamp(cfg.teams | 0, 2, 12);
  var chs = [], others = [];
  RES.forEach(function(x, i){ (x.cat === 'ch' ? chs : others).push(i); });
  var nch = channelCount(teams, size);
  var pick = shuffle(chs, r).slice(0, nch);
  // 其他資源：先放一些「跟已選通路有組合」的，讓綜效有機會出現
  var rest = shuffle(others, r), withCombo = [], noCombo = [];
  rest.forEach(function(i){ (COMBOS.some(function(c){ return (c.a === i && pick.indexOf(c.b) >= 0) || (c.b === i && pick.indexOf(c.a) >= 0); }) ? withCombo : noCombo).push(i); });
  var need = size - nch, take = withCombo.slice(0, Math.ceil(need / 2));
  take = take.concat(shuffle(noCombo.concat(withCombo.slice(take.length)), r).slice(0, need - take.length));
  // 通路不要全擠在最前面，也不要全在最後
  var deck = shuffle(pick.concat(take), r);
  return deck.map(function(res, k){ return {res:res, fmt:cfg.fmt === 'mix' ? FMT_ORDER[k % 4] : (FMTS[cfg.fmt] ? cfg.fmt : 'e')}; });
}
function deckMid(deck){ return deck.reduce(function(s, l){ var x = RES[l.res]; return s + (x.lo + x.hi) / 2; }, 0); }
// 建議起始資金：全班資金約是拍品估值中位數總和的 1.3 倍
function suggestBudget(deck, teams){ return Math.max(100, Math.round(deckMid(deck) * 1.3 / teams / 50) * 50); }

// 真實價值：老師端的祕密亂數決定（不送給學生，結算才公布）
function trueValue(res, seed){
  var x = RES[res], u = rng('tv:' + seed + ':' + res)(), u2 = rng('tv2:' + seed + ':' + res)();
  var p = clamp(x.bias + ((u + u2) - 1) * .75 * x.vol, 0, 1);
  return r10(x.lo + (x.hi - x.lo) * p);
}
function trueValues(deck, seed){ var o = {}; deck.forEach(function(l){ o[l.res] = trueValue(l.res, seed); }); return o; }

/* ---------- 價格規則 ---------- */
function startPrice(res){ return Math.max(10, r10(RES[res].lo * .5)); }        // 公開喊價起標價、密封最低價、荷蘭式底價
function dutchStart(res){ return r10(RES[res].hi * 1.4); }
function minBid(lot, inc){ return lot.lead ? lot.price + inc : lot.price; }
// 密封／次高價開標：最高者得標（同價先出價者），次高價付第二高（只有一組出價就付底價）
function sealedResult(bids, fmt, reserve){
  var arr = Object.keys(bids).map(function(t){ return {team:+t, amt:bids[t].amt, t:bids[t].t}; }).filter(function(b){ return b.amt >= reserve; });
  arr.sort(function(a, b){ return b.amt - a.amt || a.t - b.t; });
  if(!arr.length) return null;
  var price = fmt === 'v' ? (arr[1] ? arr[1].amt : reserve) : arr[0].amt;
  return {team:arr[0].team, price:price, ranked:arr};
}

/* ---------- 結算 ---------- */
function scoreTeam(items, cash, vals){
  var base = 0, cats = {}, hasCh = false;
  items.forEach(function(res){ base += vals[res] || 0; cats[RES[res].cat] = 1; if(RES[res].cat === 'ch') hasCh = true; });
  var combos = COMBOS.filter(function(c){ return items.indexOf(c.a) >= 0 && items.indexOf(c.b) >= 0; });
  var comboSum = combos.reduce(function(s, c){ return s + c.v; }, 0);
  var nc = Object.keys(cats).length, divPct = nc >= 5 ? .2 : nc >= 4 ? .1 : 0;
  var divBonus = Math.round(base * divPct);
  var res = base + comboSum + divBonus, penalty = 0;
  if(items.length && !hasCh){ penalty = Math.round(res / 2); res -= penalty; }
  return {cash:cash, base:base, combos:combos, comboSum:comboSum, cats:nc, divPct:divPct, divBonus:divBonus, hasCh:hasCh, penalty:penalty, assets:res, total:cash + res};
}

/* ---------- 轉播站訊息（老師狀態放 name 欄位 ≤24 字；只用數字與少數字母，避開不雅字詞過濾） ---------- */
// 等待中：T|w|<gid>|<組數>|<資金>|<加價>
// 拍品：  T|<lid>|<res2><fmt><ph>|<價格>|<領先組或已出價組數>|<剩餘秒>   ph：1 預告 2 競標中 4 成交 5 流標
// 結束：  T|9|<gid>
function encT(s){
  if(s.k === 'w') return 'T|w|' + s.gid + '|' + s.teams + '|' + s.budget + '|' + s.inc;
  if(s.k === 'end') return 'T|9|' + s.gid;
  if(s.k === 'lot') return 'T|' + s.lid + '|' + ('0' + s.res).slice(-2) + s.fmt + s.ph + '|' + Math.round(s.price) + '|' + (s.lead | 0) + '|' + Math.max(0, Math.min(999, Math.round(s.secs || 0)));
  return 'T|0';
}
function decT(name){
  var a = String(name || '').split('|');
  if(a[0] !== 'T') return null;
  if(a[1] === 'w') return {k:'w', gid:a[2], teams:+a[3] || 0, budget:+a[4] || 0, inc:+a[5] || 10};
  if(a[1] === '9') return {k:'end', gid:a[2]};
  if(/^\d{4}$/.test(a[1]) && /^\d\d[esvd][1245]$/.test(a[2] || '')) return {k:'lot', lid:a[1], res:+a[2].slice(0, 2), fmt:a[2][2], ph:+a[2][3], price:+a[3] || 0, lead:+a[4] || 0, secs:+a[5] || 0};
  return {k:'idle'};
}
// 學生：J|<組>|<誰>（加入）、B|<lid>|<組>|<金額或 D>|<誰>（出價）
function cleanWho(s){ return Array.from(String(s || '').replace(/[|\u0000-\u001f<>]/g, '').trim()).slice(0, 8).join(''); }
function encS(s){
  if(s.k === 'bid') return 'B|' + s.lid + '|' + s.team + '|' + (s.amt === 'D' ? 'D' : Math.round(s.amt)) + '|' + cleanWho(s.who);
  return 'J|' + (s.team | 0) + '|' + cleanWho(s.who);
}
function decS(name){
  var a = String(name || '').split('|');
  if(a[0] === 'J') return {k:'join', team:+a[1] || 0, who:cleanWho(a.slice(2).join(''))};
  if(a[0] === 'B' && /^\d{4}$/.test(a[1])) return {k:'bid', lid:a[1], team:+a[2] || 0, amt:a[3] === 'D' ? 'D' : +a[3], who:cleanWho(a.slice(4).join(''))};
  return null;
}
// 聊天：資金表 $<gid>,<第幾則>,<共幾則>,<加價>:<組>=<資金>/<資源兩碼…>;…　真實價值 V<gid>,<i>,<n>:<資源兩碼><價值三碼>…
function chunkJoin(head, parts, sep){
  var out = [], cur = [];
  parts.forEach(function(p){ if(cur.length && (head.length + 10 + cur.concat([p]).join(sep).length) > 58){ out.push(cur); cur = []; } cur.push(p); });
  if(cur.length || !out.length) out.push(cur);
  return out.map(function(c, i){ return head + ',' + i + ',' + out.length + ':' + c.join(sep); });
}
function encTable(gid, teams, inc){
  var parts = teams.map(function(t, i){ return (i + 1) + '=' + Math.round(t.cash) + '/' + t.items.map(function(r){ return ('0' + r).slice(-2); }).join(''); });
  return chunkJoin('$' + gid + ',' + inc, parts, ';').map(function(s){ return s.replace(/^\$(\d+),(\d+),(\d+),(\d+):/, '$$$1,$3,$4,$2:'); });
}
function decTable(text){
  var m = /^\$(\d{4}),(\d+),(\d+),(\d+):(.*)$/.exec(String(text || ''));
  if(!m) return null;
  var teams = {};
  m[5].split(';').forEach(function(p){ var q = /^(\d+)=(\d+)\/(\d*)$/.exec(p); if(!q) return; var items = []; for(var i = 0; i + 1 < q[3].length; i += 2) items.push(+q[3].slice(i, i + 2)); teams[+q[1]] = {cash:+q[2], items:items}; });
  return {gid:m[1], i:+m[2], n:+m[3], inc:+m[4], teams:teams};
}
function encVals(gid, vals){
  var parts = Object.keys(vals).map(function(r){ return ('0' + r).slice(-2) + ('00' + Math.min(999, vals[r])).slice(-3); });
  return chunkJoin('V' + gid, parts, '');
}
function decVals(text){
  var m = /^V(\d{4}),(\d+),(\d+):(\d*)$/.exec(String(text || ''));
  if(!m) return null;
  var vals = {};
  for(var i = 0; i + 4 < m[4].length; i += 5) vals[+m[4].slice(i, i + 2)] = +m[4].slice(i + 2, i + 5);
  return {gid:m[1], i:+m[2], n:+m[3], vals:vals};
}

function money(n){ return Math.round(n).toLocaleString('zh-TW'); }

var API = {CATS:CATS, RES:RES, COMBOS:COMBOS, FMTS:FMTS, FMT_ORDER:FMT_ORDER, TEAM_COLORS:TEAM_COLORS,
  hash:hash, rng:rng, digits:digits, newRoom:newRoom, shuffle:shuffle, clamp:clamp, r10:r10, cryptoInt:cryptoInt,
  channelCount:channelCount, makeDeck:makeDeck, deckMid:deckMid, suggestBudget:suggestBudget, trueValue:trueValue, trueValues:trueValues,
  startPrice:startPrice, dutchStart:dutchStart, minBid:minBid, sealedResult:sealedResult, scoreTeam:scoreTeam,
  encT:encT, decT:decT, encS:encS, decS:decS, cleanWho:cleanWho, encTable:encTable, decTable:decTable, encVals:encVals, decVals:decVals, money:money};
if(typeof module !== 'undefined' && module.exports) module.exports = API; else root.AUC = API;
})(typeof window !== 'undefined' ? window : globalThis);
