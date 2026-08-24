/* ============================================================================
 * RouteCast — Simplified Travel Demand Datasets & Default Parameters
 * ----------------------------------------------------------------------------
 * A T4Cast-style macroscopic travel demand model reduced to the smallest input
 * set that still produces a defensible four-step forecast.
 *
 * The full T4Cast / E-TraMS workflow (UP-NCTS ITS Lab) needs a georeferenced
 * network, a full zone system and household interview survey files. This app
 * replaces those with three small, hand-editable tables:
 *
 *   1. ZONES    — one row per municipality/city (socio-economic data)
 *   2. LINKS    — one row per road corridor between zones (supply data)
 *   3. PARAMS   — model coefficients (behaviour data)
 *
 * Everything else is derived. All figures below are indicative planning values
 * for Region XII (SOCCSKSARGEN) and are meant to be edited by the user.
 * ==========================================================================*/

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RCData = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* --------------------------------------------------------------------------
   * MODE TABLE
   * Five modes covering the Philippine provincial mode mix. `kind` drives the
   * public-transport fleet-sizing step; only kind === 'pt' modes get a fleet.
   * ------------------------------------------------------------------------*/
  var MODES = [
    {
      id: 'puj', name: 'PUJ / Jeepney', short: 'PUJ', kind: 'pt', color: '#d4a537',
      asc: 0.00,          // alternative-specific constant (reference mode)
      fareBase: 13.00,    // PHP, covers the first `fareBaseKm` kilometres
      fareBaseKm: 4,
      farePerKm: 1.80,    // PHP per succeeding kilometre
      speed: 28,          // free-flow operating speed, km/h
      accessWait: 8,      // access + wait + egress penalty, minutes
      occupancy: 16,      // average persons per vehicle (for veh conversion)
      pcu: 1.5,           // passenger-car units
      seats: 22,          // rated capacity used for fleet sizing
      co2: 320            // g CO2 per vehicle-km
    },
    {
      id: 'uv', name: 'UV Express', short: 'UV', kind: 'pt', color: '#1565c0',
      asc: -0.30, fareBase: 15.00, fareBaseKm: 4, farePerKm: 2.20,
      speed: 45, accessWait: 12, occupancy: 12, pcu: 1.5, seats: 14, co2: 250
    },
    {
      id: 'bus', name: 'Public Utility Bus', short: 'Bus', kind: 'pt', color: '#2e7d32',
      asc: -0.75, fareBase: 11.00, fareBaseKm: 4, farePerKm: 1.90,
      speed: 40, accessWait: 15, occupancy: 35, pcu: 2.5, seats: 49, co2: 800
    },
    {
      id: 'car', name: 'Private Car', short: 'Car', kind: 'private', color: '#c62828',
      asc: -0.25,
      ascIncomeCoef: 1.20, // ASC_car(i) = asc + coef * ln(income_i / incomeRef)
      fareBase: 30.00,     // terminal / parking charge per trip
      fareBaseKm: 0,
      farePerKm: 8.50,     // fuel + running cost, shared across occupants
      speed: 50, accessWait: 3, occupancy: 2.1, pcu: 1.0, seats: 0, co2: 190
    },
    {
      id: 'mc', name: 'Motorcycle / Tricycle', short: 'MC', kind: 'private', color: '#6a1b9a',
      asc: -0.25, fareBase: 0.00, fareBaseKm: 0, farePerKm: 3.20,
      speed: 45, accessWait: 2, occupancy: 1.4, pcu: 0.33, seats: 0, co2: 75
    }
  ];

  /* --------------------------------------------------------------------------
   * DEFAULT MODEL PARAMETERS
   * ------------------------------------------------------------------------*/
  var PARAMS = {
    /* --- horizon & growth ------------------------------------------------ */
    baseYear: 2025,
    horizonYear: 2035,
    popGrowth: 1.80,      // % per year, compounded
    empGrowth: 2.60,      // % per year
    incomeGrowth: 3.00,   // % per year, real

    /* --- step 1: trip generation ----------------------------------------- */
    tripRateHH: 7.5,      // person-trips per household per day (all purposes)
    incomeElasticity: 0.30, // production uplift per unit of relative income
    attrPerJob: 2.20,     // attractions per job
    attrPerStudent: 1.80, // attractions per enrolled student
    attrPerCapita: 0.20,  // residual (shopping / personal business) attractions

    /* --- step 2: trip distribution --------------------------------------- */
    deterrence: 'logsum', // logsum | exponential | power | combined
    betaLogsum: 1.25,     // f = exp(beta * logsum)
    betaTime: 0.045,      // f = exp(-beta * t)          [1/min]
    gammaPower: 2.00,     // f = t^-gamma
    intrazonalK: 0.30,    // d_ii = k * sqrt(area_i)
    furnessIters: 600,
    furnessTol: 1e-4,

    /* --- step 3: modal split --------------------------------------------- */
    thetaCost: 0.012,     // utility per PHP
    thetaTime: 0.030,     // utility per minute  (VOT = thetaTime/thetaCost)
    incomeRef: 18000,     // PHP/month, reference household income for car ASC

    /* --- step 4: traffic assignment -------------------------------------- */
    peakHourFactor: 0.09, // share of daily trips in the design peak hour
    peakDirSplit: 0.55,   // share of peak-hour trips in the heavy direction
    bprAlpha: 0.15,
    bprBeta: 4.00,
    capPerLane: 1800,     // pcu/hour/lane when a link has no explicit capacity
    incrementSlices: [0.4, 0.3, 0.2, 0.1],

    /* --- feedback loop ---------------------------------------------------- */
    outerIters: 3,        // skim -> distribute -> split -> assign -> re-skim

    /* --- public transport supply ----------------------------------------- */
    loadFactor: 0.85,     // design occupancy as a share of seated capacity
    terminalTime: 10,     // minutes of layover at each end of a round trip
    minHeadway: 2         // minutes; floor on the computed headway
  };

  /* --------------------------------------------------------------------------
   * PRESET 1 — SOCCSKSARGEN (Region XII) inter-city corridor system
   * Population/household figures follow the 2020 PSA census order of magnitude
   * and are carried forward to the 2025 base year.
   * ------------------------------------------------------------------------*/
  var PRESET_R12 = {
    meta: {
      name: 'Region XII Inter-City Corridors',
      studyArea: 'SOCCSKSARGEN (Region XII)',
      preparedBy: '',
      notes: 'Baseline inter-city travel demand forecast for the Region XII ' +
             'national highway corridors serving Koronadal, General Santos, ' +
             'Kidapawan, Tacurong and adjoining municipalities.'
    },
    zones: [
      /* id, name, population, households, employment, enrolment, income, area */
      { id: 'Z1', name: 'Koronadal City',   pop: 205000, hh: 48800, emp: 72000, enrol: 52000, income: 19000, area: 277 },
      { id: 'Z2', name: 'General Santos',   pop: 732000, hh: 178500, emp: 281000, enrol: 186000, income: 22000, area: 492 },
      { id: 'Z3', name: 'Kidapawan City',   pop: 169000, hh: 40200, emp: 57000, enrol: 43000, income: 17500, area: 358 },
      { id: 'Z4', name: 'Tacurong City',    pop: 109000, hh: 25900, emp: 39000, enrol: 28000, income: 17000, area: 154 },
      { id: 'Z5', name: 'Isulan',           pop: 108000, hh: 25700, emp: 33000, enrol: 27500, income: 15500, area: 256 },
      { id: 'Z6', name: 'Polomolok',        pop: 188000, hh: 44700, emp: 68000, enrol: 47000, income: 16500, area: 246 },
      { id: 'Z7', name: 'Surallah',         pop: 97000,  hh: 23100, emp: 28000, enrol: 24500, income: 14500, area: 173 },
      { id: 'Z8', name: 'Midsayap',         pop: 177000, hh: 42100, emp: 51000, enrol: 44000, income: 15000, area: 288 }
    ],
    links: [
      /* simplified corridors: one row per road section between two zones */
      { id: 'L1', from: 'Z1', to: 'Z6', name: 'Koronadal–Polomolok',  dist: 34, lanes: 2, speed: 60, capacity: 3600 },
      { id: 'L2', from: 'Z6', to: 'Z2', name: 'Polomolok–Gen. Santos', dist: 26, lanes: 2, speed: 60, capacity: 3600 },
      { id: 'L3', from: 'Z1', to: 'Z7', name: 'Koronadal–Surallah',   dist: 18, lanes: 1, speed: 50, capacity: 1800 },
      { id: 'L4', from: 'Z1', to: 'Z4', name: 'Koronadal–Tacurong',   dist: 30, lanes: 2, speed: 60, capacity: 3600 },
      { id: 'L5', from: 'Z4', to: 'Z5', name: 'Tacurong–Isulan',      dist: 9,  lanes: 2, speed: 50, capacity: 3600 },
      { id: 'L6', from: 'Z5', to: 'Z8', name: 'Isulan–Midsayap',      dist: 55, lanes: 1, speed: 60, capacity: 1800 },
      { id: 'L7', from: 'Z8', to: 'Z3', name: 'Midsayap–Kidapawan',   dist: 42, lanes: 1, speed: 60, capacity: 1800 },
      { id: 'L8', from: 'Z4', to: 'Z3', name: 'Tacurong–Kidapawan',   dist: 68, lanes: 1, speed: 55, capacity: 1800 }
    ]
  };

  /* --------------------------------------------------------------------------
   * PRESET 2 — a four-zone teaching example, small enough to hand-check
   * ------------------------------------------------------------------------*/
  var PRESET_MINI = {
    meta: {
      name: 'Four-Zone Worked Example',
      studyArea: 'Generic corridor town',
      preparedBy: '',
      notes: 'Minimal dataset for learning the model. Small enough that every ' +
             'intermediate table can be checked by hand.'
    },
    zones: [
      { id: 'Z1', name: 'Town Centre',   pop: 60000, hh: 14300, emp: 34000, enrol: 15000, income: 21000, area: 40 },
      { id: 'Z2', name: 'North Suburb',  pop: 45000, hh: 10700, emp: 9000,  enrol: 12000, income: 17000, area: 95 },
      { id: 'Z3', name: 'South Suburb',  pop: 38000, hh: 9000,  emp: 7500,  enrol: 10000, income: 15500, area: 110 },
      { id: 'Z4', name: 'Port District', pop: 22000, hh: 5200,  emp: 26000, enrol: 4000,  income: 18500, area: 55 }
    ],
    links: [
      { id: 'L1', from: 'Z1', to: 'Z2', name: 'North Road',  dist: 9,  lanes: 2, speed: 50, capacity: 3600 },
      { id: 'L2', from: 'Z1', to: 'Z3', name: 'South Road',  dist: 12, lanes: 2, speed: 50, capacity: 3600 },
      { id: 'L3', from: 'Z1', to: 'Z4', name: 'Port Access', dist: 6,  lanes: 2, speed: 45, capacity: 3600 },
      { id: 'L4', from: 'Z3', to: 'Z4', name: 'Coastal Rd',  dist: 14, lanes: 1, speed: 40, capacity: 1800 }
    ]
  };

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  /** Build a complete, ready-to-run scenario from a preset id. */
  function makeScenario(presetId) {
    var preset = presetId === 'mini' ? PRESET_MINI : PRESET_R12;
    var s = clone(preset);
    s.params = clone(PARAMS);
    s.modes = clone(MODES);
    s.meta.preset = presetId === 'mini' ? 'mini' : 'r12';
    s.meta.created = new Date().toISOString();
    return s;
  }

  /** Blank scenario — two empty zones and one link, for a from-scratch build. */
  function blankScenario() {
    return {
      meta: {
        name: 'New Scenario', studyArea: '', preparedBy: '', notes: '',
        preset: 'blank', created: new Date().toISOString()
      },
      zones: [
        { id: 'Z1', name: 'Zone 1', pop: 50000, hh: 12000, emp: 15000, enrol: 12000, income: 18000, area: 100 },
        { id: 'Z2', name: 'Zone 2', pop: 50000, hh: 12000, emp: 15000, enrol: 12000, income: 18000, area: 100 }
      ],
      links: [
        { id: 'L1', from: 'Z1', to: 'Z2', name: 'Zone 1–Zone 2', dist: 10, lanes: 2, speed: 60, capacity: 3600 }
      ],
      params: clone(PARAMS),
      modes: clone(MODES)
    };
  }

  return {
    MODES: MODES,
    PARAMS: PARAMS,
    PRESETS: { r12: PRESET_R12, mini: PRESET_MINI },
    makeScenario: makeScenario,
    blankScenario: blankScenario,
    clone: clone
  };
}));
