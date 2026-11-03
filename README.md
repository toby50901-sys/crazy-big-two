# 瘋狂大老二 5.0 V4.0｜Cloudflare 連線測試版

從使用者上傳的 V3.4 HTML 抽取出牌型、鬼牌、步步高、頂大、計分邏輯，改成由 Cloudflare Durable Object 伺服器管理的房間狀態。支援三真人、兩真人一電腦、一真人兩電腦。每個房間的積分保存在 Durable Object SQLite storage。

## 部署

1. 在電腦安裝 Node.js 20.19+，解壓 ZIP，進入本資料夾。
2. 執行 `npm install`。
3. 執行 `npx wrangler login` 並登入你自己的 Cloudflare 帳號。
4. 執行 `npm run deploy`，取得新的 `*.workers.dev` 網址。
5. 開啟網址建立房間，複製邀請連結給朋友；房主可補電腦。

> 這是**全新 Worker 專案**，不會自動取代你之前透過網頁上傳的 Worker。若想用原本網址，需要在 `wrangler.jsonc` 修改 `name` 為原 Worker 名稱，再部署。請先用新名稱測試。

## 限制與注意

- 使用每約 1.6 秒輪詢同步（不是 WebSocket），適合初期朋友測試。
- 沒有登入帳號，使用瀏覽器 sessionStorage 保存玩家權杖；關閉分頁或清除資料可能無法重新進房，請先不要關閉。
- 邀請連結只給朋友；目前沒有房主踢人、公開房間、觀戰、完整斷線復原或正式防濫用機制。
- 房間 ID 是 UUID；邀請網址內含房間 ID。請勿分享不信任對象。
- 房間的座位及分數在 Durable Object 儲存，未提供清空房間功能。
- 請先測試完整規則與計分，特別是鬼牌宣告、步步高與聽牌頂大。這是測試版本，尚未完成實際三裝置端到端驗證。
- 目前需要使用 Wrangler CLI 部署，**不能只把 ZIP 上傳到 Cloudflare 的靜態檔案上傳介面**，因為 Durable Objects 需要 binding/migration。
