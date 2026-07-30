import type { Metadata } from "next";
import LegalPage from "../components/LegalPage";
import { HANDELSBETINGELSER } from "@/lib/legal-content";

export const metadata: Metadata = {
  title: "Handelsbetingelser — Bakkens Hvile",
  description:
    "Handelsbetingelser for køb af billetter og tilvalg i Bakkens Hvile.",
};

export default function Page() {
  return <LegalPage doc={HANDELSBETINGELSER} />;
}
