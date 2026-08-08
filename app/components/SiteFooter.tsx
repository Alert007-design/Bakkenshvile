import Link from "next/link";
import { ADDRESS, CONTACT } from "@/lib/site-config";

// Fælles footer med den fulde interne linkgraf: alle offentlige sider kan nås
// fra alle sider (SEO + navigation), og NAP-oplysningerne (navn, adresse,
// CVR) vises konsistent overalt.
export default function SiteFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="footer">
      <div className="brand">BAKKENS HVILE</div>
      <nav className="footerLinks" aria-label="Oversigt over sider">
        <Link href="/book">Billetter</Link>
        <Link href="/priser">Drikkekort</Link>
        <Link href="/sangerinderne">Sangerinderne</Link>
        <Link href="/historie">Historien</Link>
        <Link href="/150-aar">150 år</Link>
        <Link href="/underholdning-til-fest">Fest &amp; firma</Link>
        <Link href="/show-koebenhavn">Show i København</Link>
        <Link href="/praktisk">Praktisk info</Link>
        <Link href="/handelsbetingelser">Handelsbetingelser</Link>
        <Link href="/privatlivspolitik">Privatlivspolitik</Link>
        <Link href="/en">English</Link>
      </nav>
      <div className="meta">
        Bakkens Hvile · {ADDRESS.streetAddress} · {ADDRESS.postalCode}{" "}
        {ADDRESS.addressLocality} · CVR {CONTACT.cvr} · © {year}
      </div>
    </footer>
  );
}
