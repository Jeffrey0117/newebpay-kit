/**
 * Known-answer tests — 向量全部來自藍新官方手冊:
 * - 定期定額 NDNP-1.0.8 §4.1 (AES256 加密範例, p.15-17)
 * - 幕前支付 NDNF-1.2.6 §4.1.2 (SHA256 範例, p.22-23)
 * 跑法: node --test
 */
const test = require('node:test')
const assert = require('node:assert/strict')
const { createNewebpay, buildQuery } = require('./index.js')

// ── NDNP 手冊範例商店(官方文件公開的測試金鑰,非真實商店) ──
const ndnp = createNewebpay({
  merchantID: 'TEK1682407426',
  hashKey: 'IaWudQJsuOT994cpHRWzv7Ge67yC1cE3',
  hashIV: 'C1dLm3nxZRVlmBSP',
  sandbox: true,
})

const NDNP_PLAIN =
  'RespondType=JSON&TimeStamp=1700033460&Version=1.5&LangType=zh-Tw' +
  '&MerOrderNo=myorder1700033460&ProdDesc=Test+commssion&PeriodAmt=10' +
  '&PeriodType=M&PeriodPoint=05&PeriodStartType=2&PeriodTimes=12' +
  '&PayerEmail=test%40neweb.com.tw&PaymentInfo=Y&OrderInfo=N&EmailModify=1' +
  '&NotifyURL=https%3A%2F%2Fwebhook.site%2Fb728e917-1bf7-478b-b0f9-73b56aeb44e0'

const NDNP_CIPHER_HEX =
  '45d5175feaa9ef2ea039f84afba34c6330e8fa21ae01ec40f15ab00073b4e935' +
  '84cc1d3a7e2b26feb08216d14074dd4a83a64791e114cd15e200a88ef38720e7' +
  '830d892953a25b84411abc8d0f86ff73719af52e0c303de9586c422702e806e5' +
  '99ffd739086b0c3f8c3b995b2a6ba92902070f5f8c4c2916f72b0d9c1027ca05' +
  '0799a6a55e78ff07c663e4b90aa3a84dfde353f1354fc5165ccc897f5ee0586a' +
  '2852e2e5e1be1f3fa2f7a618377abdab9b6aa3af39eb005e461aaa2c8da4d2fd' +
  '3af93bed9eb3438b01804a9a1bc39bcb6f7bd3a35bd275fe53923960bd76c4de' +
  'f1175e8b1f60acb21cd4ebe9c03fe10df2c1a6aa455e21899c02cba501ce2fb8' +
  '7c72a6cbb2a146ddd4688fd3ce9cf068bdb6f4f2c4351d78973d32268737e931' +
  'def628d0f3f3aac038cd551a0f8c85e0d194542da74f6ba841c4068bab0f1445' +
  '3dbac0d16dba1de2656368238855dc6351821380a3455532a2259c2c5caf4cac'

test('buildQuery 等價 PHP http_build_query (空格=+, RFC1738)', () => {
  const qs = buildQuery({
    RespondType: 'JSON',
    TimeStamp: 1700033460,
    Version: '1.5',
    LangType: 'zh-Tw',
    MerOrderNo: 'myorder1700033460',
    ProdDesc: 'Test commssion',
    PeriodAmt: '10',
    PeriodType: 'M',
    PeriodPoint: '05',
    PeriodStartType: '2',
    PeriodTimes: '12',
    PayerEmail: 'test@neweb.com.tw',
    PaymentInfo: 'Y',
    OrderInfo: 'N',
    EmailModify: '1',
    NotifyURL: 'https://webhook.site/b728e917-1bf7-478b-b0f9-73b56aeb44e0',
  })
  assert.equal(qs, NDNP_PLAIN)
})

test('AES-256-CBC 加密 = 官方手冊範例輸出 (NDNP p.17)', () => {
  assert.equal(ndnp.encrypt(NDNP_PLAIN), NDNP_CIPHER_HEX)
})

test('AES-256-CBC 解密官方密文還原明文 (含 PKCS7 去 padding)', () => {
  assert.equal(ndnp.decrypt(NDNP_CIPHER_HEX), NDNP_PLAIN)
})

test('encrypt→decrypt roundtrip (含中文)', () => {
  const s = 'ProdDesc=' + encodeURIComponent('月費訂閱 Pro 方案') + '&PeriodAmt=299'
  assert.equal(ndnp.decrypt(ndnp.encrypt(s)), s)
})

// ── NDNF 手冊範例商店 (SHA256 範例金鑰) ──
const ndnf = createNewebpay({
  merchantID: 'MS127874575',
  hashKey: 'Fs5cX1TGqYM2PpdbE14a9H83YQSQF5jn',
  hashIV: 'C6AcmfqJILwgnhIP',
  sandbox: true,
})

