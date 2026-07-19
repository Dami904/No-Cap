import "server-only";
import { NextResponse } from "next/server";
import { signInstallationCookie } from "@/lib/githubApp";

export const runtime = "nodejs";

/**
 * GitHub redirects here after a user installs (or updates) the NoCap GitHub App —
 * configured as the App's "Setup URL" in its settings. `installation_id` proves
 * GitHub itself granted access (a user can only install an app on repos they
 * administer), which is what makes this a real ownership check, not just a paste box.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const installationId = url.searchParams.get("installation_id");
  const setupAction = url.searchParams.get("setup_action");

  // "request" = a non-admin asked an admin to approve — nothing to connect yet.
  if (!installationId || setupAction === "request") {
    return NextResponse.redirect(new URL("/register?gh=pending", url.origin));
  }

  const res = NextResponse.redirect(new URL("/register?gh=connected", url.origin));
  res.cookies.set("nocap_gh_session", signInstallationCookie(Number(installationId)), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });
  return res;
}
