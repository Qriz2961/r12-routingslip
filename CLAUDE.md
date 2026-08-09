# CLAUDE.md

This file gives Claude Code (and other AI assistants) the context needed to work in this repository.

## What this repository is

A single-page web app used by **LTFRB Region XII (RFRO XII), Koronadal City** front-desk staff to:

1. Register a new transaction/application (walk-in or TSE-affiliated) and generate a unique **reference/docket number**.
2. Print a two-part document: a client receipt stub (top half) and an internal **routing slip** (bottom half) that travels with the paper folder through six processing stations (PACD → Assessment → Cashier → Tech/Legal/Admin → Records → Completion & Release).

This is a real government front-office tool (LTFRB = Land Transportation Franchising and Regulatory Board, Philippines), not a demo — treat business logic changes (reference number format, fees, processing times, folder colors) as consequential, since they are derived from actual LTFRB memorandum circulars (MC 2017-002 docket numbering, MC 2005-011 folder-color filing rule).

## Codebase structure

The entire application is **one file**:

- `index.html` — everything: markup, `<style>` CSS, and `<script>` vanilla JS. No build step, no framework, no package.json, no dependencies (besides a Google Fonts `<link>` for Inter).
- `vercel.json` — static deployment config. Vercel serves `index.html` via `@vercel/static` and routes all paths to it (`"src": "/(.*)", "dest": "/index.html"`).

There is no server, no database, and no bundler. All "persistence" is `localStorage` in the browser (see below). To work on this app, just open `index.html` directly in a browser or run any static file server — there is nothing to install or compile.

## How the app works

### Two-screen flow
- `#screen-form` — "New Transaction" intake form (applicant info, denomination, request type, optional units).
- `#screen-registered` — shown after `createTransaction()` runs: receipt stub + routing slip, ready to print.

`resetForm()` clears the form and switches back to `#screen-form`; `safePrint()` temporarily forces the registered screen visible (hiding the app bar/form) and calls `window.print()`, then restores the previous DOM state after a delay.

### The `requestType` `<select>` — the core data table
Every `<option>` in `#requestType` encodes a pipe-delimited record in its `value`:

```
dispCode|mc2017Code|regime|folderName|folderHexColor|fee|processingTime
```

Example: `CN|CN|RFRO|Pale Yellow|#FFFFDD|PHP 200 / PHP 40 / PHP 240|4 Working Days, 6 Hours`

This is parsed with `.split('|')` in `onTxnChange()` and `createTransaction()` (see `index.html:730-740`, `:755-762`). When adding/editing a request type:
- Keep exactly 7 `|`-delimited fields in this order.
- `regime` drives reference-number format (`VIS` vs. everything else — see below) and is one of `RFRO`, `MC2017`, `AO`, `VIS`.
- `folderHexColor` must also be added to the `lightColors` array (`index.html:804`) if it's a light/pale color, so the folder-color swatch picks readable text/border contrast.
- Options are grouped into `<optgroup>`s by category (Confirmation, With/Without Hearing, Administrative Operations, Inspection, Certification, Complaints, Special Programs, Walk-in/Admin). Add new types to the matching group rather than creating new groups casually.
- If `fee` is exactly the string `No fee` (case-insensitive), the Cashier row is hidden from the printed routing slip (`index.html:822-826`).

