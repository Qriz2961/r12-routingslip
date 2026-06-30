# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

A single-file, browser-only Transaction Management System (TMS) for LTFRB RFRO XII (Land Transportation Franchising and Regulatory Board, Regional Franchising and Regulatory Office, Region XII) in Koronadal City, Philippines. It generates routing slips for franchise/permit transactions.

## Running / Developing

No build system, no package manager, no dependencies. The entire app is `index.html`.

- **Develop**: Open `index.html` directly in a browser, or serve with any static file server (e.g., `python3 -m http.server`)
- **Deploy**: Push to the repo — Vercel picks it up automatically via `vercel.json` and serves `index.html` as a static asset at all routes

There are no tests, no linting tools, and no build steps.

## Architecture

The app lives entirely in one file (`index.html`) with three sections: CSS (lines 8–252), HTML markup (lines 255–676), and JavaScript (lines 677–932).

### Two-Screen Flow

- **Screen 1** (`#screen-form`): The transaction entry form. Applicant name, entity (TSE), denomination, and request type are required. Units are optional.
- **Screen 2** (`#screen-registered`): Shows the registered transaction stub and a printable routing slip. Triggered by `createTransaction()`.
- `resetForm()` / "Done" returns to Screen 1.

### Transaction Type Option Encoding

Request type `<option>` values are pipe-delimited with 7 fields:
```
displayCode|mc2017Code|regime|folderColorName|folderHex|fee|processingTime
```
Example: `"CN|CN|RFRO|Pale Yellow|#FFFFDD|PHP 240|4 Working Days, 6 Hours"`

- `p[0]` — display code (shown in routing slip, may include suffix like `SP-ST`)
- `p[1]` — MC 2017-002 code (used in reference number)
- `p[2]` — regime: `RFRO`, `MC2017`, `AO`, or `VIS`
- `p[3]` — folder color name (text label in MC-banner)
- `p[4]` — hex color (applied to the folder color swatch via inline `style`)
- `p[5]` — fee string
- `p[6]` — processing time string

### Reference Number Generation

Two formats, determined by `regime`:

- **VIS** (walk-in/visitor): `VIS-RFRO12-YYYYMMDD-NNNN`
- **All others**: `R12-{mc2017Code}-{denom}-{YYYY}-{monthLetter}-{NNNN}`

Month letters follow MC 2017-002: `a`=Jan, `b`=Feb, … `l`=Dec (array `ML` at line 679).

### Sequence Counter (localStorage)

The docket counter is global — shared across all transaction types, denominations, and TSEs. It auto-resets on year rollover.

| localStorage key | Purpose |
|---|---|
| `rfro12_seq_v6` | Current counter integer |
| `rfro12_seq_v6_year` | Year the counter belongs to |

Admin reset requires PIN `1217` (see `adminResetCounter()` at line 871). The PIN is hardcoded — change it there if needed.

### Print Layout

- Page size: Folio 8.5×13 in, portrait, 2-inch top margin
- Page 1: Transaction receipt stub (`.reg-hdr`, `.ref-section`, `.txn-details`, `.staff-box`)
- Page 2: Routing slip (`.slip-wrapper`) — forced via `page-break-before: always` on `.slip-wrapper`
- `.slip-divider` is the visual clip-line between the two sections; it becomes an invisible page break in print
- `safePrint()` (line 901) temporarily forces visibility of Screen 2 before calling `window.print()`, then restores DOM state

### Cashier Row Logic

The Cashier row (`#cashierRow`) is hidden when the selected transaction has fee `"No fee"` (case-insensitive check in `createTransaction()` around line 823).

### Folder Color Swatch

The `#folderColorBox` background is set via inline `style` attribute (not a CSS class) to ensure `print-color-adjust: exact` works reliably across browsers. Light colors (white, pale yellow, etc.) get dark text/border; dark colors get light text (see `lightColors` array at line 804).

## Adding or Modifying Transaction Types

Add/edit `<option>` elements inside the appropriate `<optgroup>` in the `#requestType` select (lines 401–500). Follow the pipe-delimited format above. The folder hex must be a valid CSS color; if it's in the `lightColors` array in `createTransaction()`, add it there too so the swatch label remains readable.

## Adding TSE Names

Add `<option value="...">` entries to `<datalist id="entityList">` (lines 303–372). The value is the full TSE name including the acronym in parentheses.
