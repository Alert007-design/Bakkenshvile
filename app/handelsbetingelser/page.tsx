import type { Metadata } from "next";
import LegalPage from "../components/LegalPage";
import { HANDELSBETINGELSER } from "@/lib/legal-content";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata("handelsbetingelser");

export default function Page() {
  return <LegalPage doc={HANDELSBETINGELSER} />;
}