### Reference/docket number generation (`createTransaction()`)
- Non-`VIS` regimes: `R12-{mc2017}-{denom}-{yyyy}-{monthLetter}-{seq}` (e.g. `R12-CN-PJ-2026-h-0001`). Month letters `a`–`l` map Jan–Dec (`ML` array, `index.html:679`), per MC 2017-002.
- `VIS` regime (walk-ins/visits): `VIS-RFRO12-{yyyymmdd}-{seq}`.
- `seq` is a **single running counter shared across all transaction types, denominations, and TSEs**, zero-padded to 4 digits, stored in `localStorage` (`rfro12_seq_v6`) alongside the year it belongs to (`rfro12_seq_v6_year`). It auto-resets to 0 on calendar year rollover (`nextSeq()`, `index.html:687-702`).
- Staff can manually reset the counter via the "⚙ Reset Counter" button (`adminResetCounter()`, `index.html:871-886`), gated by a hardcoded PIN (`1217`) plus a typed `YES` confirmation. This PIN is **not a real secret** (it's client-side JS, visible to anyone) — treat it as a fat-finger guard for staff, not an access control. Don't invest effort hardening it (e.g. moving to a backend) unless the user explicitly asks for real auth.

### Entity/TSE datalist
`#entityList` (`index.html:302-372`) is a flat, hand-maintained list of Transport Service Entity names/acronyms for the "Entity / Company Name" autocomplete. It's static HTML, alphabetically clustered by locale/area, not sorted globally. When adding a TSE, insert it near others from the same municipality for maintainability, matching the existing "Full Name (ACRONYM)" convention.

### Units section
Dynamically-added repeatable `unit-card` blocks (plate number, make/year, engine/chassis no., LTO OR info) via `addUnit()`/`removeUnit()` (`index.html:842-868`). Purely client-side DOM manipulation; unit data is **not** currently read anywhere in `createTransaction()` or included on the printed slip — it exists in the form for staff reference during intake but isn't wired into the output. Be aware of this gap if asked to "print unit details" — it requires new plumbing, not a bug fix.

### Print layout
The `@media print` block (`index.html:145-252`) is the trickiest part of this file:
- Fixed **Folio-size** page (`8.5in x 13in`) with a 2in top margin — this matches a specific pre-printed or standard government form size. Don't change page size without confirming with the user.
- `page-break-before`/`page-break-after` on `.slip-divider` and `.slip-wrapper` force the receipt stub onto page 1 and the routing slip onto page 2.
- `-webkit-print-color-adjust`/`print-color-adjust: exact` is applied repeatedly to force background colors (navy header, folder color swatch, amber banner) to actually print — Chrome/Safari suppress background colors by default otherwise.
- `safePrint()` in JS and the print CSS work together: JS flips which screen is `display:block` right before calling `window.print()`, then the print CSS hides chrome (`app-bar`, form, buttons) that would otherwise still be in the DOM.

If you change print output, **test by actually opening the print preview** (Ctrl/Cmd+P) in a browser — CSS print bugs are invisible in normal screen rendering.

## Conventions

- **No build tooling.** Don't introduce a bundler, npm, TypeScript, or a framework unless explicitly asked — this is intentionally a single static HTML file deployable anywhere.
- **No external JS dependencies.** Keep it vanilla JS. The only external resource is the Google Fonts stylesheet.
- Inline `<style>` and `<script>` in `index.html` — don't split into separate `.css`/`.js` files unless asked; the project is deliberately a single portable file.
- CSS custom properties (`--navy`, `--amber`, `--green`, etc. in `:root`) define the color system — reuse these variables instead of hardcoding new hex colors for UI chrome (folder colors in the request-type table are a separate, deliberately literal color system tied to MC 2005-011 and should stay as explicit hex values).
- IDs, not classes, are used as JS hooks (`document.getElementById(...)`) throughout — keep that pattern for new interactive elements rather than introducing a different selection strategy.
- Comments in the CSS use a `/* ─── SECTION ─────... ─── */` banner style, and the script uses `// ─── SECTION ───...` — match this when adding new sections.

## Testing changes

There is no test suite, linter, or CI configured in this repo. To validate a change:
1. Open `index.html` directly in a browser (or serve it with any static file server).
2. Exercise the form: fill required fields (Date Received, Applicant Name, Denomination, Request Type), click "Create", confirm the reference number, fee, and processing time look right for the chosen request type.
3. Open print preview (Ctrl/Cmd+P) and confirm the stub/routing-slip page break and colors look correct.
4. If you touched the sequence counter logic, check `localStorage` (`rfro12_seq_v6`, `rfro12_seq_v6_year`) in devtools to confirm year-rollover and reset behavior.

## Deployment

Deploys as a static site on Vercel per `vercel.json` — pushing to the connected branch/repo is what ships it. There's no separate build command; Vercel serves `index.html` as-is.
