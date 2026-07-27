import { cookies } from "next/headers";
import { verifyBarSession, BAR_COOKIE_NAME } from "@/lib/bar-auth";
import BarLogin from "./BarLogin";
import BarClient from "./BarClient";
import "./bar.css";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

export default function BarPage() {
  // Session verificeres serverside. csrf sendes til klienten (cookien er
  // HttpOnly og kan ikke læses af JavaScript).
  const cookie = cookies().get(BAR_COOKIE_NAME)?.value;
  let session = null;
  try {
    session = verifyBarSession(cookie);
  } catch {
    session = null;
  }

  if (!session) {
    return <BarLogin />;
  }
  return <BarClient csrf={session.csrf} />;
}
