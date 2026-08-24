/* Numeric sanity tests for the RouteCast engine. Run: node t4cast/test-engine.mjs */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const Data = require('./data.js');
const Eng = require('./engine.js');

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail !== undefined ? '  -> ' + detail : '')); }
}
function near(a, b, tol) { return Math.abs(a - b) <= tol; }

console.log('\n== Preset R12 ==');
const s = Data.makeScenario('r12');
const r = Eng.run(s);
const n = s.zones.length;

// --- conservation ------------------------------------------------------------
const rowSums = r.T.map(row => row.reduce((a, b) => a + b, 0));
const colSums = r.T[0].map((_, j) => r.T.reduce((a, row) => a + row[j], 0));
let maxRowErr = 0, maxColErr = 0;
for (let i = 0; i < n; i++) maxRowErr = Math.max(maxRowErr, Math.abs(rowSums[i] - r.generation.P[i]) / r.generation.P[i]);
for (let j = 0; j < n; j++) maxColErr = Math.max(maxColErr, Math.abs(colSums[j] - r.generation.A[j]) / r.generation.A[j]);
check('row totals match productions (<0.5%)', maxRowErr < 0.005, (maxRowErr * 100).toFixed(4) + '%');
check('col totals match attractions (<0.5%)', maxColErr < 0.005, (maxColErr * 100).toFixed(4) + '%');
check('sum P == sum A after balancing',
  near(r.generation.P.reduce((a, b) => a + b, 0), r.generation.A.reduce((a, b) => a + b, 0), 1));

// --- mode shares -------------------------------------------------------------
const shareSum = r.kpi.modeShare.reduce((a, b) => a + b, 0);
check('mode shares sum to 1', near(shareSum, 1, 1e-9), shareSum);
check('every mode share in (0,1)', r.kpi.modeShare.every(v => v > 0 && v < 1));
check('mode trips sum to total trips',
  near(r.kpi.modeTrips.reduce((a, b) => a + b, 0), r.kpi.totalTrips, 1));

// --- plausibility ------------------------------------------------------------
check('trips per capita between 1.0 and 3.0', r.kpi.tripsPerCapita > 1 && r.kpi.tripsPerCapita < 3,
  r.kpi.tripsPerCapita.toFixed(3));
check('avg trip length between 2 and 60 km', r.kpi.avgTripLength > 2 && r.kpi.avgTripLength < 60,
  r.kpi.avgTripLength.toFixed(2) + ' km');
check('avg trip time between 5 and 180 min', r.kpi.avgTripTime > 5 && r.kpi.avgTripTime < 180,
  r.kpi.avgTripTime.toFixed(1) + ' min');
check('all links carry volume', r.links.every(L => L.vol > 0));
check('congested time >= free-flow time on every link', r.links.every(L => L.time >= L.t0 - 1e-9));
check('every link has a LOS letter', r.links.every(L => 'ABCDEF'.includes(L.los)));
check('fleet requirement positive for PUJ', r.kpi.fleetTotals.puj > 0, r.kpi.fleetTotals.puj);
check('CO2 estimate positive', r.kpi.co2Tons > 0, r.kpi.co2Tons.toFixed(1) + ' t/day');
check('feedback loop converged (<10% vol change)', r.kpi.convergence < 0.10,
  (r.kpi.convergence * 100).toFixed(2) + '%');
check('furness converged within tolerance', r.history.every(h => h.furnessGap < 5e-4),
  JSON.stringify(r.history.map(h => h.furnessGap.toExponential(2))));

// --- growth ------------------------------------------------------------------
const zg = Eng.growZones(s.zones, s.params);
const expect = s.zones[0].pop * Math.pow(1.018, 10);
check('10-yr population growth compounds correctly', near(zg[0].pop, expect, 1), zg[0].pop.toFixed(0));

console.log('\n== Sensitivity: higher fuel/car cost shifts demand to PT ==');
const s2 = Data.makeScenario('r12');
s2.modes.find(m => m.id === 'car').farePerKm = 20;
const r2 = Eng.run(s2);
const carIdx = s.modes.findIndex(m => m.id === 'car');
check('car share falls when car cost triples',
  r2.kpi.modeShare[carIdx] < r.kpi.modeShare[carIdx],
  `${(r.kpi.modeShare[carIdx]*100).toFixed(1)}% -> ${(r2.kpi.modeShare[carIdx]*100).toFixed(1)}%`);

