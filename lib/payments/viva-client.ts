// Lavniveau HTTP-klient mod Viva.com Smart Checkout. Kender INTET til vores
// ordrer, database eller domænelogik — kun Vivas endpoints og datatyper.
// Domænelogikken (mapning til/fra ordrer) ligger i lib/payments/viva.ts.
//
// Sikkerhed: token-endpointets svar-body må ALDRIG logges (indeholder adgangs-
// token). Vivas orderCode er et 16-cifret tal, der overstiger JavaScripts
// sikre heltalsområde — det læses derfor altid ud af den rå respons-tekst som
// streng, aldrig via JSON.parse til et number.

export type VivaEnv = "demo" | "live";

export interface VivaHosts {
  accounts: string; // OAuth2-token
  api: string; // ordrer + transaktioner
  checkout: string; // gæstens checkout-side
  webhookKeyHost: string; // webhook-verifikationsnøgle
}

/** Læser Viva-miljøet fra VIVA_ENV. Default: demo (fejler aldrig til live). */
export function getVivaEnv(): VivaEnv {
  return process.env.VIVA_ENV === "live" ? "live" : "demo";
}

/** Vært-URL'er for det valgte Viva-miljø. */
export function vivaHosts(env: VivaEnv = getVivaEnv()): VivaHosts {
  if (env === "live") {
    return {
      accounts: "https://accounts.vivapayments.com",
      api: "https://api.vivapayments.com",
      checkout: "https://www.vivapayments.com/web/checkout",
      webhookKeyHost: "https://www.vivapayments.com",
    };
  }
  return {
    accounts: "https://demo-accounts.vivapayments.com",
    api: "https://demo-api.vivapayments.com",
    checkout: "https://demo.vivapayments.com/web/checkout",
    webhookKeyHost: "https://demo.vivapayments.com",
  };
}

/** Gæstens checkout-URL for en given ordre. */
export function vivaCheckoutUrl(orderCode: string, env: VivaEnv = getVivaEnv()): string {
  return `${vivaHosts(env).checkout}?ref=${encodeURIComponent(orderCode)}`;
}

/**
 * Vælger Viva payment source pr. flow. Success-/failure-URL sidder på sourcen,
 * så billetter/genbestilling og bordbestilling bruger hver sin. VIVA_SOURCE_CODE
 * beholdes som fallback, så bordbestillingen ikke knækker, hvis de nye variabler
 * ikke er sat endnu.
 */
export function vivaSourceCode(kind: "table" | "tickets"): string {
  const fallback = process.env.VIVA_SOURCE_CODE || "";
  const specific =
    kind === "table"
      ? process.env.VIVA_SOURCE_CODE_TABLE
      : process.env.VIVA_SOURCE_CODE_TICKETS;
  const code = specific || fallback;
  if (!code) {
    throw new Error(
      `Viva source code mangler (${kind}): sæt VIVA_SOURCE_CODE_${
        kind === "table" ? "TABLE" : "TICKETS"
      } eller VIVA_SOURCE_CODE`
    );
  }
  return code;
}

// --- OAuth2-token med cache pr. serverinstans --------------------------------

