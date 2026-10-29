/**
 * newebpay-kit — 藍新金流 NewebPay 零依賴 Node SDK
 *
 * 涵蓋:
 * - MPG 幕前支付 [NPA-F01](單次付款,手冊 NDNF-1.2.6)
 * - 信用卡定期定額 [NPA-B05 建立 / B051 改狀態 / B052 改金額 / B053 查詢](手冊 NDNP-1.0.8)
 * - Notify 解密 + TradeSha/CheckCode 驗章
 *
 * 全部 API 都是「產生表單欄位」或「純函式加解密」,不碰網路;
 * 真正送出由呼叫端決定(前端 form post / 後端 fetch)。
 */
const crypto = require('node:crypto')

/** 等價 PHP http_build_query(RFC1738:空格編成 +)— 藍新範例用這個格式 */
function buildQuery(params) {
  return Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => `${encodeRFC1738(k)}=${encodeRFC1738(String(v))}`)
    .join('&')
}

function encodeRFC1738(s) {
  return encodeURIComponent(s)
    .replace(/%20/g, '+')
    .replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase())
}

function parseQuery(qs) {
  const out = {}
  for (const pair of qs.split('&')) {
    if (!pair) continue
    const eq = pair.indexOf('=')
    const k = decodeURIComponent(pair.slice(0, eq).replace(/\+/g, ' '))
    out[k] = decodeURIComponent(pair.slice(eq + 1).replace(/\+/g, ' '))
  }
  return out
}

