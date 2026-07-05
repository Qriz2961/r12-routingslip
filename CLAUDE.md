# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A single-page, single-file web app: **`index.html`** contains all HTML, CSS, and JavaScript inline — no build step, no package manager, no dependencies. It's a transaction intake and routing-slip generator used by LTFRB Regional Field Office XII (Koronadal City) front-desk staff to register transactions (franchise applications, permits, complaints, etc.) and print a two-page document: a client receipt stub + an internal routing/tracking slip.

Deployment is via Vercel as static hosting (`vercel.json`): the single build step serves `index.html` for all routes.

## Development workflow

There is no build, lint, or test tooling in this repo — it's a static file edited directly.

- **Run locally**: open `index.html` directly in a browser, or serve the directory with any static file server (e.g. `python3 -m http.server`) and visit `index.html`.
- **Deploy**: pushing to the connected branch triggers Vercel's static build (`@vercel/static` per `vercel.json`), which just publishes `index.html` as-is.
- **Test changes manually**: since there's no test suite, verify by exercising the UI in a browser — fill the form, click Create, then Print, and check both the on-screen "Transaction Registered" screen and the print preview (browser print-to-PDF is the easiest way to check `@media print` rules).

## Architecture (all in `index.html`)

The whole app is two "screens" toggled via `display:none`/`display:block`, no routing/framework:

1. **`#screen-form`** — the intake form (applicant info, denomination, request type, optional vehicle units).
2. **`#screen-registered`** — shown after "Create": a receipt-style summary plus the printable routing slip.

### Request-type data encoding

The `<select id="requestType">` options encode multiple fields per transaction type as a single pipe-delimited `value` string, parsed in JS by splitting on `|`:

```
dispCode|mc2017Code|regime|folderColorName|folderColorHex|fee|processingTime
```

`onTxnChange()` and `createTransaction()` both parse this via `value.split('|')`. When adding/editing a request type option, all 7 fields must stay in this exact order — code elsewhere indexes into the array positionally (`p[0]`...`p[6]`).

- `regime` drives reference-code formatting (`VIS` walk-ins get a date-based code; everything else gets an MC-2017-style code — see below).
- `folderColorHex` drives the printed folder-color swatch (`#folderColorBox`), with a light/dark color list (`lightColors`) used to choose readable text/border color on top of it.
- `fee === 'No fee'` (case-insensitive) hides the Cashier row in the printed routing slip table.

### Reference/docket number generation

Two numbering schemes, chosen by `regime` in `createTransaction()`:
- **VIS (walk-in/visitor)**: `VIS-RFRO12-YYYYMMDD-NNNN`
- **Everything else**: `R12-{mc2017Code}-{denomination}-{yyyy}-{monthLetter}-{seq}`, where the month letter comes from the `ML` array (`a`=Jan … `l`=Dec), per MC 2017-002 conventions.

### Sequence counter

A single global counter (`localStorage` keys `rfro12_seq_v6` / `rfro12_seq_v6_year`) is shared across *all* transaction types/denominations and resets to 0 automatically on calendar-year rollover (`nextSeq()`). It is **not** reset per transaction type — don't add per-type counters without checking existing reference-number expectations. There's an admin PIN-gated manual reset (`adminResetCounter()`, PIN hardcoded in JS as `'1217'` — this is a front-desk convenience, not real security).

### Print layout

The `@media print` block is doing structural work, not just styling:
- `@page` is set to `8.5in x 13in` (legal/folio) with a 2in top margin, to match pre-printed department stationery.
- Page 1 = the receipt stub (`.ref-section`, `.txn-details`, `.staff-box`), page 2 = the routing slip (`.slip-wrapper`), split via `page-break-before`/`after` on `.slip-divider`.
- `safePrint()` temporarily forces `#screen-registered` visible and `#screen-form` hidden right before calling `window.print()`, then restores prior visibility state afterward — this is required because the print CSS assumes the registered screen is the one being printed regardless of what's currently shown on screen.
- Background colors (folder color swatch, table header, banners) require explicit `-webkit-print-color-adjust`/`print-color-adjust: exact` on every colored element, since browsers strip backgrounds by default when printing.

## Conventions to preserve when editing

- Keep everything in one file unless explicitly asked to split it up — this is intentionally a zero-dependency, zero-build static page.
- IDs are queried directly via `document.getElementById` throughout (no framework/state management) — renaming an element `id` requires updating every reference in the `<script>` block.
- The entity datalist (`#entityList`) is a flat, manually maintained list of transport cooperatives/companies; add new entities as additional `<option>` alphabetized within their apparent municipal grouping (the list is loosely grouped by municipality, not strictly alphabetical).
