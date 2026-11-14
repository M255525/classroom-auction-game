# classroom-auction-game — 創業資源大競標：全班即時拍賣

課堂用的分組競標遊戲。老師開網頁投影，學生掃 QR code 用手機出價（不用 App、不用登入），也可以由老師「現場代按」。全班 2～12 組，每組同樣的創業金，競標 4～24 項創業資源（24 張拍品、5 類：通路／人才／行銷／設備／品牌）。每項只公布估值區間，**真實價值結算才公布**。教學重點：稀缺（通路＝組數−1）、機會成本（現金 1:1 算進企業價值）、贏家詛咒（寬區間拍品）、四種拍賣形式比較、組合綜效。

2026-11-14 建立。使用者從「跨距大的工具方向」清單選了 #11「全班即時拍賣」。

- 純靜態：`index.html`（CSS，酒紅絨布＋象牙卡片＋金色的拍賣行風格）＋`data.js`（拍品、組合、引擎、轉播站訊息編解碼；node 可 require）＋`app.js`（老師端 `T`、學生端 `S`、連線 `NET`）＋`watermark.js`（列印浮水印，從開店模擬複製）＋`manual.html`＋PWA。
- 本機預覽 port **8879**（`.claude/launch.json` 的 `classroom-auction-game`）。visitor-badge `m255525.classroomauctiongame`。線上網址預定 <https://m255525.github.io/classroom-auction-game/>（寫死在 `app.js` 的 `ONLINE`，QR code 在非 github.io 網址時一律指向它）。**2026-11-14 已上線**（repo 由使用者自己 `gh repo create`；先 push 後才開 Pages，`build_type=workflow`，分支規則已是 master，第一次部署直接成功）。程式牆在 `REPO_META`（不在 LOCAL_APPS），github-dashboard 已補。

## 引擎（data.js）
- 金額單位一律「萬元」。`RES` 每張：`lo/hi`（公開估值）、`bias`（真實價值大概落在區間哪裡，不公開）、`vol`（波動）。網紅合作 `bias .3 vol 1`、電視置入、獨家配方、加盟授權是刻意設計的「贏家詛咒」拍品。
- `COMBOS` 17 組兩兩加成（索引對應 `RES` 順序，**改 RES 順序要一起改**）。`scoreTeam()`：現金＋資源真實價值＋組合＋多元（4 類 +10%、5 類 +20%），有資源但沒有通路 → 資源部分（含加成）打五折。
- `makeDeck(cfg, seed)`：通路數 `channelCount()`＝組數−1（1～5，且小於拍品數），其他資源先放一半「跟已選通路有組合」的。`fmt:'mix'` 時依序 e/s/v/d 輪流。`suggestBudget()`＝估值中位數總和 ×1.3 ÷ 組數（取 50 的倍數）。
- `trueValue(res, secret)`：老師端 16 位祕密亂數 `G.secret` 決定，**不送給學生**（學生看程式碼也算不出來），結算時才用聊天送出。
- 價格：起標價／密封最低價／荷蘭式底價＝估值下限一半（`startPrice`），荷蘭式起始＝上限 ×1.4，每步約 1/24。密封同價先出價者得標；次高價只有一組出價時付底價。
- **改 data.js 後跑 `node tools/test_engine.mjs`**（約 1.9 萬項：資料、出牌通路數、真實價值分布、開標、結算、訊息長度與安全字元、資金表／真實價值分段還原）。

