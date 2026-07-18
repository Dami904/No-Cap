import "server-only";
import { NextResponse, after } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { processPush, type PushCommit } from "@/lib/relayerClient";

export const runtime = "nodejs"; // needs node:crypto + a persistent-enough process for after()

function verifySignature(rawBody: string, header: string | null, secret: string): boolean {
  if (!header || !header.startsWith("sha256=")) return false;
  const expected =
    "sha256=" + createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(header);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * GitHub push webhook → auto-anchor. Verifies the signature, acknowledges
 * immediately (GitHub retries on ~10s timeout), then does the actual onchain
 * work in `after()` so webhook latency is never coupled to block-confirmation
 * latency. See lib/relayerClient.ts for the anchoring logic itself.
 */
export async function POST(req: Request) {
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "webhook not configured" }, { status: 503 });
  }

  const rawBody = await req.text();
  const signature = req.headers.get("x-hub-signature-256");
  if (!verifySignature(rawBody, signature, secret)) {
    return NextResponse.json({ error: "signature mismatch" }, { status: 401 });
  }

  const event = req.headers.get("x-github-event");
  if (event === "ping") {
    return NextResponse.json({ ok: true, pong: true });
  }
  if (event !== "push") {
    return NextResponse.json({ ok: true, skipped: `unhandled event: ${event}` });
  }

  let payload: {
    repository?: { full_name?: string };
    commits?: PushCommit[];
    deleted?: boolean;
  };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const fullName = payload.repository?.full_name;
  const commits = payload.commits ?? [];
  if (payload.deleted || !fullName || commits.length === 0) {
    return NextResponse.json({ ok: true, skipped: "no commits to anchor" });
  }

  after(async () => {
    try {
      const result = await processPush(fullName, commits);
      // Structured log only — no secrets, safe for a hosting platform's log viewer.
      console.log(
        `[nocap-webhook] ${fullName} repoId=${result.repoId} anchored=${result.anchored.length} skipped=${result.skipped.length}`,
        JSON.stringify(result.skipped)
      );
    } catch (e) {
      console.error(`[nocap-webhook] processPush failed for ${fullName}:`, e);
    }
  });

  return NextResponse.json({ ok: true, queued: commits.length });
}
