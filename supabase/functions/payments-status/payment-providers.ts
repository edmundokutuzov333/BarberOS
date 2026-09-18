import forge from "npm:node-forge@1.3.1";

export type PaymentProvider = "mpesa" | "emola";
export type PaymentStatus = "paid" | "failed" | "pending";

export type ProviderConfig = {
  base_url?: string;
  service_provider_code?: string;
  origin?: string;
  public_key?: string;
  api_key?: string;
  wsdl_url?: string;
  partner_code?: string;
  language?: string;
  username?: string;
  password?: string;
};

export type PaymentRequest = {
  provider: PaymentProvider;
  provider_ref: string;
  amount_cents: number;
  msisdn: string;
  public_config: ProviderConfig;
  credentials: ProviderConfig;
};

export type ProviderResult = {
  status: PaymentStatus;
  providerTransactionId?: string | null;
  providerStatus?: string | null;
  providerMessage?: string | null;
  raw?: unknown;
  retryable?: boolean;
};

export class ProviderError extends Error {
  retryable: boolean;
  constructor(code: string, message: string, retryable = false) {
    super(code + (message ? ":" + message : ""));
    this.retryable = retryable;
  }
}

function cleanPhone(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.startsWith("258")) return digits;
  if (digits.startsWith("0") && digits.length === 10) return "258" + digits.slice(1);
  if (digits.startsWith("8") && digits.length === 9) return "258" + digits;
  throw new ProviderError("INVALID_PHONE", "Número móvel de Moçambique inválido.");
}

function publicPem(value: string): string {
  const raw = value.trim();
  if (raw.includes("BEGIN PUBLIC KEY")) return raw;
  return "-----BEGIN PUBLIC KEY-----\n" + raw.replace(/\s+/g, "").match(/.{1,64}/g)!.join("\n") + "\n-----END PUBLIC KEY-----";
}

function mpesaBearer(apiKey: string, publicKey: string): string {
  if (!apiKey || !publicKey) throw new ProviderError("MPESA_CREDENTIALS_INCOMPLETE", "Credenciais M-Pesa incompletas.");
  const key = forge.pki.publicKeyFromPem(publicPem(publicKey));
  const encrypted = key.encrypt(apiKey, "RSAES-PKCS1-V1_5");
  return forge.util.encode64(encrypted);
}

async function readResponse(response: Response): Promise<{ raw: string; json: Record<string, unknown> | null }> {
  const raw = await response.text();
  let json: Record<string, unknown> | null = null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") json = parsed as Record<string, unknown>;
  } catch {}
  return { raw, json };
}

function retryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

async function mpesaInitiate(r: PaymentRequest): Promise<ProviderResult> {
  const base = (r.public_config.base_url || "").replace(/\/+$/, "");
  const spc = r.public_config.service_provider_code || "";
  const apiKey = r.credentials.api_key || "";
  const publicKey = r.credentials.public_key || "";
  if (!base || !spc) throw new ProviderError("MPESA_CONFIG_INCOMPLETE", "Configuração M-Pesa incompleta.");
  const to = cleanPhone(r.msisdn);
  const amount = (r.amount_cents / 100).toFixed(2);
  const token = mpesaBearer(apiKey, publicKey);
  const response = await fetch(base + "/ipg/v1x/c2bPayment/singleStage/", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + token,
      "Origin": r.public_config.origin || "*",
    },
    body: JSON.stringify({
      input_TransactionReference: r.provider_ref,
      input_CustomerMSISDN: to,
      input_Amount: amount,
      input_ThirdPartyReference: r.provider_ref,
      input_ServiceProviderCode: spc,
    }),
  });
  const { raw, json } = await readResponse(response);
  if (!response.ok) throw new ProviderError("MPESA_HTTP_" + response.status, raw.slice(0, 700), retryableStatus(response.status));

  const code = String(json?.output_ResponseCode ?? "").trim();
  const tx = typeof json?.output_TransactionID === "string" ? json.output_TransactionID : null;
  const desc = typeof json?.output_ResponseDesc === "string" ? json.output_ResponseDesc : null;
  if (code !== "INS-0") {
    throw new ProviderError("MPESA_" + (code || "UNKNOWN"), desc || "M-Pesa rejeitou a solicitação.", false);
  }
  return {
    status: "pending",
    providerTransactionId: tx,
    providerStatus: code,
    providerMessage: desc || "Pedido de pagamento enviado ao M-Pesa.",
    raw: json ?? raw.slice(0, 2000),
  };
}

