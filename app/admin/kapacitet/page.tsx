// Ejerens overblik over pladserne: kapacitet, solgt/reserveret og tilbage pr.
// forestilling og priskategori. Kun visning — selve justeringen af kapaciteten
// sker i Airtable på den enkelte forestilling.
//
// Siden ligger under /admin og er derfor bag personalelogin (middleware.ts).

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifyStaffSession, STAFF_COOKIE_NAME } from "@/lib/staff-auth";
import KapacitetClient from "./KapacitetClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

export default function KapacitetSide() {
  let session = null;
  try {
    session = verifyStaffSession(cookies().get(STAFF_COOKIE_NAME)?.value);
  } catch {
    session = null;
  }
  if (!session) redirect("/login?next=/admin/kapacitet");

  return <KapacitetClient csrf={session.csrf} />;
}
