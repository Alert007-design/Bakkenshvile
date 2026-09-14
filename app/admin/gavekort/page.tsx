import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { listGiftCards } from "@/lib/gift-cards";
import { verifyStaffSession, STAFF_COOKIE_NAME } from "@/lib/staff-auth";
import GavekortAdmin from "./GavekortAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

// Personale-oversigt over gavekort. Adgang via den fælles personalesession
// (middleware håndhæver den også). csrf sendes til klienten til "markér brugt".
export default async function AdminGavekortPage() {
  let session = null;
  try {
    session = verifyStaffSession(cookies().get(STAFF_COOKIE_NAME)?.value);
  } catch {
    session = null;
  }
  if (!session) redirect("/login?next=/admin/gavekort");

  const cards = await listGiftCards(getDb());
  return <GavekortAdmin initialCards={cards} csrf={session.csrf} />;
}
