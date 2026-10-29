# newebpay-kit 🏦

藍新金流 NewebPay 零依賴 Node SDK — MPG 幕前支付（單次付款）＋信用卡定期定額（訂閱）。

- 加密層以**官方手冊 known-answer 向量**驗證（AES-256-CBC/PKCS7/hex 與 TradeSha 均 bit-for-bit 吻合手冊範例）
- 零依賴，`node:crypto` only，Node 18+
- 所有 API 回傳「表單欄位」或純函式，不偷打網路；要送出自己決定（前端 form post / 後端 `postForm()`）

對應手冊版本：幕前支付 NDNF-1.2.6、信用卡定期定額 NDNP-1.0.8。

## Install

```bash
npm i github:Jeffrey0117/newebpay-kit
```

## Quick start

```js
const { createNewebpay } = require('newebpay-kit')

const pay = createNewebpay({
  merchantID: process.env.NEWEBPAY_MERCHANT_ID,
  hashKey: process.env.NEWEBPAY_HASH_KEY,   // 32 字元
  hashIV: process.env.NEWEBPAY_HASH_IV,     // 16 字元
  sandbox: process.env.NODE_ENV !== 'production', // true → ccore 測試站
})
```

### 單次付款（MPG）

```js
// server: 產生表單
const form = pay.mpg({
  MerchantOrderNo: 'order_' + Date.now(), // 限英數底線,商店內不可重複
  Amt: 299,                               // 新台幣整數
  ItemDesc: 'Pro 方案一個月',
  Email: user.email,
  NotifyURL: 'https://yoursite.com/api/newebpay/notify',
  ReturnURL: 'https://yoursite.com/pay/done',
})
// 前端: 把 form.fields 塞進 <form method="POST" action={form.action}> 自動 submit

// notify endpoint: 驗章 + 解密(驗不過直接 throw)
const result = pay.parseMpgNotify(req.body) // { Status:'SUCCESS', Result:{...} }
```

### 訂閱（定期定額委託）

```js
// 建立委託:消費者在藍新頁輸入一次卡號,之後藍新每期自動扣
const form = pay.period({
  MerOrderNo: 'sub_' + userId + '_' + Date.now(),
  ProdDesc: 'Pro 月費',
  PeriodAmt: 299,
  PeriodType: 'M',      // D=天 W=週 M=月 Y=年
  PeriodPoint: '05',    // 每月 5 號扣
  PeriodTimes: '99',    // 期數(CAU 商店可用 'NE' 無限期)
  PayerEmail: user.email,
  NotifyURL: 'https://yoursite.com/api/newebpay/period-notify', // 每期授權結果
  ReturnURL: 'https://yoursite.com/subscribe/done',
})

// 每期授權通知(NPA-N050):body 的 Period 欄位
const notify = pay.parsePeriodNotify(req.body.Period)
// notify.Status === 'SUCCESS' → 延展會員效期

// 退訂 / 暫停 / 恢復(server-to-server)
await pay.postForm(pay.alterPeriodStatus({
  MerOrderNo: 'sub_...', PeriodNo: 'P2311...', AlterType: 'terminate', // suspend|restart|terminate
}))

// 改金額 / 改週期
await pay.postForm(pay.alterPeriodAmt({ MerOrderNo, PeriodNo, AlterAmt: 399 }))

// 查詢委託
await pay.postForm(pay.queryPeriod({ MerOrderNo, PeriodNo }))
```

## API

| 函式 | 用途 |
|---|---|
| `mpg(params)` | MPG 單次付款表單（NPA-F01，Version 2.0） |
| `parseMpgNotify({TradeInfo, TradeSha})` | MPG 通知驗章＋解密（壞章直接 throw） |
| `period(params)` | 建立定期定額委託表單（NPA-B05，Version 1.5） |
| `alterPeriodStatus({MerOrderNo, PeriodNo, AlterType})` | 暫停/終止/恢復委託（NPA-B051） |
| `alterPeriodAmt({MerOrderNo, PeriodNo, ...})` | 改金額/週期/期數（NPA-B052） |
| `queryPeriod({MerOrderNo, PeriodNo})` | 查委託單（NPA-B053） |
| `postForm(form)` | 幕後送出上面三支 admin API 並解密回應 |
| `parsePeriodNotify(hex)` | 解密定期定額通知（建立完成/每期 NPA-N050/CAU） |
| `encrypt / decrypt / tradeSha / checkCode / checkValue` | 底層原語 |

## 地雷

- **測試環境金鑰 ≠ 正式金鑰**：ccore 測試站要用藍新「測試平台」(cwww) 另開的測試商店金鑰，拿正式金鑰打 ccore 必失敗。
- `MerOrderNo` 限英數與 `_`，同商店不可重複 — 每專案加前綴（跟 PayUni 的教訓一樣）。
- `TimeStamp` 容許誤差 120 秒，主機時鐘要準。
- 定期定額的扣款排程在藍新那端，商店端靠 NotifyURL 收每期結果 — **webhook 掉了不會重來**，務必冪等 + 以 `queryPeriod` 對帳。
- `PeriodType=M` 遇當月無該日（例如 31 號）自動改月底扣。
- 委託 `terminate` 之後不可逆，退訂想保留復活路徑用 `suspend`。

## Tests

```bash
node --test   # 12 tests, 官方手冊 known-answer 向量
```

## 生態系

- 訂閱帳本/方案/webhook 派送 → [PayGate](https://github.com/Jeffrey0117/paygate)
- 變現 UX/paywall → [paywall-kit](https://github.com/Jeffrey0117/paywall-kit)
- PayUni 版（站內 embed）→ [payuni-embed-kit](https://github.com/Jeffrey0117/payuni-embed-kit)
