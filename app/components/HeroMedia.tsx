"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { billeder } from "@/lib/billeder";

// Videoens poster ligger som asset (ikke i billeder.ts, da det hører til videoen).
// salen.mp4 er STÅENDE (1280x2276, 9:16) — kildefilen bar et -90° rotationsflag.
const POSTER = { src: "/video/salen-poster.jpg", bredde: 1280, hoejde: 2276 };

type Mode = "video" | "posterStill" | "desktopStill";

/**
 * Baggrundsmedie til heroen.
 *
 * Videoen er stående (9:16), så den bruges der, hvor det format passer:
 *
 * - Under 768 px (mobil)            → dæmpet fuldskærms baggrundsvideo (salen.mp4).
 * - Bred skærm (desktop)            → BH (17) som stillbillede. Videoen strækkes
 *   IKKE til fuld bredde — et stående motiv beskåret til en vandret stribe
 *   viser næsten ingenting.
 * - prefers-reduced-motion: reduce  → KUN salen-poster.jpg som stillbillede.
 *   Videoen mountes aldrig, så den hentes heller ikke.
 *
 * Videoelementet findes kun i DOM'en, når betingelserne er opfyldt — derfor
 * er start-tilstanden et stillbillede, og videoen tilføjes først på klienten.
 * Al hero-tekst står i selve siden (page.tsx), ikke i dette medie.
 */
export default function HeroMedia() {
  // SSR/første render: poster-stillbillede. Samme på server og klient →
  // ingen hydration-mismatch. På mobil genbruges posteren som videoens poster.
  const [mode, setMode] = useState<Mode>("posterStill");

  useEffect(() => {
    const reduceMq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const wideMq = window.matchMedia("(min-width: 768px)");

    const update = () => {
      if (reduceMq.matches) setMode("posterStill");
      else if (wideMq.matches) setMode("desktopStill");
      else setMode("video");
    };

    update();
    reduceMq.addEventListener("change", update);
    wideMq.addEventListener("change", update);
    return () => {
      reduceMq.removeEventListener("change", update);
      wideMq.removeEventListener("change", update);
    };
  }, []);

  if (mode === "video") {
    return (
      <video
        className="heroVideo"
        autoPlay
        muted
        loop
        playsInline
        preload="metadata"
        poster={POSTER.src}
        aria-hidden="true"
      >
        <source src="/video/salen.mp4" type="video/mp4" />
      </video>
    );
  }

  if (mode === "posterStill") {
    return (
      <Image
        src={POSTER.src}
        alt=""
        width={POSTER.bredde}
        height={POSTER.hoejde}
        priority
        sizes="100vw"
        aria-hidden="true"
        style={{ objectPosition: "center" }}
      />
    );
  }

  // desktopStill — BH (17)
  const hero = billeder.syngepigerFloejlstaepper;
  return (
    <Image
      src={hero.src}
      alt={hero.alt}
      width={hero.bredde}
      height={hero.hoejde}
      priority
      sizes="100vw"
      style={{ objectPosition: "center 25%" }}
    />
  );
}
