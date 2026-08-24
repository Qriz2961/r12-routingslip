# RouteCast — mobile travel demand forecasting

A mobile web app in the spirit of **T4Cast** (the macroscopic travel demand
analysis and forecasting software from the UP-NCTS ITS Lab, packaged with
LocalSim as Project E-TraMS). RouteCast keeps T4Cast's modelling chain — the
classical four-step model with congested-network feedback — but replaces the
georeferenced network, full zone system and household interview survey files
with three small tables that fit on a phone screen.

Live at `/t4cast` on the deployment. Installable as a PWA and works offline
after the first load.

---

## What it does

| Screen | Purpose |
|---|---|
| **Data** | Zone socio-economics, corridor network, scenario metadata. Presets, JSON import/export. |
| **Model** | Every model coefficient, grouped by step, each shown with the formula it appears in. Mode characteristics editor. |
| **Run** | Validation, stepwise execution, convergence report, scenario library and side-by-side comparison. |
| **Results** | KPI tiles, trip generation, OD matrix heat map, mode split, link volumes with V/C and LOS, public transport fleet requirement. |
| **Report** | A full printable forecast report with auto-generated findings, a methodology appendix, and CSV/JSON export. |

## Simplified input datasets

Three tables drive everything. Two presets ship with the app: an eight-zone
Region XII (SOCCSKSARGEN) inter-city corridor system, and a four-zone teaching
example small enough to check by hand.

**1. Zones** — one row per city or municipality:
`population`, `households`, `employment`, `enrolment`, `average household income`, `land area`.

**2. Corridors** — one row per road section between two zones:
`from`, `to`, `length (km)`, `lanes per direction`, `free-flow speed`, `capacity (pcu/h/direction)`.

**3. Parameters** — growth rates, trip rates, deterrence coefficients, logit
coefficients, BPR parameters, load factor, and per-mode fare/speed/occupancy
/PCU/seats/CO₂ characteristics for five modes (jeepney, UV Express, bus,
private car, motorcycle).

Everything else — skims, intrazonal distances, shortest paths, vehicle
conversions — is derived by the model.

## Simulation formulas

**Step 0 · Growth**

```
Pop(h) = Pop(0) × (1 + g)^n          n = horizon − base year
```
Population, households and enrolment grow at the population rate; employment at
the employment rate; income at the real income rate.

**Step 1 · Trip generation**

```
P_i = r × HH_i × [1 + κ (Inc_i / Inc_avg − 1)]
A_j = a_e·Emp_j + a_s·Enr_j + a_p·Pop_j
A_j ← A_j × (ΣP / ΣA)                 attraction balancing
```

**Step 2 · Trip distribution** — doubly-constrained gravity model

```
T_ij = a_i · b_j · P_i · A_j · f(c_ij)
a_i  = 1 / Σ_j b_j A_j f_ij     b_j = 1 / Σ_i a_i P_i f_ij
d_ii = k × √(area_i)                  intrazonal distance
```
Solved by Furness (IPF) balancing. Convergence is judged on the realised row
totals, because the factor pair `(a, b)` is only determined up to a reciprocal
constant. Four deterrence functions are selectable; the default uses the
mode-choice logsum, so improving any mode makes a destination more attractive:

```
logsum       f = exp(β·LS)
exponential  f = exp(−β·t)
power        f = t^−γ
combined     f = t^−γ · exp(−β·t)
```

**Step 3 · Modal split** — multinomial logit

```
Time_m = 60·d/v_m × congestion + accessWait_m
Cost_m = fareBase_m + farePerKm_m · max(0, d − fareBaseKm_m)
         (÷ occupancy for private modes — the cost is shared)
U_m    = ASC_m − θ_c·Cost_m − θ_t·Time_m
Pr_m   = exp(U_m) / Σ_k exp(U_k)
LS     = ln Σ_k exp(U_k)              composite accessibility
ASC_car(i) = ASC_car + λ·ln(Inc_i / Inc_ref)
```
Value of time is the ratio `θ_t / θ_c`. The logsum is computed with a max-shift
for numerical stability.

**Step 4 · Traffic assignment** — incremental loading with BPR volume-delay

```
V_ij = (T_ij + T_ji) × PHF × dirSplit  peak-hour, peak-direction persons
veh  = V_ij / occupancy_m     pcu = veh × pcu_m
t    = t₀ × [1 + α (V/C)^β]           BPR
```
Demand is loaded on Dijkstra shortest paths in successive slices (default
40/30/20/10 %), with link times updated after each slice so later slices see the
congestion earlier ones created. Level of service follows
A ≤ 0.35, B ≤ 0.55, C ≤ 0.75, D ≤ 0.90, E ≤ 1.00, F > 1.00.

**Step 5 · Public transport supply**

```
h = 60 × seats × LF / P_max           headway, minutes
C = 2 × (60·L / v + terminal)         cycle time
N = ⌈ C / h ⌉                         units required
```
Sized on the maximum load section of each corridor, per public transport mode.

**Feedback loop.** Steps 2–4 are iterated (default three passes). Congested
skims from the assignment feed back into distribution and mode choice, with link
volumes averaged by the method of successive averages,
`v⁽ⁿ⁾ = v⁽ⁿ⁻¹⁾ + (1/n)(v_new − v⁽ⁿ⁻¹⁾)`, so the loop settles instead of
oscillating.

## Report generation

The Report screen assembles a nine-section forecast document: executive summary
with findings derived from the run (not boilerplate), input datasets, results for
each of the five steps, the full parameter set, and a methodology appendix with
every formula and a stated list of limitations. It prints to A4 with page breaks
and colour preserved, and exports:

- **Results CSV** — summary indicators, zone results, mode results, link results, PT supply
- **OD matrix CSV** — the full origin–destination table
- **Scenario JSON** — inputs and parameters, re-importable

## Files

```
t4cast/
  index.html            markup + styles (mobile-first, print stylesheet)
  data.js               presets, mode table, default parameters
  engine.js             the model — pure functions, runs in browser and Node
  app.js                state, screens, charts, report, exports
  manifest.webmanifest  PWA manifest
  sw.js                 service worker (network-first, offline fallback)
  test-engine.mjs       numeric sanity + sensitivity tests
```

## Tests

```bash
node t4cast/test-engine.mjs
```

29 checks: matrix conservation (row totals = productions, column totals =
attractions), mode share closure, Furness and feedback convergence,
plausibility bands for trips per capita and trip length, growth compounding,
sensitivity (tripling car cost lowers car share; halving capacity raises V/C and
lowers network speed), all four deterrence functions, and edge cases
(disconnected zone, no links at all, zero-year horizon).

## Limitations

Zones are whole municipalities and intrazonal travel is approximated from land
area rather than modelled on a street network. Assignment is a single peak hour
in the heavy direction with no intersection, signal or queue-spillback
modelling. Trip purposes are not segmented, and the shipped coefficients are
indicative planning defaults — the model is uncalibrated until you replace them
with locally observed values. Emissions use fixed rates per vehicle-kilometre.
Results are for planning use and are not a substitute for a calibrated regional
model or field surveys.
