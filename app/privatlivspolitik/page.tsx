import type { Metadata } from "next";
import LegalPage from "../components/LegalPage";
import { PRIVATLIVSPOLITIK } from "@/lib/legal-content";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata("privatlivspolitik");

export default function Page() {
  return <LegalPage doc={PRIVATLIVSPOLITIK} />;
}
