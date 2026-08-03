"use client";

import { useEffect, useRef, useState } from "react";
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

// Afspilningstempo for baggrundsvideoen pr. skærmstørrelse.
// På desktop kører videoen i halvt tempo (roligere baggrund til den
// vandrette stribe); på mobil beholdes det oprindelige tempo. Tempoet
// sættes på selve <video> via playbackRate — kildefilen ændres ikke.
const TEMPO_MOBIL = 1;
const TEMPO_DESKTOP = 0.5;

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
  const videoRef = useRef<HTMLVideoElement>(null);

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
  const tempo = wide ? TEMPO_DESKTOP : TEMPO_MOBIL;

  // Hold playbackRate i sync med skærmstørrelsen. Kører også når videoen
  // lige er mountet, og når man skifter mellem mobil/desktop-bredde.
  useEffect(() => {
    if (mode === "video" && videoRef.current) {
      videoRef.current.playbackRate = tempo;
    }
  }, [mode, tempo]);

  if (mode === "video") {
    return (
      <video
        ref={videoRef}
        className="heroVideo"
        autoPlay
        muted
        loop
        playsInline
        preload="metadata"
        poster={POSTER.src}
        aria-hidden="true"
        style={{ objectPosition: crop }}
        // playbackRate nulstilles til 1, når mediedataen er indlæst —
        // sæt tempoet igen her, så desktop-halveringen holder.
        onLoadedMetadata={(e) => {
          e.currentTarget.playbackRate = tempo;
        }}
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
