import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import SiteNav from "../components/SiteNav";
import SiteFooter from "../components/SiteFooter";
import JsonLd from "../components/JsonLd";
import { billeder } from "@/lib/billeder";
import {
  CURRENT_SEASON_LABEL,
  FOUNDING_YEAR,
  PERFORMERS,
  KAPELMESTER,
} from "@/lib/site-config";
import { pageMetadata, performersJsonLd, breadcrumbs } from "@/lib/seo";

export const metadata: Metadata = pageMetadata("sangerinderne");

// Sæsonens besætning kommer fra lib/site-config.ts (én kilde — samme navne som
// på forsiden). TODO(redaktion): Når faktatjekkede biografier pr. sangerinde
// foreligger (karriere, år i Bakkens Hvile, evt. særlig rolle — fx Dot
// Wessmans), tilføjes de i site-config og vises automatisk her. Indtil da
// vises kun navn, rolle og portræt — intet opfindes.
export default function SangerinderePage() {
  return (
    <main>
      <JsonLd
        data={[
          performersJsonLd(),
          breadcrumbs([
            ["Forside", "/"],
            ["Bakkesangerinderne", "/sangerinderne"],
          ]),
        ]}
      />
      <SiteNav />

      <section className="section">
        <div className="prose">
          <p className="eyebrow">Sæsonen {CURRENT_SEASON_LABEL}</p>
          <h1>Bakkesangerinderne — sangerinderne i Bakkens Hvile</h1>
          <p className="lead">
            Bakkesangerinderne — også kaldet syngepigerne — er de sangerinder,
            der optræder på scenen i Bakkens Hvile på Dyrehavsbakken i
            Klampenborg. Traditionen for bakkesangen går tilbage til{" "}
            {FOUNDING_YEAR}, og showet byder på skønsang og syngende
            samfundssatire — fra klassiske danske sange og viser til dagens
            friskeste overskrifter.
          </p>

          <h2>Nuværende bakkesangerinder — sæson {CURRENT_SEASON_LABEL}</h2>
        </div>

        <div className="wrap" style={{ marginTop: 48 }}>
          <div className="singerGrid">
            {PERFORMERS.map((singer) => {
              const billede = billeder[singer.billedeKey];
              return (
                <div className="singerCard" key={singer.name}>
                  <div className="singerPhoto">
                    <Image
                      src={billede.src}
                      alt={billede.alt}
                      width={billede.bredde}
                      height={billede.hoejde}
                      loading="lazy"
                      sizes="(max-width: 560px) 100vw, (max-width: 900px) 50vw, 276px"
                      style={{ objectPosition: "center 25%" }}
                    />
                  </div>
                  <p className="singerName">{singer.name}</p>
                  <p style={{ color: "var(--muted)", fontSize: 14, margin: "4px 0 0" }}>
                    {singer.rolle}
                  </p>
                </div>
              );
            })}
          </div>

          <figure className="kapelmesterFeature">
            <div className="kapelmesterPhoto">
              <Image
                src={billeder.kennethMedSyngepigerne.src}
                alt={billeder.kennethMedSyngepigerne.alt}
                width={billeder.kennethMedSyngepigerne.bredde}
                height={billeder.kennethMedSyngepigerne.hoejde}
                loading="lazy"
                sizes="(max-width: 900px) 100vw, 900px"
                style={{ objectPosition: "center 30%" }}
              />
            </div>
            <figcaption className="kapelmesterCaption">
              Kapelmester {KAPELMESTER.name} akkompagnerer sangerinderne.
            </figcaption>
          </figure>
        </div>

        <div className="prose">
          <h2>Oplev sangerinderne live</h2>
          <p>
            Sangerinderne står på scenen i Bakkens Hvile over{" "}
            <Link href="/book">sæsonens spilledatoer</Link> — og de kan også{" "}
            <Link href="/underholdning-til-fest">
              bookes til fester og arrangementer
            </Link>
            . Nysgerrig på traditionen bag? Læs{" "}
            <Link href="/historie">historien om Bakkens Hvile</Link> og om{" "}
            <Link href="/150-aar">150-års jubilæet i 2027</Link>.
          </p>
          <div className="ctaBand">
            <Link href="/book" className="ctaGold" style={{ padding: "16px 32px" }}>
              Køb billetter
            </Link>
            <Link href="/underholdning-til-fest" className="ctaOutline">
              Book sangerinderne
            </Link>
          </div>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
