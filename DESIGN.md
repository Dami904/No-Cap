# NoCap — DESIGN.md

## Theme
Dark, dense, tool-first. Slightly irreverent crypto-native — not neon vaporwave, not enterprise gray.

## Color
| Token | Value | Use |
|-------|--------|-----|
| bg | `#0b0c0f` | page |
| elevated | `#12141a` / `#161922` | cards |
| border | `#2a2e3a` | hairlines |
| text | `#eef0f5` | primary |
| muted | `#9aa3b5` | secondary |
| accent | `#6ee7b7` | CTAs, timeline spine, pass state |
| warn | `#fbbf24` | anomaly signals |
| danger | `#f87171` | fail badge |
| link | `#7dd3fc` | external refs |

Atmosphere: soft mint + ice radial washes — not full-bleed gradients on text.

## Typography
- **Sans:** DM Sans — UI, body, headings (tight tracking on H1)
- **Mono:** IBM Plex Mono — hashes, addresses, timestamps, repoIds

## Components
- Pill buttons (primary = solid mint on near-black text)
- Cards with 12px radius, deep shadow
- Vertical timeline with mint spine (not a table of rows as the hero)
- Status pills: ok / bad / warn — always with icon or text, not color alone
- Stat tiles for anchors / streak / contributors

## Layout
- Max width ~1320px shell (widens on large monitors instead of stranding content in a narrow column)
- Sticky minimal nav
- Verify page: timeline primary column, signals secondary
- Judge board: dense table, sortable, public (no wallet chrome required)

## Motion
Minimal. Prefer state changes over decorative animation. No hover-image gimmicks.

## Do not
- Gradient text heroes
- Default purple/blue shadcn look
- Inter-only generic SaaS
- Soft gray cards on white with blue primary
