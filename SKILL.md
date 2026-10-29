# SKILL: newebpay-kit 接線打法

## 何時觸發

- 專案要收台灣信用卡（單次或訂閱）且金流走藍新 NewebPay
- 2026-07 PayUni 主商店被關後，**藍新是全生態的現役金流**；新接金流預設用這顆
- 看到 `NEWEBPAY_*` env、`ccore.newebpay.com`、`MPG/period` 等字樣

## 架構定位（跟既有金流三兄弟的關係）

```
前端結帳頁 → newebpay-kit 產表單 → 藍新付款頁(卡號在藍新,不過我們手)
                                      ↓ NotifyURL
後端 notify endpoint → parseMpgNotify / parsePeriodNotify → 開通會員
                                      ↓
                    PayGate(/api/subscribe) 登記訂閱帳本(照舊)
```

- **藍新不需要固定 IP 白名單** → 不用走 payuni-gateway VPS，webhook 直接打 cloudpipe 專案自己的 endpoint。
- **訂閱模式跟 PayUni 根本不同**：PayUni 是「我方存 CreditHash 主動續扣」（PayGate expire-check 發動）；藍新定期定額是「藍新按排程自動扣，每期打 NotifyURL 告訴你結果」。所以 PayGate 的角色從「發動扣款」變成「收 webhook 記帳 + 對帳」。退訂 = `alterPeriodStatus terminate`（不可逆，想留復活路徑用 suspend）。

## 接線步驟

1. env 三件套（**金鑰只進 .env，絕不進 git**）：
   ```
   NEWEBPAY_MERCHANT_ID=
   NEWEBPAY_HASH_KEY=      # 32 字元
   NEWEBPAY_HASH_IV=       # 16 字元
   NEWEBPAY_SANDBOX=0      # 1 → ccore 測試站(要用測試平台的另一組金鑰!)
   ```
2. 單次付款：`mpg()` → 前端 auto-submit form → notify 用 `parseMpgNotify`（驗章失敗直接 500，不開通）。
3. 訂閱：`period()` → notify 收「建立完成」開通首期 → 之後每期 NPA-N050 延展效期 → 同步打 PayGate `/api/subscribe`。
4. **冪等**：notify 可能重送也可能漏送。以 `MerchantOrderNo`/`PeriodNo` 當 key 去重；排程每日 `queryPeriod` 對帳補漏。
5. 訂單前綴每專案不同（pokkit=PK、coursebloom=PD…），`MerOrderNo` 限英數底線。

## 文案/UX 模式

- 結帳按鈕按下 → 整頁導向藍新（幕前支付沒有站內 embed；要站內體驗等申請「幕後授權」再說）
- 付款完成頁靠 `ReturnURL` 導回，但**開通一律以 NotifyURL 為準**（ReturnURL 可能不來）

## 地雷

- 測試站 ccore 要用 cwww 測試平台的測試商店金鑰，正式金鑰打 ccore 必敗 — 反之亦然。
- `TimeStamp` 誤差 >120s 直接交易失敗。
- PHP 範例的 query string 是 RFC1738（空格=+），kit 的 `buildQuery` 已對齊，別自己用 `URLSearchParams`（空格會變 %20… 其實也是 +，但 `!'()*` 編碼不同）混用。
- 每月 31 號扣款遇小月自動變月底 — 對帳邏輯別假設日期固定。
- 委託建立用的 `PeriodTimes` 若超過卡片效期，藍新自動縮短期數（開 CAU 才可 `NE` 無限期）。