const NDNF_EDATA =
  'f79eac33c4f3245d58f17b544c5d38b09457a6d77e77bae6f10fcc7236fe153c' +
  'cef1a80001c0746afc063a7570f80ad970d8a32c72332c9ec554741018800787' +
  '6bdca2bafa52d07d31b6b183f2204d6e4feee6d245e286ab198cf95422ad5843' +
  'c7696fc943cbb65979ad207607d4b5d97dac4a90ccd5e7a37adb7d7062e838be' +
  '09d94e8c5dfa145c048e17feabe58c2e310792f0f50f5af32961ffb07ff6649a' +
  'e1021ad558242551de5f09316e3182e198775e5d1ad5b66a70be290004de750f' +
  'a85d86b0c2f087b40005d89e048be2ab6fd83f1c522494c093426a10a1f73fe4'

test('TradeSha = 官方手冊範例輸出 (NDNF p.23)', () => {
  assert.equal(
    ndnf.tradeSha(NDNF_EDATA),
    '84E4D9F96537E029F8450BE1E759080F9AF6995921B7F6F9AAFDDD2C36E7B287'
  )
})

test('mpg() 產出表單欄位齊全且 TradeSha 對得上 TradeInfo', () => {
  const form = ndnf.mpg({
    MerchantOrderNo: 'order_123',
    Amt: 299,
    ItemDesc: 'Pro plan',
    Email: 'a@b.c',
    NotifyURL: 'https://example.com/notify',
    ReturnURL: 'https://example.com/return',
  })
  assert.equal(form.action, 'https://ccore.newebpay.com/MPG/mpg_gateway')
  assert.equal(form.method, 'POST')
  assert.equal(form.fields.MerchantID, 'MS127874575')
  assert.equal(form.fields.TradeSha, ndnf.tradeSha(form.fields.TradeInfo))
  const plain = ndnf.decrypt(form.fields.TradeInfo)
  assert.match(plain, /MerchantOrderNo=order_123/)
  assert.match(plain, /Amt=299/)
  assert.match(plain, /Version=2\.0/)
  assert.match(plain, /RespondType=JSON/)
})

test('period() 產出建立委託表單 (MerchantID_/PostData_, Version 1.5)', () => {
  const form = ndnp.period({
    MerOrderNo: 'sub_001',
    ProdDesc: 'Pro monthly',
    PeriodAmt: 299,
    PeriodType: 'M',
    PeriodPoint: '05',
    PeriodTimes: '99',
    PayerEmail: 'a@b.c',
    NotifyURL: 'https://example.com/period-notify',
  })
  assert.equal(form.action, 'https://ccore.newebpay.com/MPG/period')
  assert.equal(form.fields.MerchantID_, 'TEK1682407426')
  const plain = ndnp.decrypt(form.fields.PostData_)
  assert.match(plain, /Version=1\.5/)
  assert.match(plain, /PeriodAmt=299/)
  assert.match(plain, /PeriodStartType=2/) // 預設立即首期授權
})

test('alterPeriodStatus() 加密內容帶 PeriodNo/AlterType (Version 1.0)', () => {
  const form = ndnp.alterPeriodStatus({
    MerOrderNo: 'sub_001',
    PeriodNo: 'P231115153213aMDNWZ',
    AlterType: 'suspend',
  })
  assert.equal(form.action, 'https://ccore.newebpay.com/MPG/period/AlterStatus')
  const plain = ndnp.decrypt(form.fields.PostData_)
  assert.match(plain, /Version=1\.0/)
  assert.match(plain, /AlterType=suspend/)
})

test('parsePeriodNotify 解密 JSON 通知', () => {
  const payload = { Status: 'SUCCESS', Result: { PeriodNo: 'P123', AuthTimes: 12 } }
  const hex = ndnp.encrypt(JSON.stringify(payload))
  assert.deepEqual(ndnp.parsePeriodNotify(hex), payload)
})

test('parseMpgNotify 驗章通過才解密, 壞章直接丟錯', () => {
  const plain = 'Status=SUCCESS&Amt=299&MerchantOrderNo=order_123'
  const TradeInfo = ndnf.encrypt(plain)
  const good = ndnf.parseMpgNotify({ TradeInfo, TradeSha: ndnf.tradeSha(TradeInfo) })
  assert.equal(good.Status, 'SUCCESS')
  assert.equal(good.Amt, '299')
  assert.throws(() => ndnf.parseMpgNotify({ TradeInfo, TradeSha: 'DEADBEEF' }), /TradeSha/)
})

test('checkCode / checkValue 欄位排序穩定', () => {
  const a = ndnf.checkCode({ TradeNo: 't1', Amt: 10, MerchantOrderNo: 'o1', MerchantID: 'm1' })
  const b = ndnf.checkCode({ Amt: 10, MerchantID: 'm1', MerchantOrderNo: 'o1', TradeNo: 't1' })
  assert.equal(a, b)
  assert.match(a, /^[0-9A-F]{64}$/)
  assert.match(ndnf.checkValue({ Amt: 10, MerchantID: 'm1', MerchantOrderNo: 'o1' }), /^[0-9A-F]{64}$/)
})

test('sandbox=false 走正式站', () => {
  const prod = createNewebpay({ merchantID: 'X', hashKey: 'k'.repeat(32), hashIV: 'i'.repeat(16) })
  assert.match(prod.mpg({ MerchantOrderNo: 'o', Amt: 1, ItemDesc: 'd', Email: 'a@b.c' }).action, /^https:\/\/core\.newebpay\.com/)
})
