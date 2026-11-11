// Rettelse af en kundes email fra /admin/opslag.
//
// Emailen står på kundekortet i Customers, ikke på bookingen. Har kunden flere
// bookinger, gælder rettelsen dem alle. Ligner adressen en tastefejl (fx .dl
// i stedet for .dk), gemmes intet, før personalet har bekræftet. Der sendes
// ingen mail herfra, og adresserne skrives aldrig i loggen.

import { FIELDS } from "@/lib/airtable";

const FORM = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/;

// Endelser, der næsten altid er en tastefejl.
const ENDELSER: Record<string, string> = {
  dl: "dk", dkk: "dk", dj: "dk", ck: "dk",
  con: "com", cmo: "com", comm: "com", vom: "com", cm: "com", om: "com", xom: "com",
  ner: "net", nett: "net",
};

// Kendte udbydere, stavet forkert.
const DOMAENER: Record<string, string> = {
  "gmial.com": "gmail.com", "gamil.com": "gmail.com", "gmal.com": "gmail.com",
  "gnail.com": "gmail.com", "gmaill.com": "gmail.com", "gmai.com": "gmail.com",
  "gmail.dk": "gmail.com", "gmail.co": "gmail.com", "googlemail.dk": "gmail.com",
  "hotmial.com": "hotmail.com", "hotmal.com": "hotmail.com", "hotmai.com": "hotmail.com",
  "hotmial.dk": "hotmail.dk", "hotmal.dk": "hotmail.dk", "hotmai.dk": "hotmail.dk",
  "hotamil.com": "hotmail.com", "hotamil.dk": "hotmail.dk",
  "outlok.com": "outlook.com", "outlok.dk": "outlook.dk", "outllok.com": "outlook.com",
  "icloud.dk": "icloud.com", "iclod.com": "icloud.com", "icoud.com": "icloud.com",
  "yaho.com": "yahoo.com", "yahooo.com": "yahoo.com", "yahoo.dk": "yahoo.com",
  "live.dl": "live.dk", "jubii.dl": "jubii.dk", "mail.dl": "mail.dk",
};

export type EmailTjek =
  | { ok: true; email: string; forslag?: string }
  | { ok: false; error: string };

function rettetDomaene(domaene: string): string {
  if (DOMAENER[domaene]) return DOMAENER[domaene];
  const punkt = domaene.lastIndexOf(".");
  const endelse = domaene.slice(punkt + 1);
  if (ENDELSER[endelse]) {
    const rettet = `${domaene.slice(0, punkt)}.${ENDELSER[endelse]}`;
    return DOMAENER[rettet] ?? rettet;
  }
  return domaene;
}

export function tjekEmail(input: unknown): EmailTjek {
  const email = typeof input === "string" ? input.trim().toLowerCase() : "";
  if (!FORM.test(email) || email.split("@").length !== 2) {
    return { ok: false, error: "Det ligner ikke en email. Tjek, at der står fx navn@firma.dk." };
  }
  const [navn, domaene] = email.split("@");
  const nyt = rettetDomaene(domaene);
  if (nyt !== domaene) return { ok: true, email, forslag: `${navn}@${nyt}` };
  return { ok: true, email };
}

type Post = { id: string; fields: Record<string, unknown> };

export interface RetEmailDeps {
  hentBooking(id: string): Promise<Post | null>;
  hentKunde(id: string): Promise<Post | null>;
  opdaterKunde(id: string, felter: Record<string, unknown>): Promise<void>;
  log(besked: string, ctx?: Record<string, unknown>): void;
}

export type RetEmailSvar =
  | { ok: true; email: string; antalBookinger: number }
  | { ok: false; status: number; error: string; forslag?: string };

export async function retKundeEmail(
  deps: RetEmailDeps,
  bookingId: string,
  input: unknown,
  bekraeftet = false
): Promise<RetEmailSvar> {
  const tjek = tjekEmail(input);
  if (!tjek.ok) return { ok: false, status: 400, error: tjek.error };
  if (tjek.forslag && !bekraeftet) {
    return {
      ok: false,
      status: 409,
      error: `Mente du ${tjek.forslag}?`,
      forslag: tjek.forslag,
    };
  }

  const booking = await deps.hentBooking(bookingId);
  if (!booking) return { ok: false, status: 404, error: "Bookingen findes ikke." };
  const kundeId = (booking.fields[FIELDS.booking.customer] as string[] | undefined)?.[0];
  const kunde = kundeId ? await deps.hentKunde(kundeId) : null;
  if (!kunde) {
    return { ok: false, status: 404, error: "Bookingen har intet kundekort, så emailen kan ikke rettes her." };
  }

  const gammel = String(kunde.fields[FIELDS.customer.email] ?? "").trim().toLowerCase();
  if (gammel === tjek.email) {
    return { ok: false, status: 400, error: "Det er den samme email, som står der i forvejen." };
  }

  try {
    await deps.opdaterKunde(kunde.id, { [FIELDS.customer.email]: tjek.email });
  } catch {
    deps.log("Ret email: Airtable kunne ikke opdateres", { bookingId });
    return {
      ok: false,
      status: 502,
      error: "Emailen blev ikke rettet, fordi Airtable ikke svarede. Prøv igen om lidt.",
    };
  }
  const bookinger = kunde.fields[FIELDS.customer.bookings];
  const antalBookinger = Array.isArray(bookinger) && bookinger.length > 0 ? bookinger.length : 1;
  deps.log("Email rettet af personale", { bookingId, antalBookinger });
  return { ok: true, email: tjek.email, antalBookinger };
}
