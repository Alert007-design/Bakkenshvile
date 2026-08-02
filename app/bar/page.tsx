import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifyStaffSession, STAFF_COOKIE_NAME } from "@/lib/staff-auth";
import BarClient from "./BarClient";
import "./bar.css";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

export default function BarPage() {
  // Session verificeres serverside (defense-in-depth oven på middleware). csrf
  // sendes til klienten (cookien er HttpOnly og kan ikke læses af JavaScript).
  let session = null;
  try {
    session = verifyStaffSession(cookies().get(STAFF_COOKIE_NAME)?.value);
  } catch {
    session = null;
  }
  if (!session) redirect("/login?next=/bar");

  return <BarClient csrf={session.csrf} />;
}
