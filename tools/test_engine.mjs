// node tools/test_engine.mjs：檢查拍品資料、組合、出牌、結算與轉播站訊息編解碼
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const A = require('../data.js');
let fail = 0, n = 0;
const ok = (c, msg) => { n++; if (!c) { fail++; console.log('FAIL', msg); } };

// 資料
A.RES.forEach((r, i) => { ok(A.CATS[r.cat], 'cat ' + i); ok(r.lo < r.hi && r.lo >= 10 && r.hi <= 400, 'range ' + i); ok(r.bias >= 0 && r.bias <= 1 && r.vol > 0 && r.vol <= 1, 'bias ' + i); });
ok(A.RES.length <= 99, 'res fits 2 digits');
A.COMBOS.forEach((c, i) => { ok(A.RES[c.a] && A.RES[c.b] && c.a !== c.b, 'combo idx ' + i); const names = c.n.split('＋'); ok(names.length === 2, 'combo name ' + i); });
const pairs = new Set(A.COMBOS.map((c) => [c.a, c.b].sort().join('-'))); ok(pairs.size === A.COMBOS.length, 'combo unique');

// 出牌：通路數＝組數−1（上限 5）、不重複、數量正確
for (let t = 2; t <= 12; t++) for (let size = 6; size <= 16; size++) for (const fmt of ['e', 's', 'v', 'd', 'mix']) {
  const deck = A.makeDeck({ teams: t, size, fmt }, 'S' + t + size + fmt);
  ok(deck.length === size, 'deck size');
  ok(new Set(deck.map((l) => l.res)).size === size, 'deck unique');
  const ch = deck.filter((l) => A.RES[l.res].cat === 'ch').length;
  ok(ch === A.channelCount(t, size), 'channels ' + t + '/' + size + ' got ' + ch);
  ok(deck.every((l) => A.FMTS[l.fmt]), 'fmt');
  if (fmt === 'mix') ok(deck[0].fmt === 'e' && deck[1].fmt === 's' && deck[2].fmt === 'v' && deck[3].fmt === 'd', 'mix order');
  const b = A.suggestBudget(deck, t); ok(b >= 100 && b % 50 === 0, 'budget');
}
// 同種子可重現
ok(JSON.stringify(A.makeDeck({ teams: 6, size: 12, fmt: 'mix' }, 'X')) === JSON.stringify(A.makeDeck({ teams: 6, size: 12, fmt: 'mix' }, 'X')), 'deck reproducible');

// 真實價值落在區間、10 的倍數、平均接近 bias
A.RES.forEach((r, i) => {
  let s = 0; const N = 400;
  for (let k = 0; k < N; k++) { const v = A.trueValue(i, 'seed' + k); ok(v >= r.lo && v <= r.hi && v % 10 === 0, 'tv range ' + i); s += v; }
  const mean = s / N, expect = r.lo + (r.hi - r.lo) * r.bias;
  ok(Math.abs(mean - expect) < (r.hi - r.lo) * .12, 'tv mean ' + r.n + ' ' + mean.toFixed(0) + ' vs ' + expect.toFixed(0));
});

// 密封開標
const sb = { 1: { amt: 100, t: 5 }, 2: { amt: 120, t: 9 }, 3: { amt: 120, t: 3 }, 4: { amt: 5, t: 1 } };
let r = A.sealedResult(sb, 's', 10); ok(r.team === 3 && r.price === 120, 'sealed tie earliest');
r = A.sealedResult(sb, 'v', 10); ok(r.team === 3 && r.price === 120, 'vickrey second (tie)');
r = A.sealedResult({ 1: { amt: 100, t: 1 }, 2: { amt: 60, t: 2 } }, 'v', 10); ok(r.team === 1 && r.price === 60, 'vickrey second');
r = A.sealedResult({ 1: { amt: 100, t: 1 } }, 'v', 30); ok(r.price === 30, 'vickrey single pays reserve');
ok(A.sealedResult({ 1: { amt: 5, t: 1 } }, 's', 10) === null, 'below reserve unsold');
ok(A.minBid({ lead: 0, price: 50 }, 10) === 50 && A.minBid({ lead: 2, price: 50 }, 10) === 60, 'minBid');

