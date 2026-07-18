# NoCap — PRODUCT.md

## Register
**product** (primary) with a sharp brand landing. The core experience is a tool for builders and judges; the homepage sells the belief, the `/verify` and `/hackathon` surfaces do the work.

## Platform
**web**

## Users
- Hackathon builders who need an immutable build timeline
- Judges who must check “started after registration” without trusting git dates
- Organizers who want a public board of participant progress

## Purpose
Prove *when* a project was built by anchoring commit fingerprints on Monad — automatically via GitHub Action — so timelines are verifiable, not claimed.

## Positioning
Onchain build provenance for hackathons. Not a git host. Not a plagiarism detector. Not a token.

Tagline: **your build, no cap.**

## Brand personality
Direct. A little irreverent. Crypto-native. Zero corporate-dashboard energy. Terminal-adjacent confidence without cosplay cyberpunk.

## Anti-references
- Gradient-text SaaS heroes
- Generic shadcn admin templates left unstyled
- Fake “AI insights” that restate the table
- Tokenomics / points gamification
- Mystery-box dashboards with no live chain data

## Trust framing (always say this)
The default path is **CI attestation**: a per-repo burner key anchors commit SHAs.
That is *not* the same as “Alice personally signed this commit.” It’s still the right trust model for hackathon provenance — just say it out loud.

## Conversion & proof
- Green window badge on `/verify` is the one visual that sells the product
- Dogfood: NoCap’s own repo timeline on the landing path
- Judge board turns “send me your link” into “browse the field”

## Accessibility
WCAG AA contrast on text/accent; don’t rely on color alone for pass/fail (badge includes ✅/⛔ text). Keyboard-reachable forms and connect actions.

## Visual direction (summary — see DESIGN.md)
Dark canvas. Mint accent. Monospace for hashes. One green badge that does all the talking.
