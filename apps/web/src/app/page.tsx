import Link from "next/link";
import { ADDRESSES, DEFAULT_HACKATHON, SITE } from "@/lib/config";
import { formatTs, shorten } from "@/lib/format";
import { explorerAddressUrl, ZERO_ADDRESS } from "@nocap/shared";
import { SelfProof } from "@/components/SelfProof";

export default function HomePage() {
  return (
    <div>
      <section className="hero">
        <div>
          <div className="kicker">onchain build provenance · monad testnet</div>
          <h1>
            Your build, <em>no cap.</em>
          </h1>
          <p className="lead">{SITE.description}</p>
          <p className="lead" style={{ color: "var(--text)" }}>
            Git timestamps can be rewritten. Rebases lie. Chain time can&apos;t.
          </p>
          <div className="btn-row">
            <Link className="btn btn-primary" href="/register">
              Register a project
            </Link>
            <Link className="btn" href={`/hackathon/${DEFAULT_HACKATHON.idString}`}>
              Judge board
            </Link>
          </div>
        </div>
        <div>
          <div className="terminal" aria-hidden>
            <div className="terminal-bar">
              <i />
              <i />
              <i />
              <span>~/your-app</span>
            </div>
            <div className="terminal-body">
              <p>
                <span className="t-prompt">$</span> git push origin main
              </p>
              <p className="t-dim">⚡ NoCap Action · anchor(repoId, 6ff3a2c)</p>
              <p className="t-ok">✓ anchored on Monad · finalized in ~800ms</p>
              <p>
                <span className="t-prompt">$</span> nocap verify
              </p>
              <p className="t-ok">✓ No Cap — build started inside the window</p>
            </div>
          </div>
          <div style={{ marginTop: "1rem" }}>
            <SelfProof />
          </div>
        </div>
      </section>

      <section className="steps">
        <div className="step">
          <div className="step-num">01</div>
          <h2>Register</h2>
          <p>
            Claim your repo onchain. First registrant wins ownership — then authorize your CI
            burner as a contributor.
          </p>
        </div>
        <div className="step">
          <div className="step-num">02</div>
          <h2>Build</h2>
          <p>
            Every push fires the GitHub Action → <code>anchor()</code> on Monad. Zero manual
            effort.
          </p>
        </div>
        <div className="step">
          <div className="step-num">03</div>
          <h2>Verify</h2>
          <p>
            Judges open a public timeline and one green badge. No wallet needed, nothing to
            trust but the chain.
          </p>
        </div>
      </section>

      <section className="card band">
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "baseline",
            gap: "0.5rem 1rem",
            marginBottom: "0.5rem",
          }}
        >
          <h2 style={{ margin: 0, letterSpacing: "-0.02em" }}>
            {DEFAULT_HACKATHON.name}
          </h2>
          <span className="badge-ok" style={{ fontSize: "0.75rem" }}>
            ● live window
          </span>
        </div>
        <p className="muted mono" style={{ margin: 0 }}>
          {formatTs(DEFAULT_HACKATHON.startTime)}
          {" → "}
          {formatTs(DEFAULT_HACKATHON.endTime)}
        </p>
        <p className="dim" style={{ margin: "0.75rem 0 0", fontSize: "0.9rem" }}>
          Anchors inside a window earn its green badge. One protocol, any hackathon —{" "}
          <Link href="/organizer">organizers seed new windows</Link>; Spark 2026 is the one
          running now.
        </p>
      </section>

      {ADDRESSES.registry !== ZERO_ADDRESS && (
        <section className="grid-3 band">
          <div className="stat">
            <div className="label">Registry contract</div>
            <div className="value mono" style={{ fontSize: "1.05rem" }}>
              <a
                href={explorerAddressUrl(ADDRESSES.registry)}
                target="_blank"
                rel="noreferrer"
              >
                {shorten(ADDRESSES.registry, 6)} ↗
              </a>
            </div>
            <p className="dim" style={{ margin: "0.5rem 0 0", fontSize: "0.9rem" }}>
              Every anchor is a public event — audit it yourself.
            </p>
          </div>
          <div className="stat">
            <div className="label">Chain</div>
            <div className="value" style={{ fontSize: "1.05rem" }}>
              Monad testnet
            </div>
            <p className="dim" style={{ margin: "0.5rem 0 0", fontSize: "0.9rem" }}>
              Chain id <span className="mono">10143</span> · ~400ms blocks.
            </p>
          </div>
          <div className="stat">
            <div className="label">Cost per anchor</div>
            <div className="value" style={{ fontSize: "1.05rem" }}>
              Fractions of a cent
            </div>
            <p className="dim" style={{ margin: "0.5rem 0 0", fontSize: "0.9rem" }}>
              One event per commit — hashes and labels only.
            </p>
          </div>
        </section>
      )}
    </div>
  );
}
