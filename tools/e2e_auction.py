# 端對端：老師分頁＋3 支學生手機（各自獨立的瀏覽器 context），連正式轉播站的隨機 BID 房間
# 用法：python tools/e2e_auction.py <截圖資料夾>（需先開 http://127.0.0.1:8879）
import sys, io, os, json
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', line_buffering=True)
from playwright.sync_api import sync_playwright
OUT = sys.argv[1]; os.makedirs(OUT, exist_ok=True)
BASE = 'http://127.0.0.1:8879/'
errs, fails = [], []
def check(c, msg):
    print(('ok   ' if c else 'FAIL ') + msg)
    if not c: fails.append(msg)
def stub(pg):
    pg.route('**/script.google.com/**', lambda r: r.fulfill(status=200, body='{"marquee":["測試公告：跑馬燈正常"]}', headers={'content-type': 'application/json'}))
    pg.route('**/visitor-badge.laobi.icu/**', lambda r: r.fulfill(status=200, body='', headers={'content-type': 'image/svg+xml'}))
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('console', lambda m: m.type == 'error' and errs.append(m.text))

with sync_playwright() as p:
    b = p.chromium.launch()
    tc = b.new_context(viewport={'width': 1366, 'height': 900})
    t = tc.new_page(); stub(t)
    t.goto(BASE); t.wait_for_timeout(600)
    t.screenshot(path=os.path.join(OUT, '01_warn.png'))
    t.click('#modal .btn'); t.screenshot(path=os.path.join(OUT, '02_home.png'), full_page=True)
    t.click('[data-act=newSetup]'); t.wait_for_timeout(300)
    t.fill('#cTeams', '3'); t.dispatch_event('#cTeams', 'change')
    t.fill('#cSize', '4'); t.dispatch_event('#cSize', 'change')
    t.fill('#cEng', '5'); t.dispatch_event('#cEng', 'change')
    g = t.evaluate('_cab.G')
    check(len(g['deck']) == 4, 'deck size 4')
    chs = t.evaluate("_cab.G.deck.filter(l => AUC.RES[l.res].cat === 'ch').length")
    check(chs == 2, 'channels = teams-1 (2), got %s' % chs)
    check([l['fmt'] for l in g['deck']] == ['e', 's', 'v', 'd'], 'mix formats in order')
    t.wait_for_function('_cab.NET.status === "on"', timeout=15000)
    code = t.evaluate('_cab.NET.code'); print('room', code)
    t.screenshot(path=os.path.join(OUT, '03_setup.png'), full_page=True)

    studs = []
    for i in range(3):
        c = b.new_context(viewport={'width': 375, 'height': 740}, has_touch=True, is_mobile=True)
        s = c.new_page(); stub(s)
        s.goto(BASE + '?join=' + code); s.wait_for_timeout(500)
        s.fill('#whoIn', 'S11%02d' % (i + 1)); s.click('[data-act=saveWho]')
        try:
            s.wait_for_selector('[data-team="3"]', timeout=15000)
        except Exception:
            print('DEBUG stu', i, s.evaluate('JSON.stringify({T:_cab.S.T, n:_cab.S.teamsN, st:_cab.NET.status, closed:_cab.S.closed, ask:_cab.S.askWho, team:_cab.S.team, peers:_cab.NET.peers})'))
            print('DEBUG teacher', t.evaluate('JSON.stringify({st:_cab.NET.status, state:_cab.NET.state, peers:_cab.NET.peers})'))
            s.screenshot(path=os.path.join(OUT, 'debug_stu.png')); raise
        if i == 0: s.screenshot(path=os.path.join(OUT, '10_stu_team.png'))
        s.click('[data-team="%d"]' % (i + 1))
        studs.append(s)
    t.wait_for_function('Object.values(_cab.T.members).filter(m => m.team > 0).length >= 3', timeout=15000)
    members = t.evaluate('Object.values(_cab.T.members).map(m => m.team + ":" + m.who).sort()')
    check(members == ['1:S1101', '2:S1102', '3:S1103'], 'teacher sees members %s' % members)
    budget = t.evaluate('_cab.G.cfg.budget')

    # 開始
    t.click('[data-act=startAuction]'); t.wait_for_timeout(300)
    for s in studs: s.wait_for_function('_cab.S.table[1] && _cab.S.table[1].cash === %d' % budget, timeout=15000)
    check(True, 'students got budget table %d' % budget)

    # 第 1 項：公開喊價
    t.click('[data-act=openLot]')
    s1, s2, s3 = studs
    s1.wait_for_selector('.bidmain:not([disabled])', timeout=10000)
    s1.screenshot(path=os.path.join(OUT, '11_stu_english.png'))
    start = t.evaluate('_cab.G.lot.price')
    s1.click('.bidmain'); t.wait_for_function('_cab.G.lot.lead === 1', timeout=8000)
    check(t.evaluate('_cab.G.lot.price') == start, 'first bid = start price')
    s2.wait_for_function('_cab.S.T && _cab.S.T.lead === 1', timeout=8000)
    s2.click('.bidmain'); t.wait_for_function('_cab.G.lot.lead === 2', timeout=8000)
    inc = t.evaluate('_cab.G.cfg.inc')
    check(t.evaluate('_cab.G.lot.price') == start + inc, 'second bid +inc')
    # 領先的組不能再加
    s2.wait_for_function('_cab.S.T.lead === 2', timeout=8000)
    check(s2.is_disabled('.bidmain'), 'leader button disabled')
    # 現場代按：第 3 組出指定金額
    t.click('#manualBox summary')
    t.fill('#manAmt', str(start + inc * 5)); t.click('[data-man="3"]')
    check(t.evaluate('_cab.G.lot.lead') == 3 and t.evaluate('_cab.G.lot.price') == start + inc * 5, 'manual bid team 3')
    # 太低的手機出價會被擋（s1 送舊金額）
    t.evaluate('_cab.T.bid(1, %d, "x")' % (start + inc))
    check(t.evaluate('_cab.G.lot.lead') == 3, 'low bid rejected')
    t.screenshot(path=os.path.join(OUT, '04_english.png'), full_page=True)
    # 等倒數自然落槌（5 秒）
    t.wait_for_function('_cab.G.lot.ph === 4', timeout=25000)
    p1 = start + inc * 5
    check(t.evaluate('_cab.G.teams[2].cash') == budget - p1, 'team 3 paid')
    t.screenshot(path=os.path.join(OUT, '05_sold.png'), full_page=True)
    s3.wait_for_function('_cab.S.T.ph === 4', timeout=8000)
    s3.screenshot(path=os.path.join(OUT, '12_stu_won.png'))
    s3.wait_for_function('_cab.S.table[3] && _cab.S.table[3].cash === %d' % (budget - p1), timeout=15000)
    check(True, 'student 3 sees new cash')

    # 第 2 項：密封
    t.click('[data-act=nextLot]'); t.click('[data-act=openLot]')
    lot = t.evaluate('_cab.G.lot'); check(lot['fmt'] == 's', 'lot2 sealed')
    sp = t.evaluate('AUC.startPrice(_cab.G.lot.res)')
    for s, amt in ((s1, sp + 30), (s2, sp + 50)):
        s.wait_for_selector('#sealAmt', timeout=8000); s.fill('#sealAmt', str(amt)); s.click('[data-act=seal]')
    try:
        t.wait_for_function('Object.keys(_cab.G.lot.sealed).length === 2', timeout=8000)
    except Exception:
        print('DEBUG lot', t.evaluate('JSON.stringify({lot:_cab.G.lot, peers:_cab.NET.peers, cash:_cab.G.teams.map(x=>x.cash)})'))
        for k, s in enumerate(studs): print('DEBUG s', k, s.evaluate('JSON.stringify({my:_cab.S.my, T:_cab.S.T, flash:_cab.S.flash, cash:_cab.S.cash(), state:_cab.NET.state})'))
        s1.screenshot(path=os.path.join(OUT, 'debug_sealed.png')); raise
    s1.screenshot(path=os.path.join(OUT, '13_stu_sealed.png'))
    # 修改出價
    s1.fill('#sealAmt', str(sp + 70)); s1.click('[data-act=seal]')
    try:
        t.wait_for_function('_cab.G.lot.sealed[1].amt === %d' % (sp + 70), timeout=8000)
    except Exception:
        print('DEBUG mod teacher', t.evaluate('JSON.stringify({lid:_cab.G.lot.lid, sealed:_cab.G.lot.sealed, peers:_cab.NET.peers})'))
        print('DEBUG mod s1', s1.evaluate('JSON.stringify({my:_cab.S.my, T:_cab.S.T, state:_cab.NET.state, st:_cab.NET.status, val:(document.getElementById("sealAmt")||{}).value})'))
        raise
    t.screenshot(path=os.path.join(OUT, '06_sealed.png'), full_page=True)
    t.click('[data-act=closeLot]')
    check(t.evaluate('_cab.G.lot.lead') == 1 and t.evaluate('_cab.G.lot.price') == sp + 70, 'sealed first-price: team1 pays own bid')

    # 第 3 項：次高價
    t.click('[data-act=nextLot]'); t.click('[data-act=openLot]')
    sp = t.evaluate('AUC.startPrice(_cab.G.lot.res)')
    for s, amt in ((s2, sp + 80), (s3, sp + 20)):
        s.wait_for_selector('#sealAmt', timeout=8000); s.fill('#sealAmt', str(amt)); s.click('[data-act=seal]')
    t.wait_for_function('Object.keys(_cab.G.lot.sealed).length === 2', timeout=8000)
    # 老師重新整理：狀態保留、重新連線、舊出價不重複
    t.reload(); t.wait_for_function('_cab.NET.status === "on"', timeout=15000); t.wait_for_timeout(1500)
    check(t.evaluate('_cab.G.lot.ph') == 2 and len(t.evaluate('Object.keys(_cab.G.lot.sealed)')) == 2, 'teacher reload keeps lot and bids')
    check(t.evaluate('_cab.NET.code') == code, 'same room after reload')
    t.click('[data-act=closeLot]')
    check(t.evaluate('_cab.G.lot.lead') == 2 and t.evaluate('_cab.G.lot.price') == sp + 20, 'vickrey: team2 pays second price')
    t.screenshot(path=os.path.join(OUT, '07_vickrey.png'), full_page=True)

    # 第 4 項：荷蘭式
    t.click('[data-act=nextLot]'); t.click('[data-act=openLot]')
    p0 = t.evaluate('_cab.G.lot.price')
    t.wait_for_function('_cab.G.lot.price < %d' % p0, timeout=8000)
    s1.wait_for_selector('[data-act=dutch]', timeout=8000)
    s1.screenshot(path=os.path.join(OUT, '14_stu_dutch.png'))
    s1.click('[data-act=dutch]')
    t.wait_for_function('_cab.G.lot.ph === 4', timeout=8000)
    check(t.evaluate('_cab.G.lot.lead') == 1 and t.evaluate('_cab.G.lot.price') < p0, 'dutch sold to team1 below start')

    # 結算
    t.click('[data-act=nextLot]'); t.wait_for_timeout(500)
    check(t.evaluate('_cab.G.stage') == 'end', 'stage end')
    t.screenshot(path=os.path.join(OUT, '08_end.png'), full_page=True)
    tot = t.evaluate('''(() => { const v = AUC.trueValues(_cab.G.deck, _cab.G.secret); return _cab.G.teams.map(x => AUC.scoreTeam(x.items, x.cash, v).total); })()''')
    for i, s in enumerate(studs):
        s.wait_for_function('_cab.S.vn && Object.keys(_cab.S.vparts).length >= _cab.S.vn', timeout=30000)
        got = s.evaluate('(() => { const m = _cab.S.table[_cab.S.team]; return AUC.scoreTeam(m.items, m.cash, _cab.S.vals).total; })()')
        check(got == tot[i], 'student %d final value %s == teacher %s' % (i + 1, got, tot[i]))
    s1.screenshot(path=os.path.join(OUT, '15_stu_end.png'), full_page=True)
    # 學生端看不到真實價值之前的祕密（secret 不在網路上）
    check(s1.evaluate('typeof _cab.G') in ('object',) and s1.evaluate('_cab.G') is None, 'student has no game secret')
    # CSV
    csv = t.evaluate('(() => { let out; const o = URL.createObjectURL; return 1; })()')
    # 版面：375 寬沒有橫向捲動
    for name, pg in (('stu', s1),):
        check(pg.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'), name + ' no horizontal overflow')
    t.set_viewport_size({'width': 375, 'height': 800}); t.wait_for_timeout(300)
    check(t.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'), 'teacher end 375 no overflow')
    t.screenshot(path=os.path.join(OUT, '09_end_375.png'), full_page=True)
    t.click('[data-act=again]'); t.wait_for_timeout(300)
    check(t.evaluate('_cab.G.stage') == 'setup' and t.evaluate('_cab.NET.code') == code, 'play again keeps room')
    check(t.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'), 'teacher setup 375 no overflow')
    s1.wait_for_function('_cab.S.T && _cab.S.T.k === "w"', timeout=10000)
    check(s1.evaluate('_cab.S.team') == 1, 'student keeps team in new game')
    # 關閉教室
    t.set_viewport_size({'width': 1366, 'height': 900})
    t.evaluate('_cab.ACT.netOffYes()')
    s1.wait_for_function('_cab.S.closed === 4004', timeout=10000)
    check(True, 'close room kicks students (4004)')
    s1.screenshot(path=os.path.join(OUT, '16_stu_closed.png'))
    b.close()
print('console errors:', [e for e in errs if 'ERR_' not in e][:10])
print('FAILS:', fails if fails else 'none')
