# Kør migration 008 (prisforskel ved flytning) – klik for klik

`migrations/008_prisforskel.sql` lader betalingstabellen `ticket_payments`
kende en ny slags betaling, "prisforskel". Den bruges, når personalet flytter
en reservation til en dyrere dato. Ingen data røres; kun reglen for, hvilke
slags betalinger tabellen tager imod, ændres. Den kan køres igen uden skade.

Kør den, FØR ændringen flettes. Ellers kan betalingslinket for prisforskel
ikke oprettes (flytningen sker stadig, men personalet får en advarsel).

## Sådan

1. Gå til <https://vercel.com>, log ind, og vælg projektet **Bakkenshvile**.
2. Klik fanen **Storage**, og åbn Postgres-databasen.
3. Vælg fanen **Query**.
4. Indsæt disse to linjer:

```sql
ALTER TABLE ticket_payments DROP CONSTRAINT IF EXISTS ticket_payments_flow_check;
ALTER TABLE ticket_payments ADD CONSTRAINT ticket_payments_flow_check CHECK (flow IN ('billet','genbestil','prisforskel'));
```

5. Klik **Run**. Der må ikke stå nogen fejl.

## Bekræft, at det virkede

Kør denne i samme felt:

```sql
SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'ticket_payments_flow_check';
```

Svaret skal indeholde `'prisforskel'`.
