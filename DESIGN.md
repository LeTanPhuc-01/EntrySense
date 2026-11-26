# EntrySense — Design System (`DESIGN.md`)

## Aesthetic Direction
EntrySense is a strictly read-only, glanceable parking occupancy instrument modeled after Apple Human Interface Guidelines (iOS Weather, Apple Fitness, Apple Health, and macOS Settings). Every surface prioritizes optical clarity, tactile restraint, and instantaneous legibility on mobile and desktop.

## Anti-Slop Principles (`pbakaus/impeccable`)
1. **Native Optical Typography:** No coding-font clichés (`Plus Jakarta Sans`, `JetBrains Mono`, or `Inter` defaults). Uses Apple's native optical sans stack (`-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Helvetica Neue", system-ui, sans-serif`) with `font-variant-numeric: tabular-nums` for aligned live metrics and zero external font flicker.
2. **Perceptual OKLCH Neutrals:** No generic Tailwind slate-navy boilerplate (`#F8FAFC` / `#0B0F17`) or heavy `1px` gray box borders. Surfaces use calibrated OKLCH neutral steps (`#F5F5F7` canvas / `#FFFFFF` elevated in light; `#09090B` obsidian canvas / `#161618` elevated with subtle top specular hairlines in dark).
3. **Zero Structural Clutter:** No rounded-square icon tiles (`rounded-xl bg-*`) beside headings or list rows, no nested cards-within-cards, and no competing rainbow accents. Hierarchy relies on weight, optical tracking, whitespace, and `0.5px` hairlines.
4. **Purposeful Spring Physics:** Interactive transitions (`motion/react` wrapped in `<MotionConfig reducedMotion="user">`) use damped spring physics for segmented pills, floating glass navigation, availability ring sweeps, interactive chart scrubbing, and iOS toggle switches.

## Semantic Color System
- **Primary Accent:** Apple System Blue (`--accent`) for interactive controls, segmented selections, and primary install/retry actions.
- **Availability Status:**
  - Open spaces (`--status-good` / `--status-good-fill`): Emerald/Apple Green
  - Low availability or stale warning (`--status-warn` / `--status-warn-fill`): Amber/Apple Orange
  - Full lot or counter offline (`--status-danger` / `--status-danger-fill`): Apple Red
- **Popular Times Chart (`America/Chicago`):**
  - Historical typical (`--chart-typical` / `--chart-typical-active`): Soft sky blue
  - Earlier today (`--chart-today-fill` / `--chart-today-cap`): Translucent teal with crisp top cap
  - Live current hour (`--chart-live-fill` / `--chart-live-cap`): Translucent rose with crisp top cap

## Strict Product & UI Invariants
- **Strictly Read-Only:** End-user phones never expose controls, API keys, or endpoints to mutate counts, lot settings, or session resets.
- **Zero Private/Camera Leakage:** Never store, accept, or render camera images, stream URLs, device IDs, or Tailscale IPs.
- **Occupancy Gauge Rules:** Headline `free` clamped at `0`; actual `occupied` of `capacity` shown (allowing `occupied > capacity` while clamping progress bars at 100%); `Live` vs `Live · from Pi` source badge; `Count may be out of date` at `>= 150 s`; `Counter offline` at `>= 900 s` without ever hiding numbers.
- **Popular Times Chart Rules:** Renders in `America/Chicago` (`CT`) with layered historical typical, earlier today, and `LIVE` current-hour bar plus `"Busier than usual"`, `"As busy as usual"`, or `"Less busy than usual"` comparison copy.
