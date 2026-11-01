import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifyStaffSession, STAFF_COOKIE_NAME } from "@/lib/staff-auth";
import OpslagClient from "./OpslagClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

// Opslag på bookingnummer. Bag den fælles login-session (middleware håndhæver
// den også).
export default function OpslagPage({
  searchParams,
}: {
  searchParams: { nr?: string };
}) {
  let session = null;
  try {
    session = verifyStaffSession(cookies().get(STAFF_COOKIE_NAME)?.value);
  } catch {
    session = null;
  }
  if (!session) redirect("/login?next=/admin/opslag");
  return <OpslagClient startNr={typeof searchParams.nr === "string" ? searchParams.nr : ""} />;
}
