# Viva-opsætning — listen der skal igennem (med login fra Michael)

Alt hvad der skal sættes op hos Viva og i Vercel, før betaling (billetter og
gavekort) kan gå live. Kør den oppefra og ned. Værdier hentes hos Viva; kun
navnene står her — indtast værdierne selv i Vercel.

## 1. API-adgange (Viva → Indstillinger → API-adgange)

Hent og læg i Vercel (Production):

| Vercel-variabel | Hvor hos Viva |
|---|---|
| `VIVA_CLIENT_ID` | API-adgange → Smart Checkout (OAuth2 client credentials) |
| `VIVA_CLIENT_SECRET` | Samme sted |
| `VIVA_MERCHANT_ID` | API-adgange → Merchant ID |
| `VIVA_API_KEY` | API-adgange → API-nøgle |

## 2. Webhook-hemmelighed (du vælger den selv)

| Vercel-variabel | Værdi |
|---|---|
| `VIVA_WEBHOOK_TOKEN` | En lang, tilfældig streng, du selv finder på |

## 3. Betalingskilder (Viva → Salg → Online Betalinger → Hjemmesider/apps)

Opret en kilde pr. flow. Hver kilde bærer sin egen success-/fejl-URL. Kildens
"source code" lægges i Vercel:

| Flow | Vercel-variabel | Success-URL | Fejl-URL |
|---|---|---|---|
| Billetter | `VIVA_SOURCE_CODE_TICKETS` | `https://bakkenshvile.dk/success` | `https://bakkenshvile.dk/afbrudt` |
| **Gavekort** | `VIVA_SOURCE_CODE_GAVEKORT` | `https://bakkenshvile.dk/gavekort/kvittering` | `https://bakkenshvile.dk/gavekort/afbrudt` |
| Bordbestilling (senere) | `VIVA_SOURCE_CODE_TABLE` | `https://bakkenshvile.dk/bord/kvittering` | `https://bakkenshvile.dk/bord/afbrudt` |

## 4. Webhook (registreres ÉN gang — håndterer alle flows)

Viva → webhooks/notifikationer. URL:

```
https://bakkenshvile.dk/api/table-orders/viva/webhook?k=<VIVA_WEBHOOK_TOKEN>
```

Erstat `<VIVA_WEBHOOK_TOKEN>` med præcis værdien fra punkt 2. Ved Vivas
verifikation (GET) svarer koden selv med nøglen — det kræver kun, at
`VIVA_MERCHANT_ID` og `VIVA_API_KEY` er sat.

## 5. Slå live til (fail-closed indtil da)

Hvert flow har sit eget live-flag, og de er bevidst afkoblede: gavekortet kan gå
live, mens billetsalget stadig er under test. Sæt kun dem, du faktisk vil åbne —
alle defaulter til `false` og spærrer fail-closed.

| Vercel-variabel | Værdi |
|---|---|
| `VIVA_ENV` | `live` |
| `GAVEKORT_LIVE` | `true` (kun når gavekort skal live) |
| `TICKETS_LIVE` | `true` (kun når billetsalget skal live) |
| `TABLE_ORDERING_LIVE` | `true` (kun når bordbestilling skal live) |
| `SITE_URL` | `https://bakkenshvile.dk` |

Skal **kun gavekortet** live nu, er det `VIVA_ENV=live` + `GAVEKORT_LIVE=true`.
Lad `TICKETS_LIVE` og `TABLE_ORDERING_LIVE` være usat — billet- og bordflowet
fejler så fortsat lukket, præcis som i dag.

Redeploy til sidst. Verificér med et testkøb i live-miljøet: bekræft
webhook-kvittering, billet-/gavekort-mail og at success-siden viser "gennemført".
