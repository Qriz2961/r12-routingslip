/* ============================================================================
 * RouteCast — application layer (state, screens, rendering, reporting)
 * Vanilla JS, no build step, no external runtime dependencies.
 * ==========================================================================*/
var UI = (function () {
  'use strict';

  var STORE_SCN = 'rc.scenario.v1';
  var STORE_LIB = 'rc.library.v1';

  var S = null;      // current scenario
  var R = null;      // last simulation result
  var LIB = [];      // saved runs
  var screen = 'data';
  var resultsTab = 'overview';
  var compareWith = null;

  /* ─────────────────────────────────────────────── helpers ── */
  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s === undefined || s === null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function n0(v) { return isFinite(v) ? Math.round(v).toLocaleString('en-US') : '–'; }
  function n1(v) { return isFinite(v) ? v.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : '–'; }
  function n2(v) { return isFinite(v) ? v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '–'; }
  function pct(v, d) { return isFinite(v) ? (v * 100).toFixed(d === undefined ? 1 : d) + '%' : '–'; }
  function toast(msg) {
    var t = $('toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.remove('show'); }, 2400);
  }
  function todayISO() { return new Date().toISOString().slice(0, 10); }
  function longDate() {
    return new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  }
  function download(name, mime, text) {
    var blob = new Blob([text], { type: mime });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
  }

  /* ─────────────────────────────────────────── persistence ── */
  function save() {
    try { localStorage.setItem(STORE_SCN, JSON.stringify(S)); } catch (e) { /* private mode */ }
  }
  function saveLib() {
    try { localStorage.setItem(STORE_LIB, JSON.stringify(LIB)); } catch (e) { /* quota */ }
  }
  function load() {
    try {
      var raw = localStorage.getItem(STORE_SCN);
      if (raw) {
        var o = JSON.parse(raw);
        if (o && o.zones && o.links && o.params && o.modes) return o;
      }
    } catch (e) { /* corrupt */ }
    return null;
  }
  function loadLib() {
    try {
      var raw = localStorage.getItem(STORE_LIB);
      var a = raw ? JSON.parse(raw) : [];
      return Array.isArray(a) ? a : [];
    } catch (e) { return []; }
  }

  /* ────────────────────────────────────────── navigation ──── */
  function go(name) {
    screen = name;
    ['data', 'model', 'run', 'results', 'report'].forEach(function (k) {
      var sc = $('screen-' + k), tb = $('tab-' + k);
      if (sc) sc.classList.toggle('active', k === name);
      if (tb) tb.classList.toggle('active', k === name);
    });
    if (name === 'results') renderResults();
    if (name === 'report') renderReport();
    if (name === 'run') renderRun();
    window.scrollTo(0, 0);
  }
  function toggleSect(id) { var e = $(id); if (e) e.classList.toggle('open'); }
  function toggleItem(el) { el.parentElement.classList.toggle('open'); }

  /* ══════════════════════════════════════════════════════════
   * SCREEN 1 — DATA
   * ════════════════════════════════════════════════════════*/
  function renderMeta() {
    $('metaName').value = S.meta.name || '';
    $('metaArea').value = S.meta.studyArea || '';
    $('metaBy').value = S.meta.preparedBy || '';
    $('metaNotes').value = S.meta.notes || '';
    $('barScenario').textContent = S.meta.name || 'Untitled';
  }
  function metaChanged() {
    S.meta.name = $('metaName').value;
    S.meta.studyArea = $('metaArea').value;
    S.meta.preparedBy = $('metaBy').value;
    S.meta.notes = $('metaNotes').value;
    $('barScenario').textContent = S.meta.name || 'Untitled';
    save();
  }

  var ZONE_FIELDS = [
    { k: 'name',   l: 'Zone name',   t: 'text' },
    { k: 'pop',    l: 'Population',  u: 'persons', step: 1000 },
    { k: 'hh',     l: 'Households',  u: 'count',   step: 100 },
    { k: 'emp',    l: 'Employment',  u: 'jobs',    step: 500 },
    { k: 'enrol',  l: 'Enrolment',   u: 'students', step: 500 },
    { k: 'income', l: 'Ave. HH income', u: 'PHP/mo', step: 500 },
    { k: 'area',   l: 'Land area',   u: 'km²',     step: 1 }
  ];

  function renderZones() {
    var host = $('zoneList');
    $('zoneCount').textContent = S.zones.length + (S.zones.length === 1 ? ' zone' : ' zones');
    host.innerHTML = S.zones.map(function (z, i) {
      var body = ZONE_FIELDS.map(function (f) {
        var val = z[f.k];
        return '<div class="fg"><label>' + esc(f.l) +
          (f.u ? ' <span class="u">(' + esc(f.u) + ')</span>' : '') + '</label>' +
          '<input type="' + (f.t === 'text' ? 'text' : 'number') + '"' +
          (f.step ? ' step="' + f.step + '" min="0" inputmode="decimal"' : '') +
          ' value="' + esc(val) + '" oninput="UI.editZone(' + i + ',\'' + f.k + '\',this.value)"></div>';
      });
      return '<div class="item"><div class="ih" onclick="UI.toggleItem(this)">' +
        '<span class="tag">' + esc(z.id) + '</span>' +
        '<span class="nm">' + esc(z.name || 'Unnamed zone') + '</span>' +
        '<span class="meta">' + n0(z.pop) + ' pop</span><span class="car">▶</span></div>' +
        '<div class="ib">' +
          body[0] +
          '<div class="grid2">' + body[1] + body[2] + '</div>' +
          '<div style="height:9px"></div>' +
          '<div class="grid2">' + body[3] + body[4] + '</div>' +
          '<div style="height:9px"></div>' +
          '<div class="grid2">' + body[5] + body[6] + '</div>' +
          '<div class="row-end"><button class="btn sm danger" onclick="UI.removeZone(' + i + ')">Delete zone</button></div>' +
        '</div></div>';
    }).join('');
  }
  function editZone(i, k, v) {
    S.zones[i][k] = (k === 'name') ? v : (parseFloat(v) || 0);
    if (k === 'name' || k === 'pop') {
      var ih = $('zoneList').children[i].querySelector('.ih');
      ih.querySelector('.nm').textContent = S.zones[i].name || 'Unnamed zone';
      ih.querySelector('.meta').textContent = n0(S.zones[i].pop) + ' pop';
    }
    if (k === 'name') renderLinks();
    save(); invalidate();
  }
  function nextZoneId() {
    var m = 0;
    S.zones.forEach(function (z) { var d = parseInt(String(z.id).replace(/\D/g, ''), 10); if (d > m) m = d; });
    return 'Z' + (m + 1);
  }
  function addZone() {
    var id = nextZoneId();
    S.zones.push({ id: id, name: 'Zone ' + id.slice(1), pop: 50000, hh: 12000, emp: 15000,
                   enrol: 12000, income: 18000, area: 100 });
    save(); invalidate(); renderZones(); renderLinks();
    var kids = $('zoneList').children;
    if (kids.length) kids[kids.length - 1].classList.add('open');
  }
  function removeZone(i) {
    var z = S.zones[i];
    if (!confirm('Delete ' + (z.name || z.id) + '? Corridors that use it will also be removed.')) return;
    S.zones.splice(i, 1);
    S.links = S.links.filter(function (L) { return L.from !== z.id && L.to !== z.id; });
    save(); invalidate(); renderZones(); renderLinks();
    toast('Zone deleted');
  }

  function zoneOptions(sel) {
    return S.zones.map(function (z) {
      return '<option value="' + esc(z.id) + '"' + (z.id === sel ? ' selected' : '') + '>' +
             esc(z.id + ' · ' + (z.name || '')) + '</option>';
    }).join('');
  }
  function zoneName(id) {
    var z = S.zones.filter(function (x) { return x.id === id; })[0];
    return z ? (z.name || z.id) : id;
  }

  function renderLinks() {
    var host = $('linkList');
    $('linkCount').textContent = S.links.length + (S.links.length === 1 ? ' link' : ' links');
    host.innerHTML = S.links.map(function (L, i) {
      return '<div class="item"><div class="ih" onclick="UI.toggleItem(this)">' +
        '<span class="tag">' + esc(L.id) + '</span>' +
        '<span class="nm">' + esc(L.name || (zoneName(L.from) + '–' + zoneName(L.to))) + '</span>' +
        '<span class="meta">' + n0(L.dist) + ' km</span><span class="car">▶</span></div>' +
        '<div class="ib">' +
          '<div class="fg"><label>Corridor name</label><input type="text" value="' + esc(L.name || '') +
            '" oninput="UI.editLink(' + i + ',\'name\',this.value)"></div>' +
          '<div class="grid2">' +
            '<div class="fg"><label>From zone</label><select onchange="UI.editLink(' + i + ',\'from\',this.value)">' +
              zoneOptions(L.from) + '</select></div>' +
            '<div class="fg"><label>To zone</label><select onchange="UI.editLink(' + i + ',\'to\',this.value)">' +
              zoneOptions(L.to) + '</select></div>' +
          '</div><div style="height:9px"></div>' +
          '<div class="grid3">' +
            '<div class="fg"><label>Length <span class="u">km</span></label><input type="number" step="0.5" min="0.1" inputmode="decimal" value="' +
              esc(L.dist) + '" oninput="UI.editLink(' + i + ',\'dist\',this.value)"></div>' +
            '<div class="fg"><label>Lanes <span class="u">/dir</span></label><input type="number" step="1" min="1" inputmode="numeric" value="' +
              esc(L.lanes) + '" oninput="UI.editLink(' + i + ',\'lanes\',this.value)"></div>' +
            '<div class="fg"><label>Speed <span class="u">km/h</span></label><input type="number" step="5" min="5" inputmode="numeric" value="' +
              esc(L.speed) + '" oninput="UI.editLink(' + i + ',\'speed\',this.value)"></div>' +
          '</div><div style="height:9px"></div>' +
          '<div class="fg"><label>Capacity <span class="u">pcu/hour per direction</span></label>' +
            '<input type="number" step="100" min="0" inputmode="numeric" value="' + esc(L.capacity) +
            '" oninput="UI.editLink(' + i + ',\'capacity\',this.value)"></div>' +
          '<div class="hint">Leave capacity at 0 to derive it as lanes × ' + n0(S.params.capPerLane) + ' pcu/h.</div>' +
          '<div class="row-end"><button class="btn sm danger" onclick="UI.removeLink(' + i + ')">Delete corridor</button></div>' +
        '</div></div>';
    }).join('') || '<div class="hint" style="text-align:center;padding:10px 0">No corridors yet.</div>';
    checkNetwork();
  }
  function editLink(i, k, v) {
    S.links[i][k] = (k === 'name' || k === 'from' || k === 'to') ? v : (parseFloat(v) || 0);
    if (k === 'from' || k === 'to' || k === 'name' || k === 'dist') {
      var ih = $('linkList').children[i].querySelector('.ih');
      var L = S.links[i];
      ih.querySelector('.nm').textContent = L.name || (zoneName(L.from) + '–' + zoneName(L.to));
      ih.querySelector('.meta').textContent = n0(L.dist) + ' km';
    }
    save(); invalidate(); checkNetwork();
  }
  function addLink() {
    if (S.zones.length < 2) { toast('Add at least two zones first'); return; }
    var m = 0;
    S.links.forEach(function (L) { var d = parseInt(String(L.id).replace(/\D/g, ''), 10); if (d > m) m = d; });
    var a = S.zones[0].id, b = S.zones[1].id;
    S.links.push({ id: 'L' + (m + 1), from: a, to: b, name: zoneName(a) + '–' + zoneName(b),
                   dist: 10, lanes: 2, speed: 60, capacity: 3600 });
    save(); invalidate(); renderLinks();
    var kids = $('linkList').children;
    if (kids.length) kids[kids.length - 1].classList.add('open');
  }
  function removeLink(i) {
    S.links.splice(i, 1); save(); invalidate(); renderLinks(); toast('Corridor deleted');
  }

  /** Flag zones that no corridor reaches — they can only produce intrazonal trips. */
  function checkNetwork() {
    var used = {};
    S.links.forEach(function (L) { used[L.from] = 1; used[L.to] = 1; });
    var orphans = S.zones.filter(function (z) { return !used[z.id]; });
    var selfLinks = S.links.filter(function (L) { return L.from === L.to; });
    var html = '';
    if (selfLinks.length) {
      html += '<div class="note err" style="margin-top:12px">' + selfLinks.length +
        ' corridor(s) start and end in the same zone and will be ignored.</div>';
    }
    if (orphans.length) {
      html += '<div class="note warn" style="margin-top:12px"><strong>Not connected:</strong> ' +
        orphans.map(function (z) { return esc(z.name || z.id); }).join(', ') +
        '. These zones will only generate intrazonal trips.</div>';
    }
    $('netCheck').innerHTML = html;
  }

  /* ══════════════════════════════════════════════════════════
   * SCREEN 2 — MODEL PARAMETERS
   * ════════════════════════════════════════════════════════*/
  var PARAM_GROUPS = [
    {
      id: 'grp-growth', title: 'Horizon & growth', open: true,
      formula: 'Pop(h) = Pop(0) × (1 + g)^n      n = horizon − base year',
      note: 'Population, households and enrolment grow at the population rate; ' +
            'jobs at the employment rate; incomes at the real income rate.',
      items: [
        { k: 'baseYear', l: 'Base year', step: 1 },
        { k: 'horizonYear', l: 'Horizon year', step: 1 },
        { k: 'popGrowth', l: 'Population growth', u: '%/yr', step: 0.1 },
        { k: 'empGrowth', l: 'Employment growth', u: '%/yr', step: 0.1 },
        { k: 'incomeGrowth', l: 'Real income growth', u: '%/yr', step: 0.1 }
      ]
    },
    {
      id: 'grp-gen', title: 'Step 1 · Trip generation',
      formula: 'P_i = r × HH_i × [1 + κ (Inc_i / Inc_avg − 1)]\n' +
               'A_j = a_e·Emp_j + a_s·Enr_j + a_p·Pop_j\n' +
               'A_j ← A_j × (ΣP / ΣA)          attraction balancing',
      note: 'Productions come from households, attractions from jobs, school places ' +
            'and residual population. Attractions are then scaled so that ΣA = ΣP.',
      items: [
        { k: 'tripRateHH', l: 'Trip rate r', u: 'person-trips/hh/day', step: 0.1 },
        { k: 'incomeElasticity', l: 'Income elasticity κ', u: '–', step: 0.05 },
        { k: 'attrPerJob', l: 'Attractions per job a_e', u: 'trips', step: 0.1 },
        { k: 'attrPerStudent', l: 'Attractions per student a_s', u: 'trips', step: 0.1 },
        { k: 'attrPerCapita', l: 'Attractions per capita a_p', u: 'trips', step: 0.05 }
      ]
    },
    {
      id: 'grp-dist', title: 'Step 2 · Trip distribution',
      formula: 'T_ij = a_i · b_j · P_i · A_j · f(c_ij)\n' +
               'a_i = 1 / Σ_j b_j A_j f_ij      b_j = 1 / Σ_i a_i P_i f_ij\n' +
               'd_ii = k × √(area_i)            intrazonal distance',
      note: 'Doubly-constrained gravity model solved by the Furness (IPF) procedure. ' +
            'The default deterrence uses the mode-choice logsum, so improving any ' +
            'mode makes a destination more attractive.',
      items: [
        { k: 'deterrence', l: 'Deterrence function', type: 'select', options: [
            ['logsum', 'Logsum  f = exp(β·LS)'],
            ['exponential', 'Exponential  f = exp(−β·t)'],
            ['power', 'Power  f = t^−γ'],
            ['combined', 'Combined  f = t^−γ·exp(−β·t)']
          ] },
        { k: 'betaLogsum', l: 'Logsum coefficient β', u: '–', step: 0.05 },
        { k: 'betaTime', l: 'Time coefficient β', u: '1/min', step: 0.005 },
        { k: 'gammaPower', l: 'Power exponent γ', u: '–', step: 0.1 },
        { k: 'intrazonalK', l: 'Intrazonal factor k', u: '–', step: 0.05 },
        { k: 'furnessIters', l: 'Max Furness iterations', u: '–', step: 50 },
        { k: 'furnessTol', l: 'Convergence tolerance', u: '–', step: 0.00001 }
      ]
    },
    {
      id: 'grp-mode', title: 'Step 3 · Modal split',
      formula: 'U_m = ASC_m − θ_c·Cost_m − θ_t·Time_m\n' +
               'Pr_m = exp(U_m) / Σ_k exp(U_k)\n' +
               'LS   = ln Σ_k exp(U_k)         composite accessibility\n' +
               'ASC_car(i) = ASC_car + λ·ln(Inc_i / Inc_ref)',
      note: 'Multinomial logit over the five modes. Value of time is the ratio ' +
            'θ_t / θ_c. Car ownership rises with zone income through λ.',
      items: [
        { k: 'thetaCost', l: 'Cost coefficient θ_c', u: '1/PHP', step: 0.001 },
        { k: 'thetaTime', l: 'Time coefficient θ_t', u: '1/min', step: 0.005 },
        { k: 'incomeRef', l: 'Reference income Inc_ref', u: 'PHP/mo', step: 500 }
      ],
      derived: function (p) {
        var vot = p.thetaCost > 0 ? (p.thetaTime / p.thetaCost) * 60 : 0;
        return 'Implied value of time: <strong>PHP ' + n0(vot) + ' per hour</strong>';
      }
    },
    {
      id: 'grp-assign', title: 'Step 4 · Traffic assignment',
      formula: 'V_ij = (T_ij + T_ji) × PHF × dir      peak-hour peak-direction\n' +
               'veh  = V_ij / occupancy_m   ·   pcu = veh × pcu_m\n' +
               't    = t₀ × [1 + α (V/C)^β]           BPR volume-delay',
      note: 'Demand is loaded on shortest paths in successive slices; link times are ' +
            'updated by the BPR function after each slice, so later slices see the ' +
            'congestion earlier ones created.',
      items: [
        { k: 'peakHourFactor', l: 'Peak hour factor PHF', u: 'share of daily', step: 0.005 },
        { k: 'peakDirSplit', l: 'Peak direction split', u: 'share', step: 0.05 },
        { k: 'bprAlpha', l: 'BPR α', u: '–', step: 0.05 },
        { k: 'bprBeta', l: 'BPR β', u: '–', step: 0.5 },
        { k: 'capPerLane', l: 'Default lane capacity', u: 'pcu/h/lane', step: 100 },
        { k: 'outerIters', l: 'Feedback iterations', u: '–', step: 1 }
      ]
    },
    {
      id: 'grp-pt', title: 'Step 5 · Public transport supply',
      formula: 'h = 60 × seats × LF / P_max        headway, minutes\n' +
               'C = 2 × (60 L / v + terminal)      cycle time\n' +
               'N = ⌈ C / h ⌉                      units required',
      note: 'Fleet size for the maximum load section of each corridor, by public ' +
            'transport mode. This is the output that feeds route planning and ' +
            'franchise capacity decisions.',
      items: [
        { k: 'loadFactor', l: 'Design load factor LF', u: 'of seated capacity', step: 0.05 },
        { k: 'terminalTime', l: 'Terminal time', u: 'min per end', step: 1 },
        { k: 'minHeadway', l: 'Minimum headway', u: 'min', step: 0.5 }
      ]
    }
  ];

  function renderParams() {
    $('paramSections').innerHTML = PARAM_GROUPS.map(function (g) {
      var fields = g.items.map(function (it) {
        var v = S.params[it.k];
        var ctl;
        if (it.type === 'select') {
          ctl = '<select onchange="UI.editParam(\'' + it.k + '\',this.value,1)">' +
            it.options.map(function (o) {
              return '<option value="' + o[0] + '"' + (o[0] === v ? ' selected' : '') + '>' + esc(o[1]) + '</option>';
            }).join('') + '</select>';
        } else {
          ctl = '<input type="number" inputmode="decimal" step="' + (it.step || 'any') + '" value="' + esc(v) +
                '" oninput="UI.editParam(\'' + it.k + '\',this.value)">';
        }
        return '<div class="fg"><label>' + esc(it.l) +
          (it.u ? ' <span class="u">(' + esc(it.u) + ')</span>' : '') + '</label>' + ctl + '</div>';
      });
      var pairs = '';
      for (var i = 0; i < fields.length; i += 2) {
        pairs += '<div class="grid2">' + fields[i] + (fields[i + 1] || '') + '</div><div style="height:9px"></div>';
      }
      return '<div class="sect' + (g.open ? ' open' : '') + '" id="' + g.id + '">' +
        '<div class="sh" onclick="UI.toggleSect(\'' + g.id + '\')"><span class="t">' + esc(g.title) +
        '</span><span class="car">▶</span></div><div class="sb">' +
        '<div class="formula">' + esc(g.formula) + '</div>' +
        '<div class="hint" style="margin-bottom:12px">' + g.note + '</div>' + pairs +
        (g.derived ? '<div class="note info" id="' + g.id + '-derived">' + g.derived(S.params) + '</div>' : '') +
        '</div></div>';
    }).join('');
  }
  function editParam(k, v, rerender) {
    S.params[k] = (k === 'deterrence') ? v : (parseFloat(v) || 0);
    PARAM_GROUPS.forEach(function (g) {
      if (!g.derived) return;
      var el = $(g.id + '-derived');
      if (el) el.innerHTML = g.derived(S.params);
    });
    save(); invalidate();
    if (rerender) { /* select changes need no redraw beyond derived text */ }
  }
  function resetParams() {
    if (!confirm('Reset all model parameters and mode characteristics to defaults?')) return;
    S.params = RCData.clone(RCData.PARAMS);
    S.modes = RCData.clone(RCData.MODES);
    save(); invalidate(); renderParams(); renderModes();
    toast('Parameters reset');
  }

  var MODE_FIELDS = [
    { k: 'asc', l: 'ASC', u: 'utility', step: 0.05 },
    { k: 'fareBase', l: 'Base fare', u: 'PHP', step: 0.5 },
    { k: 'fareBaseKm', l: 'Fare covers', u: 'km', step: 1 },
    { k: 'farePerKm', l: 'Per succeeding km', u: 'PHP', step: 0.1 },
    { k: 'speed', l: 'Free-flow speed', u: 'km/h', step: 1 },
    { k: 'accessWait', l: 'Access + wait', u: 'min', step: 1 },
    { k: 'occupancy', l: 'Occupancy', u: 'persons/veh', step: 0.1 },
    { k: 'pcu', l: 'PCU factor', u: '–', step: 0.05 },
    { k: 'seats', l: 'Seating capacity', u: 'seats', step: 1 },
    { k: 'co2', l: 'CO₂ rate', u: 'g/veh-km', step: 5 }
  ];

  function renderModes() {
    $('modeCount').textContent = S.modes.length + ' modes';
    $('modeList').innerHTML = S.modes.map(function (m, i) {
      var fields = MODE_FIELDS.map(function (f) {
        return '<div class="fg"><label>' + esc(f.l) + ' <span class="u">(' + esc(f.u) + ')</span></label>' +
          '<input type="number" inputmode="decimal" step="' + f.step + '" value="' + esc(m[f.k]) +
          '" oninput="UI.editMode(' + i + ',\'' + f.k + '\',this.value)"></div>';
      });
      var pairs = '';
      for (var j = 0; j < fields.length; j += 2) {
        pairs += '<div class="grid2">' + fields[j] + (fields[j + 1] || '') + '</div><div style="height:9px"></div>';
      }
      var extra = (m.ascIncomeCoef !== undefined)
        ? '<div class="fg"><label>Income coefficient λ <span class="u">(car ASC uplift)</span></label>' +
          '<input type="number" inputmode="decimal" step="0.1" value="' + esc(m.ascIncomeCoef) +
          '" oninput="UI.editMode(' + i + ',\'ascIncomeCoef\',this.value)"></div>' : '';
      return '<div class="item"><div class="ih" onclick="UI.toggleItem(this)">' +
        '<span class="swatch" style="background:' + esc(m.color) + '"></span>' +
        '<span class="nm">' + esc(m.name) + '</span>' +
        '<span class="meta">' + (m.kind === 'pt' ? 'public' : 'private') + '</span><span class="car">▶</span></div>' +
        '<div class="ib">' + pairs + extra + '</div></div>';
    }).join('');
  }
  function editMode(i, k, v) {
    S.modes[i][k] = parseFloat(v) || 0;
    save(); invalidate();
  }

  /* ══════════════════════════════════════════════════════════
   * SCREEN 3 — RUN
   * ════════════════════════════════════════════════════════*/
  var STEP_DEFS = [
    ['Socio-economic growth', 'Project population, households, jobs and income to the horizon year'],
    ['Step 1 — Trip generation', 'Productions from households, attractions from jobs and school places'],
    ['Step 2 — Trip distribution', 'Doubly-constrained gravity model solved by Furness balancing'],
    ['Step 3 — Modal split', 'Multinomial logit across jeepney, UV Express, bus, car and motorcycle'],
    ['Step 4 — Traffic assignment', 'Incremental loading with BPR volume-delay and skim feedback'],
    ['Step 5 — Supply sizing', 'Headway, cycle time and fleet requirement per corridor']
  ];

  function validate() {
    var errs = [], warns = [];
    if (!S.zones.length) errs.push('No zones defined.');
    if (S.zones.length < 2) warns.push('Only one zone — the model will produce intrazonal trips only.');
    S.zones.forEach(function (z) {
      if (!(z.hh > 0)) errs.push((z.name || z.id) + ': households must be greater than zero.');
      if (!(z.area > 0)) errs.push((z.name || z.id) + ': land area must be greater than zero.');
      if (!(z.income > 0)) errs.push((z.name || z.id) + ': average household income must be greater than zero.');
    });
    var ids = {};
    S.zones.forEach(function (z) {
      if (ids[z.id]) errs.push('Duplicate zone id ' + z.id + '.');
      ids[z.id] = 1;
    });
    S.links.forEach(function (L) {
      if (!ids[L.from] || !ids[L.to]) errs.push(L.id + ' refers to a zone that no longer exists.');
      if (!(L.dist > 0)) errs.push(L.id + ': length must be greater than zero.');
      if (!(L.speed > 0)) errs.push(L.id + ': free-flow speed must be greater than zero.');
    });
    if (S.params.horizonYear < S.params.baseYear) errs.push('Horizon year is before the base year.');
    if (!S.links.length) warns.push('No corridors — nothing will be assigned to the network.');
    if (!(S.params.tripRateHH > 0)) errs.push('Trip rate must be greater than zero.');
    return { errs: errs, warns: warns, ok: errs.length === 0 };
  }

  function renderRun() {
    var v = validate();
    var html = '';
    if (v.errs.length) {
      html += '<div class="note err"><strong>Fix before running:</strong><ul style="margin:6px 0 0 16px">' +
        v.errs.map(function (e) { return '<li>' + esc(e) + '</li>'; }).join('') + '</ul></div>';
    }
    if (v.warns.length) {
      html += '<div class="note warn">' + v.warns.map(esc).join('<br>') + '</div>';
    }
    if (v.ok && !v.warns.length) {
      html += '<div class="note ok">' + S.zones.length + ' zones and ' + S.links.length +
        ' corridors ready. Forecast horizon ' + esc(S.params.baseYear) + ' → ' +
        esc(S.params.horizonYear) + ' (' + (S.params.horizonYear - S.params.baseYear) + ' years).</div>';
    }
    $('runValidation').innerHTML = html;
    $('btnRun').disabled = !v.ok;
    if (!$('runSteps').innerHTML) renderSteps(-1);
    renderLibrary();
  }

  function renderSteps(upto) {
    $('runSteps').innerHTML = STEP_DEFS.map(function (s, i) {
      var cls = upto > i ? 'done' : (upto === i ? 'active' : '');
      var mark = upto > i ? '✓' : String(i + 1);
      return '<li class="' + cls + '"><span class="dot">' + mark + '</span><div>' +
        '<div class="sl">' + esc(s[0]) + '</div><div class="sd">' + esc(s[1]) + '</div></div></li>';
    }).join('');
  }

  function invalidate() {
    if (R) { R = null; $('runSummary').innerHTML = ''; renderSteps(-1); }
  }

  function runSim() {
    var v = validate();
    if (!v.ok) { toast('Fix the errors first'); return; }
    var btn = $('btnRun');
    btn.disabled = true; btn.textContent = 'Running…';
    renderSteps(0);
    var i = 0;
    // Animate the step list, then run the (synchronous) model on the last tick.
    var tick = setInterval(function () {
      i++;
      renderSteps(i);
      if (i >= STEP_DEFS.length) {
        clearInterval(tick);
        try {
          R = RCEngine.run(RCData.clone(S));
          renderSteps(STEP_DEFS.length);
          renderRunSummary();
          toast('Simulation complete');
        } catch (e) {
          $('runSummary').innerHTML = '<div class="note err"><strong>Simulation failed.</strong><br>' +
            esc(e && e.message ? e.message : String(e)) + '</div>';
          renderSteps(-1);
        }
        btn.disabled = false; btn.textContent = '▶ Run simulation';
      }
    }, 130);
  }

  function renderRunSummary() {
    if (!R) return;
    var k = R.kpi;
    var conv = R.history.map(function (h) {
      return '<tr><td>Iteration ' + h.iter + '</td><td>' + h.furnessIters + '</td><td>' +
        h.furnessGap.toExponential(1) + '</td><td>' + pct(h.volChange, 2) + '</td></tr>';
    }).join('');
    $('runSummary').innerHTML =
      '<div class="note ok" style="margin-top:14px"><strong>Forecast complete for ' +
        esc(S.params.horizonYear) + '.</strong> ' + n0(k.totalTrips) +
        ' daily person trips · ' + n1(k.avgTripLength) + ' km average trip length · ' +
        k.congestedLinks + ' of ' + k.totalLinks + ' corridors at LOS E or F.</div>' +
      '<h3 class="sub">Convergence</h3>' +
      '<div class="tw"><table class="dt"><thead><tr><th>Feedback loop</th><th>Furness iters</th>' +
      '<th>Furness gap</th><th>Volume change</th></tr></thead><tbody>' + conv + '</tbody></table></div>' +
      '<div class="hint" style="margin-top:8px">Link volumes are averaged across feedback iterations ' +
      'by the method of successive averages; the volume-change column is the residual at each pass.</div>' +
      '<div class="btnrow" style="margin-top:14px">' +
        '<button class="btn primary" onclick="UI.go(\'results\')">View results →</button>' +
        '<button class="btn" onclick="UI.go(\'report\')">Generate report</button>' +
      '</div>';
  }

  /* ─────────────────────────────────────── scenario library ── */
  function saveToLibrary() {
    if (!R) { toast('Run the simulation first'); return; }
    var name = prompt('Save this run as:', S.meta.name || 'Scenario ' + (LIB.length + 1));
    if (!name) return;
    LIB.push({
      id: 'run' + Date.now(),
      name: name,
      savedAt: new Date().toISOString(),
      horizonYear: S.params.horizonYear,
      zones: S.zones.length,
      links: S.links.length,
      scenario: RCData.clone(S),
      kpi: {
        totalTrips: R.kpi.totalTrips, avgTripLength: R.kpi.avgTripLength,
        avgTripTime: R.kpi.avgTripTime, networkSpeed: R.kpi.networkSpeed,
        congestedLinks: R.kpi.congestedLinks, totalLinks: R.kpi.totalLinks,
        co2Tons: R.kpi.co2Tons, modeShare: R.kpi.modeShare.slice(),
        fleetTotals: JSON.parse(JSON.stringify(R.kpi.fleetTotals)),
        peakVkt: R.kpi.peakVkt
      },
      modeNames: R.modes.map(function (m) { return m.short; })
    });
    saveLib(); renderLibrary(); toast('Saved to library');
  }
  function clearLibrary() {
    if (!LIB.length) { toast('Library is already empty'); return; }
    if (!confirm('Delete all ' + LIB.length + ' saved runs?')) return;
    LIB = []; compareWith = null; saveLib(); renderLibrary(); toast('Library cleared');
  }
  function removeFromLibrary(i) {
    LIB.splice(i, 1);
    if (compareWith !== null && compareWith >= LIB.length) compareWith = null;
    saveLib(); renderLibrary();
  }
  function restoreFromLibrary(i) {
    if (!confirm('Replace the current scenario with "' + LIB[i].name + '"? Unsaved edits will be lost.')) return;
    S = RCData.clone(LIB[i].scenario);
    R = null; save();
    renderAll(); go('data'); toast('Scenario restored');
  }
  function setCompare(i) {
    compareWith = (compareWith === i) ? null : i;
    renderLibrary();
  }
  function renderLibrary() {
    $('libCount').textContent = LIB.length + ' saved';
    if (!LIB.length) {
      $('libraryList').innerHTML = '<div class="hint" style="text-align:center;padding:8px 0">No saved runs yet.</div>';
      $('compareBox').innerHTML = '';
      return;
    }
    $('libraryList').innerHTML = LIB.map(function (e, i) {
      return '<div class="item' + (compareWith === i ? ' open' : '') + '">' +
        '<div class="ih" onclick="UI.toggleItem(this)">' +
        '<span class="tag">' + esc(e.horizonYear) + '</span>' +
        '<span class="nm">' + esc(e.name) + '</span>' +
        '<span class="meta">' + n0(e.kpi.totalTrips) + '</span><span class="car">▶</span></div>' +
        '<div class="ib"><div class="hint">Saved ' + esc(new Date(e.savedAt).toLocaleString()) + ' · ' +
        e.zones + ' zones · ' + e.links + ' corridors</div>' +
        '<div class="btnrow" style="margin-top:10px">' +
          '<button class="btn sm" onclick="UI.setCompare(' + i + ')">' +
            (compareWith === i ? '✓ Comparing' : 'Compare') + '</button>' +
          '<button class="btn sm" onclick="UI.restoreFromLibrary(' + i + ')">Restore</button>' +
          '<button class="btn sm danger" onclick="UI.removeFromLibrary(' + i + ')">Delete</button>' +
        '</div></div></div>';
    }).join('');
    renderCompare();
  }
  function renderCompare() {
    if (compareWith === null || !LIB[compareWith]) { $('compareBox').innerHTML = ''; return; }
    if (!R) {
      $('compareBox').innerHTML = '<div class="note warn" style="margin-top:12px">' +
        'Run the current scenario to compare it against "' + esc(LIB[compareWith].name) + '".</div>';
      return;
    }
    var b = LIB[compareWith].kpi, a = R.kpi;
    var rows = [
      ['Daily person trips', a.totalTrips, b.totalTrips, n0, 1],
      ['Average trip length (km)', a.avgTripLength, b.avgTripLength, n1, 1],
      ['Average trip time (min)', a.avgTripTime, b.avgTripTime, n1, -1],
      ['Network speed (km/h)', a.networkSpeed, b.networkSpeed, n1, 1],
      ['Peak vehicle-km', a.peakVkt, b.peakVkt, n0, -1],
      ['Corridors at LOS E/F', a.congestedLinks, b.congestedLinks, n0, -1],
      ['CO₂ (tonnes/day)', a.co2Tons, b.co2Tons, n0, -1]
    ].map(function (r) {
      var d = r[1] - r[2];
      var rel = r[2] ? d / r[2] : 0;
      var good = r[4] * d >= 0;
      var col = Math.abs(rel) < 0.001 ? 'var(--muted)' : (good ? 'var(--green)' : 'var(--red)');
      var sign = d > 0 ? '+' : '';
      return '<tr><td>' + r[0] + '</td><td>' + r[3](r[1]) + '</td><td>' + r[3](r[2]) + '</td>' +
        '<td style="color:' + col + ';font-weight:700">' + sign + (r[2] ? pct(rel, 1) : '–') + '</td></tr>';
    }).join('');
    $('compareBox').innerHTML = '<h3 class="sub">Current vs. ' + esc(LIB[compareWith].name) + '</h3>' +
      '<div class="tw"><table class="dt"><thead><tr><th>Indicator</th><th>Current</th><th>Saved</th>' +
      '<th>Change</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
      '<div class="hint" style="margin-top:8px">Green marks a change in the desirable direction ' +
      '(more travel opportunity, less congestion, lower emissions).</div>';
  }

  /* ══════════════════════════════════════════════════════════
   * CHARTS — hand-rolled inline SVG, no libraries
   * ════════════════════════════════════════════════════════*/
  function barChartH(items, opts) {
    opts = opts || {};
    var W = 320, rowH = 26, padL = opts.padL || 74, padR = 52, top = 6;
    var H = top * 2 + items.length * rowH;
    var max = Math.max.apply(null, items.map(function (d) { return d.v; }).concat([1e-9]));
    var bars = items.map(function (d, i) {
      var y = top + i * rowH;
      var w = Math.max(1, (d.v / max) * (W - padL - padR));
      return '<text x="' + (padL - 6) + '" y="' + (y + 15) + '" text-anchor="end" font-size="10" ' +
             'fill="#667085" font-family="Inter,sans-serif">' + esc(d.k) + '</text>' +
             '<rect x="' + padL + '" y="' + (y + 5) + '" width="' + w.toFixed(1) + '" height="14" rx="3" fill="' +
             esc(d.c || '#1a3a4a') + '"/>' +
             '<text x="' + (padL + w + 6) + '" y="' + (y + 16) + '" font-size="10" font-weight="600" ' +
             'fill="#334" font-family="Inter,sans-serif">' + esc(d.lab) + '</text>';
    }).join('');
    return '<div class="chartwrap"><svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' +
           esc(opts.title || 'bar chart') + '">' + bars + '</svg></div>';
  }

  function vcChart(links) {
    var W = 320, H = 150, padL = 30, padB = 34, padT = 10;
    var max = Math.max(1.2, Math.max.apply(null, links.map(function (L) { return L.vc; })));
    var bw = (W - padL - 8) / Math.max(1, links.length);
    var plotH = H - padB - padT;
    var grid = [0.5, 1.0].map(function (g) {
      var y = padT + plotH * (1 - g / max);
      return '<line x1="' + padL + '" y1="' + y.toFixed(1) + '" x2="' + (W - 6) + '" y2="' + y.toFixed(1) +
        '" stroke="' + (g === 1 ? '#c62828' : '#e4e7ec') + '" stroke-width="1"' +
        (g === 1 ? ' stroke-dasharray="3 3"' : '') + '/>' +
        '<text x="' + (padL - 4) + '" y="' + (y + 3).toFixed(1) + '" text-anchor="end" font-size="8" fill="#98a2b3" ' +
        'font-family="Inter,sans-serif">' + g.toFixed(1) + '</text>';
    }).join('');
    var colors = { A: '#2e7d32', B: '#66a05a', C: '#d4a537', D: '#e08a3c', E: '#e05252', F: '#c62828' };
    var bars = links.map(function (L, i) {
      var h = Math.max(1, plotH * Math.min(L.vc, max) / max);
      var x = padL + i * bw + bw * 0.15;
      var w = bw * 0.7;
      return '<rect x="' + x.toFixed(1) + '" y="' + (padT + plotH - h).toFixed(1) + '" width="' + w.toFixed(1) +
        '" height="' + h.toFixed(1) + '" rx="2" fill="' + colors[L.los] + '"/>' +
        '<text x="' + (x + w / 2).toFixed(1) + '" y="' + (H - padB + 12) + '" text-anchor="middle" font-size="8" ' +
        'fill="#667085" font-family="Inter,sans-serif">' + esc(L.id) + '</text>' +
        '<text x="' + (x + w / 2).toFixed(1) + '" y="' + (H - padB + 22) + '" text-anchor="middle" font-size="7.5" ' +
        'font-weight="700" fill="' + colors[L.los] + '" font-family="Inter,sans-serif">' + L.los + '</text>';
    }).join('');
    return '<div class="chartwrap"><svg viewBox="0 0 ' + W + ' ' + H + '" role="img" ' +
      'aria-label="volume to capacity ratio by corridor">' + grid + bars +
      '<line x1="' + padL + '" y1="' + (padT + plotH) + '" x2="' + (W - 6) + '" y2="' + (padT + plotH) +
      '" stroke="#d0d5dd" stroke-width="1"/></svg></div>';
  }

  function stackChart(segments) {
    var W = 320, H = 26, total = segments.reduce(function (a, s) { return a + s.v; }, 0) || 1, x = 0;
    var parts = segments.map(function (s) {
      var w = (s.v / total) * W;
      var r = '<rect x="' + x.toFixed(1) + '" y="0" width="' + Math.max(0, w).toFixed(1) + '" height="' + H +
        '" fill="' + esc(s.c) + '"/>' +
        (w > 34 ? '<text x="' + (x + w / 2).toFixed(1) + '" y="17" text-anchor="middle" font-size="9.5" ' +
          'font-weight="700" fill="#fff" font-family="Inter,sans-serif">' + (100 * s.v / total).toFixed(0) + '%</text>' : '');
      x += w; return r;
    }).join('');
    return '<div class="chartwrap"><svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="mode share">' +
      '<g clip-path="url(#rcclip)">' + parts + '</g>' +
      '<defs><clipPath id="rcclip"><rect x="0" y="0" width="' + W + '" height="' + H + '" rx="5"/></clipPath></defs>' +
      '</svg></div>';
  }

  function legend(modes) {
    return '<div class="legend">' + modes.map(function (m) {
      return '<span><span class="swatch" style="background:' + esc(m.color) + '"></span>' + esc(m.name) + '</span>';
    }).join('') + '</div>';
  }

  /* ══════════════════════════════════════════════════════════
   * SCREEN 4 — RESULTS
   * ════════════════════════════════════════════════════════*/
  var RESULT_TABS = [
    ['overview', 'Summary'], ['generation', 'Trips'], ['distribution', 'Matrix'],
    ['mode', 'Modes'], ['network', 'Network'], ['fleet', 'Fleet']
  ];

  function setResultsTab(t) { resultsTab = t; renderResults(); }

  function renderResults() {
    var host = $('resultsBody');
    if (!R) {
      host.innerHTML = '<div class="empty"><div class="ic">📊</div>' +
        '<p>No results yet.<br>Run the simulation to see the forecast.</p>' +
        '<button class="btn primary sm" style="margin-top:14px" onclick="UI.go(\'run\')">Go to Run</button></div>';
      return;
    }
    var seg = '<div class="segbar">' + RESULT_TABS.map(function (t) {
      return '<button class="' + (resultsTab === t[0] ? 'active' : '') + '" onclick="UI.setResultsTab(\'' +
        t[0] + '\')">' + esc(t[1]) + '</button>';
    }).join('') + '</div>';
    var body = {
      overview: resOverview, generation: resGeneration, distribution: resDistribution,
      mode: resMode, network: resNetwork, fleet: resFleet
    }[resultsTab]();
    host.innerHTML = seg + body;
  }

  function resOverview() {
    var k = R.kpi;
    var tiles = [
      ['Daily person trips', n0(k.totalTrips), S.params.horizonYear + ' horizon'],
      ['Trips per capita', n2(k.tripsPerCapita), 'per person per day'],
      ['Ave. trip length', n1(k.avgTripLength) + ' <small>km</small>', pct(k.intrazonalTrips / k.totalTrips, 0) + ' intrazonal'],
      ['Ave. trip time', n1(k.avgTripTime) + ' <small>min</small>', 'all modes, composite'],
      ['Network speed', n1(k.networkSpeed) + ' <small>km/h</small>', 'peak hour, volume-weighted'],
      ['Congested links', k.congestedLinks + ' <small>/ ' + k.totalLinks + '</small>', 'at LOS E or F'],
      ['Peak vehicle-km', n0(k.peakVkt), 'pcu-km in the peak hour'],
      ['CO₂ emissions', n0(k.co2Tons) + ' <small>t/day</small>', 'road transport, study area']
    ].map(function (t) {
      return '<div class="kpi"><div class="k">' + t[0] + '</div><div class="v">' + t[1] +
        '</div><div class="d">' + t[2] + '</div></div>';
    }).join('');

    var shareSeg = R.modes.map(function (m, i) { return { v: k.modeShare[i], c: m.color }; });
    var fleetRows = R.modes.filter(function (m) { return m.kind === 'pt'; }).map(function (m) {
      return '<tr><td>' + esc(m.name) + '</td><td>' + n0(k.fleetTotals[m.id] || 0) + '</td></tr>';
    }).join('');

    return '<div class="kpis">' + tiles + '</div>' +
      '<h3 class="sub">Mode share</h3>' + stackChart(shareSeg) + legend(R.modes) +
      '<h3 class="sub">Peak-hour volume / capacity by corridor</h3>' + vcChart(R.links) +
      '<h3 class="sub">Public transport units required</h3>' +
      '<div class="tw"><table class="dt"><thead><tr><th>Mode</th><th>Units</th></tr></thead><tbody>' +
      fleetRows + '</tbody></table></div>' +
      '<div class="hint" style="margin-top:8px">Sum of the fleet needed on the maximum load section of ' +
      'every corridor. A unit that serves two corridors end to end is counted on each.</div>';
  }

  function resGeneration() {
    var g = R.generation, z = R.zones;
    var rows = z.map(function (zz, i) {
      return '<tr><td>' + esc(zz.name) + '</td><td>' + n0(zz.pop) + '</td><td>' + n0(zz.hh) + '</td>' +
        '<td>' + n0(zz.emp) + '</td><td>' + n0(g.P[i]) + '</td><td>' + n0(g.Araw[i]) + '</td>' +
        '<td>' + n0(g.A[i]) + '</td></tr>';
    }).join('');
    var tot = '<tr><td>Total</td><td>' + n0(z.reduce(function (a, x) { return a + x.pop; }, 0)) + '</td>' +
      '<td>' + n0(z.reduce(function (a, x) { return a + x.hh; }, 0)) + '</td>' +
      '<td>' + n0(z.reduce(function (a, x) { return a + x.emp; }, 0)) + '</td>' +
      '<td>' + n0(g.totalP) + '</td><td>' + n0(g.totalARaw) + '</td><td>' + n0(g.totalP) + '</td></tr>';
    return '<div class="note info"><strong>Step 1 — Trip generation.</strong> Socio-economic data grown to ' +
      esc(S.params.horizonYear) + ', then converted to daily productions and attractions. ' +
      'Raw attractions are scaled by <strong>' + n2(g.balanceFactor) + '</strong> so that ΣA = ΣP.</div>' +
      '<div class="tw"><table class="dt"><thead><tr><th>Zone</th><th>Pop</th><th>HH</th><th>Jobs</th>' +
      '<th>P<sub>i</sub></th><th>A raw</th><th>A bal.</th></tr></thead><tbody>' + rows +
      '</tbody><tfoot>' + tot + '</tfoot></table></div>' +
      barChartH(z.map(function (zz, i) {
        return { k: zz.name.length > 12 ? zz.name.slice(0, 11) + '…' : zz.name, v: g.P[i], lab: n0(g.P[i]), c: '#1a3a4a' };
      }), { title: 'productions by zone' }) +
      '<div class="hint">Productions P<sub>i</sub> by zone (daily person trips).</div>';
  }

  function resDistribution() {
    var T = R.T, z = R.zones, n = z.length;
    var max = 0;
    for (var i = 0; i < n; i++) for (var j = 0; j < n; j++) if (i !== j && T[i][j] > max) max = T[i][j];
    var head = '<tr><th>From \\ To</th>' + z.map(function (zz) { return '<th>' + esc(zz.id) + '</th>'; }).join('') +
      '<th>Total</th></tr>';
    var body = z.map(function (zz, i) {
      var rowTot = 0;
      var cells = z.map(function (_, j) {
        rowTot += T[i][j];
        var v = T[i][j];
        var intensity = i === j ? 0 : Math.min(1, max > 0 ? v / max : 0);
        var bg = i === j ? '#f2f5f8' : 'rgba(21,101,192,' + (0.05 + 0.55 * intensity).toFixed(3) + ')';
        var fg = intensity > 0.6 ? '#fff' : '#111';
        return '<td class="' + (i === j ? 'diag' : '') + '" style="background:' + bg + ';color:' + fg + '">' +
          n0(v) + '</td>';
      }).join('');
      return '<tr><td>' + esc(zz.id) + ' ' + esc(zz.name.slice(0, 10)) + '</td>' + cells +
        '<td style="font-weight:700">' + n0(rowTot) + '</td></tr>';
    }).join('');
    var colTot = '<tr><td>Total</td>' + z.map(function (_, j) {
      var s = 0; for (var i2 = 0; i2 < n; i2++) s += T[i2][j];
      return '<td>' + n0(s) + '</td>';
    }).join('') + '<td>' + n0(R.kpi.totalTrips) + '</td></tr>';

    var topPairs = [];
    for (var a = 0; a < n; a++) for (var b = 0; b < n; b++) {
      if (a === b) continue;
      topPairs.push({ k: z[a].id + '→' + z[b].id, v: T[a][b], lab: n0(T[a][b]), c: '#1565c0' });
    }
    topPairs.sort(function (x, y) { return y.v - x.v; });
    topPairs = topPairs.slice(0, 8);

    return '<div class="note info"><strong>Step 2 — Trip distribution.</strong> Doubly-constrained gravity model, ' +
      esc(S.params.deterrence) + ' deterrence, converged in ' + R.distribution.iters +
      ' Furness iterations (residual ' + R.distribution.gap.toExponential(1) + '). ' +
      'Daily person trips, all modes. The diagonal is intrazonal travel.</div>' +
      '<div class="tw"><table class="dt mtx"><thead>' + head + '</thead><tbody>' + body +
      '</tbody><tfoot>' + colTot + '</tfoot></table></div>' +
      '<h3 class="sub">Busiest inter-zonal movements</h3>' +
      barChartH(topPairs, { padL: 62, title: 'top OD pairs' }) +
      '<div class="hint">Intrazonal trips account for ' +
      pct(R.kpi.intrazonalTrips / R.kpi.totalTrips, 1) + ' of all travel.</div>';
  }

  function resMode() {
    var k = R.kpi;
    var rows = R.modes.map(function (m, i) {
      return '<tr><td><span class="swatch" style="background:' + esc(m.color) +
        ';display:inline-block;margin-right:5px"></span>' + esc(m.short) + '</td>' +
        '<td>' + n0(k.modeTrips[i]) + '</td><td>' + pct(k.modeShare[i]) + '</td>' +
        '<td>' + n0(k.modePkm[i]) + '</td><td>' + n0(k.modeVkm[i]) + '</td>' +
        '<td>' + n0(k.modeVkm[i] * m.co2 / 1e6) + '</td></tr>';
    }).join('');
    var bars = R.modes.map(function (m, i) {
      return { k: m.short, v: k.modeShare[i], lab: pct(k.modeShare[i]), c: m.color };
    });
    // sample utilities for a representative 10 km trip, from the first zone
    var sample = R.modes.map(function (m, i) {
      var d = 10, cf = 1;
      var t = 60 * d / m.speed * cf + m.accessWait;
      var c = m.fareBase + m.farePerKm * Math.max(0, d - m.fareBaseKm);
      if (m.kind === 'private') c = c / m.occupancy;
      return '<tr><td>' + esc(m.short) + '</td><td>' + n1(t) + '</td><td>' + n0(c) + '</td>' +
        '<td>' + n2(m.asc - S.params.thetaCost * c - S.params.thetaTime * t) + '</td></tr>';
    }).join('');

    return '<div class="note info"><strong>Step 3 — Modal split.</strong> Multinomial logit over ' +
      R.modes.length + ' modes. Value of time PHP ' +
      n0((S.params.thetaTime / S.params.thetaCost) * 60) + '/hour.</div>' +
      stackChart(R.modes.map(function (m, i) { return { v: k.modeShare[i], c: m.color }; })) +
      barChartH(bars, { title: 'mode share' }) +
      '<h3 class="sub">Demand by mode</h3>' +
      '<div class="tw"><table class="dt"><thead><tr><th>Mode</th><th>Trips/day</th><th>Share</th>' +
      '<th>Pax-km</th><th>Veh-km</th><th>t CO₂</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
      '<h3 class="sub">Utility check — a 10 km uncongested trip</h3>' +
      '<div class="tw"><table class="dt"><thead><tr><th>Mode</th><th>Time (min)</th>' +
      '<th>Cost (PHP)</th><th>Utility</th></tr></thead><tbody>' + sample + '</tbody></table></div>' +
      '<div class="hint" style="margin-top:8px">Perceived cost for private modes is the vehicle running ' +
      'cost divided by occupancy. Higher utility means a more attractive mode.</div>';
  }

  function resNetwork() {
    var rows = R.links.map(function (L) {
      return '<tr><td>' + esc(L.name) + '</td><td>' + n1(L.dist) + '</td><td>' + n0(L.capacity) + '</td>' +
        '<td>' + n0(L.vol) + '</td><td>' + n2(L.vc) + '</td>' +
        '<td><span class="pill los-' + L.los + '">' + L.los + '</span></td>' +
        '<td>' + n0(L.speed) + '</td><td>' + n1(L.delay) + '</td></tr>';
    }).join('');
    return '<div class="note info"><strong>Step 4 — Traffic assignment.</strong> Peak-hour, peak-direction ' +
      'volumes in pcu, loaded in ' + S.params.incrementSlices.length + ' increments with BPR ' +
      'α=' + S.params.bprAlpha + ', β=' + S.params.bprBeta + '.</div>' +
      vcChart(R.links) +
      '<div class="tw"><table class="dt"><thead><tr><th>Corridor</th><th>km</th><th>Cap</th><th>Vol</th>' +
      '<th>V/C</th><th>LOS</th><th>km/h</th><th>Delay</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
      '<div class="hint" style="margin-top:8px">Delay is the minutes added by congestion over the ' +
      'free-flow running time. LOS thresholds: A ≤0.35, B ≤0.55, C ≤0.75, D ≤0.90, E ≤1.00, F &gt;1.00.</div>' +
      '<h3 class="sub">Vehicle mix on each corridor</h3>' +
      '<div class="tw"><table class="dt"><thead><tr><th>Corridor</th>' +
      R.modes.map(function (m) { return '<th>' + esc(m.short) + '</th>'; }).join('') +
      '</tr></thead><tbody>' + R.links.map(function (L) {
        return '<tr><td>' + esc(L.id) + '</td>' + L.modeVeh.map(function (v) {
          return '<td>' + n0(v) + '</td>';
        }).join('') + '</tr>';
      }).join('') + '</tbody></table></div>' +
      '<div class="hint" style="margin-top:8px">Vehicles per hour in the peak direction.</div>';
  }

  function resFleet() {
    var pt = R.modes.filter(function (m) { return m.kind === 'pt'; });
    var head = '<tr><th>Corridor</th>' + pt.map(function (m) {
      return '<th>' + esc(m.short) + ' pax</th><th>' + esc(m.short) + ' hw</th><th>' + esc(m.short) + ' units</th>';
    }).join('') + '</tr>';
    var rows = R.fleets.map(function (f) {
      return '<tr><td>' + esc(f.name) + '</td>' + f.modes.map(function (fm) {
        return '<td>' + n0(fm.pmax) + '</td><td>' + n1(fm.headway) + '</td><td>' + n0(fm.fleet) + '</td>';
      }).join('') + '</tr>';
    }).join('');
    var totals = '<tr><td>Total units</td>' + pt.map(function (m) {
      return '<td>–</td><td>–</td><td>' + n0(R.kpi.fleetTotals[m.id] || 0) + '</td>';
    }).join('') + '</tr>';
    var bars = pt.map(function (m) {
      return { k: m.short, v: R.kpi.fleetTotals[m.id] || 0, lab: n0(R.kpi.fleetTotals[m.id] || 0), c: m.color };
    });
    return '<div class="note info"><strong>Step 5 — Public transport supply.</strong> Units needed on the ' +
      'maximum load section of each corridor at a ' + pct(S.params.loadFactor, 0) +
      ' load factor and ' + n0(S.params.terminalTime) + '-minute terminal time.</div>' +
      barChartH(bars, { title: 'fleet by mode' }) +
      '<div class="tw"><table class="dt"><thead>' + head + '</thead><tbody>' + rows +
      '</tbody><tfoot>' + totals + '</tfoot></table></div>' +
      '<div class="hint" style="margin-top:8px">pax = peak-hour peak-direction passengers, ' +
      'hw = headway in minutes, units = vehicles required to hold that headway over the round trip. ' +
      'Compare against authorised units to identify corridors that are over- or under-served.</div>';
  }

  /* ══════════════════════════════════════════════════════════
   * SCREEN 5 — REPORT
   * ════════════════════════════════════════════════════════*/
  var reportOpts = { matrix: true, params: true, appendix: true };

  function toggleReportOpt(k, on) { reportOpts[k] = on; renderReport(); }

  /** Narrative findings derived from the numbers, not hard-coded. */
  function findings() {
    var out = [], k = R.kpi;
    var bad = R.links.filter(function (L) { return L.los === 'E' || L.los === 'F'; })
                     .sort(function (a, b) { return b.vc - a.vc; });
    var watch = R.links.filter(function (L) { return L.los === 'D'; })
                       .sort(function (a, b) { return b.vc - a.vc; });

    if (bad.length) {
      out.push('<strong>' + bad.length + ' corridor' + (bad.length > 1 ? 's exceed' : ' exceeds') +
        ' acceptable operating conditions</strong> in the ' + S.params.horizonYear + ' peak hour: ' +
        bad.map(function (L) { return esc(L.name) + ' (V/C ' + n2(L.vc) + ', LOS ' + L.los + ')'; }).join('; ') +
        '. Capacity expansion, demand management or a mode shift to higher-occupancy vehicles is required.');
    } else if (watch.length) {
      out.push('<strong>No corridor fails</strong>, but ' + watch.length + ' approach' +
        (watch.length > 1 ? '' : 'es') + ' capacity at LOS D: ' +
        watch.map(function (L) { return esc(L.name) + ' (V/C ' + n2(L.vc) + ')'; }).join('; ') +
        '. These should be monitored and re-tested against a higher growth scenario.');
    } else {
      out.push('<strong>The network accommodates the ' + S.params.horizonYear + ' forecast</strong> ' +
        'with every corridor operating at LOS C or better. The busiest section is ' +
        esc(R.links.slice().sort(function (a, b) { return b.vc - a.vc; })[0].name) + ' at V/C ' +
        n2(Math.max.apply(null, R.links.map(function (L) { return L.vc; }))) + '.');
    }

    var ptShare = R.modes.reduce(function (a, m, i) { return a + (m.kind === 'pt' ? k.modeShare[i] : 0); }, 0);
    var topPrivate = R.modes.map(function (m, i) { return { m: m, s: k.modeShare[i] }; })
      .filter(function (x) { return x.m.kind === 'private'; })
      .sort(function (a, b) { return b.s - a.s; })[0];
    out.push('<strong>Public transport carries ' + pct(ptShare) + ' of daily trips.</strong> ' +
      'The largest single private mode is ' + esc(topPrivate.m.name) + ' at ' + pct(topPrivate.s) +
      '. Every percentage point shifted from private to public transport removes roughly ' +
      n0(k.totalTrips * 0.01 * k.avgTripLength * (1 / topPrivate.m.occupancy - 1 / 16)) +
      ' vehicle-km per day from the network.');

    var fleetTxt = R.modes.filter(function (m) { return m.kind === 'pt'; }).map(function (m) {
      return n0(k.fleetTotals[m.id] || 0) + ' ' + m.short;
    }).join(', ');
    out.push('<strong>Public transport supply requirement: ' + fleetTxt + '</strong> units across all ' +
      'corridors at a ' + pct(S.params.loadFactor, 0) + ' load factor. Corridors where the required ' +
      'fleet exceeds authorised units are candidates for additional franchises; the reverse indicates ' +
      'over-supply and low unit revenue.');

    var busiest = R.fleets.slice().sort(function (a, b) {
      var sa = a.modes.reduce(function (x, m) { return x + m.pmax; }, 0);
      var sb = b.modes.reduce(function (x, m) { return x + m.pmax; }, 0);
      return sb - sa;
    })[0];
    if (busiest) {
      out.push('<strong>' + esc(busiest.name) + ' is the priority public transport corridor</strong>, ' +
        'carrying ' + n0(busiest.modes.reduce(function (x, m) { return x + m.pmax; }, 0)) +
        ' peak-hour passengers in the peak direction — the natural first candidate for route ' +
        'rationalisation, terminal investment or higher-capacity units.');
    }

    out.push('<strong>Travel demand grows with the socio-economic base:</strong> ' + n0(k.totalTrips) +
      ' daily person trips by ' + S.params.horizonYear + ', an average of ' + n2(k.tripsPerCapita) +
      ' trips per person per day over an average distance of ' + n1(k.avgTripLength) + ' km. ' +
      'Road transport emits an estimated ' + n0(k.co2Tons) + ' tonnes of CO₂ per day.');
    return out;
  }

  function reportZoneTable() {
    return '<div class="tw"><table class="dt"><thead><tr><th>Zone</th><th>Pop</th><th>HH</th><th>Jobs</th>' +
      '<th>Enrol</th><th>Income</th><th>km²</th></tr></thead><tbody>' +
      S.zones.map(function (z) {
        return '<tr><td>' + esc(z.id) + ' ' + esc(z.name) + '</td><td>' + n0(z.pop) + '</td><td>' + n0(z.hh) +
          '</td><td>' + n0(z.emp) + '</td><td>' + n0(z.enrol) + '</td><td>' + n0(z.income) +
          '</td><td>' + n0(z.area) + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }
  function reportLinkTable() {
    return '<div class="tw"><table class="dt"><thead><tr><th>Corridor</th><th>km</th><th>Lanes</th>' +
      '<th>km/h</th><th>Capacity</th></tr></thead><tbody>' +
      S.links.map(function (L) {
        return '<tr><td>' + esc(L.id) + ' ' + esc(L.name || (zoneName(L.from) + '–' + zoneName(L.to))) +
          '</td><td>' + n1(L.dist) + '</td><td>' + n0(L.lanes) + '</td><td>' + n0(L.speed) +
          '</td><td>' + n0(L.capacity) + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }
  function reportParamTable() {
    return PARAM_GROUPS.map(function (g) {
      return '<p style="font-weight:700;color:#1a3a4a;margin:10px 0 5px">' + esc(g.title) + '</p>' +
        '<div class="tw"><table class="dt"><tbody>' + g.items.map(function (it) {
          var unit = (it.u && it.u !== '\u2013') ? ' <span style="color:#667085">' + esc(it.u) + '</span>' : '';
          return '<tr><td>' + esc(it.l) + '</td><td>' + esc(S.params[it.k]) + unit + '</td></tr>';
        }).join('') + '</tbody></table></div>';
    }).join('') +
    '<p style="font-weight:700;color:#1a3a4a;margin:10px 0 5px">Mode characteristics</p>' +
    '<div class="tw"><table class="dt"><thead><tr><th>Mode</th><th>ASC</th><th>Fare</th><th>+/km</th>' +
    '<th>km/h</th><th>Wait</th><th>Occ</th><th>PCU</th><th>Seats</th></tr></thead><tbody>' +
    S.modes.map(function (m) {
      return '<tr><td>' + esc(m.short) + '</td><td>' + n2(m.asc) + '</td><td>' + n0(m.fareBase) +
        '</td><td>' + n2(m.farePerKm) + '</td><td>' + n0(m.speed) + '</td><td>' + n0(m.accessWait) +
        '</td><td>' + n1(m.occupancy) + '</td><td>' + n2(m.pcu) + '</td><td>' + n0(m.seats) + '</td></tr>';
    }).join('') + '</tbody></table></div>';
  }

  function renderReport() {
    var host = $('reportBody');
    if (!R) {
      $('reportControls').innerHTML = '';
      host.innerHTML = '<div class="empty"><div class="ic">📄</div>' +
        '<p>No forecast to report yet.<br>Run the simulation first.</p>' +
        '<button class="btn primary sm" style="margin-top:14px" onclick="UI.go(\'run\')">Go to Run</button></div>';
      return;
    }
    $('reportControls').innerHTML =
      '<div class="sect open"><div class="sh" style="cursor:default"><span class="t">Report output</span></div>' +
      '<div class="sb">' +
        '<div class="hint" style="margin-bottom:10px">Include:</div>' +
        ['matrix|Full origin–destination matrix', 'params|Model parameter appendix',
         'appendix|Methodology and formulas'].map(function (o) {
          var p = o.split('|');
          return '<label style="display:flex;gap:8px;align-items:center;font-size:12px;margin-bottom:7px">' +
            '<input type="checkbox" style="width:auto" ' + (reportOpts[p[0]] ? 'checked' : '') +
            ' onchange="UI.toggleReportOpt(\'' + p[0] + '\',this.checked)">' + esc(p[1]) + '</label>';
        }).join('') +
        '<div class="btnrow" style="margin-top:12px">' +
          '<button class="btn primary" onclick="window.print()">🖨 Print / Save PDF</button>' +
          '<button class="btn" onclick="UI.exportCSV()">⭳ Results CSV</button>' +
        '</div>' +
        '<div class="btnrow" style="margin-top:8px">' +
          '<button class="btn sm" onclick="UI.exportMatrixCSV()">⭳ OD matrix CSV</button>' +
          '<button class="btn sm" onclick="UI.exportScenario()">⭳ Scenario JSON</button>' +
        '</div>' +
      '</div></div>';

    var k = R.kpi, p = S.params;
    var sec = 0;
    function H(title, cls) {
      sec++;
      return '<div class="rpt-sec' + (cls ? ' ' + cls : '') + '"><h3><span class="no">' + sec + '.</span>' +
        esc(title) + '</h3>';
    }

    var html = '<div class="report"><div class="rpt-cover">' +
      '<div class="org">TRAVEL DEMAND FORECAST REPORT</div>' +
      '<h2>' + esc(S.meta.name || 'Untitled Scenario') + '</h2>' +
      '<div class="st">' + esc(S.meta.studyArea || 'Study area not specified') + '</div>' +
      '<div class="mt">' +
        '<div><div class="l">BASE YEAR</div><div class="v">' + esc(p.baseYear) + '</div></div>' +
        '<div><div class="l">HORIZON YEAR</div><div class="v">' + esc(p.horizonYear) + '</div></div>' +
        '<div><div class="l">ZONES / CORRIDORS</div><div class="v">' + S.zones.length + ' / ' + S.links.length + '</div></div>' +
        '<div><div class="l">DATE PREPARED</div><div class="v">' + esc(longDate()) + '</div></div>' +
        '<div><div class="l">PREPARED BY</div><div class="v">' + esc(S.meta.preparedBy || '—') + '</div></div>' +
        '<div><div class="l">MODEL</div><div class="v">RouteCast four-step</div></div>' +
      '</div></div><div class="rpt-body">';

    /* 1 — executive summary */
    html += H('Executive summary') +
      '<p>' + esc(S.meta.notes || ('This report presents a ' + p.horizonYear +
        ' travel demand forecast for ' + (S.meta.studyArea || 'the study area') +
        ', prepared with a four-step macroscopic model.')) + '</p>' +
      '<div class="kpis" style="margin:12px 0">' + [
        ['Daily person trips', n0(k.totalTrips)],
        ['Ave. trip length', n1(k.avgTripLength) + ' <small>km</small>'],
        ['Public transport share', pct(R.modes.reduce(function (a, m, i) {
          return a + (m.kind === 'pt' ? k.modeShare[i] : 0); }, 0))],
        ['Corridors at LOS E/F', k.congestedLinks + ' <small>of ' + k.totalLinks + '</small>']
      ].map(function (t) {
        return '<div class="kpi"><div class="k">' + t[0] + '</div><div class="v">' + t[1] + '</div></div>';
      }).join('') + '</div>' +
      '<ul>' + findings().map(function (f) { return '<li>' + f + '</li>'; }).join('') + '</ul></div>';

    /* 2 — input datasets */
    html += H('Input datasets') +
      '<p>The forecast uses three input tables. Socio-economic values below are ' +
      'base-year (' + esc(p.baseYear) + ') observations; the model grows them to the horizon year ' +
      'before generating trips.</p>' +
      '<p style="font-weight:700;color:#1a3a4a">2.1 Zone system</p>' + reportZoneTable() +
      '<p style="font-weight:700;color:#1a3a4a;margin-top:12px">2.2 Corridor network</p>' + reportLinkTable() +
      '<p style="margin-top:10px">Capacity is stated per direction. Intrazonal travel distance is ' +
      'estimated as ' + n2(p.intrazonalK) + '·√(area).</p></div>';

    /* 3 — trip generation */
    html += H('Trip generation (Step 1)') +
      '<p>Productions are generated from households at ' + n1(p.tripRateHH) +
      ' person-trips per household per day, adjusted for relative household income ' +
      '(elasticity ' + n2(p.incomeElasticity) + '). Attractions combine employment, school ' +
      'enrolment and residual population, then are scaled by ' + n2(R.generation.balanceFactor) +
      ' so that total attractions equal total productions.</p>' +
      '<div class="tw"><table class="dt"><thead><tr><th>Zone</th><th>Pop ' + esc(p.horizonYear) + '</th>' +
      '<th>HH</th><th>Jobs</th><th>Productions</th><th>Attractions</th></tr></thead><tbody>' +
      R.zones.map(function (z, i) {
        return '<tr><td>' + esc(z.name) + '</td><td>' + n0(z.pop) + '</td><td>' + n0(z.hh) + '</td><td>' +
          n0(z.emp) + '</td><td>' + n0(R.generation.P[i]) + '</td><td>' + n0(R.generation.A[i]) + '</td></tr>';
      }).join('') + '</tbody><tfoot><tr><td>Total</td><td>' +
      n0(R.zones.reduce(function (a, z) { return a + z.pop; }, 0)) + '</td><td>' +
      n0(R.zones.reduce(function (a, z) { return a + z.hh; }, 0)) + '</td><td>' +
      n0(R.zones.reduce(function (a, z) { return a + z.emp; }, 0)) + '</td><td>' +
      n0(R.generation.totalP) + '</td><td>' + n0(R.generation.totalP) + '</td></tr></tfoot></table></div></div>';

    /* 4 — distribution */
    html += H('Trip distribution (Step 2)') +
      '<p>A doubly-constrained gravity model distributes the productions across destinations using ' +
      'the <em>' + esc(p.deterrence) + '</em> deterrence function. Balancing converged in ' +
      R.distribution.iters + ' Furness iterations with a residual of ' +
      R.distribution.gap.toExponential(1) + '. Intrazonal travel accounts for ' +
      pct(k.intrazonalTrips / k.totalTrips) + ' of all trips.</p>';
    if (reportOpts.matrix) {
      html += '<p style="font-weight:700;color:#1a3a4a">Origin–destination matrix — daily person trips</p>' +
        '<div class="tw"><table class="dt mtx"><thead><tr><th>O \\ D</th>' +
        R.zones.map(function (z) { return '<th>' + esc(z.id) + '</th>'; }).join('') + '<th>Σ</th></tr></thead><tbody>' +
        R.zones.map(function (z, i) {
          var rt = R.T[i].reduce(function (a, b) { return a + b; }, 0);
          return '<tr><td>' + esc(z.id) + '</td>' + R.T[i].map(function (v, j) {
            return '<td' + (i === j ? ' class="diag"' : '') + '>' + n0(v) + '</td>';
          }).join('') + '<td style="font-weight:700">' + n0(rt) + '</td></tr>';
        }).join('') + '</tbody></table></div>';
    }
    html += '</div>';

    /* 5 — modal split */
    html += H('Modal split (Step 3)') +
      '<p>Mode choice is a multinomial logit model with a value of time of PHP ' +
      n0((p.thetaTime / p.thetaCost) * 60) + ' per hour. Car availability rises with zone income.</p>' +
      stackChart(R.modes.map(function (m, i) { return { v: k.modeShare[i], c: m.color }; })) +
      legend(R.modes) +
      '<div class="tw" style="margin-top:10px"><table class="dt"><thead><tr><th>Mode</th><th>Trips/day</th>' +
      '<th>Share</th><th>Pax-km/day</th><th>Veh-km/day</th></tr></thead><tbody>' +
      R.modes.map(function (m, i) {
        return '<tr><td>' + esc(m.name) + '</td><td>' + n0(k.modeTrips[i]) + '</td><td>' +
          pct(k.modeShare[i]) + '</td><td>' + n0(k.modePkm[i]) + '</td><td>' + n0(k.modeVkm[i]) + '</td></tr>';
      }).join('') + '</tbody></table></div></div>';

    /* 6 — assignment */
    html += H('Traffic assignment (Step 4)', 'page-break') +
      '<p>Peak-hour, peak-direction demand (' + pct(p.peakHourFactor, 1) + ' of daily trips, ' +
      pct(p.peakDirSplit, 0) + ' in the heavy direction) is converted to passenger-car units and ' +
      'loaded on shortest paths in ' + p.incrementSlices.length + ' increments. Link speeds follow ' +
      'the BPR function with α = ' + p.bprAlpha + ' and β = ' + p.bprBeta + '.</p>' +
      vcChart(R.links) +
      '<div class="tw"><table class="dt"><thead><tr><th>Corridor</th><th>Capacity</th><th>Volume</th>' +
      '<th>V/C</th><th>LOS</th><th>Speed</th><th>Delay</th></tr></thead><tbody>' +
      R.links.map(function (L) {
        return '<tr><td>' + esc(L.name) + '</td><td>' + n0(L.capacity) + '</td><td>' + n0(L.vol) +
          '</td><td>' + n2(L.vc) + '</td><td><span class="pill los-' + L.los + '">' + L.los + '</span></td>' +
          '<td>' + n0(L.speed) + '</td><td>' + n1(L.delay) + '</td></tr>';
      }).join('') + '</tbody></table></div>' +
      '<p style="margin-top:9px">Network-wide the peak hour produces ' + n0(k.peakVkt) +
      ' vehicle-km at an average speed of ' + n1(k.networkSpeed) + ' km/h.</p></div>';

    /* 7 — fleet */
    var pt = R.modes.filter(function (m) { return m.kind === 'pt'; });
    html += H('Public transport supply (Step 5)') +
      '<p>For every corridor the model sizes each public transport mode from the peak-hour maximum ' +
      'load section, at a ' + pct(p.loadFactor, 0) + ' design load factor and ' + n0(p.terminalTime) +
      ' minutes of terminal time per end.</p>' +
      '<div class="tw"><table class="dt"><thead><tr><th>Corridor</th>' +
      pt.map(function (m) { return '<th>' + esc(m.short) + ' pax</th><th>hw</th><th>units</th>'; }).join('') +
      '</tr></thead><tbody>' +
      R.fleets.map(function (f) {
        return '<tr><td>' + esc(f.name) + '</td>' + f.modes.map(function (fm) {
          return '<td>' + n0(fm.pmax) + '</td><td>' + n1(fm.headway) + '</td><td>' + n0(fm.fleet) + '</td>';
        }).join('') + '</tr>';
      }).join('') + '</tbody><tfoot><tr><td>Total</td>' +
      pt.map(function (m) { return '<td>–</td><td>–</td><td>' + n0(k.fleetTotals[m.id] || 0) + '</td>'; }).join('') +
      '</tr></tfoot></table></div></div>';

    /* 8 — parameters */
    if (reportOpts.params) {
      html += H('Model parameters', 'page-break') +
        '<p>Complete parameter set used for this run. Values are indicative planning defaults unless ' +
        'they have been replaced with locally calibrated figures.</p>' + reportParamTable() + '</div>';
    }

    /* 9 — methodology */
    if (reportOpts.appendix) {
      html += H('Methodology', reportOpts.params ? '' : 'page-break') +
        '<p>RouteCast implements the classical four-step travel demand chain used by macroscopic ' +
        'forecasting packages, with a feedback loop between assignment and the demand steps.</p>' +
        PARAM_GROUPS.map(function (g) {
          return '<p style="font-weight:700;color:#1a3a4a;margin:11px 0 4px">' + esc(g.title) + '</p>' +
            '<div class="formula">' + esc(g.formula) + '</div>' +
            '<p style="font-size:11px">' + g.note + '</p>';
        }).join('') +
        '<p style="font-weight:700;color:#1a3a4a;margin:11px 0 4px">Convergence</p>' +
        '<p>The demand steps and the assignment are iterated ' + p.outerIters + ' times. Link volumes ' +
        'are averaged across iterations by the method of successive averages, ' +
        'v<sup>(n)</sup> = v<sup>(n−1)</sup> + (1/n)(v<sub>new</sub> − v<sup>(n−1)</sup>), so that ' +
        'congested skims feeding distribution and mode choice settle rather than oscillate. ' +
        'The final residual for this run was ' + pct(k.convergence, 2) + '.</p>' +
        '<p style="font-weight:700;color:#1a3a4a;margin:11px 0 4px">Limitations</p>' +
        '<ul>' +
          '<li>Zones are whole municipalities; intrazonal travel is approximated from land area ' +
          'rather than modelled on a street network.</li>' +
          '<li>Assignment is a single peak hour in the heavy direction; it does not model ' +
          'intersections, signal delay or queue spillback.</li>' +
          '<li>Trip purposes are not segmented, and the model is uncalibrated against observed ' +
          'counts unless the user has supplied local coefficients.</li>' +
          '<li>Emissions use fixed rates per vehicle-kilometre and take no account of vehicle age, ' +
          'speed profile or fuel type.</li>' +
        '</ul></div>';
    }

    html += '<div class="sigblock">' +
      '<div><div class="line"></div>Prepared by' + (S.meta.preparedBy ? ' — ' + esc(S.meta.preparedBy) : '') + '</div>' +
      '<div><div class="line"></div>Reviewed / approved by</div></div>';

    html += '</div><div class="rpt-foot">Generated by RouteCast on ' + esc(longDate()) +
      ' · scenario "' + esc(S.meta.name || 'Untitled') + '" · ' + S.zones.length + ' zones, ' +
      S.links.length + ' corridors, ' + esc(p.baseYear) + '–' + esc(p.horizonYear) + ' horizon. ' +
      'Figures are model estimates from the stated inputs and are intended for planning use; ' +
      'they are not a substitute for a calibrated regional model or field surveys.</div></div>';

    host.innerHTML = html;
  }

  /* ══════════════════════════════════════════════════════════
   * EXPORTS
   * ════════════════════════════════════════════════════════*/
  function csvEsc(v) {
    var s = String(v === undefined || v === null ? '' : v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function csvRows(rows) {
    return rows.map(function (r) { return r.map(csvEsc).join(','); }).join('\r\n');
  }
  function slug(s) {
    return String(s || 'scenario').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
  }

  function exportScenario() {
    download(slug(S.meta.name) + '-scenario.json', 'application/json', JSON.stringify(S, null, 2));
    toast('Scenario exported');
  }
  function importScenario(input) {
    var f = input.files && input.files[0];
    if (!f) return;
    var rd = new FileReader();
    rd.onload = function () {
      try {
        var o = JSON.parse(rd.result);
        if (!o.zones || !o.links || !o.params) throw new Error('Not a RouteCast scenario file.');
        if (!o.modes) o.modes = RCData.clone(RCData.MODES);
        if (!o.meta) o.meta = { name: f.name.replace(/\.json$/i, '') };
        S = o; R = null; save(); renderAll(); go('data');
        toast('Scenario imported');
      } catch (e) {
        alert('Could not read that file: ' + (e.message || e));
      }
      input.value = '';
    };
    rd.readAsText(f);
  }

  function exportCSV() {
    if (!R) { toast('Run the simulation first'); return; }
    var k = R.kpi, rows = [];
    rows.push(['RouteCast results', S.meta.name || 'Untitled']);
    rows.push(['Study area', S.meta.studyArea || '']);
    rows.push(['Base year', S.params.baseYear, 'Horizon year', S.params.horizonYear]);
    rows.push(['Generated', new Date().toISOString()]);
    rows.push([]);

    rows.push(['SUMMARY INDICATORS']);
    rows.push(['Daily person trips', Math.round(k.totalTrips)]);
    rows.push(['Trips per capita', k.tripsPerCapita.toFixed(3)]);
    rows.push(['Average trip length (km)', k.avgTripLength.toFixed(2)]);
    rows.push(['Average trip time (min)', k.avgTripTime.toFixed(2)]);
    rows.push(['Intrazonal share', (k.intrazonalTrips / k.totalTrips).toFixed(4)]);
    rows.push(['Peak vehicle-km (pcu-km)', Math.round(k.peakVkt)]);
    rows.push(['Network speed (km/h)', k.networkSpeed.toFixed(2)]);
    rows.push(['Corridors at LOS E/F', k.congestedLinks, 'of', k.totalLinks]);
    rows.push(['CO2 (tonnes/day)', Math.round(k.co2Tons)]);
    rows.push([]);

    rows.push(['ZONE RESULTS']);
    rows.push(['Zone id', 'Zone', 'Population', 'Households', 'Jobs', 'Enrolment', 'Income',
               'Area km2', 'Productions', 'Attractions']);
    R.zones.forEach(function (z, i) {
      rows.push([z.id, z.name, Math.round(z.pop), Math.round(z.hh), Math.round(z.emp),
                 Math.round(z.enrol), Math.round(z.income), z.area,
                 Math.round(R.generation.P[i]), Math.round(R.generation.A[i])]);
    });
    rows.push([]);

    rows.push(['MODE RESULTS']);
    rows.push(['Mode', 'Trips per day', 'Share', 'Passenger-km', 'Vehicle-km', 'CO2 tonnes/day']);
    R.modes.forEach(function (m, i) {
      rows.push([m.name, Math.round(k.modeTrips[i]), k.modeShare[i].toFixed(4),
                 Math.round(k.modePkm[i]), Math.round(k.modeVkm[i]),
                 Math.round(k.modeVkm[i] * m.co2 / 1e6)]);
    });
    rows.push([]);

    rows.push(['LINK RESULTS (peak hour, peak direction)']);
    rows.push(['Link id', 'Corridor', 'Length km', 'Lanes', 'Capacity pcu/h', 'Volume pcu/h',
               'V/C', 'LOS', 'Free-flow min', 'Congested min', 'Speed km/h', 'Delay min']);
    R.links.forEach(function (L) {
      rows.push([L.id, L.name, L.dist, L.lanes, Math.round(L.capacity), Math.round(L.vol),
                 L.vc.toFixed(3), L.los, L.t0.toFixed(2), L.time.toFixed(2),
                 L.speed.toFixed(1), L.delay.toFixed(2)]);
    });
    rows.push([]);

    rows.push(['PUBLIC TRANSPORT SUPPLY']);
    rows.push(['Link id', 'Corridor', 'Mode', 'Peak pax', 'Headway min', 'Cycle min', 'Units required']);
    R.fleets.forEach(function (f) {
      f.modes.forEach(function (fm) {
        rows.push([f.linkId, f.name, fm.name, Math.round(fm.pmax), fm.headway.toFixed(2),
                   fm.cycle.toFixed(1), fm.fleet]);
      });
    });

    download(slug(S.meta.name) + '-results.csv', 'text/csv;charset=utf-8', csvRows(rows));
    toast('Results CSV exported');
  }

  function exportMatrixCSV() {
    if (!R) { toast('Run the simulation first'); return; }
    var rows = [['Origin \\ Destination'].concat(R.zones.map(function (z) { return z.id + ' ' + z.name; }), ['Total'])];
    R.zones.forEach(function (z, i) {
      var tot = R.T[i].reduce(function (a, b) { return a + b; }, 0);
      rows.push([z.id + ' ' + z.name].concat(R.T[i].map(function (v) { return Math.round(v); }), [Math.round(tot)]));
    });
    var colTot = ['Total'];
    for (var j = 0; j < R.zones.length; j++) {
      var s = 0;
      for (var i2 = 0; i2 < R.zones.length; i2++) s += R.T[i2][j];
      colTot.push(Math.round(s));
    }
    colTot.push(Math.round(R.kpi.totalTrips));
    rows.push(colTot);
    download(slug(S.meta.name) + '-od-matrix.csv', 'text/csv;charset=utf-8', csvRows(rows));
    toast('OD matrix exported');
  }

  /* ══════════════════════════════════════════════════════════
   * BOOT
   * ════════════════════════════════════════════════════════*/
  function loadPreset(which) {
    if (S && !confirm('Replace the current scenario with the ' +
        (which === 'r12' ? 'Region XII' : which === 'mini' ? 'four-zone example' : 'blank') +
        ' dataset? Unsaved edits will be lost.')) return;
    S = (which === 'blank') ? RCData.blankScenario() : RCData.makeScenario(which);
    R = null; compareWith = null;
    save(); renderAll(); go('data');
    toast('Dataset loaded');
  }

  function renderAll() {
    renderMeta(); renderZones(); renderLinks(); renderParams(); renderModes(); renderRun();
    if (screen === 'results') renderResults();
    if (screen === 'report') renderReport();
  }

  function init() {
    S = load() || RCData.makeScenario('r12');
    if (!S.meta.name) S.meta.name = RCData.PRESETS.r12.meta.name;
    LIB = loadLib();
    renderAll();
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', function () {
        navigator.serviceWorker.register('sw.js').catch(function () { /* offline support is optional */ });
      });
    }
  }

  return {
    init: init, go: go, toggleSect: toggleSect, toggleItem: toggleItem,
    metaChanged: metaChanged, loadPreset: loadPreset,
    addZone: addZone, editZone: editZone, removeZone: removeZone,
    addLink: addLink, editLink: editLink, removeLink: removeLink,
    editParam: editParam, resetParams: resetParams, editMode: editMode,
    runSim: runSim, setResultsTab: setResultsTab,
    saveToLibrary: saveToLibrary, clearLibrary: clearLibrary,
    removeFromLibrary: removeFromLibrary, restoreFromLibrary: restoreFromLibrary,
    setCompare: setCompare, toggleReportOpt: toggleReportOpt,
    exportScenario: exportScenario, importScenario: importScenario,
    exportCSV: exportCSV, exportMatrixCSV: exportMatrixCSV
  };
})();

document.addEventListener('DOMContentLoaded', UI.init);