## 手機連線（借用創業島轉播站教室模式，Worker 沒改）
- `wss://startup-island-presence.content-workflow.workers.dev/ws?room=BID<6碼>&cls=1`（老師另帶 `tkey`，存 `cab.tkey.<碼>`）。`BID` 前綴與講師課堂小幫手的 `VOTE` 分開；教室大廳只列 VOTE 房間，這裡不會出現。學生只看得到老師。
- **狀態放 presence 的 name 欄位（≤24 字）**：老師 `T|w|gid|組數|資金|加價`、`T|<lid4>|<res2><fmt><ph>|價格|領先組(密封時＝已出價組數)|剩餘秒`（ph 1 預告／2 競標／4 成交／5 流標）、`T|9|gid`；學生 `J|組|誰`、`B|lid|組|金額或D|誰`（誰 ≤8 字）。
- **轉播站的不雅字詞過濾會把數字轉成字母**（0→o、1→i、3→e、4→a、5→s、7→t、`|`→i），命中就把整個 name 換成「旅人」。所以狀態代碼只用數字＋`T/w/e/s/v/d/J/B`，測試檢查不含 `cfhklmnprwxz`；學生自填的「誰」理論上仍可能觸發（同講師小幫手）。
- 聊天（≤60 字、間隔 2.7 秒佇列 `queueChats(list, tag)`，同 tag 只留最新）：資金表 `$<gid>,<i>,<n>,<加價>:1=520/0312;2=…`（資源兩碼串接），真實價值 `V<gid>,<i>,<n>:<res2><值3>…`。**不能有「.字母」**（網址過濾）。結算時先送資金表再送真實價值（反過來手機會用舊資金表算，踩過）。
- **老師只收 `lid` 等於目前拍品的出價**：重新連線時轉播站會重送每個人最後的狀態，沒比對 lid 會把上一項的舊出價套到這一項（踩過，E2E 抓到）。密封出價重播時 `replay && old` 不覆蓋。
- 學生 id 存 `cab.sid.<碼>`、名字 `cab.who`、組別 `cab.team.<碼>`。關閉碼 4004（教室關閉）／4005（被請出）不自動重連；4001（老師金鑰不符）老師端自動換新代碼。
- 「同一班再玩一場」保留房間代碼、換 `gid`，學生不用重新加入（手機看到新 gid 會清掉舊資料、保留組別）。

## 畫面（app.js）
- 老師 localStorage 前綴 `cab.`：`game`（整場 G，含 secret）、`cfg`（上次設定）、`net`（'0'＝老師關過手機連線）、`manualOpen`、`fs`、`mute`、`fold`、`warnSeen`、`marquee`。⚙「🧹 清除全部資料」保留 fs/fold/warnSeen/marquee/mute。
- 計時 `T.tick` 每 200ms：公開喊價開場 `max(15, engSec)` 秒、每次出價延長到至少 `engSec` 秒；密封 `sealSec`；荷蘭式每 `dutchEvery` 秒降一次，低於底價流標。空白鍵＝開始／落槌／下一項。「↩ 重來這一項」退錢並換新 lid。
- **重畫時保留輸入**：學生的 `sealAmt/custAmt/whoIn/codeIn`、老師的 `manAmt/[data-seal]` 重畫前後保留值、焦點與游標位置。金額輸入框用 `type="text" inputmode="numeric"`（`type=number` 讀不到游標位置；曾因重畫把游標移到最前面，打出「11070」，E2E 抓到）。數字一律用 `numOf()` 讀。
- 結算：排名＋明細、每項「付了多少／其實值多少」、五張檢討卡（稀缺、贏家詛咒、機會成本、四種形式成交價／真實價值 %、組合綜效）＋5 題討論題、CSV（BOM）、列印浮水印。
- 測試掛鉤 `window._cab`（G、T、S、NET、ACT）。

## 驗證
- `python tools/e2e_auction.py <截圖資料夾>`（需先開 8879；連**正式轉播站**的隨機 BID 房間）：老師＋3 支 375px 學生手機（各自獨立 context）：選組、公開喊價（領先不能加、現場代按指定金額、太低被擋、倒數落槌）、密封與修改出價、老師重新整理後出價保留、次高價、荷蘭式、結算後學生手機算出的企業價值與老師一致、375px 無橫向溢出、再玩一場保留代碼與組別、關閉教室 4004。2026-11-14 本機連跑 4 輪全過、無 console 錯誤；上線後設 `AUC_BASE=https://m255525.github.io/classroom-auction-game/` 對線上版再跑一輪全過。
- **真手機掃 QR、投影機、30 人以上同時出價未實測**。

## 標準配備
跑馬燈（工作區公告 GAS，滑鼠移入暫停，不可關）、⚙ 常用設定（收合式＋關於本工具）、首訪警語（學生頁不跳，頁尾有連結）、`manual.html#creator` 完整版（改 `tools/manual_body.html` 後跑 `python tools/build_manual.py`，創作者區塊取自賞鳥地圖手冊）、PWA（`tools/make_icons.py`；上線改版升 `service-worker.js` 的 `CACHE_NAME`）、訪客計數器、列印浮水印。無序號、無 AI。