async function mpesaQuery(r: PaymentRequest): Promise<ProviderResult> {
  const base = (r.public_config.base_url || "").replace(/\/+$/, "");
  const spc = r.public_config.service_provider_code || "";
  if (!base || !spc) throw new ProviderError("MPESA_CONFIG_INCOMPLETE", "Configuração M-Pesa incompleta.");
  const token = mpesaBearer(r.credentials.api_key || "", r.credentials.public_key || "");
  const url = base + "/ipg/v1x/queryTransactionStatus/?input_QueryReference=" +
    encodeURIComponent(r.provider_ref) + "&input_ServiceProviderCode=" + encodeURIComponent(spc);
  const response = await fetch(url, {
    method: "GET",
    headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token, "Origin": r.public_config.origin || "*" },
  });
  const { raw, json } = await readResponse(response);
  if (!response.ok) throw new ProviderError("MPESA_HTTP_" + response.status, raw.slice(0, 700), retryableStatus(response.status));

  const code = String(json?.output_ResponseCode ?? "").trim();
  const statusText = String(json?.output_TransactionStatus ?? json?.output_Status ?? "").trim().toLowerCase();
  const tx = typeof json?.output_TransactionID === "string" ? json.output_TransactionID : null;
  const desc = typeof json?.output_ResponseDesc === "string" ? json.output_ResponseDesc : null;

  if (["completed","successful","success","paid","completed successfully"].some(x => statusText.includes(x)) || (code === "INS-0" && tx)) {
    return { status: "paid", providerTransactionId: tx, providerStatus: code || statusText, providerMessage: desc, raw: json ?? raw.slice(0, 2000) };
  }
  if (["failed","rejected","cancelled","canceled","expired","declined"].some(x => statusText.includes(x))) {
    return { status: "failed", providerTransactionId: tx, providerStatus: code || statusText, providerMessage: desc || statusText, raw: json ?? raw.slice(0, 2000) };
  }
  return { status: "pending", providerTransactionId: tx, providerStatus: code || statusText || null, providerMessage: desc || "Pagamento ainda em processamento.", raw: json ?? raw.slice(0, 2000) };
}

function escapeXml(value: string): string {
  return value.replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&apos;");
}

function soapInput(wscode: string, params: Record<string,string>, c: ProviderConfig): string {
  const p = Object.entries(params).filter(([,v]) => v !== "");
  const body = p.map(([name,value]) => '<param name="' + escapeXml(name) + '" value="' + escapeXml(value) + '"/>').join("");
  return '<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">' +
    '<soap:Body><gwOperation xmlns="http://webservice.bccsgw.viettel.com/"><Input>' +
    "<username>" + escapeXml(c.username || "") + "</username>" +
    "<password>" + escapeXml(c.password || "") + "</password>" +
    "<wscode>" + escapeXml(wscode) + "</wscode>" + body +
    "</Input></gwOperation></soap:Body></soap:Envelope>";
}

function xmlValue(xml: string, tag: string): string | null {
  const re = new RegExp("<(?:[A-Za-z0-9_:-]+:)?" + tag + "[^>]*>([\\s\\S]*?)</(?:[A-Za-z0-9_:-]+:)?" + tag + ">", "i");
  const m = xml.match(re);
  return m ? m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,"$1").trim() : null;
}

function xmlInner(xml: string): string {
  return xmlValue(xml, "original") || "";
}

function innerValue(xml: string, tag: string): string | null {
  return xmlValue(xml, tag) || xmlValue(xmlInner(xml), tag);
}

