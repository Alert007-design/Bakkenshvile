# Opgaver – store selskaber

- [x] Airtable-feltet "Betalingsfrist"
- [x] Migration 007 (tabel group_reservations, kilden 'selskab')
- [x] Pladsbogen: hold uden udløb med kilde 'selskab'; mislykket betaling frigiver ikke 'selskab'; markér solgt pr. booking
- [x] lib/selskab.ts med tests: opret, betal, faktura, fristkørsel
- [x] Mails: invitation, påmindelse, annullering (kunde) og besked til Dot
- [x] Webhook: drikkevarer og betalt-tidspunkt for selskaber; fallback ved flyttet betalingsreference
- [x] Admin: /admin/selskab (opret + liste) og faktura-knap i opslaget
- [x] Kundeside /selskab/[nr] med drikkekort og betaling
- [x] Daglig kørsel i /api/cron/varsel
- [x] Bordplan: status giver gæstenummer og vises med frist
- [x] Typecheck, build og alle tests grønne
- [ ] Ejeren kører migration 007 i databasen
- [ ] Ejeren siger ja, og pull requestet flettes
- [ ] SELSKAB_AUTO_ANNULLERING=true i Vercel, når ejeren vil have automatisk annullering
