"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { billeder } from "@/lib/billeder";

// Videoens poster ligger som asset (ikke i billeder.ts, da det hører til videoen).
const POSTER = { src: "/video/salen-poster.jpg", bredde: 1280, hoejde: 2276 };

type Mode = "video" | "posterStill" | "mobileStill";

/**
 * Baggrundsmedie til heroen.
 *
 * - Bred skærm + bevægelse tilladt  → dæmpet baggrundsvideo (salen.mp4).
 * - prefers-reduced-motion: reduce  → KUN salen-poster.jpg som stillbillede.
 *   Videoen mountes aldrig, så den hentes heller ikke.
 * - Under 768 px                    → BH (17) som stillbillede (en 16:9-video
 *   beskåret til mobil viser næsten ingenting).
 *
 * Videoelementet findes kun i DOM'en, når betingelserne er opfyldt — derfor
 * er start-tilstanden et stillbillede, og videoen tilføjes først på klienten.
 * Al hero-tekst står i selve siden (page.tsx), ikke i dette medie.
 */
export default function HeroMedia() {
  // SSR/første render: poster-stillbillede. Samme på server og klient →
  // ingen hydration-mismatch. Videoens poster genbruges, hvis videoen mountes.
  const [mode, setMode] = useState<Mode>("posterStill");

  useEffect(() => {
    const reduceMq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const wideMq = window.matchMedia("(min-width: 768px)");

    const update = () => {
      if (reduceMq.matches) setMode("posterStill");
      else if (wideMq.matches) setMode("video");
      else setMode("mobileStill");
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

  // mobileStill — BH (17)
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
