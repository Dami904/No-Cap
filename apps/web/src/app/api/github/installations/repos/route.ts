import "server-only";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { listInstallationRepos, verifyInstallationCookie } from "@/lib/githubApp";

export const runtime = "nodejs";

/** Repos the current browser's GitHub App installation can see — powers the
 *  /register picker. No installation cookie = not connected yet, not an error. */
export async function GET() {
  const cookieStore = await cookies();
  const installationId = verifyInstallationCookie(
    cookieStore.get("nocap_gh_session")?.value
  );
  if (!installationId) {
    return NextResponse.json({ connected: false, repos: [] });
  }

  try {
    const repos = await listInstallationRepos(installationId);
    return NextResponse.json({ connected: true, repos });
  } catch (e) {
    return NextResponse.json(
      { connected: true, repos: [], error: e instanceof Error ? e.message : "lookup failed" },
      { status: 502 }
    );
  }
}
