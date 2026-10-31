// Kundens adresse ved billetkøb. Postnummeret er krævet (så Bakkens Hvile kan
// se, hvor gæsterne kommer fra). Vej og by er frivillige.
//
// Postnummeret valideres løst, så også udenlandske gæster kan købe
// (fx svensk "123 45" eller tysk "10115").

export interface KundeAdresse {
  adresse: string;
  postnummer: string;
  by: string;
}

const MAKS_LAENGDE = 100;

function ren(v: unknown, maks = MAKS_LAENGDE): string {
  return String(v ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maks);
}

export type AdresseSvar =
  | { ok: true; adresse: KundeAdresse }
  | { ok: false; fejl: string };

export function laesKundeAdresse(input: {
  address?: unknown;
  zip?: unknown;
  city?: unknown;
}): AdresseSvar {
  const postnummer = ren(input.zip, 12);
  if (!postnummer) {
    return { ok: false, fejl: "Postnummer er påkrævet." };
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9 -]{1,9}$/.test(postnummer) || !/\d/.test(postnummer)) {
    return { ok: false, fejl: "Postnummeret ser ikke rigtigt ud." };
  }
  return {
    ok: true,
    adresse: {
      adresse: ren(input.address),
      postnummer,
      by: ren(input.city, 60),
    },
  };
}