console.log('\n== Sensitivity: capacity cut raises V/C ==');
const s3 = Data.makeScenario('r12');
s3.links.forEach(l => { l.lanes = 1; l.capacity = 1800; });
const r3 = Eng.run(s3);
const avgVC = a => a.links.reduce((x, L) => x + L.vc, 0) / a.links.length;
check('halving capacity raises mean V/C', avgVC(r3) > avgVC(r),
  `${avgVC(r).toFixed(3)} -> ${avgVC(r3).toFixed(3)}`);
check('halving capacity lowers network speed', r3.kpi.networkSpeed < r.kpi.networkSpeed,
  `${r.kpi.networkSpeed.toFixed(1)} -> ${r3.kpi.networkSpeed.toFixed(1)} km/h`);

console.log('\n== Deterrence function variants ==');
for (const kind of ['logsum', 'exponential', 'power', 'combined']) {
  const sv = Data.makeScenario('r12');
  sv.params.deterrence = kind;
  const rv = Eng.run(sv);
  check(`${kind}: finite total trips`, isFinite(rv.kpi.totalTrips) && rv.kpi.totalTrips > 0,
    Math.round(rv.kpi.totalTrips).toLocaleString() + ' trips, ATL ' + rv.kpi.avgTripLength.toFixed(1) + ' km');
}

console.log('\n== Preset mini + disconnected zone ==');
const s4 = Data.makeScenario('mini');
const r4 = Eng.run(s4);
check('mini preset runs', r4.kpi.totalTrips > 0, Math.round(r4.kpi.totalTrips).toLocaleString());
const s5 = Data.makeScenario('mini');
s5.zones.push({ id: 'Z9', name: 'Island', pop: 5000, hh: 1200, emp: 800, enrol: 900, income: 12000, area: 30 });
const r5 = Eng.run(s5);
check('disconnected zone does not break the run', isFinite(r5.kpi.totalTrips) && r5.kpi.totalTrips > 0);
check('disconnected zone only has intrazonal trips',
  r5.T[4].every((v, j) => j === 4 || v === 0));

console.log('\n== Edge cases ==');
const s6 = Data.blankScenario();
s6.links = [];
const r6 = Eng.run(s6);
check('no links at all: still runs (intrazonal only)', isFinite(r6.kpi.totalTrips) && r6.kpi.totalTrips > 0);
const s7 = Data.blankScenario();
s7.params.horizonYear = s7.params.baseYear;
const r7 = Eng.run(s7);
check('zero-year horizon runs', isFinite(r7.kpi.totalTrips) && r7.kpi.totalTrips > 0);

console.log('\n== Headline results (R12, 2035) ==');
console.log('  daily person trips  : ' + Math.round(r.kpi.totalTrips).toLocaleString());
console.log('  trips per capita    : ' + r.kpi.tripsPerCapita.toFixed(2));
console.log('  avg trip length     : ' + r.kpi.avgTripLength.toFixed(1) + ' km');
console.log('  avg trip time       : ' + r.kpi.avgTripTime.toFixed(1) + ' min');
console.log('  mode share          : ' + r.modes.map((m, i) => m.short + ' ' + (r.kpi.modeShare[i] * 100).toFixed(1) + '%').join('  '));
console.log('  network speed       : ' + r.kpi.networkSpeed.toFixed(1) + ' km/h');
console.log('  links at LOS E/F    : ' + r.kpi.congestedLinks + ' of ' + r.kpi.totalLinks);
console.log('  CO2                 : ' + Math.round(r.kpi.co2Tons).toLocaleString() + ' t/day');
console.log('  fleet requirement   : ' + JSON.stringify(r.kpi.fleetTotals));
console.log('\n  link summary:');
r.links.forEach(L => console.log('   ' + L.id.padEnd(3) + L.name.padEnd(24) +
  ' vol ' + Math.round(L.vol).toString().padStart(5) + ' pcu/h  cap ' + L.capacity +
  '  V/C ' + L.vc.toFixed(2) + '  LOS ' + L.los + '  ' + L.speed.toFixed(0) + ' km/h'));

console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
