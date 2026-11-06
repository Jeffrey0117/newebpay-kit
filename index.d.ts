/** 藍新金流 NewebPay 零依賴 Node SDK 型別定義 */

export interface NewebpayOptions {
  /** 商店代號(MS 開頭,從藍新會員專區取得) */
  merchantID: string
  /** HashKey,32 字元 */
  hashKey: string
  /** HashIV,16 字元 */
  hashIV: string
  /** true 走測試站 ccore.newebpay.com(要用測試商店金鑰) */
  sandbox?: boolean
}

/** 產生好的表單:前端 <form method="POST" action={action}> 塞 fields 送出 */
export interface FormPost {
  action: string
  method: 'POST'
  fields: Record<string, string>
}

export interface MpgParams {
  /** 訂單編號,限英數底線,30 字元內,不可重複 */
  MerchantOrderNo: string
  /** 金額(整數,新台幣) */
  Amt: number
  ItemDesc: string
  Email: string
  /** 幕後通知網址(付款結果 server-to-server) */
  NotifyURL?: string
  /** 付款完成導回網址 */
  ReturnURL?: string
  /** 取消付款返回網址 */
  ClientBackURL?: string
  [key: string]: unknown
}

export interface MpgNotifyResult {
  Status: string
  Message?: string
  Result?: Record<string, any>
  [key: string]: unknown
}

export interface PeriodParams {
  MerOrderNo: string
  ProdDesc: string
  PeriodAmt: number
  /** D=日 W=週 M=月 Y=年 */
  PeriodType: 'D' | 'W' | 'M' | 'Y'
  PeriodPoint: string | number
  PeriodTimes: number
  PayerEmail: string
  NotifyURL?: string
  [key: string]: unknown
}

export interface Newebpay {
  /** 正式或測試站 base URL */
  base: string
  /** AES-256-CBC 加密 → hex(物件會先轉 RFC1738 query string) */
  encrypt(data: string | Record<string, unknown>): string
  /**
   * hex → AES 解密 → 去 padding → utf8 字串。
   * 藍新 padding 以 32 bytes 為單位(pad 1~32),非標準 PKCS7。
   */
  decrypt(hex: string): string
  /** TradeSha = SHA256("HashKey={key}&{hex}&HashIV={iv}") 大寫 */
  tradeSha(encryptedHex: string): string
  /** 回傳驗章 CheckCode */
  checkCode(fields: Record<string, unknown>): string
  /** 查詢 API 用 CheckValue */
  checkValue(fields: Record<string, unknown>): string
  /** MPG 幕前支付表單(單次付款) */
  mpg(params: MpgParams): FormPost
  /** 解析並驗章 NotifyURL/ReturnURL 回傳;TradeSha 不符或解密失敗直接 throw */
  parseMpgNotify(body: { TradeInfo: string; TradeSha: string }): MpgNotifyResult
  /** 建立定期定額委託 */
  period(params: PeriodParams): FormPost
  /** 修改委託狀態:suspend | terminate | restart */
  alterPeriodStatus(params: { MerOrderNo: string; PeriodNo: string; AlterType: 'suspend' | 'terminate' | 'restart' }): FormPost
  /** 修改委託金額/週期 */
  alterPeriodAmt(params: { MerOrderNo: string; PeriodNo: string; [key: string]: unknown }): FormPost
  /** 查詢委託單 */
  queryPeriod(params: { MerOrderNo: string; PeriodNo: string }): FormPost
  /** 幕後直接送出 period admin 表單並解密回傳(Node 18+) */
  postForm(form: FormPost): Promise<Record<string, any>>
  /** 解密定期定額 notify 的 Period 欄位 */
  parsePeriodNotify(periodHex: string): Record<string, any>
}

export function createNewebpay(options: NewebpayOptions): Newebpay

/** 等價 PHP http_build_query(RFC1738) */
export function buildQuery(params: Record<string, unknown>): string
