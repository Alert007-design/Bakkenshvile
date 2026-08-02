import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifyStaffSession, STAFF_COOKIE_NAME } from "@/lib/staff-auth";
import LoginClient from "./LoginClient";
import "./login.css";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

// Kun interne stier tillades som redirect-mål, så login ikke kan misbruges til
// at sende brugeren videre til en fremmed URL (open redirect).
function safeNext(next: string | undefined): string {
  if (typeof next === "string" && next.startsWith("/") && !next.startsWith("//")) {
    return next;
  }
  return "/funktioner";
}

export default function LoginPage({
  searchParams,
}: {
  searchParams: { next?: string };
}) {
  const next = safeNext(searchParams.next);

  // Allerede logget ind? Send direkte videre.
  const session = (() => {
    try {
      return verifyStaffSession(cookies().get(STAFF_COOKIE_NAME)?.value);
    } catch {
      return null;
    }
  })();
  if (session) redirect(next);

  return <LoginClient next={next} />;
}
