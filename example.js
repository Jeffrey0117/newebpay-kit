/**
 * example.js — 最小可跑範例(不實際扣款,只示範表單生成與 notify 解析)
 * 跑法: node example.js
 */
const { createNewebpay } = require('./index.js')

const pay = createNewebpay({
  merchantID: process.env.NEWEBPAY_MERCHANT_ID || 'TEK1682407426', // fallback = 官方手冊範例商店
  hashKey: process.env.NEWEBPAY_HASH_KEY || 'IaWudQJsuOT994cpHRWzv7Ge67yC1cE3',
  hashIV: process.env.NEWEBPAY_HASH_IV || 'C1dLm3nxZRVlmBSP',
  sandbox: true,
})

// ── 1. 單次付款表單 ──
const mpgForm = pay.mpg({
  MerchantOrderNo: 'demo_' + Date.now(),
  Amt: 299,
  ItemDesc: 'Pro plan (one-time)',
  Email: 'buyer@example.com',
  NotifyURL: 'https://example.com/api/newebpay/notify',
  ReturnURL: 'https://example.com/pay/done',
})
console.log('MPG form →', mpgForm.action)
console.log('  fields:', Object.keys(mpgForm.fields).join(', '))

// 前端渲染(auto-submit):
const html = `
<form id="pay" method="POST" action="${mpgForm.action}">
${Object.entries(mpgForm.fields)
  .map(([k, v]) => `  <input type="hidden" name="${k}" value="${v}">`)
  .join('\n')}
</form>
<script>document.getElementById('pay').submit()</script>`
console.log('\nauto-submit HTML length:', html.length)

// ── 2. 訂閱委託表單 ──
const subForm = pay.period({
  MerOrderNo: 'sub_demo_' + Date.now(),
  ProdDesc: 'Pro monthly',
  PeriodAmt: 299,
  PeriodType: 'M',
  PeriodPoint: '05',
  PeriodTimes: '12',
  PayerEmail: 'buyer@example.com',
  NotifyURL: 'https://example.com/api/newebpay/period-notify',
})
console.log('\nPeriod form →', subForm.action)

// ── 3. notify 解析(模擬) ──
const fakeNotify = pay.encrypt(JSON.stringify({ Status: 'SUCCESS', Result: { PeriodNo: 'P123' } }))
console.log('\nparsePeriodNotify →', pay.parsePeriodNotify(fakeNotify))
