# Mailopsætning — send.bakkenshvile.dk

Kort oversigt over, hvordan bekræftelsesmails sendes, og hvilke DNS-records
der hører til afsenderdomænet.

## Afsenderdomæne

- Afsenderdomænet er **`send.bakkenshvile.dk`**, verificeret i **Resend**.
- Resend-region: **eu-west-1**.

## DNS-records (hostet hos DanDomain)

| Formål | Type | Navn | Værdi |
|--------|------|------|-------|
| DKIM | TXT | (leveret af Resend) | (leveret af Resend) |
| SPF | TXT | (leveret af Resend) | (leveret af Resend) |
| DMARC | TXT | `_dmarc.send` | `v=DMARC1; p=none` |

- **DKIM** og **SPF** ligger som records hos **DanDomain** og signerer/autoriserer
  udgående mail fra `send.bakkenshvile.dk`. De konkrete værdier genereres af
  Resend ved domæneverificeringen.
- **DMARC** er sat til `p=none` (overvågningstilstand — intet afvises).
  Der er **ingen `rua`**, da aggregerede rapporter ikke bruges.

## Afsender- og svaradresse

Sat ét sted, i [`lib/resend.ts`](../lib/resend.ts):

- **From:** `Bakkens Hvile <billetter@send.bakkenshvile.dk>` (konstanten `EMAIL_FROM`)
- **Reply-To:** `kontor@bakkenshvile.dk` (konstanten `EMAIL_REPLY_TO`)

`EMAIL_FROM` kan overstyres via miljøvariablen `EMAIL_FROM`.
