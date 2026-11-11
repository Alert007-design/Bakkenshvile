# Nye funktioner på opslagssiden (/admin/opslag)

Godkendt af ejeren 11-11-2026. Fire dele, som bygges og flettes hver for sig.

## A. Note på en reservation
Personalet kan skrive en note på en booking og gemme den. Noten lægges i feltet
"Særlige ønsker" i Airtable efter de eksisterende tekster (adskilt med " | ")
og starter med dato og klokkeslæt, fx "Note 11-11-2026 kl. 19.40: Rullestol".
Den vises under "Bemærkning" på opslaget og på gæstelisten (stjerne). Intet
nyt felt i Airtable. Kunden får ingen mail. Højst 300 tegn pr. note.

## B. Ret kundens email
Knap "Ret email" ved kunden. Adressen tjekkes for form, og typiske tastefejl
(fx .dl, .con, gmial.com) giver en advarsel med forslag. Rettelsen gemmes på
kundekortet i Customers. Bruges kortet af flere bookinger, siges det. Bagefter
kan billetten sendes til den nye adresse med en knap; intet sendes automatisk.

## C. Ekstra billetter til en eksisterende reservation
Knap "Tilføj billetter" på opslaget åbner /admin/ekstrabillet udfyldt med
forestilling, navn, email og telefon. Kunden får en reservationsbekræftelse
med betalingslink til Viva. Mailen nævner det oprindelige bookingnummer. De
ekstra billetter bliver en ny booking med en note, der peger på den gamle.

## D. Flyt en reservation til en anden dato
Knap "Flyt til anden dato" med liste over kommende forestillinger og ledige
pladser. Pladserne flyttes i ét greb; mangler der plads, sker intet. Bordnummer
og gæstenummer nulstilles, varselmailen sættes til at gå ud igen, og der
skrives en note "Flyttet fra …". Kunden får automatisk en ny billet.
Prisforskel (ejerens beslutning): er den nye dato dyrere, får kunden en mail
med betalingslink til Viva for forskellen. Er den billigere, får kunden en
tilgodeseddel på forskellen, som kan bruges i baren på dagen.
