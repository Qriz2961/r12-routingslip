/* ============================================================================
 * RouteCast Engine — four-step macroscopic travel demand model
 * ----------------------------------------------------------------------------
 * Mirrors the T4Cast (UP-NCTS ITS Lab) modelling chain at a simplified scale:
 *
 *   0. Socio-economic growth        Pop(h) = Pop(0)(1+g)^n
 *   1. Trip generation              P_i, A_j  (+ attraction balancing)
 *   2. Trip distribution            doubly-constrained gravity model (Furness)
 *   3. Modal split                  multinomial logit, composite logsum
 *   4. Traffic assignment           incremental loading with BPR volume-delay
 *   5. Supply sizing                headway / cycle time / fleet requirement
 *
 * Steps 2-4 sit inside a feedback loop: congested skims from the assignment are
 * fed back into distribution and mode choice, averaged by the method of
 * successive averages (MSA) until link volumes stabilise.
 *
 * Pure functions, no DOM. Runs in the browser and under Node (for the tests).
 * ==========================================================================*/

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RCEngine = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var INF = Infinity;

  /* ------------------------------------------------------------------ utils */
  function zeros(n, m) {
    var a = new Array(n), i, j;
    for (i = 0; i < n; i++) { a[i] = new Array(m); for (j = 0; j < m; j++) a[i][j] = 0; }
    return a;
  }
  function sum(arr) { var s = 0, i; for (i = 0; i < arr.length; i++) s += arr[i]; return s; }
  function matSum(M) { var s = 0, i, j; for (i = 0; i < M.length; i++) for (j = 0; j < M[i].length; j++) s += M[i][j]; return s; }
  function num(v, dflt) { var n = parseFloat(v); return isFinite(n) ? n : (dflt || 0); }

  /* ==========================================================================
   * STEP 0 — Socio-economic growth
   * Population, households and enrolment grow at popGrowth; employment at
   * empGrowth; household income at incomeGrowth. All compounded over the
   * (horizonYear - baseYear) forecast period.
   * ========================================================================*/
  function growZones(zones, p) {
    var years = Math.max(0, num(p.horizonYear, 0) - num(p.baseYear, 0));
    var fp = Math.pow(1 + num(p.popGrowth) / 100, years);
    var fe = Math.pow(1 + num(p.empGrowth) / 100, years);
    var fi = Math.pow(1 + num(p.incomeGrowth) / 100, years);
    return zones.map(function (z) {
      return {
        id: z.id,
        name: z.name,
        area: num(z.area, 1),
        pop: num(z.pop) * fp,
        hh: num(z.hh) * fp,
        emp: num(z.emp) * fe,
        enrol: num(z.enrol) * fp,
        income: num(z.income) * fi,
        basePop: num(z.pop),
        baseEmp: num(z.emp)
      };
    });
  }

  /* ==========================================================================
   * NETWORK — build an undirected graph from the simplified corridor table
   * ========================================================================*/
  function buildNetwork(zones, links, p) {
    var idx = {}, i;
    for (i = 0; i < zones.length; i++) idx[zones[i].id] = i;

    var edges = [];
    for (i = 0; i < links.length; i++) {
      var L = links[i];
      var a = idx[L.from], b = idx[L.to];
      if (a === undefined || b === undefined || a === b) continue; // orphan link
      var lanes = Math.max(1, num(L.lanes, 1));
      var cap = num(L.capacity, 0) || lanes * num(p.capPerLane, 1800);
      var dist = Math.max(0.01, num(L.dist, 1));
      var speed = Math.max(5, num(L.speed, 50));
      edges.push({
        id: L.id, name: L.name || (zones[a].name + '–' + zones[b].name),
        from: L.from, to: L.to, a: a, b: b,
        dist: dist, lanes: lanes, capacity: cap,
        speed0: speed,
        t0: 60 * dist / speed,   // free-flow travel time, minutes
        time: 60 * dist / speed, // current (congested) travel time
        vol: 0                   // peak-hour peak-direction pcu
      });
    }

    // adjacency list of edge indices
    var adj = [];
    for (i = 0; i < zones.length; i++) adj.push([]);
    for (i = 0; i < edges.length; i++) { adj[edges[i].a].push(i); adj[edges[i].b].push(i); }

    return { edges: edges, adj: adj, idx: idx, n: zones.length };
  }

  /** BPR volume-delay function: t = t0 * (1 + alpha * (V/C)^beta) */
  function bpr(edge, p) {
    var vc = edge.capacity > 0 ? edge.vol / edge.capacity : 0;
    return edge.t0 * (1 + num(p.bprAlpha, 0.15) * Math.pow(vc, num(p.bprBeta, 4)));
  }

  /* --------------------------------------------------------------------------
   * Dijkstra from one origin over current edge times. Returns time, distance
   * and the edge path to every zone.
   * ------------------------------------------------------------------------*/
  function dijkstra(net, src) {
    var n = net.n, dist = new Array(n), dkm = new Array(n), prevEdge = new Array(n),
        done = new Array(n), i, k;
    for (i = 0; i < n; i++) { dist[i] = INF; dkm[i] = INF; prevEdge[i] = -1; done[i] = false; }
    dist[src] = 0; dkm[src] = 0;

    for (k = 0; k < n; k++) {
      var u = -1, best = INF;
      for (i = 0; i < n; i++) if (!done[i] && dist[i] < best) { best = dist[i]; u = i; }
      if (u === -1) break;
      done[u] = true;
      var list = net.adj[u];
      for (i = 0; i < list.length; i++) {
        var e = net.edges[list[i]];
        var v = (e.a === u) ? e.b : e.a;
        var nd = dist[u] + e.time;
        if (nd < dist[v] - 1e-12) {
          dist[v] = nd; dkm[v] = dkm[u] + e.dist; prevEdge[v] = list[i];
        }
      }
    }
    return { time: dist, km: dkm, prevEdge: prevEdge };
  }

  /** Walk the Dijkstra tree back from j to src, returning the edge indices. */
  function pathEdges(net, tree, src, j) {
    var out = [], cur = j, guard = 0;
    while (cur !== src && tree.prevEdge[cur] !== -1 && guard++ < net.n + 2) {
      var ei = tree.prevEdge[cur];
      out.push(ei);
      var e = net.edges[ei];
      cur = (e.a === cur) ? e.b : e.a;
    }
    return (cur === src) ? out : [];
  }

  /* --------------------------------------------------------------------------
   * SKIMS — inter-zonal shortest-path distance/time plus a congestion factor.
   * Intrazonal distance is estimated from the zone's land area:
   *      d_ii = intrazonalK * sqrt(area_i)
   * ------------------------------------------------------------------------*/
  function buildSkims(zones, net, p) {
    var n = zones.length;
    var km = zeros(n, n), t0 = zeros(n, n), t = zeros(n, n), cong = zeros(n, n),
        paths = [], connected = zeros(n, n), i, j;

    // free-flow reference tree (edge.time temporarily set to t0)
    var saved = net.edges.map(function (e) { return e.time; });
    net.edges.forEach(function (e) { e.time = e.t0; });
    var ffTrees = [];
    for (i = 0; i < n; i++) ffTrees.push(dijkstra(net, i));
    net.edges.forEach(function (e, k2) { e.time = saved[k2]; });

    for (i = 0; i < n; i++) {
      var tree = dijkstra(net, i);
      paths.push([]);
      for (j = 0; j < n; j++) {
        if (i === j) {
          km[i][j] = num(p.intrazonalK, 0.3) * Math.sqrt(Math.max(1, num(zones[i].area, 1)));
          t0[i][j] = 60 * km[i][j] / 25;   // nominal 25 km/h urban local speed
          t[i][j] = t0[i][j];
          cong[i][j] = 1;
          connected[i][j] = 1;
          paths[i].push([]);
          continue;
        }
        if (!isFinite(tree.time[j])) {                 // no route between i and j
          km[i][j] = 0; t0[i][j] = 0; t[i][j] = 0; cong[i][j] = 1;
          connected[i][j] = 0; paths[i].push([]);
          continue;
        }
        km[i][j] = tree.km[j];
        t[i][j] = tree.time[j];
        t0[i][j] = isFinite(ffTrees[i].time[j]) ? ffTrees[i].time[j] : tree.time[j];
        cong[i][j] = t0[i][j] > 0 ? Math.max(1, t[i][j] / t0[i][j]) : 1;
        connected[i][j] = 1;
        paths[i].push(pathEdges(net, tree, i, j));
      }
    }
    return { km: km, t0: t0, t: t, cong: cong, paths: paths, connected: connected };
  }

  /* ==========================================================================
   * STEP 1 — Trip generation
   *
   *   P_i = tripRateHH * HH_i * [1 + kappa * (Inc_i / Inc_avg - 1)]
   *   A_j = a_emp * Emp_j + a_enr * Enrol_j + a_pop * Pop_j
   *   A_j <- A_j * (sum P / sum A)        (attraction balancing)
   * ========================================================================*/
  function tripGeneration(zones, p) {
    var n = zones.length, i;
    var incAvg = 0;
    for (i = 0; i < n; i++) incAvg += zones[i].income;
    incAvg = n ? incAvg / n : 1;
    if (!(incAvg > 0)) incAvg = 1;

    var P = new Array(n), Araw = new Array(n);
    for (i = 0; i < n; i++) {
      var incFac = 1 + num(p.incomeElasticity) * (zones[i].income / incAvg - 1);
      P[i] = num(p.tripRateHH) * zones[i].hh * Math.max(0.1, incFac);
      Araw[i] = num(p.attrPerJob) * zones[i].emp
              + num(p.attrPerStudent) * zones[i].enrol
              + num(p.attrPerCapita) * zones[i].pop;
    }
    var sP = sum(P), sA = sum(Araw);
    var bal = sA > 0 ? sP / sA : 0;
    var A = Araw.map(function (v) { return v * bal; });
    return { P: P, A: A, Araw: Araw, balanceFactor: bal, totalP: sP, totalARaw: sA, incAvg: incAvg };
  }

  /* ==========================================================================
   * STEP 3 (evaluated first, to supply the composite cost for step 2)
   * Modal split — multinomial logit
   *
   *   Time_m(i,j)  = 60 * d_ij / v_m * congestion_ij + accessWait_m
   *   Cost_m(i,j)  = fareBase_m + farePerKm_m * max(0, d_ij - fareBaseKm_m)
   *                  (divided by occupancy for private modes — shared cost)
   *   U_m(i,j)     = ASC_m - thetaCost * Cost - thetaTime * Time
   *   ASC_car(i)   = ASC_car + lambda * ln(Inc_i / IncRef)
   *   Pr_m(i,j)    = exp(U_m) / sum_k exp(U_k)
   *   Logsum(i,j)  = ln sum_k exp(U_k)      -> composite accessibility measure
   * ========================================================================*/
  function modeChoice(zones, modes, skims, p) {
    var n = zones.length, M = modes.length;
    var prob = [], logsum = zeros(n, n), compTime = zeros(n, n), compCost = zeros(n, n);
    var i, j, m;

    var incomeRef = num(p.incomeRef, 18000) || 18000;
    var thC = num(p.thetaCost), thT = num(p.thetaTime);

    for (i = 0; i < n; i++) {
      prob.push([]);
      for (j = 0; j < n; j++) {
        var d = skims.km[i][j];
        var cf = skims.cong[i][j];
        var U = new Array(M), T = new Array(M), C = new Array(M);
        var maxU = -INF;

        for (m = 0; m < M; m++) {
          var md = modes[m];
          var tm = 60 * d / Math.max(5, num(md.speed, 30)) * cf + num(md.accessWait);
          var cm = num(md.fareBase) + num(md.farePerKm) * Math.max(0, d - num(md.fareBaseKm));
          if (md.kind === 'private') cm = cm / Math.max(1, num(md.occupancy, 1));
          var asc = num(md.asc);
          if (md.ascIncomeCoef) {
            asc += num(md.ascIncomeCoef) * Math.log(Math.max(1, zones[i].income) / incomeRef);
          }
          var u = asc - thC * cm - thT * tm;
          U[m] = u; T[m] = tm; C[m] = cm;
          if (u > maxU) maxU = u;
        }

        var expSum = 0, ex = new Array(M);
        for (m = 0; m < M; m++) { ex[m] = Math.exp(U[m] - maxU); expSum += ex[m]; }
        var row = new Array(M), ct = 0, cc = 0;
        for (m = 0; m < M; m++) {
          row[m] = expSum > 0 ? ex[m] / expSum : 1 / M;
          ct += row[m] * T[m];
          cc += row[m] * C[m];
        }
        prob[i].push(row);
        logsum[i][j] = Math.log(expSum) + maxU;   // numerically-stable log-sum-exp
        compTime[i][j] = ct;
        compCost[i][j] = cc;
      }
    }
    return { prob: prob, logsum: logsum, compTime: compTime, compCost: compCost };
  }

  /* ==========================================================================
   * STEP 2 — Trip distribution: doubly-constrained gravity model
   *
   *   T_ij = a_i * b_j * P_i * A_j * f(c_ij)
   *
   * with f() selected by params.deterrence:
   *   logsum      f = exp(beta_LS * Logsum_ij)      (default, feeds back mode choice)
   *   exponential f = exp(-beta_t * t_ij)
   *   power       f = t_ij ^ -gamma
   *   combined    f = t_ij ^ -gamma * exp(-beta_t * t_ij)
   *
   * a_i and b_j are found by the Furness / IPF bi-proportional procedure.
   * ========================================================================*/
  function deterrenceMatrix(skims, mc, p) {
    var n = skims.km.length, F = zeros(n, n), i, j;
    var kind = p.deterrence || 'logsum';
    for (i = 0; i < n; i++) {
      for (j = 0; j < n; j++) {
        if (!skims.connected[i][j]) { F[i][j] = 0; continue; }
        var t = Math.max(0.5, skims.t[i][j]);
        var f;
        switch (kind) {
          case 'exponential': f = Math.exp(-num(p.betaTime) * t); break;
          case 'power':       f = Math.pow(t, -num(p.gammaPower)); break;
          case 'combined':    f = Math.pow(t, -num(p.gammaPower)) * Math.exp(-num(p.betaTime) * t); break;
          default:            f = Math.exp(num(p.betaLogsum) * mc.logsum[i][j]); break;
        }
        F[i][j] = isFinite(f) && f > 0 ? f : 0;
      }
    }
    return F;
  }

  function distribute(gen, F, p) {
    var n = gen.P.length, i, j, it;
    var a = new Array(n).fill(1), b = new Array(n).fill(1);
    var maxIt = Math.max(1, num(p.furnessIters, 600)), tol = num(p.furnessTol, 1e-4);
    var gap = 1, iters = 0;

    for (it = 0; it < maxIt; it++) {
      gap = 0;
      // row factors:  a_i = 1 / sum_j ( b_j * A_j * f_ij )
      for (i = 0; i < n; i++) {
        var s = 0;
        for (j = 0; j < n; j++) s += b[j] * gen.A[j] * F[i][j];
        a[i] = s > 0 ? 1 / s : 0;
      }
      // column factors:  b_j = 1 / sum_i ( a_i * P_i * f_ij )
      for (j = 0; j < n; j++) {
        var s2 = 0;
        for (i = 0; i < n; i++) s2 += a[i] * gen.P[i] * F[i][j];
        b[j] = s2 > 0 ? 1 / s2 : 0;
      }
      // Convergence is judged on the realised row totals, not on a[] and b[]
      // themselves: the pair (a, b) is only determined up to a reciprocal
      // constant, so the factors keep drifting even once T_ij has settled.
      // Columns are exact by construction after the b[] pass, so only the
      // production constraint can still be violated.
      for (i = 0; i < n; i++) {
        if (!(gen.P[i] > 0)) continue;
        var rs = 0;
        for (j = 0; j < n; j++) rs += b[j] * gen.A[j] * F[i][j];
        gap = Math.max(gap, Math.abs(a[i] * rs - 1));
      }
      iters = it + 1;
      if (gap < tol) break;
    }

    var T = zeros(n, n);
    for (i = 0; i < n; i++) for (j = 0; j < n; j++) T[i][j] = a[i] * gen.P[i] * b[j] * gen.A[j] * F[i][j];
    return { T: T, a: a, b: b, iters: iters, gap: gap };
  }

  /* ==========================================================================
   * STEP 4 — Traffic assignment
   *
   * Peak-hour peak-direction demand for the unordered zone pair (i,j):
   *      V_ij = (T_ij + T_ji) * peakHourFactor * peakDirSplit
   * converted to vehicles by mode occupancy and to pcu by the mode's pcu
   * factor, then loaded onto the network in slices. After each slice the BPR
   * function updates link times so later slices see the congestion the earlier
   * ones created (incremental assignment).
   * ========================================================================*/
  function assign(T, modes, skims, net, p) {
    var n = T.length, M = modes.length, i, j, m, e;

    net.edges.forEach(function (ed) {
      ed.vol = 0; ed.time = ed.t0;
      ed.modeVeh = new Array(M).fill(0);
      ed.modePax = new Array(M).fill(0);
    });

    // build the peak-hour pcu demand list for inter-zonal pairs
    var phf = num(p.peakHourFactor, 0.09), dirs = num(p.peakDirSplit, 0.55);
    var demand = [];
    for (i = 0; i < n; i++) {
      for (j = i + 1; j < n; j++) {
        if (!skims.connected[i][j]) continue;
        var twoWay = T[i][j] + T[j][i];
        if (twoWay <= 0) continue;
        var pcu = 0, veh = new Array(M).fill(0), pax = new Array(M).fill(0);
        for (m = 0; m < M; m++) {
          var pr = 0.5 * (skims.probRef[i][j][m] + skims.probRef[j][i][m]);
          var persons = twoWay * pr * phf * dirs;
          var v = persons / Math.max(0.1, num(modes[m].occupancy, 1));
          veh[m] = v; pax[m] = persons; pcu += v * num(modes[m].pcu, 1);
        }
        demand.push({ i: i, j: j, pcu: pcu, veh: veh, pax: pax });
      }
    }

    var slices = p.incrementSlices && p.incrementSlices.length ? p.incrementSlices : [1];
    for (var s = 0; s < slices.length; s++) {
      var share = slices[s];
      // recompute shortest paths on the current (congested) times
      var trees = [];
      for (i = 0; i < n; i++) trees.push(null);
      for (var d0 = 0; d0 < demand.length; d0++) {
        var D = demand[d0];
        if (!trees[D.i]) trees[D.i] = dijkstra(net, D.i);
        var pe = pathEdges(net, trees[D.i], D.i, D.j);
        for (var k = 0; k < pe.length; k++) {
          e = net.edges[pe[k]];
          e.vol += D.pcu * share;
          for (m = 0; m < M; m++) { e.modeVeh[m] += D.veh[m] * share; e.modePax[m] += D.pax[m] * share; }
        }
      }
      net.edges.forEach(function (ed) { ed.time = bpr(ed, p); });
    }
    return net;
  }

  /* --------------------------------------------------------------------- LOS */
  function losOf(vc) {
    if (vc <= 0.35) return 'A';
    if (vc <= 0.55) return 'B';
    if (vc <= 0.75) return 'C';
    if (vc <= 0.90) return 'D';
    if (vc <= 1.00) return 'E';
    return 'F';
  }

  /* ==========================================================================
   * STEP 5 — Public transport supply
   *
   *   headway  h = 60 * seats * loadFactor / Pmax      [min, floored]
   *   cycle    C = 2 * (60 * L / v_congested + terminalTime)
   *   fleet    N = ceil(C / h)
   * ========================================================================*/
  function fleetRequirement(net, modes, p) {
    var out = [], m, e;
    var lf = num(p.loadFactor, 0.85), term = num(p.terminalTime, 10), minH = num(p.minHeadway, 2);
    for (var k = 0; k < net.edges.length; k++) {
      e = net.edges[k];
      var speed = e.time > 0 ? 60 * e.dist / e.time : e.speed0;
      var row = { linkId: e.id, name: e.name, dist: e.dist, speed: speed, modes: [] };
      for (m = 0; m < modes.length; m++) {
        if (modes[m].kind !== 'pt') continue;
        var pmax = e.modePax[m];
        var seats = Math.max(1, num(modes[m].seats, 20));
        var h = pmax > 0 ? Math.max(minH, 60 * seats * lf / pmax) : 0;
        var cycle = 2 * (60 * e.dist / Math.max(5, speed) + term);
        var fleet = h > 0 ? Math.ceil(cycle / h) : 0;
        row.modes.push({
          id: modes[m].id, name: modes[m].name, pmax: pmax,
          headway: h, cycle: cycle, fleet: fleet,
          tripsPerHour: h > 0 ? 60 / h : 0
        });
      }
      out.push(row);
    }
    return out;
  }

  /* ==========================================================================
   * MAIN — run the whole chain with a skim feedback loop
   * ========================================================================*/
  function run(scenario) {
    var p = scenario.params, modes = scenario.modes, i, j, m, k;
    var zones = growZones(scenario.zones, p);
    var n = zones.length;
    var net = buildNetwork(zones, scenario.links, p);
    var gen = tripGeneration(zones, p);

    var outer = Math.max(1, Math.round(num(p.outerIters, 3)));
    var history = [], skims = null, mc = null, dist = null, F = null;
    var avgVol = new Array(net.edges.length).fill(0);

    for (var it = 1; it <= outer; it++) {
      skims = buildSkims(zones, net, p);
      mc = modeChoice(zones, modes, skims, p);
      skims.probRef = mc.prob;
      F = deterrenceMatrix(skims, mc, p);
      dist = distribute(gen, F, p);
      assign(dist.T, modes, skims, net, p);

      // MSA on link volumes, then recompute times from the averaged volumes
      var maxChange = 0;
      for (k = 0; k < net.edges.length; k++) {
        var nv = avgVol[k] + (net.edges[k].vol - avgVol[k]) / it;
        if (avgVol[k] > 0) maxChange = Math.max(maxChange, Math.abs(nv - avgVol[k]) / avgVol[k]);
        else if (nv > 0 && it > 1) maxChange = Math.max(maxChange, 1);
        avgVol[k] = nv;
        net.edges[k].vol = nv;
        net.edges[k].time = bpr(net.edges[k], p);
      }
      history.push({ iter: it, furnessIters: dist.iters, furnessGap: dist.gap, volChange: maxChange });
    }

    /* ---------------------------------------------------- per-mode OD matrices */
    var T = dist.T;
    var Tm = [];
    for (m = 0; m < modes.length; m++) Tm.push(zeros(n, n));
    for (i = 0; i < n; i++) for (j = 0; j < n; j++)
      for (m = 0; m < modes.length; m++) Tm[m][i][j] = T[i][j] * mc.prob[i][j][m];

    /* -------------------------------------------------------- link statistics */
    var links = net.edges.map(function (e) {
      var vc = e.capacity > 0 ? e.vol / e.capacity : 0;
      var speed = e.time > 0 ? 60 * e.dist / e.time : e.speed0;
      return {
        id: e.id, name: e.name, from: e.from, to: e.to,
        dist: e.dist, lanes: e.lanes, capacity: e.capacity,
        vol: e.vol, vc: vc, los: losOf(vc),
        t0: e.t0, time: e.time, speed: speed,
        delay: Math.max(0, e.time - e.t0),
        modeVeh: e.modeVeh.slice(), modePax: e.modePax.slice()
      };
    });

    /* ------------------------------------------------------------------ KPIs */
    var totalTrips = matSum(T);
    var pkm = 0, ptime = 0, intraTrips = 0;
    for (i = 0; i < n; i++) for (j = 0; j < n; j++) {
      pkm += T[i][j] * skims.km[i][j];
      ptime += T[i][j] * mc.compTime[i][j];
      if (i === j) intraTrips += T[i][j];
    }

    var modeTrips = modes.map(function (_, mm) { return matSum(Tm[mm]); });
    var modeShare = modeTrips.map(function (v) { return totalTrips > 0 ? v / totalTrips : 0; });
    var modePkm = modes.map(function (_, mm) {
      var s = 0;
      for (i = 0; i < n; i++) for (j = 0; j < n; j++) s += Tm[mm][i][j] * skims.km[i][j];
      return s;
    });
    // daily vehicle-km (both directions, all day) and CO2
    var modeVkm = modes.map(function (md, mm) { return modePkm[mm] / Math.max(0.1, num(md.occupancy, 1)); });
    var co2Tons = modes.reduce(function (acc, md, mm) { return acc + modeVkm[mm] * num(md.co2, 0) / 1e6; }, 0);

    var vkt = 0, vht = 0, congested = 0;
    links.forEach(function (L) {
      vkt += L.vol * L.dist;
      vht += L.vol * L.time / 60;
      if (L.los === 'E' || L.los === 'F') congested++;
    });

    var fleets = fleetRequirement(net, modes, p);
    var fleetTotals = {};
    modes.forEach(function (md) { if (md.kind === 'pt') fleetTotals[md.id] = 0; });
    fleets.forEach(function (row) {
      row.modes.forEach(function (fm) { fleetTotals[fm.id] = (fleetTotals[fm.id] || 0) + fm.fleet; });
    });

    return {
      generatedAt: new Date().toISOString(),
      years: Math.max(0, num(p.horizonYear) - num(p.baseYear)),
      zones: zones,
      modes: modes,
      generation: gen,
      skims: skims,
      deterrence: F,
      distribution: dist,
      T: T,
      Tm: Tm,
      prob: mc.prob,
      logsum: mc.logsum,
      compTime: mc.compTime,
      compCost: mc.compCost,
      links: links,
      fleets: fleets,
      history: history,
      kpi: {
        totalTrips: totalTrips,
        intrazonalTrips: intraTrips,
        interzonalTrips: totalTrips - intraTrips,
        tripsPerCapita: totalTrips / Math.max(1, zones.reduce(function (a, z) { return a + z.pop; }, 0)),
        avgTripLength: totalTrips > 0 ? pkm / totalTrips : 0,
        avgTripTime: totalTrips > 0 ? ptime / totalTrips : 0,
        passengerKm: pkm,
        modeTrips: modeTrips,
        modeShare: modeShare,
        modePkm: modePkm,
        modeVkm: modeVkm,
        peakVkt: vkt,
        peakVht: vht,
        networkSpeed: vht > 0 ? vkt / vht : 0,
        congestedLinks: congested,
        totalLinks: links.length,
        co2Tons: co2Tons,
        fleetTotals: fleetTotals,
        convergence: history.length ? history[history.length - 1].volChange : 0
      }
    };
  }

  return {
    run: run,
    growZones: growZones,
    tripGeneration: tripGeneration,
    buildNetwork: buildNetwork,
    buildSkims: buildSkims,
    modeChoice: modeChoice,
    distribute: distribute,
    deterrenceMatrix: deterrenceMatrix,
    losOf: losOf,
    bpr: bpr
  };
}));