// 結算
const vals = {}; A.RES.forEach((x, i) => { vals[i] = 100; });
let sc = A.scoreTeam([], 500, vals); ok(sc.total === 500 && sc.penalty === 0, 'empty team');
sc = A.scoreTeam([5, 15], 0, vals); ok(sc.base === 200 && sc.comboSum === 100 && sc.penalty === 150 && sc.total === 150, 'no channel penalty ' + JSON.stringify(sc));
sc = A.scoreTeam([0, 5, 15], 10, vals); ok(sc.total === 10 + 300 + 100, 'with channel');
sc = A.scoreTeam([0, 5, 10, 15, 19], 0, vals); ok(sc.cats === 5 && sc.divBonus === 100, 'diversity 20%');

// 訊息編解碼：長度 ≤24、只用安全字元、可還原
const BAD = /[cfhklmnprwxz]/i; // 避免跟數字的 leet 轉換拼出不雅字詞
for (let k = 0; k < 2000; k++) {
  const s = { k: 'lot', lid: A.digits(4), res: k % A.RES.length, fmt: 'esvd'[k % 4], ph: [1, 2, 4, 5][k % 4], price: (k * 37) % 99999, lead: k % 13, secs: k % 1000 };
  const e = A.encT(s); ok(e.length <= 24, 'encT len ' + e); ok(!BAD.test(e.slice(2)), 'encT chars ' + e);
  const d = A.decT(e); ok(d.k === 'lot' && d.lid === s.lid && d.res === s.res && d.fmt === s.fmt && d.ph === s.ph && d.price === s.price && d.lead === s.lead && d.secs === s.secs, 'decT ' + e);
}
const w = A.encT({ k: 'w', gid: '0421', teams: 12, budget: 9999, inc: 100 }); ok(w.length <= 24 && A.decT(w).teams === 12 && A.decT(w).gid === '0421', 'encT w');
ok(A.decT(A.encT({ k: 'end', gid: '1234' })).k === 'end', 'encT end');
const bs = A.encS({ k: 'bid', lid: '1234', team: 12, amt: 99999, who: '王小明同學很長的名字' }); ok(bs.length <= 24 && A.decS(bs).amt === 99999 && A.decS(bs).team === 12, 'encS ' + bs);
ok(A.decS(A.encS({ k: 'bid', lid: '1234', team: 3, amt: 'D', who: 'a|b' })).amt === 'D', 'encS dutch');
ok(A.decS(A.encS({ k: 'join', team: 4, who: 'S1102' })).team === 4, 'encS join');

// 資金表與真實價值：每則 ≤60 字、全部還原
for (let t = 2; t <= 12; t++) {
  const teams = Array.from({ length: t }, (_, i) => ({ cash: 9999 - i, items: Array.from({ length: (i * 3) % 7 }, (_, j) => (i + j * 5) % 24) }));
  const msgs = A.encTable('0042', teams, 20);
  msgs.forEach((m) => { ok(Array.from(m).length <= 60, 'table len ' + m.length); ok(!/\./.test(m), 'table no dot'); });
  const got = {}; let inc = 0;
  msgs.forEach((m) => { const d = A.decTable(m); ok(d && d.gid === '0042' && d.n === msgs.length, 'decTable ' + m); Object.assign(got, d.teams); inc = d.inc; });
  ok(inc === 20, 'table inc');
  teams.forEach((x, i) => ok(got[i + 1] && got[i + 1].cash === x.cash && JSON.stringify(got[i + 1].items) === JSON.stringify(x.items), 'table team ' + (i + 1)));
}
const deck = A.makeDeck({ teams: 8, size: 16, fmt: 'mix' }, 'V'); const tv = A.trueValues(deck, 'sec');
const vm = A.encVals('0042', tv); const vg = {};
vm.forEach((m) => { ok(Array.from(m).length <= 60, 'vals len'); const d = A.decVals(m); ok(d && d.n === vm.length, 'decVals'); Object.assign(vg, d.vals); });
ok(JSON.stringify(Object.keys(vg).sort()) === JSON.stringify(Object.keys(tv).sort()) && Object.keys(tv).every((k) => vg[k] === tv[k]), 'vals roundtrip');

console.log(fail ? fail + ' / ' + n + ' FAILED' : 'all ' + n + ' passed');
process.exit(fail ? 1 : 0);
