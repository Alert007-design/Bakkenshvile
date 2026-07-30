import type { Metadata } from "next";
import LegalPage from "../components/LegalPage";
import { PRIVATLIVSPOLITIK } from "@/lib/legal-content";

export const metadata: Metadata = {
  title: "Privatlivspolitik — Bakkens Hvile",
  description:
    "Sådan behandler Bakkens Hvile dine personoplysninger, når du køber billetter.",
};

export default function Page() {
  return <LegalPage doc={PRIVATLIVSPOLITIK} />;
}
