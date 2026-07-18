import "server-only";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getInstallationStore } from "@/lib/installationStore";

export const runtime = "nodejs";

/** Forgets this browser's link to a GitHub App installation. Does NOT uninstall
 *  the App or revoke its access to any repo — that's a GitHub-side action the
 *  user does at github.com/settings/installations. This only clears what NoCap
 *  itself remembers about the current session. */
export async function POST() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get("nocap_gh_session")?.value;
  if (sessionToken) {
    await getInstallationStore().clearInstallation(sessionToken);
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.delete("nocap_gh_session");
  return res;
}