async function emolaCall(r: PaymentRequest, wscode: string, params: Record<string,string>): Promise<string> {
  const wsdl = (r.public_config.wsdl_url || "").trim();
  if (!wsdl) throw new ProviderError("EMOLA_CONFIG_INCOMPLETE", "Configuração E-Mola incompleta.");
  if (!r.credentials.username || !r.credentials.password || !r.credentials.api_key || !r.public_config.partner_code) {
    throw new ProviderError("EMOLA_CREDENTIALS_INCOMPLETE", "Credenciais E-Mola incompletas.");
  }
  const xml = soapInput(wscode, params, r.credentials);
  const response = await fetch(wsdl, {
    method: "POST",
    headers: { "Content-Type": "text/xml; charset=utf-8", "SOAPAction": "gwOperation" },
    body: xml,
  });
  const text = await response.text();
  if (!response.ok) throw new ProviderError("EMOLA_HTTP_" + response.status, text.slice(0,700), retryableStatus(response.status));
  return text;
}

async function emolaInitiate(r: PaymentRequest): Promise<ProviderResult> {
  const transId = r.provider_ref;
  const amount = Number.isInteger(r.amount_cents) ? (r.amount_cents / 100).toString() : (r.amount_cents / 100).toFixed(2);
  const phone = cleanPhone(r.msisdn).replace(/^258/,"");
  const xml = await emolaCall(r,"pushUssdMessage",{
    partnerCode:r.public_config.partner_code || "",
    msisdn:phone,
    transAmount:amount,
    transId,
    key:r.credentials.api_key || "",
    smsContent:"Pagamento BarberOS de " + amount + " MT. Ref: " + r.provider_ref,
    language:r.public_config.language || "pt",
    refNo:r.provider_ref,
  });
  const errorCode = innerValue(xml,"errorCode");
  const tx = innerValue(xml,"gwtransid") || innerValue(xml,"reqeustId") || innerValue(xml,"requestId");
  const message = innerValue(xml,"message");
  if (errorCode !== null && errorCode !== "0") throw new ProviderError("EMOLA_" + errorCode, message || "E-Mola rejeitou a solicitação.");
  return { status:"pending", providerTransactionId:tx, providerStatus:"EMOLA-0", providerMessage:message || "Pedido de pagamento enviado ao E-Mola.", raw:{ response_code:errorCode, transaction_id:tx, message } };
}

async function emolaQuery(r: PaymentRequest): Promise<ProviderResult> {
  const phone = cleanPhone(r.msisdn).replace(/^258/,"");
  const xml = await emolaCall(r,"pushUssdQueryTrans",{
    partnerCode:r.public_config.partner_code || "",
    transId:r.provider_ref,
    key:r.credentials.api_key || "",
    msisdn:phone,
    transType:"QUERY_TXN",
  });
  const code = innerValue(xml,"orgResponseCode");
  const message = innerValue(xml,"orgResponseMessage") || innerValue(xml,"message");
  const tx = innerValue(xml,"gwtransid") || innerValue(xml,"reqeustId") || innerValue(xml,"requestId");
  if (code === "01") return { status:"paid", providerTransactionId:tx, providerStatus:"EMOLA-01", providerMessage:message, raw:{ orgResponseCode:code, message } };
  if (code === "00") return { status:"failed", providerTransactionId:tx, providerStatus:"EMOLA-00", providerMessage:message || "Transacção recusada.", raw:{ orgResponseCode:code, message } };
  return { status:"pending", providerTransactionId:tx, providerStatus:code ? "EMOLA-"+code : null, providerMessage:message || "Pagamento ainda em processamento.", raw:{ orgResponseCode:code, message } };
}

export async function initiatePayment(request: PaymentRequest): Promise<ProviderResult> {
  if (request.provider === "mpesa") return mpesaInitiate(request);
  return emolaInitiate(request);
}

export async function queryPayment(request: PaymentRequest): Promise<ProviderResult> {
  if (request.provider === "mpesa") return mpesaQuery(request);
  return emolaQuery(request);
}
