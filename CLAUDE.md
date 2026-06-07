# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is the **LTFRB Region XII Transaction & Routing Slip Generator** — a browser-based tool for Koronadal City staff to generate printable transaction receipt stubs and routing slips for land transport franchise applications and regulatory transactions.

## Tech Stack & Deployment

- **Vanilla HTML/CSS/JS only** — no build tools, no package manager, no frameworks, no dependencies
- Single file: `index.html` (~935 lines) contains all markup, styles, and logic
- Deployed as a static site via **Vercel** (`vercel.json`)
- No build, lint, or test commands exist — open `index.html` directly in a browser to develop

## Architecture

The app is a two-screen SPA driven entirely by DOM manipulation:

**Screen 1 (`#screen-form`)** — New Transaction Form  
Fields: date received, applicant name, entity name (autocomplete from ~70 TSE cooperatives), denomination, request type, contact, email, and a dynamic list of vehicle units.

**Screen 2 (`#screen-registered`)** — Confirmation + Routing Slip  
Populated from form values after submission. Contains a printable 2-page document (Folio 8.5"×13"): Page 1 is a receipt stub; Page 2 is the routing slip with a 6-station processing workflow table.

### Data Flow

```
Form submit → parse request type option value → generate reference code
→ increment localStorage counter → populate Screen 2 DOM → user prints
→ safePrint() swaps screens for clean print output → reset & return to Screen 1
```

### State

- **`localStorage`**: Sequence counter (`rfro12_seq_v6`) and its year (`rfro12_seq_v6_year`) — resets automatically on January 1
- **`_currentParts`** (module-level var): Parsed metadata from the selected transaction type, used when building Screen 2
- **`unitCount`** (module-level var): Tracks how many vehicle unit cards are currently rendered

## Key Business Logic

### Transaction Type Option Format
Each `<option>` in `#requestType` encodes 7 pipe-delimited fields:
```
"CN|CN|RFRO|Pale Yellow|#FFFFDD|PHP 200 / PHP 40 / PHP 240|4 Working Days, 6 Hours"
  0  1   2       3          4            5                           6
  │  │   │       │          │            └─ processing time
  │  │   │       │          └─ folder hex color
  │  │   │       └─ folder color name
  │  │   └─ regulatory regime (RFRO, MC2017, AO, etc.)
  │  └─ MC2017 sub-code (CN, EV, MR, TN, CV, …)
  └─ display code
```
Parsed in JS via `.split('|')` — index positions matter, don't reorder.

### Reference Code Generation
- **Standard format**: `R12-{mc2017}-{denom}-{YYYY}-{monthLetter}-{SEQ}`  
  Example: `R12-MC2017-CN-2026-a-0042`  
  Month letters: `['a','b','c','d','e','f','g','h','i','j','k','l']` (index 0–11)
- **VIS (Visitor) format**: `VIS-RFRO12-{YYYYMMDD}-{SEQ}`
- SEQ is 4-digit zero-padded (`0001`–`9999`), persisted in localStorage

### Cashier Row Logic
The Cashier row (station 3 in the routing slip table) is **hidden when fee is `"No fee"`**. Remaining row numbers (4–6) are not renumbered.

### Admin Counter Reset
PIN `1217` resets the sequence counter — triggered from a hidden UI affordance.

## CSS Conventions

Design tokens defined in `:root`:
```css
--navy: #1a3a4a   /* primary */
--amber: #d4a537  /* accent */
--green: #2e7d32
--blue: #1565c0
--red: #c62828
--radius: 8px
```

- **Class names**: `kebab-case` (`.app-bar`, `.unit-card`, `.slip-wrapper`, `.rtable`)
- **IDs**: `camelCase` (`#applicantName`, `#unitsList`, `#screen-registered`)
- State toggled via `.show` class on `#infoBox`

## Print Layout

CSS `@media print` targets Folio (8.5"×13") with:
- Top margin `2in` (reserved for pre-printed letterhead)
- All colors forced via `-webkit-print-color-adjust: exact`
- `.slip-divider` enforces `page-break-after: always` between page 1 and page 2
- `safePrint()` function temporarily hides Screen 1 before calling `window.print()` to avoid leaking form elements into the printout

## Locale

All date/time formatting uses `'en-PH'` locale via the `Intl` API.
