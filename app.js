/* 創業資源大競標：畫面（老師投影端＋學生手機端） */
(function(){
'use strict';
var A = window.AUC, $ = function(id){ return document.getElementById(id); };
var QS = new URLSearchParams(location.search);
var JOIN = QS.has('join');
var PFX = 'cab.';
var ONLINE = 'https://m255525.github.io/classroom-auction-game/';
var PRESENCE = QS.get('presence') || 'wss://startup-island-presence.content-workflow.workers.dev/ws';
var ROOM_PREFIX = 'BID';
function lsGet(k){ try{ return localStorage.getItem(PFX + k); }catch(e){ return null; } }
function lsSet(k, v){ try{ localStorage.setItem(PFX + k, v); }catch(e){} }
function lsDel(k){ try{ localStorage.removeItem(PFX + k); }catch(e){} }
function lsJson(k, d){ try{ var v = JSON.parse(lsGet(k)); return v == null ? d : v; }catch(e){ return d; } }
function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return {'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]; }); }
var money = A.money;
function wan(n){ return money(n) + ' 萬'; }
function signed(n){ return (n > 0 ? '+' : '') + money(n); }
function randId(){ var s = ''; while(s.length < 12) s += A.cryptoInt(36).toString(36); return s; }
var standalone = (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone;
function tname(i){ return '第 ' + i + ' 組'; }
function tcol(i){ return A.TEAM_COLORS[(i - 1) % A.TEAM_COLORS.length]; }
function tdot(i){ return '<span class="tdot" style="background:' + tcol(i) + '"></span>'; }
function catChip(cat){ var c = A.CATS[cat]; return '<span class="catchip" style="background:' + c.c + '">' + c.ic + ' ' + c.n + '</span>'; }

/* ---------- 音效（WebAudio 合成） ---------- */
var AC = null;
function snd(kind){
  if(lsGet('mute') === '1') return;
  try{
    AC = AC || new (window.AudioContext || window.webkitAudioContext)();
    var t = AC.currentTime, o = AC.createOscillator(), g = AC.createGain();
    o.connect(g); g.connect(AC.destination);
    var cfg = {bid:[660, 990, .12, 'triangle'], tick:[880, 880, .05, 'square'], gavel:[180, 60, .25, 'sawtooth'], drop:[520, 480, .06, 'sine'], start:[440, 880, .3, 'triangle']}[kind] || [440, 440, .1, 'sine'];
    o.type = cfg[3]; o.frequency.setValueAtTime(cfg[0], t); o.frequency.exponentialRampToValueAtTime(cfg[1], t + cfg[2]);
    g.gain.setValueAtTime(kind === 'tick' ? .05 : .18, t); g.gain.exponentialRampToValueAtTime(.001, t + cfg[2] + .05);
    o.start(t); o.stop(t + cfg[2] + .08);
    if(kind === 'gavel'){ setTimeout(function(){ snd('knock'); }, 160); }
  }catch(e){}
}

/* ---------- 共用：彈窗、提示 ---------- */
function openModal(h, wide){ $('modalBox').innerHTML = h; $('modalBox').className = wide ? 'wide' : ''; $('modal').classList.add('show'); }
function closeModal(){ $('modal').classList.remove('show'); }
var toastT;
function toast(s){ var t = document.querySelector('.toast'); if(!t){ t = document.createElement('div'); t.className = 'toast'; document.body.appendChild(t); } t.textContent = s; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(function(){ t.hidden = true; }, 2800); }
function confetti(){
  if(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  var box = document.createElement('div'); box.className = 'confetti';
  for(var i = 0; i < 70; i++){ var c = document.createElement('i'); c.style.left = (Math.random() * 100) + '%'; c.style.background = ['#D9A441', '#F3D58A', '#E8553F', '#FBF6EA', '#2F7DD1'][i % 5]; c.style.animationDelay = (Math.random() * .8) + 's'; box.appendChild(c); }
  document.body.appendChild(box); setTimeout(function(){ box.remove(); }, 3800);
}
function copyText(s, ok){ var done = function(){ toast(ok || '已複製'); }; if(navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(s).then(done, function(){ fallbackCopy(s); done(); }); else { fallbackCopy(s); done(); } }
function fallbackCopy(s){ var t = document.createElement('textarea'); t.value = s; document.body.appendChild(t); t.select(); try{ document.execCommand('copy'); }catch(e){} t.remove(); }
function download(name, text, type){
  var blob = new Blob(['\ufeff' + text], {type:type || 'text/csv;charset=utf-8'}), a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
  setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
function numOf(el){ var v = parseInt(String(el && el.value || '').replace(/[^0-9]/g, ''), 10); return isFinite(v) ? v : 0; }
function selOf(el){ try{ return [el.selectionStart, el.selectionEnd]; }catch(e){ return null; } }
function setSel(el, s){ if(!s || s[0] == null) return; try{ el.setSelectionRange(s[0], s[1]); }catch(e){} }
function csvCell(v){ v = String(v == null ? '' : v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }

/* ---------- 連線（老師與學生共用；借用創業島轉播站的教室模式） ---------- */
var NET = {ws:null, want:false, status:'off', code:'', role:JOIN ? 'S' : 'T', myId:randId(), peers:{}, retry:0, ping:0, q:[], qBusy:false, last:null, state:'T|0', tkey:''};
function roomUrl(code){
  var here = location.protocol === 'https:' && location.hostname === 'm255525.github.io';
  return (here ? location.origin + location.pathname : ONLINE) + '?join=' + code;
}
function netStart(code){
  NET.want = true; NET.code = code; NET.retry = 0;
  if(NET.role === 'T'){
    NET.tkey = lsGet('tkey.' + code); if(!NET.tkey){ NET.tkey = randId() + randId(); lsSet('tkey.' + code, NET.tkey); }
  } else { NET.myId = lsGet('sid.' + code) || randId(); lsSet('sid.' + code, NET.myId); }
  netConnect();
}
function netStop(closeRoom){
  var ws0 = NET.ws, code = NET.code;
  if(closeRoom && NET.role === 'T' && ws0 && ws0.readyState === 1) try{ ws0.send('{"t":"close"}'); }catch(e){}
  NET.want = false; clearTimeout(NET.rt); clearInterval(NET.ping); NET.ws = null; NET.status = 'off'; NET.peers = {};
  if(ws0) setTimeout(function(){ try{ ws0.close(); }catch(e){} }, closeRoom ? 400 : 0);
  if(closeRoom && code) lsDel('tkey.' + code);
}
function netConnect(){
  if(!NET.want) return;
  var q = 'room=' + ROOM_PREFIX + NET.code + '&cls=1' + (NET.role === 'T' ? '&tkey=' + NET.tkey : ''), ws;
  try{ ws = new WebSocket(PRESENCE + (PRESENCE.indexOf('?') >= 0 ? '&' : '?') + q); }catch(e){ netRetry(); return; }
  NET.ws = ws; NET.status = 'wait'; netPaint();
  ws.onopen = function(){
    if(NET.ws !== ws) return;
    NET.status = 'on'; NET.retry = 0;
    ws.send(JSON.stringify({t:'hello', id:NET.myId, name:NET.role === 'T' ? NET.state : S.myName(), gx:0, gy:0}));
    clearInterval(NET.ping); NET.ping = setInterval(function(){ if(NET.ws && NET.ws.readyState === 1) NET.ws.send('{"t":"ping"}'); }, 25000);
    if(NET.role === 'T') tableSoon(300);
    netPaint();
  };
  ws.onmessage = function(ev){ if(NET.ws !== ws) return; var m; try{ m = JSON.parse(ev.data); }catch(e){ return; } onNet(m); };
  ws.onclose = function(ev){
    if(NET.ws !== ws) return; NET.status = 'off'; NET.ws = null; clearInterval(NET.ping);
    var code = ev && ev.code;
    if(NET.role === 'S' && (code === 4004 || code === 4005)){ S.closed = code; NET.want = false; renderStu(); return; }
    if(code === 4001 && NET.role === 'T'){ toast('這個代碼正由另一台電腦當主持人，已改用新代碼'); netStop(); G.room = A.newRoom(); saveG(); netStart(G.room); render(); return; }
    if(code === 4002){ NET.myId = randId(); if(NET.role === 'S') lsSet('sid.' + NET.code, NET.myId); }
    netPaint(); netRetry();
  };
  ws.onerror = function(){};
}
function netRetry(){ if(!NET.want) return; NET.retry++; clearTimeout(NET.rt); NET.rt = setTimeout(netConnect, Math.min(30000, 1500 * Math.pow(2, NET.retry - 1))); }
function send(o){ if(NET.ws && NET.ws.readyState === 1){ NET.ws.send(JSON.stringify(o)); return true; } return false; }
function setName(name){ if(NET.state === name) return; NET.state = name; send({t:'look', name:name}); }
// 聊天佇列：轉播站限制每則 ≤60 字、每人間隔 ≥2.5 秒
function queueChats(list, tag){ if(tag) NET.q = NET.q.filter(function(x){ return x.tag !== tag; }); list.forEach(function(t){ NET.q.push({t:t, tag:tag}); }); pump(); }
function pump(){
  if(NET.qBusy || !NET.q.length || NET.status !== 'on') return;
  var it = NET.q.shift(); NET.last = it;
  if(!send({t:'chat', text:it.t})){ NET.q.unshift(it); return; }
  NET.qBusy = true; setTimeout(function(){ NET.qBusy = false; pump(); }, 2700);
}
function onNet(m){
  if(m.t === 'snapshot'){
    NET.peers = {}; (m.peers || []).forEach(function(p){ NET.peers[p.id] = String(p.name || ''); });
    if(NET.role === 'T') Object.keys(NET.peers).forEach(function(id){ T.onPeer(id, NET.peers[id], true); });
    else { Object.keys(NET.peers).forEach(function(id){ S.onPeer(id, NET.peers[id]); }); (m.chat || []).forEach(function(c){ S.onChat(c); }); }
  } else if(m.t === 'join' && m.peer){ NET.peers[m.peer.id] = String(m.peer.name || ''); if(NET.role === 'T'){ T.onPeer(m.peer.id, m.peer.name); tableSoon(4000); } else S.onPeer(m.peer.id, m.peer.name); }
  else if(m.t === 'look'){ NET.peers[m.id] = String(m.name || ''); if(NET.role === 'T') T.onPeer(m.id, m.name); else S.onPeer(m.id, m.name); }
  else if(m.t === 'leave'){ delete NET.peers[m.id]; if(NET.role === 'T') T.paintSide(); }
  else if(m.t === 'chat' && NET.role === 'S') S.onChat(m);
  else if(m.t === 'chatSlow' && NET.role === 'T'){ if(NET.last) NET.q.unshift(NET.last); NET.qBusy = true; setTimeout(function(){ NET.qBusy = false; pump(); }, (m.wait || 1000) + 300); }
  netPaint();
}
function netPaint(){ var el = $('netChip'); if(el) el.innerHTML = netChipHtml(); }
function netChipHtml(){
  var n = NET.role === 'T' ? Object.keys(NET.peers).filter(function(id){ return !/^T\|/.test(NET.peers[id]); }).length : 0;
  var st = NET.status === 'on' ? 'on' : NET.status === 'wait' ? 'wait' : '';
  return '<span class="dot ' + st + '"></span>' + (NET.role === 'T' ? (NET.want ? '📱 ' + esc(NET.code) + '・' + n + ' 人' : '📱 手機連線關閉') : (NET.status === 'on' ? '已連線' : NET.status === 'wait' ? '連線中…' : '未連線'));
}
var tableT = 0;
function tableSoon(ms){ clearTimeout(tableT); tableT = setTimeout(function(){ if(G && NET.role === 'T') queueChats(A.encTable(G.gid, G.teams, G.cfg.inc), 'table'); }, ms || 0); }
var qrLib = null;
function loadQR(){
  if(window.QRCode) return Promise.resolve();
  if(!qrLib) qrLib = new Promise(function(ok, no){ var s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js'; s.onload = ok; s.onerror = function(){ qrLib = null; no(); }; document.head.appendChild(s); });
  return qrLib;
}
function drawQR(id, size){ var el = $(id); if(!el) return; loadQR().then(function(){ el = $(id); if(!el) return; el.innerHTML = ''; new window.QRCode(el, {text:roomUrl(NET.code), width:size, height:size, colorDark:'#111', colorLight:'#fff', correctLevel:window.QRCode.CorrectLevel.M}); }).catch(function(){ el.innerHTML = '<p class="small">QR code 載入失敗，請用代碼加入</p>'; }); }

/* =====================================================================
   老師（主持人）端
   ===================================================================== */
var DEF_CFG = {teams:6, size:12, fmt:'mix', budget:0, inc:10, engSec:10, sealSec:30, dutchEvery:1.5};
var G = JOIN ? null : loadG();
var V = {home:!G};
function loadG(){ var g = lsJson('game', null); return g && g.v === 1 && g.teams ? g : null; }
var saveT = 0;
function saveG(){ if(G) lsSet('game', JSON.stringify(G)); else lsDel('game'); }
function saveSoon(){ clearTimeout(saveT); saveT = setTimeout(saveG, 400); }

function newGame(cfg, room){
  cfg = Object.assign({}, DEF_CFG, lsJson('cfg', {}), cfg || {});
  var seed = A.digits(12);
  var deck = A.makeDeck(cfg, seed);
  if(!cfg.budget) cfg.budget = A.suggestBudget(deck, cfg.teams);
  return {v:1, gid:A.digits(4), seed:seed, secret:A.digits(16), room:room || A.newRoom(), stage:'setup', cfg:cfg, deck:deck, idx:-1, lot:null, log:[], teams:mkTeams(cfg), at:Date.now()};
}
function mkTeams(cfg){ var t = []; for(var i = 0; i < cfg.teams; i++) t.push({cash:cfg.budget, items:[]}); return t; }
function vals(){ return A.trueValues(G.deck, G.secret); }

var T = {
  members:{}, // peerId -> {team, who}
  onPeer:function(id, name, replay){
    if(!G) return;
    var s = A.decS(name);
    if(!s){ return; }
    if(s.team >= 1 && s.team <= G.teams.length) T.members[id] = {team:s.team, who:s.who};
    else if(s.k === 'join') T.members[id] = {team:0, who:s.who};
    // 只收「這一項拍品」的出價：重新連線時轉播站會重送每個人最後的狀態，舊拍品的出價不能套到新拍品上
    if(s.k === 'bid' && G.lot && s.lid === G.lot.lid) T.bid(s.team, s.amt, s.who || '手機', id, replay);
    T.paintSide();
  },
  // 出價（手機與現場代按共用）；回傳錯誤訊息或空字串
  bid:function(team, amt, who, peer, replay){
    var L = G.lot;
    if(G.stage !== 'play' || !L || L.ph !== 2) return '現在不是競標時間';
    if(!(team >= 1 && team <= G.teams.length)) return '沒有這一組';
    var tm = G.teams[team - 1], now = Date.now();
    if(L.fmt === 'e'){
      amt = Math.round(+amt);
      if(L.lead === team) return tname(team) + '已經是最高價';
      var mb = A.minBid(L, G.cfg.inc);
      if(!(amt >= mb)) return '至少要出 ' + wan(mb);
      if(amt > tm.cash) return tname(team) + '資金不夠';
      L.price = amt; L.lead = team; L.until = Math.max(L.until, now + G.cfg.engSec * 1000);
      L.bids.push({team:team, amt:amt, by:who, at:now});
      snd('bid'); T.push(); saveSoon(); T.paintLot();
      return '';
    }
    if(L.fmt === 's' || L.fmt === 'v'){
      amt = Math.round(+amt);
      var reserve = A.startPrice(L.res), old = L.sealed[team];
      if(!(amt >= reserve)) return '至少要出 ' + wan(reserve);
      if(amt > tm.cash) return tname(team) + '資金不夠';
      if(old && old.amt === amt && (!peer || old.peer === peer)) return '';
      if(replay && old) return ''; // 老師重新整理時的舊狀態不蓋掉
      L.sealed[team] = {amt:amt, t:now, by:who, peer:peer || ''};
      if(!old) snd('tick');
      T.push(); saveSoon(); T.paintLot();
      return '';
    }
    if(L.fmt === 'd'){
      if(amt !== 'D' && amt !== undefined && amt !== null && amt !== '') { /* 現場代按也算喊停 */ }
      if(L.price > tm.cash){ L.bids.push({team:team, amt:L.price, by:who, at:now, fail:1}); T.paintLot(); return tname(team) + '資金不夠，不能喊停'; }
      L.lead = team; L.bids.push({team:team, amt:L.price, by:who, at:now});
      T.close();
      return '';
    }
    return '';
  },
  push:function(){
    if(!G) return;
    if(G.stage === 'setup'){ setName(A.encT({k:'w', gid:G.gid, teams:G.teams.length, budget:G.cfg.budget, inc:G.cfg.inc})); return; }
    if(G.stage === 'end'){ setName(A.encT({k:'end', gid:G.gid})); return; }
    var L = G.lot; if(!L){ setName(A.encT({k:'w', gid:G.gid, teams:G.teams.length, budget:G.cfg.budget, inc:G.cfg.inc})); return; }
    var lead = L.fmt === 's' || L.fmt === 'v' ? (L.ph === 2 ? Object.keys(L.sealed).length : L.lead) : L.lead;
    var secs = L.ph === 2 && L.fmt !== 'd' ? Math.ceil(Math.max(0, L.until - Date.now()) / 1000) : 0;
    setName(A.encT({k:'lot', lid:L.lid, res:L.res, fmt:L.fmt, ph:L.ph, price:L.price, lead:lead, secs:secs}));
  },
  load:function(i){
    var d = G.deck[i];
    G.idx = i;
    G.lot = {lid:A.digits(4), res:d.res, fmt:d.fmt, ph:1, price:d.fmt === 'd' ? A.dutchStart(d.res) : A.startPrice(d.res), lead:0, bids:[], sealed:{}, until:0};
  },
  open:function(){
    var L = G.lot, now = Date.now(); if(!L || L.ph !== 1) return;
    L.ph = 2; L.bids = []; L.sealed = {}; L.lead = 0;
    if(L.fmt === 'e'){ L.price = A.startPrice(L.res); L.until = now + Math.max(15, G.cfg.engSec) * 1000; }
    else if(L.fmt === 's' || L.fmt === 'v'){ L.price = A.startPrice(L.res); L.until = now + G.cfg.sealSec * 1000; }
    else { L.price = A.dutchStart(L.res); L.floor = A.startPrice(L.res); L.step = Math.max(10, A.r10((L.price - L.floor) / 24)); L.next = now + G.cfg.dutchEvery * 1000; }
    snd('start'); T.push(); saveG(); render();
  },
  close:function(){
    var L = G.lot; if(!L || L.ph !== 2) return;
    var team = 0, price = 0, ranked = null;
    if(L.fmt === 'e' || L.fmt === 'd'){ if(L.lead){ team = L.lead; price = L.price; } }
    else { var r = A.sealedResult(L.sealed, L.fmt, A.startPrice(L.res)); if(r){ team = r.team; price = r.price; ranked = r.ranked; } else ranked = []; }
    if(team && G.teams[team - 1].cash < price) team = 0; // 保險：資金不足視同流標
    L.ranked = ranked;
    if(team){
      L.ph = 4; L.lead = team; L.price = price;
      G.teams[team - 1].cash -= price; G.teams[team - 1].items.push(L.res);
      snd('gavel');
    } else { L.ph = 5; L.lead = 0; snd('drop'); }
    G.log.push({i:G.idx, res:L.res, fmt:L.fmt, team:team, price:price, nb:L.fmt === 'e' ? L.bids.length : (L.fmt === 'd' ? L.bids.length : Object.keys(L.sealed).length), ranked:ranked ? ranked.map(function(b){ return [b.team, b.amt]; }) : null});
    T.push(); tableSoon(200); saveG(); render();
  },
  undo:function(){
    var L = G.lot; if(!L || (L.ph !== 4 && L.ph !== 5)) return;
    var last = G.log[G.log.length - 1];
    if(last && last.i === G.idx){ if(last.team){ var tm = G.teams[last.team - 1]; tm.cash += last.price; var k = tm.items.lastIndexOf(last.res); if(k >= 0) tm.items.splice(k, 1); } G.log.pop(); }
    T.load(G.idx); T.push(); tableSoon(200); saveG(); render(); toast('已重來這一項，資金已退回');
  },
  next:function(){
    if(G.idx + 1 >= G.deck.length){ T.end(); return; }
    T.load(G.idx + 1); T.push(); saveG(); render(); window.scrollTo(0, 0);
  },
  skip:function(){
    var L = G.lot; if(!L) return;
    L.ph = 5; G.log.push({i:G.idx, res:L.res, fmt:L.fmt, team:0, price:0, nb:0, ranked:null, skip:1});
    T.push(); saveG(); render();
  },
  end:function(){
    G.stage = 'end'; G.lot = null; T.push();
    clearTimeout(tableT); queueChats(A.encTable(G.gid, G.teams, G.cfg.inc), 'table'); // 先送最後的資金表，再送真實價值，手機才不會用舊資料算
    queueChats(A.encVals(G.gid, vals()), 'vals');
    saveG(); render(); window.scrollTo(0, 0); confetti(); snd('gavel');
  },
  tick:function(){
    if(!G || G.stage !== 'play' || !G.lot || G.lot.ph !== 2) return;
    var L = G.lot, now = Date.now();
    if(L.fmt === 'd'){
      if(now >= L.next){
        var np = L.price - L.step;
        if(np < L.floor){ T.close(); return; }
        L.price = np; L.next = now + G.cfg.dutchEvery * 1000; snd('drop'); T.push(); saveSoon();
      }
    } else if(now >= L.until){ T.close(); return; }
    else { var left = Math.ceil((L.until - now) / 1000); if(left !== T.lastLeft){ T.lastLeft = left; if(left <= 3 && L.fmt === 'e' && L.lead) snd('tick'); } }
    T.paintLive();
  },
  paintLive:function(){
    var L = G && G.lot; if(!L) return;
    var cd = $('cd'), now = Date.now();
    if(cd && L.ph === 2 && L.fmt !== 'd'){
      var left = Math.max(0, L.until - now), tot = (L.fmt === 'e' ? G.cfg.engSec : G.cfg.sealSec) * 1000;
      cd.style.setProperty('--p', Math.min(1, left / tot)); cd.querySelector('span').textContent = Math.ceil(left / 1000);
      cd.classList.toggle('hot', left <= 3000);
      var go = $('going'); if(go) go.textContent = L.fmt === 'e' && L.lead ? (left <= 1500 ? '第三次……' : left <= 3000 ? '第二次……' : left <= 4500 ? '第一次……' : '') : '';
    }
    if(L.ph === 2 && L.fmt === 'd'){ var pv = $('pv'); if(pv) pv.innerHTML = money(L.price) + '<small>萬</small>'; var nx = $('cd'); if(nx){ var l2 = Math.max(0, L.next - now), tt = G.cfg.dutchEvery * 1000; nx.style.setProperty('--p', l2 / tt); nx.querySelector('span').textContent = '⏬'; } }
  },
  paintLot:function(){
    var el = $('lotBox'); if(!el){ T.paintSide(); return; }
    var keep = {}, ae = document.activeElement, fid = ae && (ae.id || (ae.dataset && ae.dataset.seal ? 'seal' + ae.dataset.seal : ''));
    el.querySelectorAll('#manAmt,[data-seal]').forEach(function(i){ keep[i.id || 'seal' + i.dataset.seal] = {v:i.value, sel:selOf(i)}; });
    el.innerHTML = lotHtml();
    el.querySelectorAll('#manAmt,[data-seal]').forEach(function(i){ var k = i.id || 'seal' + i.dataset.seal; if(keep[k]) i.value = keep[k].v; if(k === fid){ i.focus(); if(keep[k]) setSel(i, keep[k].sel); } });
    T.paintLive(); T.paintSide();
  },
  paintSide:function(){ var el = $('sideBox'); if(el) el.innerHTML = sideHtml(); netPaint(); },
  phones:function(team){ var n = 0; Object.keys(T.members).forEach(function(id){ if(NET.peers[id] !== undefined && T.members[id].team === team) n++; }); return n; }
};

/* ---------- 老師：共用片段 ---------- */
function topBar(){
  return '<div class="top noprint"><h1>🔨 創業資源大競標 <small>全班即時拍賣</small></h1>' +
    (G && !V.home ? '<button class="ibtn" data-act="home">🏠 首頁</button><button class="ibtn" id="netChip" data-act="room">' + netChipHtml() + '</button><button class="ibtn" data-act="rules">📜 規則</button>' : '') +
    '<a class="ibtn" href="manual.html">📖 操作手冊</a><button class="ibtn" data-act="settings" aria-label="常用設定">⚙</button></div>' +
    '<p class="warn-line noprint">拍品的估值、真實價值與加成都是遊戲設定，用來練習估價與競標，不是真實行情。<button data-act="warn">⚠ 使用警語</button></p>';
}
function footer(){
  return '<footer class="foot noprint">👤 創作者 Mark Tsai（蔡豐全）<a href="mailto:tsaimark@gmail.com">tsaimark@gmail.com</a><br><a href="manual.html">📖 操作手冊</a><a href="#" data-act="warn">⚠ 使用警語</a>' +
    (standalone ? '' : '<a href="#" data-act="install">📲 加入主畫面</a>') + '<a href="https://m255525.github.io/startup-island/" target="_blank" rel="noopener">🏝 創業島</a>' +
    '<br><img src="https://visitor-badge.laobi.icu/badge?page_id=m255525.classroomauctiongame" alt="訪客次數" height="20" loading="lazy" style="vertical-align:middle;margin-top:.4rem"></footer>';
}
function fmtBadge(f){ var x = A.FMTS[f]; return '<button class="fmt" data-act="fmtHelp" data-f="' + f + '" title="' + esc(x.d) + '">' + x.ic + ' ' + x.n + '</button>'; }
function combosOf(res){
  var inDeck = G ? G.deck.map(function(l){ return l.res; }) : [];
  return A.COMBOS.filter(function(c){ return (c.a === res || c.b === res) && inDeck.indexOf(c.a === res ? c.b : c.a) >= 0; });
}

/* ---------- 老師：首頁 ---------- */
function homeView(){
  var h = topBar() + '<section class="hero"><div><h2 class="ttl">店面只有五間，<br>你們有六組。</h2>' +
    '<p>全班分組，每組拿一筆創業金，用手機競標黃金店面、資深主廚、網紅合作、中央廚房……每一項只知道「估值區間」，真實價值要到最後才公布。搶到了，可能是賺到，也可能是付太多。</p>' +
    '<div class="chips"><span>🙋 公開喊價</span><span>✉️ 密封出價</span><span>🥈 次高價密封</span><span>⏬ 荷蘭式降價</span><span>🧩 組合加成</span><span>🚪 通路稀缺</span><span>😱 贏家詛咒</span></div>' +
    '<div class="go">' + (G ? '<button class="btn gold big" data-act="resume">▶ 回到進行中的拍賣會</button><button class="btn alt" data-act="newSetup">🆕 開新的一場</button>' : '<button class="btn gold big" data-act="newSetup">🔨 開一場拍賣會</button>') + '</div>' +
    '<p class="small" style="color:#D8BFB4">老師用電腦開投影，學生掃 QR code 用手機出價，不用下載 App、不用登入。沒有手機也能玩：老師可以幫各組代按。</p></div><div class="gavel" aria-hidden="true">🔨</div></section>' +
    '<div class="modes">' +
    '<div class="mode"><div class="mi">🚪</div><h2>稀缺</h2><p>通路（店面、專櫃、網店、攤位）的數量比組數少一個。沒有通路的組，其他資源全部打五折。店面會被搶成什麼價錢？</p></div>' +
    '<div class="mode"><div class="mi">💸</div><h2>機會成本</h2><p>沒花掉的錢也算公司價值。花 200 萬買一個只值 150 萬的資源，等於直接虧 50 萬，還放棄了買別的東西的機會。</p></div>' +
    '<div class="mode"><div class="mi">😱</div><h2>贏家詛咒</h2><p>網紅合作的估值是 40～260 萬。最後得標的通常是「最樂觀」的那一組，而最樂觀的估計往往太高。</p></div>' +
    '<div class="mode"><div class="mi">🧩</div><h2>組合綜效</h2><p>主廚＋中央廚房、電商＋網紅、配方＋商標……湊成一對另外加分。有時候為了湊組合，多付一點是值得的。</p></div>' +
    '</div>' + footer();
  return h;
}

/* ---------- 老師：設定 ---------- */
function segBtns(key, opts){ return '<div class="seg">' + opts.map(function(o){ return '<button data-cfg="' + key + '" data-v="' + o[0] + '" aria-pressed="' + (String(G.cfg[key]) === String(o[0])) + '">' + o[1] + '</button>'; }).join('') + '</div>'; }
function setupView(){
  var c = G.cfg, mid = A.deckMid(G.deck), nch = G.deck.filter(function(l){ return A.RES[l.res].cat === 'ch'; }).length;
  var used = G.deck.map(function(l){ return l.res; });
  var ratio = c.budget * c.teams / Math.max(1, mid);
  var h = topBar() + '<section class="card"><h2>🛠 拍賣會設定</h2><p class="lead">先設定組數和資金，再檢查拍品清單。學生可以先掃 QR code 加入、選組別，設定好再按「開始拍賣」。</p>' +
    '<div class="form">' +
    '<label class="fld">組數<input type="number" id="cTeams" min="2" max="12" value="' + c.teams + '"><small>2～12 組；通路會自動排成「組數－1」個</small></label>' +
    '<label class="fld">每組起始資金（萬）<input type="number" id="cBudget" min="50" max="99999" step="10" value="' + c.budget + '"><small>建議 ' + money(A.suggestBudget(G.deck, c.teams)) + ' 萬 <a href="#" data-act="sugBudget">套用</a></small></label>' +
    '<label class="fld">拍品數<input type="number" id="cSize" min="4" max="' + A.RES.length + '" value="' + c.size + '"><small>一項約 1～2 分鐘；12 項約 20 分鐘</small></label>' +
    '<label class="fld">公開喊價每口加價（萬）<input type="number" id="cInc" min="1" max="1000" value="' + c.inc + '"></label>' +
    '<label class="fld">公開喊價倒數（秒）<input type="number" id="cEng" min="5" max="60" value="' + c.engSec + '"><small>有人加價就重新倒數</small></label>' +
    '<label class="fld">密封出價時間（秒）<input type="number" id="cSeal" min="10" max="300" value="' + c.sealSec + '"></label>' +
    '<label class="fld">荷蘭式每幾秒降一次<input type="number" id="cDutch" min=".5" max="10" step=".5" value="' + c.dutchEvery + '"></label>' +
    '</div>' +
    '<div class="fld" style="margin-top:.8rem">拍賣形式' + segBtns('fmt', [['mix', '四種輪流'], ['e', '🙋 公開喊價'], ['s', '✉️ 密封'], ['v', '🥈 次高價'], ['d', '⏬ 荷蘭式']]) + '<small>四種輪流最能比較不同拍賣形式的差別；每一項也可以在下面個別改</small></div>' +
    '<div class="stat"><div>拍品 <b>' + G.deck.length + '</b> 項</div><div>通路 <b>' + nch + '</b> 個／' + c.teams + ' 組</div><div>估值中位數總和 <b>' + money(mid) + '</b> 萬</div><div>全班資金 <b>' + money(c.budget * c.teams) + '</b> 萬（' + ratio.toFixed(1) + ' 倍）</div></div>' +
    (ratio < .8 ? '<div class="alert warn">全班資金比拍品估值少很多，大部分拍品會用很低的價錢成交或流標。</div>' : ratio > 2.5 ? '<div class="alert warn">全班資金是拍品估值的 ' + ratio.toFixed(1) + ' 倍，錢太多時大家容易亂喊，可以把資金調低。</div>' : '') +
    (nch >= c.teams ? '<div class="alert warn">通路有 ' + nch + ' 個、組數 ' + c.teams + ' 組：每組都搶得到，就看不到「稀缺」了。</div>' : '') +
    '<h3 style="margin-top:1rem;color:var(--wine)">📋 拍品清單（照順序拍賣）</h3><ol class="deck">' +
    G.deck.map(function(l, i){ var x = A.RES[l.res];
      return '<li><span class="no">' + (i + 1) + '</span><span class="ic">' + x.ic + '</span><b>' + esc(x.n) + '<small>' + A.CATS[x.cat].n + '・估值 ' + x.lo + '～' + x.hi + ' 萬</small></b>' +
        '<select data-lotfmt="' + i + '" aria-label="拍賣形式">' + A.FMT_ORDER.map(function(f){ return '<option value="' + f + '"' + (f === l.fmt ? ' selected' : '') + '>' + A.FMTS[f].ic + ' ' + A.FMTS[f].n + '</option>'; }).join('') + '</select>' +
        '<button data-up="' + i + '" aria-label="往前" title="往前"' + (i ? '' : ' disabled') + '>↑</button><button data-del="' + i + '" aria-label="移除" title="移除">✕</button></li>'; }).join('') + '</ol>' +
    '<div class="go"><select id="addRes" style="min-height:2.7rem;border-radius:.5rem;border:1.5px solid var(--line);padding:0 .5rem;max-width:100%"><option value="">➕ 加一項拍品…</option>' +
    A.RES.map(function(x, i){ return used.indexOf(i) >= 0 ? '' : '<option value="' + i + '">' + x.ic + ' ' + esc(x.n) + '（' + A.CATS[x.cat].n + '）</option>'; }).join('') + '</select>' +
    '<button class="btn alt" data-act="reshuffle">🔀 重新抽拍品</button></div>' +
    '<div class="go"><button class="btn gold big" data-act="startAuction"' + (G.deck.length ? '' : ' disabled') + '>🔨 開始拍賣</button><button class="btn alt" data-act="rules">📜 先投影規則說明</button></div></section>' +
    '<section class="card"><h2>📱 讓學生加入</h2>' + joinBoxHtml(true) + '</section>' + footer();
  return h;
}
function joinBoxHtml(big){
  if(!NET.want) return '<p class="lead">學生用手機掃 QR code 加入、選自己的組別，就能出價。</p><div class="go"><button class="btn gold" data-act="netOn">📱 開放手機加入</button></div><p class="small">不開也能玩：老師在「現場代按」幫各組出價。</p>';
  var counts = {}, names = {};
  Object.keys(T.members).forEach(function(id){ if(NET.peers[id] === undefined) return; var m = T.members[id]; counts[m.team] = (counts[m.team] || 0) + 1; (names[m.team] = names[m.team] || []).push(m.who || '同學'); });
  var local = !(location.protocol === 'https:' && location.hostname === 'm255525.github.io');
  return '<div style="display:flex;gap:1rem;flex-wrap:wrap;align-items:center"><div class="qr" id="qrJoin"></div><div style="flex:1 1 14rem"><div class="small">手機掃描，或打開 ' + esc(ONLINE.replace('https://', '')) + ' 輸入代碼</div><div style="font-family:var(--serif);font-size:' + (big ? '3rem' : '2rem') + ';letter-spacing:.12em;color:var(--wine)">' + esc(NET.code) + '</div>' +
    (local ? '<p class="small">目前不是線上版網址，QR code 指向線上版。</p>' : '') +
    '<div class="go"><button class="btn alt" data-act="copyJoin">📋 複製加入連結</button><button class="btn alt" data-act="bigQR">🔍 放大 QR code</button><button class="btn red" data-act="netOff">🚪 關閉教室</button></div></div></div>' +
    '<div class="stat">' + G.teams.map(function(t, i){ return '<div title="' + esc((names[i + 1] || []).join('、')) + '">' + tdot(i + 1) + ' ' + tname(i + 1) + ' <b>' + (counts[i + 1] || 0) + '</b> 人</div>'; }).join('') + (counts[0] ? '<div>還沒選組 <b>' + counts[0] + '</b> 人</div>' : '') + '</div>';
}

/* ---------- 老師：拍賣會場 ---------- */
function playView(){
  var h = topBar() + '<div class="prog noprint">' + G.deck.map(function(l, i){ return '<i class="' + (i < G.idx ? 'done' : i === G.idx ? 'cur' : '') + '"></i>'; }).join('') + '</div>' +
    '<div class="hall"><div id="lotBox">' + lotHtml() + '</div><aside class="side" id="sideBox">' + sideHtml() + '</aside></div>' + footer();
  return h;
}
function lotHtml(){
  var L = G.lot; if(!L) return '';
  var x = A.RES[L.res], f = A.FMTS[L.fmt], cs = combosOf(L.res);
  var h = '<div class="lot"><div class="lh"><span class="no">第 ' + (G.idx + 1) + '／' + G.deck.length + ' 項</span>' + catChip(x.cat) + fmtBadge(L.fmt) + '</div>' +
    '<div class="lb"><div class="big-ic">' + x.ic + '</div><div><h2>' + esc(x.n) + '</h2><p class="desc">' + esc(x.d) + '</p><span class="est">估值 ' + x.lo + '～' + x.hi + ' 萬</span>' +
    (cs.length ? '<div class="combo">🧩 這場可以湊成：' + cs.map(function(c){ return '<b>' + esc(c.n) + '</b> +' + c.v; }).join('、') + '</div>' : '') +
    (x.cat === 'ch' ? '<div class="combo">🚪 這是通路：沒有任何通路的組，資產打五折</div>' : '') + '</div></div>';
  h += '<div class="price">' + priceHtml(L) + '</div>';
  // 控制鈕
  h += '<div class="ctl noprint">';
  if(L.ph === 1) h += '<button class="btn gold big" data-act="openLot">▶ 開始競標</button><button class="btn alt" data-act="fmtHelp" data-f="' + L.fmt + '">' + f.ic + ' 說明這種拍賣</button><button class="btn alt" data-act="skipLot">⏭ 跳過這一項</button>';
  else if(L.ph === 2) h += '<button class="btn red big" data-act="closeLot">' + (L.fmt === 's' || L.fmt === 'v' ? '✉️ 開標' : L.fmt === 'd' ? '⏹ 結束（流標）' : '🔨 落槌') + '</button>' + (L.fmt !== 'd' ? '<button class="btn alt" data-act="addTime">⏱ +10 秒</button>' : '');
  else h += '<button class="btn gold big" data-act="nextLot">' + (G.idx + 1 >= G.deck.length ? '🏁 看結算' : '下一項 ▶') + '</button><button class="btn alt" data-act="undoLot">↩ 重來這一項</button>';
  h += '</div>';
  if(L.ph === 2) h += manualHtml(L);
  h += bidLogHtml(L) + '</div>';
  return h;
}
function priceHtml(L){
  var f = L.fmt;
  if(L.ph === 1){
    var p = f === 'd' ? A.dutchStart(L.res) : A.startPrice(L.res);
    return '<div><div class="pl">' + (f === 'd' ? '起始價（會一直往下降）' : f === 'e' ? '起標價' : '最低出價') + '</div><div class="pv">' + money(p) + '<small>萬</small></div></div><div class="small" style="flex:1 1 14rem">' + esc(A.FMTS[f].d) + '</div>';
  }
  if(L.ph === 2){
    if(f === 'e') return '<div><div class="pl">' + (L.lead ? '目前最高價' : '起標價，等第一口出價') + '</div><div class="pv">' + money(L.price) + '<small>萬</small></div></div>' +
      (L.lead ? '<div class="who" style="color:' + tcol(L.lead) + '">' + tdot(L.lead) + ' ' + tname(L.lead) + '</div>' : '') + '<div class="cd" id="cd"><span></span></div><div class="going" id="going"></div>';
    if(f === 's' || f === 'v'){ var n = Object.keys(L.sealed).length;
      return '<div><div class="pl">' + (f === 'v' ? '偷偷出價，最高者得標、付第二高的價錢' : '偷偷出價，最高者得標、付自己出的價錢') + '</div><div class="pv">' + n + '<small>／' + G.teams.length + ' 組已出價</small></div></div>' +
        '<div style="display:flex;gap:.3rem;flex-wrap:wrap">' + G.teams.map(function(t, i){ return '<span title="' + tname(i + 1) + '" style="font-size:1.4rem;opacity:' + (L.sealed[i + 1] ? 1 : .25) + '">✉️</span>'; }).join('') + '</div><div class="cd" id="cd"><span></span></div>'; }
    return '<div><div class="pl">現在價錢（第一個喊「我要」的組得標）</div><div class="pv" id="pv">' + money(L.price) + '<small>萬</small></div></div><div class="small">每 ' + G.cfg.dutchEvery + ' 秒降 ' + L.step + ' 萬，底價 ' + L.floor + ' 萬</div><div class="cd" id="cd"><span>⏬</span></div>';
  }
  if(L.ph === 4) return '<div class="sold"><span class="st">成交</span><div class="who" style="margin-top:.6rem;color:' + tcol(L.lead) + '">' + tdot(L.lead) + ' ' + tname(L.lead) + ' 以 ' + wan(L.price) + ' 得標</div>' +
    (L.fmt === 'v' && L.ranked && L.ranked.length ? '<div class="small">出價最高 ' + wan(L.ranked[0].amt) + '，付第二高的價錢 ' + wan(L.price) + '</div>' : '') + '</div>';
  return '<div class="sold"><span class="st no">流標</span><div class="small" style="margin-top:.6rem">沒有組出價，這項資源沒人要。</div></div>';
}
function manualHtml(L){
  var f = L.fmt, h = '<details class="manual noprint"' + (lsGet('manualOpen') === '1' ? ' open' : '') + ' id="manualBox"><summary>🖐 現場代按（沒有手機，或幫舉手的組出價）</summary>';
  if(f === 'e'){
    var mb = A.minBid(L, G.cfg.inc);
    h += '<p class="small">按組別＝出 ' + wan(mb) + '（目前價' + (L.lead ? '＋' + G.cfg.inc : '') + '）。要喊別的價錢，先在右邊輸入金額再按組別。</p><div class="go" style="margin-top:.2rem"><label class="small">指定金額 <input type="text" inputmode="numeric" pattern="[0-9]*" autocomplete="off" id="manAmt" style="width:7rem;min-height:2.4rem;border:1.5px solid var(--line);border-radius:.4rem;padding:0 .4rem"> 萬</label></div><div class="tbtns">' +
      G.teams.map(function(t, i){ var n = i + 1, dis = L.lead === n || t.cash < mb; return '<button class="tbtn" style="background:' + tcol(n) + '" data-man="' + n + '"' + (dis ? ' disabled' : '') + '>' + tname(n) + '<small>' + (L.lead === n ? '領先中' : '資金 ' + money(t.cash)) + '</small></button>'; }).join('') + '</div>';
  } else if(f === 's' || f === 'v'){
    h += '<p class="small">各組把出價寫在紙上交給老師，輸入後按「送出」。空白＝不出價；可以覆蓋手機送來的價錢。</p><div class="sealin">' +
      G.teams.map(function(t, i){ var n = i + 1; return '<label>' + tdot(n) + n + '<input type="text" inputmode="numeric" pattern="[0-9]*" autocomplete="off" data-seal="' + n + '" placeholder="≤' + money(t.cash) + '"></label>'; }).join('') + '</div><div class="go"><button class="btn" data-act="manSeal">送出這些出價</button></div>';
  } else {
    h += '<p class="small">哪一組先喊「我要」，就按那一組。</p><div class="tbtns">' + G.teams.map(function(t, i){ var n = i + 1; return '<button class="tbtn" style="background:' + tcol(n) + '" data-man="' + n + '"' + (t.cash < L.price ? ' disabled' : '') + '>' + tname(n) + ' 我要<small>資金 ' + money(t.cash) + '</small></button>'; }).join('') + '</div>';
  }
  return h + '</details>';
}
function bidLogHtml(L){
  var rows = [];
  if((L.fmt === 's' || L.fmt === 'v') && (L.ph === 4 || L.ph === 5) && L.ranked){
    rows = L.ranked.map(function(b, k){ return '<li>' + (k === 0 ? '🏆' : (k + 1) + '.') + ' ' + tdot(b.team) + ' ' + tname(b.team) + '<span class="amt">' + wan(b.amt) + '</span></li>'; });
    if(!rows.length) rows = ['<li>沒有組出價（或都低於最低出價 ' + wan(A.startPrice(L.res)) + '）</li>'];
    return '<div class="manual"><b style="color:var(--wine)">✉️ 開標結果</b></div><ul class="blog">' + rows.join('') + '</ul>';
  }
  if(L.fmt === 'e' || L.fmt === 'd'){
    rows = L.bids.slice().reverse().slice(0, 30).map(function(b){ return '<li>' + tdot(b.team) + ' ' + tname(b.team) + ' <span class="small">' + esc(b.by || '') + (b.fail ? '（資金不足）' : '') + '</span><span class="amt">' + wan(b.amt) + '</span></li>'; });
    if(!rows.length) return '';
    return '<div class="manual"><b style="color:var(--wine)">📜 出價紀錄</b></div><ul class="blog">' + rows.join('') + '</ul>';
  }
  return '';
}
function sideHtml(){
  var L = G.lot, h = '';
  h += '<div class="roomcard noprint">' + (NET.want ? '<div class="small">掃描或輸入代碼加入</div><div class="code">' + esc(NET.code) + '</div><button class="ibtn" data-act="bigQR">🔍 QR code</button>' : '<button class="btn gold" data-act="netOn">📱 開放手機加入</button>') + '</div>';
  h += '<h3>🏢 各組資金與資源</h3><div class="teams">' + G.teams.map(function(t, i){
    var n = i + 1, lead = L && L.ph === 2 && L.lead === n && L.fmt === 'e', ph = T.phones(n);
    var hasCh = t.items.some(function(r){ return A.RES[r].cat === 'ch'; });
    return '<div class="team' + (lead ? ' lead' : '') + '">' + tdot(n) + '<b>' + tname(n) + (lead ? ' 🙋' : '') + '</b><span class="cash">' + money(t.cash) + '</span>' +
      '<div class="items" title="' + esc(t.items.map(function(r){ return A.RES[r].n; }).join('、')) + '">' + (t.items.map(function(r){ return A.RES[r].ic; }).join('') || '<span class="ph">還沒有資源</span>') + '</div>' +
      '<span class="ph" style="grid-column:1/-1">' + (NET.want ? '📱 ' + ph + ' 人' : '') + (t.items.length && !hasCh ? ' <span class="nch">⚠ 還沒有通路</span>' : '') + '</span></div>';
  }).join('') + '</div><p class="small">資金單位：萬元。滑過圖示可以看資源名稱。</p>';
  return h;
}

/* ---------- 老師：結算 ---------- */
function teamScores(){
  var tv = vals();
  return G.teams.map(function(t, i){ var s = A.scoreTeam(t.items, t.cash, tv); s.team = i + 1; s.items = t.items; s.spent = G.cfg.budget - t.cash; s.growth = s.total - G.cfg.budget; return s; })
    .sort(function(a, b){ return b.total - a.total || a.team - b.team; });
}
function endView(){
  var tv = vals(), sc = teamScores(), budget = G.cfg.budget;
  var sold = G.log.filter(function(l){ return l.team; });
  var h = topBar() + '<section class="card"><h2>🏁 結算：真實價值公布</h2><p class="lead">企業價值＝剩下的現金＋資源的真實價值（加上組合加成、多元加成；沒有通路的組資產打五折）。每組一開始都是 ' + wan(budget) + '。</p><div class="rank">' +
    sc.map(function(s, k){
      var bd = '現金 ' + money(s.cash) + '＋資源 ' + money(s.base) + (s.comboSum ? '＋組合 ' + money(s.comboSum) + '（' + s.combos.map(function(c){ return c.n; }).join('、') + '）' : '') + (s.divBonus ? '＋多元 ' + money(s.divBonus) + '（' + s.cats + ' 類）' : '') + (s.penalty ? '－沒有通路 ' + money(s.penalty) : '');
      return '<div class="rk' + (k === 0 ? ' first' : '') + '"><div class="n">' + (k === 0 ? '🏆' : k + 1) + '</div><div><b style="font-size:1.15rem">' + tdot(s.team) + ' ' + tname(s.team) + '</b> <span class="its">' + s.items.map(function(r){ return A.RES[r].ic; }).join('') + '</span></div>' +
        '<div class="tot">' + money(s.total) + '<small class="' + (s.growth >= 0 ? 'pos' : 'neg') + '">' + signed(s.growth) + ' 萬</small></div><div class="bd">' + bd + '</div></div>';
    }).join('') + '</div>' +
    '<div class="go noprint"><button class="btn gold" data-act="csv">⬇ 下載結果 CSV</button><button class="btn alt" data-act="print">🖨 列印／存成 PDF</button><button class="btn alt" data-act="again">🔁 同一班再玩一場</button><button class="btn alt" data-act="newSetup">🆕 重新設定</button></div></section>';
  // 拍品明細
  h += '<section class="card"><h2>📋 每一項拍品：付了多少、其實值多少</h2><div class="tw"><table class="t"><thead><tr><th>#</th><th>拍品</th><th>形式</th><th>得標</th><th class="n">估值</th><th class="n">成交價</th><th class="n">真實價值</th><th class="n">得標者賺／賠</th></tr></thead><tbody>' +
    G.log.map(function(l){ var x = A.RES[l.res], v = tv[l.res], d = l.team ? v - l.price : null;
      return '<tr><td>' + (l.i + 1) + '</td><td>' + x.ic + ' ' + esc(x.n) + '</td><td>' + A.FMTS[l.fmt].ic + ' ' + A.FMTS[l.fmt].n + '</td><td>' + (l.team ? tdot(l.team) + ' ' + tname(l.team) : (l.skip ? '跳過' : '流標')) + '</td><td class="n">' + x.lo + '～' + x.hi + '</td><td class="n">' + (l.team ? money(l.price) : '—') + '</td><td class="n"><b>' + money(v) + '</b></td><td class="n ' + (d == null ? '' : d >= 0 ? 'pos' : 'neg') + '">' + (d == null ? '—' : signed(d)) + '</td></tr>'; }).join('') +
    '</tbody></table></div></section>';
  h += '<section class="card"><h2>💡 這場拍賣教了我們什麼</h2><div class="lessons">' + lessonsHtml(sc, tv, sold) + '</div>' +
    '<h3 style="margin-top:1rem;color:var(--wine)">🗣 討論題</h3><ol class="qs"><li>你們組一開始的策略是什麼？中途有改變嗎？為什麼？</li><li>哪一項拍品你們「後悔沒搶」或「後悔搶了」？當時的估價錯在哪裡？</li><li>如果再玩一次，你們會先搶通路，還是先存錢等便宜的？</li><li>四種拍賣形式裡，哪一種讓你們出價最保守？哪一種最容易喊過頭？</li><li>真實創業時，哪些「資源」也是這樣被競標的？（店面租約、人才、廣告版位、政府補助……）</li></ol></section>' + footer();
  return h;
}
function lessonsHtml(sc, tv, sold){
  var out = [], nch = G.deck.filter(function(l){ return A.RES[l.res].cat === 'ch'; }).length;
  var noCh = sc.filter(function(s){ return !s.hasCh; });
  var chSold = sold.filter(function(l){ return A.RES[l.res].cat === 'ch'; });
  var chRatio = chSold.length ? chSold.reduce(function(s, l){ return s + l.price; }, 0) / chSold.reduce(function(s, l){ return s + tv[l.res]; }, 0) : 0;
  out.push(['🚪 稀缺', '這場有 ' + nch + ' 個通路、' + G.teams.length + ' 組。' + (noCh.length ? noCh.map(function(s){ return tname(s.team); }).join('、') + '沒有通路，' + (noCh.some(function(s){ return s.items.length; }) ? '手上的資源全部打五折。' : '只能抱著現金。') : '每組都搶到通路了。') +
    (chSold.length ? '通路的成交價平均是真實價值的 <b>' + Math.round(chRatio * 100) + '%</b>' + (chRatio > 1 ? '：大家知道它稀缺，願意多付。' : '。') : '')]);
  var over = sold.filter(function(l){ return l.price > tv[l.res]; }).sort(function(a, b){ return (b.price - tv[b.res]) - (a.price - tv[a.res]); });
  out.push(['😱 贏家詛咒', over.length ? '有 <b>' + over.length + '／' + sold.length + '</b> 項成交價高於真實價值。付最多冤枉錢的是 ' + A.RES[over[0].res].ic + ' ' + esc(A.RES[over[0].res].n) + '（' + tname(over[0].team) + ' 多付 ' + wan(over[0].price - tv[over[0].res]) + '）。估值區間越寬，得標的人越可能是估得最樂觀、也最容易估錯的那一組。' : '沒有任何一項付超過真實價值，大家都很冷靜！']);
  var rich = sc.slice().sort(function(a, b){ return b.cash - a.cash; })[0];
  out.push(['💸 機會成本', '剩最多現金的是 ' + tname(rich.team) + '（' + wan(rich.cash) + '）。沒花的錢也算價值；但錢放著不動，就放棄了用便宜價錢買到好資源的機會。' + (sc[0].team === rich.team ? '這場「少買」反而贏了。' : '第一名 ' + tname(sc[0].team) + ' 花了 ' + wan(sc[0].spent) + '，換到更多價值。')]);
  var byF = {};
  sold.forEach(function(l){ var b = byF[l.fmt] = byF[l.fmt] || {n:0, p:0, v:0}; b.n++; b.p += l.price; b.v += tv[l.res]; });
  var fk = Object.keys(byF);
  out.push(['🔨 四種拍賣形式', fk.length ? fk.map(function(f){ var b = byF[f]; return A.FMTS[f].ic + ' ' + A.FMTS[f].n + '：' + b.n + ' 項，成交價是真實價值的 <b>' + Math.round(b.p / b.v * 100) + '%</b>'; }).join('<br>') + '<br><span class="small">次高價密封理論上鼓勵「照真心出價」；荷蘭式常因為怕被搶而太早喊停。</span>' : '這場沒有成交的拍品。']);
  var cb = []; sc.forEach(function(s){ s.combos.forEach(function(c){ cb.push(tname(s.team) + '：' + c.n + ' +' + c.v); }); });
  out.push(['🧩 組合綜效', cb.length ? cb.join('<br>') : '沒有組湊成組合。資源單獨看不值錢，湊在一起可能變很值錢。']);
  return out.map(function(o){ return '<div class="lesson"><h3>' + o[0] + '</h3><p>' + o[1] + '</p></div>'; }).join('');
}
function resultCsv(){
  var tv = vals(), sc = teamScores(), L = [];
  L.push(['名次', '組別', '企業價值', '成長', '剩餘現金', '資源真實價值', '組合加成', '多元加成', '沒有通路扣除', '資源'].map(csvCell).join(','));
  sc.forEach(function(s, k){ L.push([k + 1, tname(s.team), s.total, s.growth, s.cash, s.base, s.comboSum, s.divBonus, s.penalty, s.items.map(function(r){ return A.RES[r].n; }).join('、')].map(csvCell).join(',')); });
  L.push('');
  L.push(['順序', '拍品', '類別', '形式', '得標', '估值下限', '估值上限', '成交價', '真實價值', '得標者賺賠', '出價次數', '密封出價（組:金額）'].map(csvCell).join(','));
  G.log.forEach(function(l){ var x = A.RES[l.res]; L.push([l.i + 1, x.n, A.CATS[x.cat].n, A.FMTS[l.fmt].n, l.team ? tname(l.team) : (l.skip ? '跳過' : '流標'), x.lo, x.hi, l.team ? l.price : '', tv[l.res], l.team ? tv[l.res] - l.price : '', l.nb, l.ranked ? l.ranked.map(function(b){ return b[0] + ':' + b[1]; }).join(' ') : ''].map(csvCell).join(',')); });
  return L.join('\r\n');
}

/* ---------- 老師：主繪製 ---------- */
function render(){
  if(JOIN){ renderStu(); return; }
  var h;
  if(!G || V.home) h = homeView();
  else if(G.stage === 'setup') h = setupView();
  else if(G.stage === 'play') h = playView();
  else h = endView();
  $('app').innerHTML = h;
  if(G && !V.home && NET.want){ if($('qrJoin')) drawQR('qrJoin', 170); }
  if(G && G.stage === 'play') T.paintLive();
}
function readCfg(){
  var num = function(id, lo, hi, d){ var v = parseFloat(($(id) || {}).value); return isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d; };
  var c = G.cfg;
  return {teams:Math.round(num('cTeams', 2, 12, c.teams)), budget:Math.round(num('cBudget', 50, 99999, c.budget)), size:Math.round(num('cSize', 4, A.RES.length, c.size)), inc:Math.round(num('cInc', 1, 1000, c.inc)), engSec:Math.round(num('cEng', 5, 60, c.engSec)), sealSec:Math.round(num('cSeal', 10, 300, c.sealSec)), dutchEvery:num('cDutch', .5, 10, c.dutchEvery)};
}
function applyCfg(re){
  var n = readCfg(), c = G.cfg, rebuild = re || n.teams !== c.teams || n.size !== c.size;
  Object.assign(c, n);
  if(rebuild){ G.deck = A.makeDeck(c, G.seed = A.digits(12)); }
  G.teams = mkTeams(c);
  lsSet('cfg', JSON.stringify({teams:c.teams, size:c.size, fmt:c.fmt, inc:c.inc, engSec:c.engSec, sealSec:c.sealSec, dutchEvery:c.dutchEvery}));
  saveG(); T.push();
}

/* ---------- 事件 ---------- */
document.addEventListener('click', function(e){
  var el = e.target.closest('button,a[data-act]');
  if(!el) return;
  var ds = el.dataset;
  if(ds.fontsize){ lsSet('fs', ds.fontsize); applyView(); openSettings(); return; }
  if(JOIN){ if(S.click(el, ds)) return; }
  else if(G && !V.home){
    if(ds.cfg){ applyCfg(false); G.cfg[ds.cfg] = ds.v; G.deck.forEach(function(l, i){ l.fmt = ds.v === 'mix' ? A.FMT_ORDER[i % 4] : ds.v; }); saveG(); render(); return; }
    if(ds.up != null){ var i = +ds.up, d = G.deck; var t = d[i - 1]; d[i - 1] = d[i]; d[i] = t; saveG(); render(); return; }
    if(ds.del != null){ G.deck.splice(+ds.del, 1); G.cfg.size = G.deck.length; saveG(); render(); return; }
    if(ds.man){ var n = +ds.man, L = G.lot, err;
      if(L && L.fmt === 'e'){ var ma = $('manAmt'), amt = numOf(ma) || A.minBid(L, G.cfg.inc); err = T.bid(n, amt, '現場'); }
      else err = T.bid(n, 'D', '現場');
      if(err) toast(err); return; }
  }
  var a = ds.act; if(!a) return;
  if(el.tagName === 'A' && el.getAttribute('href') === '#') e.preventDefault();
  if(ACT[a]) ACT[a](el);
});
document.addEventListener('change', function(e){
  var t = e.target;
  if(JOIN) return;
  if(t.dataset && t.dataset.lotfmt != null){ G.deck[+t.dataset.lotfmt].fmt = t.value; saveG(); return; }
  if(t.id === 'addRes' && t.value !== ''){ G.deck.push({res:+t.value, fmt:G.cfg.fmt === 'mix' ? A.FMT_ORDER[G.deck.length % 4] : G.cfg.fmt}); G.cfg.size = G.deck.length; saveG(); render(); return; }
  if(/^c(Teams|Size)$/.test(t.id)){ applyCfg(true); var sb = A.suggestBudget(G.deck, G.cfg.teams); G.cfg.budget = sb; G.teams = mkTeams(G.cfg); saveG(); T.push(); render(); return; }
  if(/^c(Budget|Inc|Eng|Seal|Dutch)$/.test(t.id)){ applyCfg(false); render(); }
});
document.addEventListener('toggle', function(e){ if(e.target.id === 'manualBox') lsSet('manualOpen', e.target.open ? '1' : '0'); }, true);
$('modal').addEventListener('click', function(e){ if(e.target.id === 'modal') closeModal(); });
document.addEventListener('keydown', function(e){
  if(e.key === 'Escape') closeModal();
  // 老師快捷鍵：空白鍵＝開始／落槌／下一項
  if(!JOIN && G && G.stage === 'play' && e.key === ' ' && !/INPUT|SELECT|TEXTAREA|BUTTON/.test((e.target.tagName || '')) && !$('modal').classList.contains('show')){
    e.preventDefault(); var L = G.lot; if(!L) return;
    if(L.ph === 1) T.open(); else if(L.ph === 2) T.close(); else T.next();
  }
});
var ACT = {
  close:closeModal, warn:function(){ showWarn(); }, settings:openSettings, install:function(){ closeModal(); install(); },
  home:function(){ closeModal(); V.home = true; render(); window.scrollTo(0, 0); },
  resume:function(){ V.home = false; ensureNet(); render(); },
  newSetup:function(){
    if(G && G.stage === 'play' && !V.confirmNew){ V.confirmNew = true; openModal('<h2>開新的一場？</h2><p>進行中的拍賣會會被取代（結果不會保留）。</p><div class="stack"><button class="btn red" data-act="newSetupYes">開新的一場</button><button class="btn alt" data-act="close">取消</button></div>'); V.confirmNew = false; return; }
    ACT.newSetupYes();
  },
  newSetupYes:function(){ closeModal(); var room = G ? G.room : null; G = newGame({}, room); V.home = false; saveG(); ensureNet(); T.push(); render(); window.scrollTo(0, 0); },
  again:function(){ var c = Object.assign({}, G.cfg); var room = G.room; G = newGame(c, room); G.cfg.budget = c.budget; G.teams = mkTeams(G.cfg); saveG(); T.push(); render(); window.scrollTo(0, 0); toast('同一個代碼，學生不用重新加入'); },
  sugBudget:function(){ applyCfg(false); G.cfg.budget = A.suggestBudget(G.deck, G.cfg.teams); G.teams = mkTeams(G.cfg); saveG(); T.push(); render(); },
  reshuffle:function(){ applyCfg(true); G.cfg.size = G.deck.length; saveG(); render(); },
  startAuction:function(){ applyCfg(false); if(!G.deck.length) return; G.stage = 'play'; G.log = []; G.teams = mkTeams(G.cfg); T.load(0); ensureNet(); T.push(); tableSoon(200); saveG(); render(); window.scrollTo(0, 0); },
  openLot:function(){ T.open(); }, closeLot:function(){ T.close(); }, nextLot:function(){ T.next(); }, undoLot:function(){ T.undo(); }, skipLot:function(){ T.skip(); },
  addTime:function(){ var L = G.lot; if(L && L.ph === 2){ L.until = Math.max(L.until, Date.now()) + 10000; T.push(); saveSoon(); } },
  manSeal:function(){ var n = 0, errs = []; document.querySelectorAll('[data-seal]').forEach(function(inp){ if(!numOf(inp)) return; var err = T.bid(+inp.dataset.seal, numOf(inp), '現場'); if(err) errs.push(err); else n++; inp.value = ''; }); toast(errs.length ? errs[0] : '已收到 ' + n + ' 組的出價'); },
  fmtHelp:function(el){ var f = A.FMTS[el.dataset.f]; openModal('<h2>' + f.ic + ' ' + f.n + '（' + f.s + '）</h2><p style="font-size:1.15rem">' + esc(f.d) + '</p>' + fmtTips(el.dataset.f) + '<div class="stack"><button class="btn" data-act="close">知道了</button></div>'); },
  rules:function(){ openModal(rulesHtml(), true); },
  room:function(){ if(!NET.want){ ACT.netOn(); return; } openModal('<h2>📱 讓學生加入</h2>' + joinBoxHtml(false) + '<div class="stack"><button class="btn alt" data-act="close">關閉</button></div>', true); drawQR('qrJoin', 200); },
  bigQR:function(){ if(!NET.want) return; openModal('<div style="text-align:center"><h2>📱 掃描加入拍賣會</h2><div class="qr" id="qrBig"></div><div style="font-family:var(--serif);font-size:3.4rem;letter-spacing:.14em;color:var(--wine)">' + esc(NET.code) + '</div><p class="small">或打開 ' + esc(ONLINE.replace('https://', '')) + ' 輸入代碼</p><button class="btn" data-act="close">關閉</button></div>', true); drawQR('qrBig', Math.min(420, window.innerWidth - 80, window.innerHeight - 260)); },
  netOn:function(){ lsSet('net', '1'); ensureNet(true); render(); },
  netOff:function(){ openModal('<h2>🚪 關閉教室？</h2><p>所有學生會離線，舊的 QR code 和連結從此失效。之後再開放會換一個新代碼。</p><div class="stack"><button class="btn red" data-act="netOffYes">關閉教室</button><button class="btn alt" data-act="close">取消</button></div>'); },
  netOffYes:function(){ closeModal(); netStop(true); lsSet('net', '0'); T.members = {}; G.room = A.newRoom(); saveG(); render(); },
  copyJoin:function(){ copyText(roomUrl(NET.code), '加入連結已複製'); },
  csv:function(){ download('拍賣結果_' + new Date().toISOString().slice(0, 10) + '.csv', resultCsv()); },
  print:function(){ window.print(); },
  wipeAll:function(){ openModal('<h2>確定嗎？</h2><p>拍賣會進度、設定都會刪掉，無法復原（字體與音效設定會保留）。</p><div class="stack"><button class="btn red" data-act="wipeAllYes">清除全部資料</button><button class="btn alt" data-act="close">取消</button></div>'); },
  wipeAllYes:function(){
    if(NET.want) netStop(NET.role === 'T');
    var keep = {fs:1, fold:1, warnSeen:1, marquee:1, mute:1};
    try{ Object.keys(localStorage).forEach(function(k){ if(k.indexOf(PFX) === 0 && !keep[k.slice(PFX.length)]) localStorage.removeItem(k); }); }catch(e){}
    G = null; V.home = true; closeModal(); render(); toast('資料已清除');
  },
  mute:function(){ lsSet('mute', lsGet('mute') === '1' ? '0' : '1'); openSettings(); },
  foldall:function(){ var all = document.querySelectorAll('.set-sec'), any = [].some.call(all, function(d){ return !d.open; }); all.forEach(function(d){ d.open = any; }); }
};
function ensureNet(force){
  if(JOIN || !G) return;
  if(NET.want && NET.code === G.room) return;
  if(!force && lsGet('net') === '0') return;
  if(NET.want) netStop();
  NET.state = 'T|0'; netStart(G.room); T.push();
}
function fmtTips(f){
  var t = {e:'策略提示：先想好「最多願意出多少」，超過就停手。現場氣氛很容易讓人多喊兩口。', s:'策略提示：出價要在「值多少」與「別人可能出多少」之間取捨，出太高就付太多，出太低就搶不到。', v:'策略提示：因為付的是第二高的價錢，照你心中真正的價值出價通常最好——出比較低只會讓你可能搶不到，卻不會讓你付比較少。', d:'策略提示：價錢一直往下掉，等越久越便宜，但別組可能先按。心裡要有一個「降到這裡就按」的價錢。'};
  return '<p class="alert ok">' + t[f] + '</p>';
}
function rulesHtml(){
  var c = G ? G.cfg : DEF_CFG, nch = G ? G.deck.filter(function(l){ return A.RES[l.res].cat === 'ch'; }).length : 5;
  return '<h2>📜 拍賣會規則</h2><ol class="rules">' +
    '<li>每組有 <b>' + money(c.budget || 0) + ' 萬</b> 創業金，用來競標 <b>' + (G ? G.deck.length : c.size) + '</b> 項創業資源。</li>' +
    '<li>每項資源只公布<b>估值區間</b>，<b>真實價值最後才公布</b>。</li>' +
    '<li><b>企業價值＝剩下的現金＋資源的真實價值</b>。沒花的錢也算數，付太多就是虧。</li>' +
    '<li>🚪 <b>通路只有 ' + nch + ' 個</b>（店面、專櫃、網店、攤位）。沒有任何通路的組，資源價值<b>打五折</b>。</li>' +
    '<li>🧩 湊成指定組合（例如主廚＋中央廚房）另外加分；資源涵蓋 4 類＋10%、5 類＋20%。</li>' +
    '<li>同一組的人都可以用手機出價，算同一筆錢。出價不能超過剩下的資金。</li></ol>' +
    '<div class="fmtgrid">' + A.FMT_ORDER.map(function(f){ var x = A.FMTS[f]; return '<div><b>' + x.ic + ' ' + x.n + '</b><br>' + esc(x.d) + '</div>'; }).join('') + '</div>' +
    '<div class="stack"><button class="btn" data-act="close">開始吧！</button></div>';
}

/* ---------- 警語、設定、安裝 ---------- */
var WARN_HTML = '<h2>⚠ 使用警語</h2><ul>' +
  '<li>這是教學用的競標遊戲。拍品的<b>估值、真實價值、組合加成都是遊戲設定</b>，不代表真實的店面租金、人才薪資或廣告效果。</li>' +
  '<li>手機連線借用「創業島」的轉播站，只傳送組別、出價金額，以及學生自己填的學號或姓名（最多 8 個字）。<b>學生只看得到老師的畫面</b>，看不到其他同學。轉播站不儲存任何資料，離線就消失。</li>' +
  '<li>請提醒學生<b>不要填身分證字號、電話等個人資料</b>，填學號或暱稱就好。</li>' +
  '<li>拍賣會進度、設定只存在老師這台電腦的瀏覽器。清除瀏覽器資料就會不見；需要留存請下載結果 CSV。</li>' +
  '<li>手機出價受網路影響可能有延遲；同時出價時以老師電腦先收到的為準。重要的比賽建議搭配「現場代按」。</li></ul>';
function showWarn(){ openModal(WARN_HTML + '<div class="stack"><button class="btn" data-act="close">我知道了</button></div>'); }
function sec(id, title, val, body){ return '<details class="set-sec" data-sec="' + id + '"><summary><span class="sst">' + title + '</span><span class="ssv">' + esc(val) + '</span></summary><div class="set-body">' + body + '</div></details>'; }
function openSettings(){
  var muted = lsGet('mute') === '1';
  var h = '<div class="top"><h2 style="flex:1 1 0">⚙ 常用設定</h2><button class="ibtn" style="color:var(--ink);border-color:var(--line)" data-act="foldall">全部展開／收合</button></div>' +
    sec('view', '顯示', lsGet('fs') === 'xl' ? '大字（投影用）' : '標準字', '<div class="stack"><button class="btn' + (lsGet('fs') === 'xl' ? ' alt' : '') + '" data-fontsize="m">標準字</button><button class="btn' + (lsGet('fs') === 'xl' ? '' : ' alt') + '" data-fontsize="xl">大字（投影用）</button></div>') +
    sec('sound', '音效', muted ? '關閉' : '開啟', '<div class="stack"><button class="btn alt" data-act="mute">' + (muted ? '🔊 打開音效' : '🔇 關閉音效') + '</button></div><p class="small">出價、倒數、落槌的提示音（瀏覽器合成，不載入音檔）。</p>') +
    (JOIN ? '' : sec('net', '手機連線', NET.want ? '代碼 ' + NET.code : '關閉', '<p class="small">借用創業島轉播站的教室模式，學生只看得到老師。</p><div class="stack">' + (NET.want ? '<button class="btn red" data-act="netOff">🚪 關閉教室（換新代碼）</button>' : '<button class="btn" data-act="netOn">📱 開放手機加入</button>') + '</div>')) +
    (JOIN ? '' : sec('wipe', '🧹 清除全部資料', '', '<p class="small">清掉這台電腦上的拍賣會進度與設定。字體與音效設定會保留。</p><div class="stack"><button class="btn red" data-act="wipeAll">清除全部資料</button></div>')) +
    sec('about', '關於本工具', '', '<p>👤 創作者 Mark Tsai（蔡豐全）<br><a href="mailto:tsaimark@gmail.com">tsaimark@gmail.com</a></p><div class="stack"><a class="btn alt" href="manual.html">📖 操作手冊</a><a class="btn alt" href="manual.html#creator">👤 創作者資訊</a><button class="btn alt" data-act="warn">⚠ 使用警語</button>' +
      (standalone ? '' : '<button class="btn alt" data-act="install">📲 加入主畫面</button>') + '</div><p class="small" style="margin-top:.5rem">訪客數 <img src="https://visitor-badge.laobi.icu/badge?page_id=m255525.classroomauctiongame" alt="訪客次數" height="20" loading="lazy" style="vertical-align:middle"></p>') +
    '<div class="stack"><button class="btn" data-act="close">關閉</button></div>';
  openModal(h);
  var open = lsJson('fold', []);
  document.querySelectorAll('.set-sec').forEach(function(d){ d.open = open.indexOf(d.dataset.sec) >= 0; d.addEventListener('toggle', saveFold); });
}
function saveFold(){ var o = []; document.querySelectorAll('.set-sec').forEach(function(d){ if(d.open) o.push(d.dataset.sec); }); lsSet('fold', JSON.stringify(o)); }
function applyView(){ document.documentElement.dataset.fs = lsGet('fs') === 'xl' ? 'xl' : 'm'; }
function install(){
  if(window._dp){ window._dp.prompt(); window._dp = null; return; }
  openModal('<h2>📲 加入主畫面</h2><ul><li><b>iPhone／iPad（Safari）</b>：按下方「分享」→「加入主畫面」。</li><li><b>Android（Chrome）</b>：右上角「⋮」→「安裝應用程式」或「加到主畫面」。</li><li><b>電腦（Chrome／Edge）</b>：網址列右邊的安裝圖示。</li></ul><div class="stack"><button class="btn" data-act="close">知道了</button></div>');
}

/* =====================================================================
   學生（手機）端
   ===================================================================== */
var S = {
  code:'', who:'', team:0, tid:'', T:null, until:0, gid:'', teamsN:0, inc:10, table:{}, parts:{}, vals:{}, vparts:{}, my:null, closed:0, askWho:false, pickTeam:false, flash:'',
  myName:function(){ return S.my && S.T && S.T.k === 'lot' && S.my.lid === S.T.lid && S.T.ph === 2 ? A.encS({k:'bid', lid:S.my.lid, team:S.team, amt:S.my.amt, who:S.who}) : A.encS({k:'join', team:S.team, who:S.who}); },
  start:function(code){
    S.code = code; S.who = lsGet('who') || ''; S.team = +(lsGet('team.' + code) || 0); S.closed = 0;
    S.askWho = !S.who; netStart(code); renderStu();
  },
  onPeer:function(id, name){
    var t = A.decT(name); if(!t) return;
    S.tid = id;
    var prev = S.T; S.T = t;
    if(t.k === 'w'){ S.setGid(t.gid); S.teamsN = t.teams; S.inc = t.inc; }
    if(t.k === 'end') S.setGid(t.gid);
    if(t.k === 'lot'){
      if(t.ph === 2 && t.fmt !== 'd') S.until = Date.now() + t.secs * 1000;
      if(!prev || prev.lid !== t.lid) S.flash = '';
      if(prev && prev.k === 'lot' && prev.lid === t.lid && t.ph === 2 && t.fmt === 'e' && prev.lead !== t.lead && t.lead) snd(t.lead === S.team ? 'bid' : 'tick');
      if(prev && prev.ph === 2 && (t.ph === 4 || t.ph === 5)){ snd(t.ph === 4 ? 'gavel' : 'drop'); if(t.ph === 4 && t.lead === S.team) confetti(); }
    }
    renderStu();
  },
  setGid:function(g){ if(g && g !== S.gid){ S.gid = g; S.table = {}; S.parts = {}; S.vals = {}; S.vparts = {}; S.my = null; } },
  onChat:function(m){
    if(S.tid && m.id !== S.tid) return;
    var d = A.decTable(m.text);
    if(d){ S.setGid(d.gid); if(d.gid !== S.gid) return; S.inc = d.inc; Object.keys(d.teams).forEach(function(k){ S.table[k] = d.teams[k]; }); S.teamsN = Math.max(S.teamsN, Object.keys(S.table).length); renderStu(); return; }
    var v = A.decVals(m.text);
    if(v && (!S.gid || v.gid === S.gid)){ Object.assign(S.vals, v.vals); S.vparts[v.i] = 1; S.vn = v.n; renderStu(); }
  },
  sendState:function(){ setName(S.myName()); },
  click:function(el, ds){
    if(ds.team){ S.team = +ds.team; lsSet('team.' + S.code, String(S.team)); S.pickTeam = false; S.sendState(); renderStu(); return true; }
    if(ds.bid){ S.doBid(+ds.bid); return true; }
    var a = ds.act;
    if(a === 'saveWho'){ var w = A.cleanWho(($('whoIn') || {}).value); if(!w){ toast('請輸入學號或姓名'); return true; } S.who = w; lsSet('who', w); S.askWho = false; S.sendState(); renderStu(); return true; }
    if(a === 'editWho'){ S.askWho = true; renderStu(); return true; }
    if(a === 'changeTeam'){ S.pickTeam = true; renderStu(); return true; }
    if(a === 'custBid'){ var v = numOf($('custAmt')); if(v) S.doBid(v); return true; }
    if(a === 'seal'){ var s = numOf($('sealAmt')); if(s) S.doBid(s); return true; }
    if(a === 'dutch'){ S.doBid('D'); return true; }
    if(a === 'retry'){ S.closed = 0; netStart(S.code); renderStu(); return true; }
    if(a === 'leave'){ netStop(); location.href = location.pathname + '?join'; return true; }
    if(a === 'joinCode'){ var c = String(($('codeIn') || {}).value || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); if(c.length !== 6){ toast('代碼是 6 個英文字母或數字'); return true; } history.replaceState(null, '', location.pathname + '?join=' + c); S.start(c); return true; }
    return false;
  },
  cash:function(){ var t = S.table[S.team]; return t ? t.cash : null; },
  doBid:function(amt){
    var t = S.T; if(!t || t.k !== 'lot' || t.ph !== 2) return;
    if(!S.team){ toast('請先選組別'); S.pickTeam = true; renderStu(); return; }
    var cash = S.cash();
    if(amt !== 'D'){
      if(cash != null && amt > cash){ toast('超過你們組的資金（' + wan(cash) + '）'); return; }
      if(t.fmt === 'e'){ var mb = t.lead ? t.price + S.inc : t.price; if(amt < mb){ toast('至少要出 ' + wan(mb)); return; } if(t.lead === S.team){ toast('你們已經是最高價'); return; } }
      else if(amt < A.startPrice(t.res)){ toast('至少要出 ' + wan(A.startPrice(t.res))); return; }
    } else if(cash != null && t.price > cash){ toast('資金不夠'); return; }
    S.my = {lid:t.lid, amt:amt};
    S.flash = amt === 'D' ? '已按「我要」，等老師確認…' : t.fmt === 'e' ? '已出價 ' + wan(amt) + '，等大螢幕確認' : '已送出 ' + wan(amt) + '（時間到之前可以改）';
    S.sendState(); snd('bid'); renderStu();
  }
};
function stuTop(){
  return '<div class="top noprint"><h1>🔨 創業資源大競標</h1><button class="ibtn" data-act="settings" aria-label="常用設定">⚙</button></div>';
}
function renderStu(){
  var h = '<div class="stu">' + stuTop();
  if(!S.code){
    h += '<section class="card"><h2>📱 加入拍賣會</h2><p class="lead">輸入老師投影上的 6 碼代碼。</p><div class="amtin"><input id="codeIn" maxlength="6" autocapitalize="characters" autocomplete="off" placeholder="例如 AB3K7Q" style="text-align:center;letter-spacing:.2em;text-transform:uppercase"><button class="btn gold" data-act="joinCode">加入</button></div></section>';
  } else if(S.closed){
    h += '<section class="card"><h2>' + (S.closed === 4005 ? '🚫 你已被請出這場拍賣會' : '🚪 拍賣會已關閉，或老師還沒開放') + '</h2><p class="lead">請看老師投影上的代碼是不是 <b>' + esc(S.code) + '</b>。</p><div class="go"><button class="btn gold" data-act="retry">再試一次</button><button class="btn alt" data-act="leave">輸入新代碼</button></div></section>';
  } else if(S.askWho){
    h += '<section class="card"><h2>👤 你是誰？</h2><p class="lead">填學號或姓名（最多 8 個字），老師才知道是誰出的價。不要填身分證字號或電話。</p><div class="amtin"><input id="whoIn" maxlength="8" value="' + esc(S.who) + '" placeholder="學號或姓名"><button class="btn gold" data-act="saveWho">下一步</button></div></section>';
  } else if(!S.team || S.pickTeam){
    var n = S.teamsN || 0;
    h += '<section class="card"><h2>👥 選你的組別</h2>' + (n ? '<p class="lead">同一組的人共用一筆創業金，誰都可以出價。</p><div class="tpick">' + Array.from({length:n}, function(_, i){ return '<button data-team="' + (i + 1) + '" style="background:' + tcol(i + 1) + '" aria-pressed="' + (S.team === i + 1) + '">' + tname(i + 1) + '</button>'; }).join('') + '</div>' : '<p class="lead">' + (NET.status === 'on' ? '等老師開放拍賣會…' : '連線中…') + '</p>') + '</section>';
  } else {
    h += myChip() + stuLive();
  }
  h += '<p class="small" style="text-align:center;margin-top:1rem;color:#D8BFB4">' + (S.who ? '👤 ' + esc(S.who) + '　<a href="#" data-act="editWho">改</a>　' : '') + '<span id="netChip">' + netChipHtml() + '</span>　<a href="#" data-act="warn">⚠ 使用警語</a></p></div>';
  // 老師狀態一變就會重畫：正在輸入的金額、代碼、名字要保留（別組出價時不能把你打到一半的數字洗掉）
  var lid = S.T && S.T.k === 'lot' ? S.T.lid : '', keep = {}, ae = document.activeElement, fid = ae && ae.id;
  ['sealAmt', 'custAmt', 'whoIn', 'codeIn'].forEach(function(id){ var el = $(id); if(el && el.dataset.dirty) keep[id] = {v:el.value, lid:el.dataset.lid, sel:selOf(el)}; });
  $('app').innerHTML = h;
  Object.keys(keep).forEach(function(id){ var el = $(id); if(el && (keep[id].lid === lid || !/Amt$/.test(id))){ el.value = keep[id].v; el.dataset.dirty = '1'; } });
  ['sealAmt', 'custAmt'].forEach(function(id){ var el = $(id); if(el) el.dataset.lid = lid; });
  if(fid && $(fid)){ try{ $(fid).focus({preventScroll:true}); }catch(e){} if(keep[fid]) setSel($(fid), keep[fid].sel); }
  stuTick();
}
document.addEventListener('input', function(e){ if(JOIN && e.target.id) e.target.dataset.dirty = '1'; });
document.addEventListener('keydown', function(e){
  if(!JOIN || e.key !== 'Enter' || !e.target.id) return;
  var m = {sealAmt:'seal', custAmt:'custBid', whoIn:'saveWho', codeIn:'joinCode'}[e.target.id];
  if(m){ var b = document.querySelector('[data-act="' + m + '"]'); if(b) b.click(); }
});
function myChip(){
  var t = S.table[S.team], cash = t ? t.cash : null;
  return '<div class="mychip">' + tdot(S.team) + '<b>' + tname(S.team) + '</b> <a href="#" data-act="changeTeam" style="font-size:.8rem">換組</a><span class="cash">' + (cash == null ? '—' : money(cash) + '<small style="font-size:.6em"> 萬</small>') + '</span></div>' +
    (t && t.items.length ? '<div class="small" style="color:#EBD9CF;margin-top:.3rem">已得標：' + t.items.map(function(r){ return A.RES[r].ic + ' ' + A.RES[r].n; }).join('、') + '</div>' : '');
}
function stuLive(){
  var t = S.T;
  if(!t || t.k === 'idle' || t.k === 'w') return '<section class="card"><div class="bigstate">⏳ 等老師開始</div><p class="lead" style="text-align:center">你在 ' + tname(S.team) + '。拍賣開始後，這裡會出現拍品和出價按鈕。</p></section>';
  if(t.k === 'end'){
    var mine = S.table[S.team], have = Object.keys(S.vals).length && S.vn && Object.keys(S.vparts).length >= S.vn;
    if(!mine) return '<section class="card"><div class="bigstate">🏁 拍賣結束</div><p class="lead" style="text-align:center">請看大螢幕公布結果。</p></section>';
    if(!have) return '<section class="card"><div class="bigstate">🏁 拍賣結束</div><p class="lead" style="text-align:center">真實價值公布中…請看大螢幕。</p></section>';
    var s = A.scoreTeam(mine.items, mine.cash, S.vals);
    return '<section class="card"><div class="bigstate">🏁 ' + tname(S.team) + ' 企業價值</div><div class="sprice"><div class="pv">' + money(s.total) + '<small style="font-size:.4em"> 萬</small></div></div>' +
      '<ul class="blog" style="padding:0;max-height:none">' + mine.items.map(function(r){ return '<li>' + A.RES[r].ic + ' ' + esc(A.RES[r].n) + '<span class="amt">真實價值 ' + wan(S.vals[r] || 0) + '</span></li>'; }).join('') +
      '<li>💰 剩下的現金<span class="amt">' + wan(s.cash) + '</span></li>' + (s.comboSum ? '<li>🧩 組合加成<span class="amt">+' + money(s.comboSum) + '</span></li>' : '') + (s.divBonus ? '<li>🌈 多元加成<span class="amt">+' + money(s.divBonus) + '</span></li>' : '') + (s.penalty ? '<li>🚪 沒有通路<span class="amt neg">−' + money(s.penalty) + '</span></li>' : '') + '</ul><p class="small">名次請看大螢幕。</p></section>';
  }
  var x = A.RES[t.res], f = A.FMTS[t.fmt], cash = S.cash();
  var h = '<section class="card"><div class="slot"><div class="big-ic">' + x.ic + '</div><div><h2>' + esc(x.n) + '</h2>' + catChip(x.cat) + ' <span class="small">估值 ' + x.lo + '～' + x.hi + ' 萬</span></div></div><p class="small" style="margin:.4rem 0 0">' + f.ic + ' <b>' + f.n + '</b>：' + esc(f.d) + '</p>';
  if(t.ph === 1) return h + '<div class="bigstate">⏳ 即將開始</div><p class="small" style="text-align:center">想好你們最多願意出多少。</p></section>';
  if(t.ph === 4) return h + '<div class="sold"><span class="st">成交</span><div class="bigstate" style="color:' + tcol(t.lead) + '">' + (t.lead === S.team ? '🎉 你們得標了！' : tname(t.lead) + ' 得標') + '</div><div class="pl" style="text-align:center">成交價 ' + wan(t.price) + '</div></div></section>';
  if(t.ph === 5) return h + '<div class="sold"><span class="st no">流標</span></div></section>';
  // 競標中
  var flash = S.flash && S.my && S.my.lid === t.lid ? '<div class="alert ok">' + esc(S.flash) + '</div>' : '';
  if(t.fmt === 'e'){
    var mb = t.lead ? t.price + S.inc : t.price, leadMe = t.lead === S.team, can = !leadMe && (cash == null || cash >= mb);
    h += '<div class="sprice"><div class="pl">' + (t.lead ? '目前最高價・' + (leadMe ? '<b style="color:var(--good)">你們領先！</b>' : tname(t.lead)) : '起標價') + '</div><div class="pv">' + money(t.price) + '<small style="font-size:.4em"> 萬</small></div><div class="pl">倒數 <b id="scd">—</b> 秒</div></div>';
    h += '<button class="btn gold bidmain" data-bid="' + mb + '"' + (can ? '' : ' disabled') + '>🙋 出 ' + wan(mb) + '</button>';
    h += '<div class="bidrow">' + [2, 5, 10].map(function(k){ var v = (t.lead ? t.price : t.price - S.inc) + S.inc * k; return '<button class="btn" data-bid="' + v + '"' + (!leadMe && (cash == null || cash >= v) ? '' : ' disabled') + '>' + money(v) + '</button>'; }).join('') + '</div>';
    h += '<div class="amtin"><input type="text" id="custAmt" inputmode="numeric" pattern="[0-9]*" autocomplete="off" placeholder="自己輸入金額"><button class="btn alt" data-act="custBid">出價</button></div>';
    return h + flash + '</section>';
  }
  if(t.fmt === 's' || t.fmt === 'v'){
    var mine2 = S.my && S.my.lid === t.lid ? S.my.amt : '';
    h += '<div class="sprice"><div class="pl">' + t.lead + ' 組已出價・剩 <b id="scd">—</b> 秒</div></div><p class="small">' + (t.fmt === 'v' ? '最高價得標，但只付第二高的價錢。照你心中真正的價值出價。' : '最高價得標，付自己出的價錢。別人看不到你出多少。') + '最低 ' + wan(A.startPrice(t.res)) + (cash != null ? '，最多 ' + wan(cash) : '') + '。</p>' +
      '<div class="amtin"><input type="text" id="sealAmt" inputmode="numeric" pattern="[0-9]*" autocomplete="off" value="' + mine2 + '" placeholder="你們的出價（萬）"><button class="btn gold" data-act="seal">✉️ ' + (mine2 ? '修改' : '送出') + '</button></div>';
    return h + flash + '</section>';
  }
  h += '<div class="sprice"><div class="pl">現在價錢（一直往下降）</div><div class="pv">' + money(t.price) + '<small style="font-size:.4em"> 萬</small></div></div><button class="btn red bidmain" data-act="dutch"' + (cash != null && cash < t.price ? ' disabled' : '') + '>✋ 我要！</button><p class="small" style="text-align:center">第一個按的組，用現在的價錢得標。</p>';
  return h + flash + '</section>';
}
function stuTick(){ var el = $('scd'); if(el) el.textContent = Math.max(0, Math.ceil((S.until - Date.now()) / 1000)); }

/* ---------- 跑馬燈（工作區共用公告，不可關） ---------- */
function initMarquee(){
  var URL_ = "https://script.google.com/macros/s/AKfycbwKX0DNNbY8y4nf90BFTHtxgfqJcHHcZasRrgycl4QAe52_hkjMWSkYk4xOsqU-JPCROw/exec";
  var REFRESH = 20 * 60 * 1000, bar = $('marqueeBar'), track = $('marqueeTrack'), lastKey = null;
  function appendText(c, text){ var re = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, li = 0, m; while((m = re.exec(text))){ if(m.index > li) c.appendChild(document.createTextNode(text.slice(li, m.index))); var a = document.createElement('a'); a.href = m[2]; a.textContent = m[1]; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.style.color = 'inherit'; a.style.textDecoration = 'underline'; c.appendChild(a); li = re.lastIndex; } if(li < text.length) c.appendChild(document.createTextNode(text.slice(li))); }
  function renderM(items){
    if(!items || !items.length) return;
    var k = JSON.stringify(items); if(k === lastKey) return; lastKey = k; track.innerHTML = '';
    var fr = document.createDocumentFragment();
    function pass(){ items.forEach(function(it, i){ if(i > 0) fr.appendChild(document.createTextNode('　★　')); appendText(fr, String(it)); }); }
    pass(); fr.appendChild(document.createTextNode('　★　')); pass(); track.appendChild(fr);
    bar.classList.add('show'); document.body.classList.add('has-marquee');
    track.style.animationDuration = Math.max(track.scrollWidth / 2 / 60, 12) + 's';
  }
  function fetchM(){ fetch(URL_, {method:'POST', body:JSON.stringify({serial:''})}).then(function(r){ return r.json(); }).then(function(d){ if(d && Array.isArray(d.marquee) && d.marquee.length){ lsSet('marquee', JSON.stringify(d.marquee)); renderM(d.marquee); } }).catch(function(){}); }
  renderM(lsJson('marquee', [])); fetchM(); setInterval(fetchM, REFRESH);
}

window.addEventListener('beforeinstallprompt', function(e){ e.preventDefault(); window._dp = e; });
if('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('service-worker.js').catch(function(){});
(function(){ if(!window.SOC_WATERMARK) return; var w = document.createElement('div'); w.id = 'printWm'; w.setAttribute('aria-hidden', 'true'); w.innerHTML = '<img alt="" src="' + window.SOC_WATERMARK + '">'; document.body.appendChild(w); })();
applyView();
if(JOIN){
  var jc = String(QS.get('join') || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if(jc.length === 6) S.start(jc); else renderStu();
  setInterval(stuTick, 250);
} else {
  if(G && !V.home) ensureNet();
  if(G) ensureNet();
  render();
  setInterval(T.tick, 200);
  if(!lsGet('warnSeen')){ lsSet('warnSeen', '1'); showWarn(); }
}
initMarquee();
window.addEventListener('pagehide', function(){ saveG(); });
window._cab = {get G(){ return G; }, set G(v){ G = v; }, T:T, S:S, NET:NET, ACT:ACT, render:render, V:V};
})();