function createNewebpay({ merchantID, hashKey, hashIV, sandbox = false }) {
  if (!merchantID || !hashKey || !hashIV) {
    throw new Error('newebpay-kit: merchantID / hashKey / hashIV 三者皆必填(從藍新會員專區商店設定取得)')
  }
  if (hashKey.length !== 32 || hashIV.length !== 16) {
    throw new Error('newebpay-kit: hashKey 須為 32 字元、hashIV 須為 16 字元')
  }

  const base = sandbox ? 'https://ccore.newebpay.com' : 'https://core.newebpay.com'
  const now = () => Math.floor(Date.now() / 1000)

  /** AES-256-CBC + PKCS7 → hex(藍新 PostData_/TradeInfo 格式) */
  function encrypt(data) {
    const plain = typeof data === 'string' ? data : buildQuery(data)
    const cipher = crypto.createCipheriv('aes-256-cbc', hashKey, hashIV)
    return Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]).toString('hex')
  }

  /** hex → AES 解密 → 去 PKCS7 padding → utf8 字串 */
  function decrypt(hex) {
    const decipher = crypto.createDecipheriv('aes-256-cbc', hashKey, hashIV)
    decipher.setAutoPadding(false)
    const buf = Buffer.concat([decipher.update(Buffer.from(hex, 'hex')), decipher.final()])
    const pad = buf[buf.length - 1]
    if (!pad || pad > 16 || pad > buf.length) throw new Error('newebpay-kit: PKCS7 padding 異常(金鑰不對?)')
    return buf.slice(0, buf.length - pad).toString('utf8')
  }

  /** TradeSha = SHA256("HashKey={key}&{加密hex}&HashIV={iv}") 大寫 */
  function tradeSha(encryptedHex) {
    return sha256Upper(`HashKey=${hashKey}&${encryptedHex}&HashIV=${hashIV}`)
  }

  /** 回傳驗章:CheckCode = SHA256("HashIV={iv}&{排序後欄位}&HashKey={key}") 大寫 */
  function checkCode(fields) {
    return sha256Upper(`HashIV=${hashIV}&${sortedQuery(fields)}&HashKey=${hashKey}`)
  }

  /** 查詢 API 用:CheckValue = SHA256("IV={iv}&{排序後欄位}&Key={key}") 大寫 */
  function checkValue(fields) {
    return sha256Upper(`IV=${hashIV}&${sortedQuery(fields)}&Key=${hashKey}`)
  }

  // ── MPG 幕前支付(單次付款) ──────────────────────────────

  /**
   * 產生 MPG 交易表單 → { action, method, fields }
   * 前端把 fields 塞進 <form method=post action={action}> 送出即導向藍新付款頁。
   * 必填: MerchantOrderNo(限英數_), Amt(整數,新台幣), ItemDesc, Email
   * 常用: NotifyURL(幕後通知), ReturnURL(付款完導回), ClientBackURL(取消返回)
   */
  function mpg({ MerchantOrderNo, Amt, ItemDesc, Email, ...rest }) {
    requireFields({ MerchantOrderNo, Amt, ItemDesc, Email }, 'mpg')
    const tradeInfo = encrypt({
      MerchantID: merchantID,
      RespondType: 'JSON',
      TimeStamp: now(),
      Version: '2.0',
      MerchantOrderNo,
      Amt,
      ItemDesc,
      Email,
      ...rest,
    })
    return {
      action: `${base}/MPG/mpg_gateway`,
      method: 'POST',
      fields: { MerchantID: merchantID, TradeInfo: tradeInfo, TradeSha: tradeSha(tradeInfo), Version: '2.0' },
    }
  }

  /**
   * 解析 MPG NotifyURL/ReturnURL 的回傳(body: Status/MerchantID/TradeInfo/TradeSha)。
   * 驗 TradeSha 不過直接丟錯 — 不驗章等於沒加密。
   * 回傳解密後物件(RespondType=JSON 時為巢狀物件,String 時為攤平欄位)。
   */
  function parseMpgNotify({ TradeInfo, TradeSha }) {
    if (!TradeInfo) throw new Error('newebpay-kit: 缺 TradeInfo')
    if (tradeSha(TradeInfo) !== TradeSha) throw new Error('newebpay-kit: TradeSha 驗章失敗,拒收')
    const plain = decrypt(TradeInfo)
    try {
      return JSON.parse(plain)
    } catch {
      return parseQuery(plain)
    }
  }

  // ── 信用卡定期定額 ──────────────────────────────────────

  /**
   * 建立委託 [NPA-B05] → { action, method, fields: { MerchantID_, PostData_ } }
   * 消費者會被導到藍新定期定額付款頁輸入卡號,之後藍新按週期自動扣款。
   * 必填: MerOrderNo, ProdDesc, PeriodAmt, PeriodType(D/W/M/Y), PeriodPoint, PeriodTimes, PayerEmail
   * 預設: PeriodStartType=2(立即執行首期授權), RespondType=JSON
   * 訂閱務必帶 NotifyURL — 每期授權結果都打這裡。
   */
  function period({ MerOrderNo, ProdDesc, PeriodAmt, PeriodType, PeriodPoint, PeriodTimes, PayerEmail, ...rest }) {
    requireFields({ MerOrderNo, ProdDesc, PeriodAmt, PeriodType, PeriodPoint, PeriodTimes, PayerEmail }, 'period')
    const postData = encrypt({
      RespondType: 'JSON',
      TimeStamp: now(),
      Version: '1.5',
      MerOrderNo,
      ProdDesc,
      PeriodAmt,
      PeriodType,
      PeriodPoint,
      PeriodTimes,
      PayerEmail,
      PeriodStartType: rest.PeriodStartType ?? '2',
      ...rest,
    })
    return { action: `${base}/MPG/period`, method: 'POST', fields: { MerchantID_: merchantID, PostData_: postData } }
  }

  /** 修改委託狀態 [NPA-B051]: AlterType = suspend | terminate | restart */
  function alterPeriodStatus({ MerOrderNo, PeriodNo, AlterType }) {
    requireFields({ MerOrderNo, PeriodNo, AlterType }, 'alterPeriodStatus')
    return periodAdminForm('AlterStatus', { MerOrderNo, PeriodNo, AlterType })
  }

  /** 修改委託內容 [NPA-B052]: 可改 AlterAmt / PeriodType / PeriodPoint / PeriodTimes / Extday 等 */
  function alterPeriodAmt({ MerOrderNo, PeriodNo, ...changes }) {
    requireFields({ MerOrderNo, PeriodNo }, 'alterPeriodAmt')
    return periodAdminForm('AlterAmt', { MerOrderNo, PeriodNo, ...changes })
  }

  /** 委託單查詢 [NPA-B053] */
  function queryPeriod({ MerOrderNo, PeriodNo }) {
    requireFields({ MerOrderNo, PeriodNo }, 'queryPeriod')
    return periodAdminForm('query', { MerOrderNo, PeriodNo })
  }

  function periodAdminForm(path, data) {
    const postData = encrypt({ RespondType: 'JSON', TimeStamp: now(), Version: '1.0', ...data })
    return { action: `${base}/MPG/period/${path}`, method: 'POST', fields: { MerchantID_: merchantID, PostData_: postData } }
  }

  /**
   * 幕後直接送出 period admin 表單(AlterStatus/AlterAmt/query 都是 server-to-server 可打),
   * 並解密回傳的 period 欄位。Node 18+。
   */
  async function postForm({ action, fields }) {
    const res = await fetch(action, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: buildQuery(fields),
    })
    const text = await res.text()
    if (!res.ok) throw new Error(`newebpay-kit: ${action} 回 ${res.status}: ${text.slice(0, 300)}`)
    let body
    try {
      body = JSON.parse(text)
    } catch {
      body = parseQuery(text)
    }
    const encrypted = body.period || body.Period
    return encrypted ? parsePeriodNotify(encrypted) : body
  }

  /** 解密定期定額 Notify(建立完成 / 每期授權 NPA-N050 / CAU 通知,body 的 Period 欄位) */
  function parsePeriodNotify(periodHex) {
    const plain = decrypt(periodHex)
    try {
      return JSON.parse(plain)
    } catch {
      return parseQuery(plain)
    }
  }

  return {
    base,
    encrypt,
    decrypt,
    tradeSha,
    checkCode,
    checkValue,
    mpg,
    parseMpgNotify,
    period,
    alterPeriodStatus,
    alterPeriodAmt,
    queryPeriod,
    postForm,
    parsePeriodNotify,
  }
}

function sortedQuery(fields) {
  return Object.keys(fields)
    .sort()
    .map((k) => `${k}=${fields[k]}`)
    .join('&')
}

function sha256Upper(s) {
  return crypto.createHash('sha256').update(s, 'utf8').digest('hex').toUpperCase()
}

function requireFields(obj, fn) {
  const missing = Object.entries(obj)
    .filter(([, v]) => v === undefined || v === null || v === '')
    .map(([k]) => k)
  if (missing.length) throw new Error(`newebpay-kit: ${fn}() 缺必填欄位: ${missing.join(', ')}`)
}

module.exports = { createNewebpay, buildQuery }
