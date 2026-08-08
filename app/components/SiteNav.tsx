import Link from "next/link";

// Fælles topnavigation for undersiderne (forsiden har sin egen med
// sektions-ankre). Samme klasser og udtryk som forsidens nav.
export default function SiteNav() {
  return (
    <nav className="nav">
      <Link href="/" className="logo">
        BAKKENS <span className="logoAccent">HVILE</span>
      </Link>
      <div className="navlinks">
        <Link href="/sangerinderne">Sangerinderne</Link>
        <Link href="/historie">Historien</Link>
        <Link href="/150-aar">150 år</Link>
        <Link href="/underholdning-til-fest">Fest &amp; firma</Link>
        <Link href="/praktisk">Praktisk</Link>
        <Link href="/book" className="navCta">
          Køb billetter
        </Link>
      </div>
    </nav>
  );
}
