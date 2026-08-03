"use client";

import { useEffect, useState } from "react";
import Image from "next/image";

// Videoens poster ligger som asset (ikke i billeder.ts, da det hører til videoen).
// salen.mp4 er STÅENDE (1280x2276, 9:16) — kildefilen bar et -90° rotationsflag.
const POSTER = { src: "/video/salen-poster.jpg", bredde: 1280, hoejde: 2276 };

// Udsnit af det stående motiv, der vises på hver skærmstørrelse.
// Videoen skaleres efter bredden, så på en bred skærm ses kun en vandret
// stribe af motivet. Juster tallet for at flytte striben op (lavere) eller
// ned (højere).
const CROP_MOBIL = "center center";
const CROP_DESKTOP = "center 35%";

type Mode = "video" | "posterStill";

/**
 * Baggrundsmedie til heroen.
 *
 * - Normal visning (mobil og desktop) → dæmpet baggrundsvideo (salen.mp4).
 * - prefers-reduced-motion: reduce     → KUN salen-poster.jpg som stillbillede.
 *   Videoen mountes aldrig, så den hentes heller ikke.
 *
 * Videoelementet findes kun i DOM'en, når betingelserne er opfyldt — derfor
 * er start-tilstanden et stillbillede, og videoen tilføjes først på klienten.
 * Al hero-tekst står i selve siden (page.tsx), ikke i dette medie.
 */
export default function HeroMedia() {
  // SSR/første render: poster-stillbillede. Samme på server og klient →
  // ingen hydration-mismatch. Posteren genbruges som videoens poster.
  const [mode, setMode] = useState<Mode>("posterStill");
  const [wide, setWide] = useState(false);

  useEffect(() => {
    const reduceMq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const wideMq = window.matchMedia("(min-width: 768px)");

    const update = () => {
      setWide(wideMq.matches);
      setMode(reduceMq.matches ? "posterStill" : "video");
    };

    update();
    reduceMq.addEventListener("change", update);
    wideMq.addEventListener("change", update);
    return () => {
      reduceMq.removeEventListener("change", update);
      wideMq.removeEventListener("change", update);
    };
  }, []);

  const crop = wide ? CROP_DESKTOP : CROP_MOBIL;

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
        style={{ objectPosition: crop }}
      >
        <source src="/video/salen.mp4" type="video/mp4" />
      </video>
    );
  }

  // posterStill — vises ved prefers-reduced-motion og ved første render.
  return (
    <Image
      src={POSTER.src}
      alt=""
      width={POSTER.bredde}
      height={POSTER.hoejde}
      priority
      sizes="100vw"
      aria-hidden="true"
      style={{ objectPosition: crop }}
    />
  );
}
