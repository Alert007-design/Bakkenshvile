// Salgsstatus for alle kommende forestillinger. Bag personalelogin.

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifyStaffSession, STAFF_COOKIE_NAME } from "@/lib/staff-auth";
import SalgsstatusClient from "./SalgsstatusClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

export default function SalgsstatusSide() {
  let session = null;
  try {
    session = verifyStaffSession(cookies().get(STAFF_COOKIE_NAME)?.value);
  } catch {
    session = null;
  }
  if (!session) redirect("/login?next=/admin/salgsstatus");
  return <SalgsstatusClient />;
}