interface TokenCache {
  token: string;
  expiresAt: number; // epoch ms
}
let tokenCache: TokenCache | null = null;

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} mangler i miljøvariablerne`);
  return v;
}

function basicAuth(id: string, secret: string): string {
  return "Basic " + Buffer.from(`${id}:${secret}`).toString("base64");
}

/**
 * Henter (og cacher) et Viva-adgangstoken via client_credentials. Cachen holder
 * med 60 sek. margin på expires_in, så et token aldrig bruges lige før udløb.
 */
export async function getVivaAccessToken(): Promise<string> {
  if (tokenCache && Date.now() < tokenCache.expiresAt) {
    return tokenCache.token;
  }
  const hosts = vivaHosts();
  const clientId = requireEnv("VIVA_CLIENT_ID");
  const clientSecret = requireEnv("VIVA_CLIENT_SECRET");

  const res = await fetch(`${hosts.accounts}/connect/token`, {
    method: "POST",
    headers: {
      Authorization: basicAuth(clientId, clientSecret),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) {
    // Aldrig svar-body med i loggen — den kan indeholde token/hemmeligheder.
    throw new Error(`Viva token-fejl (HTTP ${res.status})`);
  }
  const data = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!data.access_token) {
    throw new Error("Viva token-svar manglede access_token");
  }
  const ttlSeconds = typeof data.expires_in === "number" ? data.expires_in : 3600;
  tokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + Math.max(0, ttlSeconds - 60) * 1000,
  };
  return data.access_token;
}

/** Kun til test: nulstiller token-cachen. */
export function __resetVivaTokenCache(): void {
  tokenCache = null;
}

// --- Ordrer + transaktioner --------------------------------------------------

/**
 * Læser Vivas 16-cifrede orderCode ud af rå JSON-tekst som STRENG. Bruges
 * bevidst i stedet for JSON.parse, fordi tallet overstiger Number.MAX_SAFE_-
 * INTEGER og ville miste præcision som JavaScript-number. Returnerer null,
 * hvis feltet ikke findes.
 */
export function extractOrderCode(rawText: string): string | null {
  const m = rawText.match(/"orderCode"\s*:\s*"?(\d+)"?/i);
  return m ? m[1] : null;
}

export interface CreateVivaOrderInput {
  amountOre: number; // beløb i øre
  customerTrns: string; // vises for gæsten
  merchantTrns: string; // vores interne reference
  paymentTimeoutSeconds: number;
  sourceCode: string; // hvilken payment source (bestemmer success/failure-URL)
  tags?: string[];
}

/**
 * Opretter en Viva-ordre og returnerer dens orderCode som streng. Beløbet
 * sendes i øre (Vivas /checkout/v2/orders forventer mindste møntenhed).
 */
export async function createVivaOrder(input: CreateVivaOrderInput): Promise<string> {
  const hosts = vivaHosts();
  const token = await getVivaAccessToken();
  const sourceCode = input.sourceCode;

  const res = await fetch(`${hosts.api}/checkout/v2/orders`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      amount: input.amountOre, // i øre
      customerTrns: input.customerTrns,
      merchantTrns: input.merchantTrns,
      paymentTimeout: input.paymentTimeoutSeconds,
      sourceCode,
      preauth: false,
      allowRecurring: false,
      maxInstallments: 0,
      disableCash: true,
      customer: { countryCode: "DK", requestLang: "da-DK" },
      tags: input.tags ?? [],
    }),
  });
  if (!res.ok) {
    throw new Error(`Viva order-fejl (HTTP ${res.status})`);
  }
  // orderCode læses som streng ud af den rå tekst (16 cifre — for stort til
  // et sikkert JavaScript-tal).
  const rawText = await res.text();
  const orderCode = extractOrderCode(rawText);
  if (!orderCode) {
    throw new Error("Viva order-svar manglede orderCode");
  }
  return orderCode;
}

export interface VivaTransaction {
  transactionId: string;
  orderCode: string; // 16-cifret som streng
  statusId: string; // fx "F" (Finished)
  amount: number; // i KRONER (decimaltal) — konverteres i provideren
  currencyCode: string; // ISO-numerisk, fx "208" for DKK
  merchantTrns: string; // vores dashboard-reference (ekko fra ordren)
  tags: string[]; // vores entydige reference (ekko fra ordren)
}

/**
 * Henter en transaktion hos Viva. Returnerer null ved 404 (ukendt
 * transaktion). orderCode læses som streng ud af rå tekst; de øvrige felter er
 * ufarlige at JSON.parse'e. tags/merchantTrns er de værdier, vi selv satte ved
 * oprettelsen — de kommer fra Vivas verificerede svar, aldrig fra webhooken.
 */
export async function retrieveVivaTransaction(
  transactionId: string
): Promise<VivaTransaction | null> {
  const hosts = vivaHosts();
  const token = await getVivaAccessToken();

  const res = await fetch(
    `${hosts.api}/checkout/v2/transactions/${encodeURIComponent(transactionId)}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`Viva transaktions-fejl (HTTP ${res.status})`);
  }
  const rawText = await res.text();
  const parsed = JSON.parse(rawText) as {
    statusId?: string;
    amount?: number | string;
    currencyCode?: string | number;
    merchantTrns?: string;
    tags?: unknown;
  };
  const orderCode = extractOrderCode(rawText);
  if (!orderCode) {
    throw new Error("Viva transaktions-svar manglede orderCode");
  }
  const tags = Array.isArray(parsed.tags)
    ? parsed.tags.filter((t): t is string => typeof t === "string")
    : [];
  return {
    transactionId,
    orderCode,
    statusId: String(parsed.statusId ?? ""),
    amount: Number(parsed.amount ?? NaN),
    currencyCode: String(parsed.currencyCode ?? ""),
    merchantTrns: String(parsed.merchantTrns ?? ""),
    tags,
  };
}

/**
 * Henter Vivas webhook-verifikationsnøgle. Bruges af GET-handshaket på webhook-
 * ruten. Basic auth med merchant-id + api-nøgle (ikke OAuth2-tokenet).
 */
export async function getVivaWebhookKey(): Promise<string> {
  const hosts = vivaHosts();
  const merchantId = requireEnv("VIVA_MERCHANT_ID");
  const apiKey = requireEnv("VIVA_API_KEY");

  const res = await fetch(`${hosts.webhookKeyHost}/api/messages/config/token`, {
    headers: { Authorization: basicAuth(merchantId, apiKey) },
  });
  if (!res.ok) {
    throw new Error(`Viva webhook-nøgle-fejl (HTTP ${res.status})`);
  }
  const data = (await res.json()) as { Key?: string };
  if (!data.Key) {
    throw new Error("Viva webhook-nøgle-svar manglede Key");
  }
  return data.Key;
}
