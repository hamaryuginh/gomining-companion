/**
 * Module : simulateur de réinvestissement des gains de la ferme en TH.
 * La stratégie « Réinvestissement » convertit le gain net quotidien en
 * puissance au prix du TH indiqué pendant sa temporalité, puis repasse en
 * retrait classique ; elle est comparée à la stratégie « Classique » qui
 * retire les gains pendant toute la durée.
 * Deux vues : table (périodes échantillonnées) et 3 graphiques comparatifs
 * (puissance, patrimoine, net cumulé).
 * Formules de rendement et tables de coûts synchronisées avec
 * content/modules/rewards.js et content/config.js.
 */
(function () {
  'use strict';

  const api = typeof browser !== 'undefined' ? browser : chrome;
  const STATE_KEY = 'reinvestParams';

  // ─── Constantes (synchronisées avec content/config.js) ───────────

  const DAYS_PER_MONTH = 30;
  const DAYS_PER_YEAR = 365;
  const SERVICE_FEE_PER_TH = 0.0089;
  const DEFAULT_KWH = 0.05;
  const MAX_ROWS = 60;
  const MAX_SIM_DAYS = 36500; // 100 ans : au-delà, pas hebdomadaires

  // Tables des coûts d'upgrade de puissance par efficience (W/TH → $/TH)
  const POWER_UPGRADE_COSTS = {
    12: [
      [1, 16.99], [2, 15.91], [4, 15.90], [8, 15.8825], [16, 15.865], [32, 15.845],
      [48, 15.82188], [64, 15.80521], [96, 15.79016], [128, 15.76656], [192, 15.74813],
      [256, 15.72104], [384, 15.70094], [512, 15.67211], [768, 15.65119], [1024, 15.62163],
      [1536, 15.60037], [2560, 15.57052], [3584, 15.53638], [5000, 15.51443],
    ],
    15: [
      [1, 10.17], [2, 10.17], [3, 10.17], [4, 10.17], [8, 10.17], [16, 10.17], [32, 10.17],
      [48, 10.15625], [64, 10.14271], [96, 10.12938], [128, 10.11156], [192, 10.09602],
      [256, 10.07391], [384, 10.05629], [512, 10.03102], [768, 10.01186], [1024, 9.98456],
      [1536, 9.96443], [2560, 9.93599], [3584, 9.90311], [5000, 9.88170],
    ],
    20: [
      [1, 6.715], [2, 6.715], [3, 6.715], [4, 6.715], [8, 6.715], [16, 6.715], [32, 6.715],
      [48, 6.70125], [64, 6.68771], [96, 6.67438], [128, 6.65656], [192, 6.64102],
      [256, 6.61891], [384, 6.60129], [512, 6.57602], [768, 6.55686], [1024, 6.52956],
      [1536, 6.50943], [2560, 6.48099], [3584, 6.44811], [5000, 6.42670],
    ],
  };
  const WEEKS_PER_UNIT = {
    day: 1 / 7,
    week: 1,
    month: DAYS_PER_MONTH / 7,
    year: DAYS_PER_YEAR / 7,
  };
  const unitLabel = (unit) => I18N.t('common.unit' + unit.charAt(0).toUpperCase() + unit.slice(1) + 'Short');

  let powerUpgradeCosts = POWER_UPGRADE_COSTS;

  const DEFAULT_PARAMS = {
    th: 1000,
    eff: 15,
    discount: 0,
    thPrice: 15,
    btcPrice: 90000,
    sats: 45,
    kwh: DEFAULT_KWH,
    reinvestDuration: 12,
    reinvestUnit: 'month',
    classicDuration: 12,
    classicUnit: 'month',
    greedy: false,
    greedyTh: 0,
    greedyRate: 0.4,
    reinvestGreedy: false,
  };

  const COLORS = {
    reinvest: '#a78bfa',
    classic: '#fbbf24',
    grid: 'rgba(117, 64, 239, 0.14)',
    axis: '#9d93c0',
  };

  // ─── Helpers ──────────────────────────────────────────────────────

  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

  function fmtMoney(v) {
    return v.toLocaleString(I18N.locale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function fmtTh(v) {
    return v.toLocaleString(I18N.locale(), { maximumFractionDigits: 2 });
  }

  function fmtThFixed(v) {
    return v.toLocaleString(I18N.locale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function fmtSigned(v) {
    return `${v >= 0 ? '+' : '−'}${fmtMoney(Math.abs(v))}`;
  }

  /**
   * Taux marginal ($/TH) pour une efficience et une puissance données
   * (interpolation entre les efficiences de référence 12/15/20).
   */
  function powerRate(eff, powerTh) {
    const rateInRef = (refEff, th) => {
      const steps = powerUpgradeCosts[refEff] || POWER_UPGRADE_COSTS[refEff] || [];
      let rate = steps[steps.length - 1][1];
      for (const [to, amountPerTh] of steps) {
        if (th <= to) { rate = amountPerTh; break; }
      }
      return rate;
    };

    if (eff <= 12) return rateInRef(12, powerTh);
    if (eff >= 20) return rateInRef(20, powerTh);
    if (eff <= 15) {
      const t = (eff - 12) / 3;
      return rateInRef(12, powerTh) * (1 - t) + rateInRef(15, powerTh) * t;
    }
    const t = (eff - 15) / 5;
    return rateInRef(15, powerTh) * (1 - t) + rateInRef(20, powerTh) * t;
  }

  /**
   * Gain net quotidien ($) — formules officielles GoMining (rewards.js).
   */
  function computeNetDaily({ th, wth, btcPrice, satsPerThDay, kwhCost, discountPct = 0 }) {
    discountPct = clamp(discountPct, 0, 100);
    const grossDaily = (satsPerThDay * th * btcPrice) / 1e8;
    const electricityDaily = (kwhCost * 24 * wth * th) / 1000;
    const serviceDaily = SERVICE_FEE_PER_TH * th;
    const maintenanceDaily = (electricityDaily + serviceDaily) * (1 - discountPct / 100);
    return Math.max(0, grossDaily - maintenanceDaily);
  }

  // ─── Simulation ───────────────────────────────────────────────────

  /**
   * Simule la stratégie hybride sur la durée totale (réinvestissement puis
   * classique) : pendant la phase de réinvestissement le gain net est converti
   * en puissance au prix du TH (cash à 0) ; ensuite les gains sont retirés
   * (cash). Le mode classique pur = runTimeline(..., rDays = 0).
   * Les Greedy Machines (puissance initiale greedyTh) croissent chaque semaine
   * au taux greedyDailyRate (votes veGOMINING), indépendamment de la stratégie ;
   * le rendement est calculé sur la puissance totale (ferme + Greedy).
   * Si reinvestGreedy, les TH achetés entrent dans la collection Greedy (et
   * bénéficient de sa croissance) ; sinon ils entrent dans la ferme.
   * organicArr suit la croissance pure des Greedy (sans réinvestissement),
   * pour décomposer les gains ; netArr cumule le net généré (indépendamment
   * de sa destination : réinvesti ou retiré).
   * @returns {Object} { powerArr, farmArr, greedyArr, organicArr, cashArr, netArr, stride, days }
   */
  function runTimeline(baseTh, netDailyFor, thPrice, reinvest, rDays, cDays, stride, greedyTh, greedyDailyRate, reinvestGreedy) {
    const days = rDays + cDays;
    const n = Math.ceil(days / stride);
    const powerArr = new Float64Array(n + 1);
    const farmArr = new Float64Array(n + 1);
    const greedyArr = new Float64Array(n + 1);
    const organicArr = new Float64Array(n + 1);
    const cashArr = new Float64Array(n + 1);
    const netArr = new Float64Array(n + 1);
    let farm = baseTh;
    let greedy = greedyTh || 0;
    let organic = greedyTh || 0;
    let cash = 0;
    let cumNet = 0;
    powerArr[0] = farm + greedy;
    farmArr[0] = farm;
    greedyArr[0] = greedy;
    organicArr[0] = organic;
    const stepGrowth = Math.pow(1 + (greedyDailyRate || 0), stride);
    for (let k = 1; k <= n; k++) {
      const day = k * stride;
      greedy *= stepGrowth;
      organic *= stepGrowth;
      const total = farm + greedy;
      const net = netDailyFor(total) * stride;
      cumNet += net;
      if (reinvest && day <= rDays) {
        if (reinvestGreedy) greedy += net / thPrice;
        else farm += net / thPrice;
      } else {
        cash += net;
      }
      powerArr[k] = farm + greedy;
      farmArr[k] = farm;
      greedyArr[k] = greedy;
      organicArr[k] = organic;
      cashArr[k] = cash;
      netArr[k] = cumNet;
    }
    return { powerArr, farmArr, greedyArr, organicArr, cashArr, netArr, stride, days };
  }

  /**
   * Calcule les deux scénarios sur l'axe temporel commun (réinvestissement
   * puis classique, et classique sur toute la durée).
   * L'axe suit l'unité la plus fine des deux temporalités.
   */
  function compute(params) {
    const { th, eff, discount, thPrice, btcPrice, sats, kwh } = params;
    const netDailyFor = (th) => computeNetDaily({
      th, wth: eff, btcPrice, satsPerThDay: sats, kwhCost: kwh, discountPct: discount,
    });

    const rDays = Math.round(params.reinvestDuration * WEEKS_PER_UNIT[params.reinvestUnit] * 7);
    const cDays = Math.round(params.classicDuration * WEEKS_PER_UNIT[params.classicUnit] * 7);
    const totalDays = rDays + cDays;
    const stride = totalDays > MAX_SIM_DAYS ? 7 : 1;

    const rUnitDays = WEEKS_PER_UNIT[params.reinvestUnit];
    const cUnitDays = WEEKS_PER_UNIT[params.classicUnit];
    const axisUnit = rUnitDays <= cUnitDays ? params.reinvestUnit : params.classicUnit;
    const axisDays = Math.min(rUnitDays, cUnitDays) * 7;
    const horizonUnits = Math.max(1, Math.ceil(totalDays / axisDays));
    const step = Math.max(1, Math.ceil(horizonUnits / MAX_ROWS));
    const periods = [];
    for (let u = step; u < horizonUnits; u += step) periods.push(u);
    if (!periods.length || periods[periods.length - 1] !== horizonUnits) periods.push(horizonUnits);

    const reinvestActive = thPrice > 0;
    const greedyTh = params.greedy ? params.greedyTh : 0;
    const greedyDailyRate = params.greedy ? Math.pow(1 + (params.greedyRate || 0) / 100, 1 / 7) - 1 : 0;
    const reinvestGreedy = params.greedy && params.reinvestGreedy;
    const simH = runTimeline(th, netDailyFor, thPrice, reinvestActive, rDays, cDays, stride, greedyTh, greedyDailyRate, reinvestGreedy);
    const simC = runTimeline(th, netDailyFor, thPrice, false, 0, totalDays, stride, greedyTh, greedyDailyRate, false);

    return { params, rDays, cDays, totalDays, stride, axisUnit, axisDays, periods, step, simH, simC, greedyTh };
  }

  const valueAt = (sim, day) => (day <= sim.days ? sim.powerArr[Math.round(day / sim.stride)] : null);
  const cashAt = (sim, day) => (day <= sim.days ? sim.cashArr[Math.round(day / sim.stride)] : null);

  // ─── Vue table ────────────────────────────────────────────────────

  /**
   * Jour (aligné sur le pas de simulation) où le net cumulé de la stratégie
   * hybride passe au-dessus de la classique, si cela arrive dans l'horizon.
   */
  function findTableCrossing(simH, simC, rDays, totalDays, stride) {
    const last = Math.round(totalDays / stride);
    if (!(simH.cashArr[last] > simC.cashArr[last])) return null;
    for (let k = Math.round(rDays / stride) + 1; k <= last; k++) {
      const day = k * stride;
      if (day > rDays && simH.cashArr[k] >= simC.cashArr[k]) return day;
    }
    return null;
  }

function renderTable(computed) {
    const { params, rDays, totalDays, stride, axisUnit, axisDays, periods, step, simH, simC, greedyTh } = computed;
    const { th, thPrice, greedy } = params;
    const baseTotal = th + greedyTh;
    const baseWealth = baseTotal * thPrice;
    const greedyActive = !!greedy;
    const crossingDay = findTableCrossing(simH, simC, rDays, totalDays, stride);

    const dayOf = (u) => Math.min(Math.round((u * axisDays) / stride) * stride, totalDays);

    const buildRow = (u, day, isCross, prevDay) => {
      const idx = Math.round(day / stride);
      const prevIdx = Math.round(prevDay / stride);
      const hPow = simH.powerArr[idx];
      const hCash = simH.cashArr[idx];
      const cPow = simC.powerArr[idx];
      const cCash = simC.cashArr[idx];
      const hWealth = hPow * thPrice + hCash;
      const cWealth = cPow * thPrice + cCash;
      const delta = hWealth - cWealth;
      const thBought = hPow - baseTotal;
      const rowClass = u === null ? 'rv-sim__row--switch' : (isCross ? 'rv-sim__row--crossing' : '');
      const crossAttrs = isCross
        ? ` data-rv-cross-h="${hCash.toFixed(2)}" data-rv-cross-c="${cCash.toFixed(2)}"`
        : '';

      const reinvestFarm = simH.farmArr[idx] - th;
      const greedyOrganicGain = simH.organicArr[idx] - greedyTh;
      const greedyReinvestGain = simH.greedyArr[idx] - simH.organicArr[idx];
      const pctOf = (v) => ((v / Math.max(1, baseTotal)) * 100).toFixed(2);
      const gainCell = greedyActive
        ? `<span class="rv-sim__gain" tabindex="0" role="button"
              data-rv-farm-th="${reinvestFarm.toFixed(2)}" data-rv-farm-pct="${pctOf(reinvestFarm)}"
              data-rv-greedy-organic-th="${greedyOrganicGain.toFixed(2)}" data-rv-greedy-organic-pct="${pctOf(greedyOrganicGain)}"
              data-rv-greedy-reinvest-th="${greedyReinvestGain.toFixed(2)}" data-rv-greedy-reinvest-pct="${pctOf(greedyReinvestGain)}">
              <span class="rv-sim__cell--pos">+${fmtTh(thBought)}</span></span>`
        : `<span class="rv-sim__cell--pos">+${fmtTh(thBought)}</span>`;

      const netGenerated = simH.netArr[idx] - simH.netArr[prevIdx];
      const netCash = simH.cashArr[idx] - simH.cashArr[prevIdx];
      const netReinvested = netGenerated - netCash;
      const netCell = netGenerated > 0.01
        ? `<span class="rv-sim__net" tabindex="0" role="button"
              data-rv-net-gen="${netGenerated.toFixed(2)}" data-rv-net-cash="${netCash.toFixed(2)}" data-rv-net-reinvest="${netReinvested.toFixed(2)}">${fmtMoney(hCash)}</span>`
        : `${fmtMoney(hCash)}`;

      const cNetGenerated = simC.netArr[idx] - simC.netArr[prevIdx];
      const cNetCash = simC.cashArr[idx] - simC.cashArr[prevIdx];
      const cNetCell = cNetGenerated > 0.01
        ? `<span class="rv-sim__net" tabindex="0" role="button"
              data-rv-net-gen="${cNetGenerated.toFixed(2)}" data-rv-net-cash="${cNetCash.toFixed(2)}" data-rv-net-reinvest="0.00">${fmtMoney(cCash)}</span>`
        : `${fmtMoney(cCash)}`;

      return `
        <tr${rowClass ? ` class="${rowClass}"` : ''}${crossAttrs}>
          <td${isCross ? ' class="rv-sim__tip-cell" tabindex="0"' : ''}>${u === null ? I18N.t('rv.rowSwitch') : `${unitLabel(axisUnit)} ${u}`}</td>
          <td>${fmtTh(hPow)}</td>
          <td>${gainCell}</td>
          <td>${netCell}</td>
          <td><span class="rv-sim__cell--reinvest">${fmtMoney(hWealth)}</span></td>
          <td>${fmtTh(cPow)}</td>
          <td>${cNetCell}</td>
          <td>${fmtMoney(cWealth)}</td>
          <td><span class="rv-sim__cell--${delta >= 0 ? 'pos' : 'neg'}">${fmtSigned(delta)}</span></td>
        </tr>`;
    };

    const rows = [];

    rows.push(`
      <tr class="rv-sim__row--base">
        <td>${I18N.t('common.baseRow')}</td>
        <td>${fmtTh(baseTotal)}</td>
        <td>—</td>
        <td>${fmtMoney(0)}</td>
        <td class="rv-sim__cell--reinvest">${fmtMoney(baseWealth)}</td>
        <td>${fmtTh(baseTotal)}</td>
        <td>${fmtMoney(0)}</td>
        <td>${fmtMoney(baseWealth)}</td>
        <td>${fmtMoney(0)}</td>
      </tr>`);

    let crossed = false;
    const rowSpecs = periods.map((u) => ({ u, day: dayOf(u) }));
    for (const spec of rowSpecs) {
      if (crossingDay != null && !crossed && spec.day >= crossingDay) {
        spec.isCross = true;
        crossed = true;
      }
    }

    // Ligne de passage en classique, si la fin du réinvestissement ne tombe
    // pas exactement sur une période du tableau
    const switchDay = Math.min(Math.round(rDays / stride) * stride, totalDays);
    const gridDays = new Set(periods.map(dayOf));
    if (switchDay > 0 && switchDay < totalDays && !gridDays.has(switchDay)) {
      const before = periods.filter((u) => dayOf(u) < switchDay).length;
      rowSpecs.splice(before, 0, { u: null, day: switchDay });
    }

    let prevDay = 0;
    for (const spec of rowSpecs) {
      rows.push(buildRow(spec.u, spec.day, !!spec.isCross, prevDay));
      prevDay = spec.day;
    }

    tbody.innerHTML = rows.join('');
  }

  // ─── Vue graphique ────────────────────────────────────────────────

  const CHART_H = 200;

  /**
   * Séries journalières sur l'axe commun (rDays + cDays), pour les 3
   * graphiques comparatifs : puissance, patrimoine, net cumulé.
   */
  function buildChartState(computed) {
    const { rDays, totalDays, stride, simH, simC, params, axisUnit, axisDays } = computed;
    const { th, thPrice } = params;
    const n = totalDays;
    const hPower = new Float64Array(n + 1).fill(NaN);
    const cPower = new Float64Array(n + 1).fill(NaN);
    const hCash = new Float64Array(n + 1).fill(NaN);
    const cCash = new Float64Array(n + 1).fill(NaN);

    for (let k = 0; k <= simH.days / stride; k++) {
      const d = k * stride;
      hPower[d] = simH.powerArr[k];
      hCash[d] = simH.cashArr[k];
    }
    for (let k = 0; k <= simC.days / stride; k++) {
      const d = k * stride;
      cPower[d] = simC.powerArr[k];
      cCash[d] = simC.cashArr[k];
    }
    for (let d = 1; d <= n; d++) {
      if (isNaN(hPower[d])) hPower[d] = hPower[d - 1];
      if (isNaN(cPower[d])) cPower[d] = cPower[d - 1];
      if (isNaN(hCash[d])) hCash[d] = hCash[d - 1];
      if (isNaN(cCash[d])) cCash[d] = cCash[d - 1];
    }

    const hWealth = new Float64Array(n + 1);
    const cWealth = new Float64Array(n + 1);
    for (let d = 0; d <= n; d++) {
      hWealth[d] = hPower[d] * thPrice + hCash[d];
      cWealth[d] = cPower[d] * thPrice + cCash[d];
    }

    return { n, stride, hPower, cPower, hWealth, cWealth, hCash, cCash, rDays, axisUnit, axisDays };
  }

  /**
   * Jour (aligné sur le pas de simulation) où les net cumulés se croisent
   * après la fin du réinvestissement — si la courbe hybride dépasse la
   * classique avant la fin de l'horizon. Sinon null.
   */
  function findCashCrossing() {
    const { n, stride, rDays, hCash, cCash } = chartState;
    if (!(hCash[n] > cCash[n])) return null;
    const last = Math.round(n / stride);
    for (let k = Math.round(rDays / stride) + 1; k <= last; k++) {
      const day = k * stride;
      if (day > rDays && hCash[day] >= cCash[day]) return day;
    }
    return null;
  }

  function niceTicks(max, count) {
    if (!(max > 0)) return [0];
    const raw = max / count;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const norm = raw / mag;
    const step = (norm >= 5 ? 5 : norm >= 2 ? 2 : 1) * mag;
    const ticks = [];
    for (let v = 0; v <= max + step * 0.5; v += step) {
      ticks.push(v);
      if (ticks.length > 12) break;
    }
    return ticks;
  }

  function fmtAxisMoney(v) {
    if (v >= 1e6) return `${(v / 1e6).toLocaleString(I18N.locale(), { maximumFractionDigits: 1 })}M$`;
    if (v >= 1e3) return `${Math.round(v / 1e3)}k$`;
    return `$${v >= 100 ? Math.round(v) : v.toFixed(1)}`;
  }

  function fmtAxisNum(v) {
    if (v >= 1e6) return `${(v / 1e6).toLocaleString(I18N.locale(), { maximumFractionDigits: 1 })}M`;
    if (v >= 1e3) return `${(v / 1e3).toLocaleString(I18N.locale(), { maximumFractionDigits: 1 })}k`;
    return `${Math.round(v)}`;
  }

  function getBase(canvas) {
    if (!canvas._gmBase) canvas._gmBase = document.createElement('canvas');
    return canvas._gmBase;
  }

  /**
   * Dessine un graphe comparatif (fond, grille, axes, séries, transition).
   * Stocke def.x / def.y / def.pad pour le survol.
   */
  function renderChartBase(ctx, def, { W, H, dpr, n, rDays, axisUnit, axisDays, isLast }) {
    const pad = { l: 64, r: 16, t: 12, b: isLast ? 24 : 12 };
    const plotW = W - pad.l - pad.r;
    const plotH = H - pad.t - pad.b;
    const x = (d) => pad.l + (d / n) * plotW;

    let max = 1;
    for (const s of def.series) {
      for (let d = 0; d <= n; d++) {
        if (!isNaN(s.data[d])) max = Math.max(max, s.data[d]);
      }
    }
    const ticks = niceTicks(max, 4);
    const yMax = ticks[ticks.length - 1];
    const y = (v) => pad.t + plotH - (v / yMax) * plotH;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.02)';
    ctx.fillRect(0, 0, W, H);

    // Grille horizontale + labels d'axe
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    ctx.fillStyle = COLORS.axis;
    ctx.font = '10px Segoe UI, sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (const v of ticks) {
      const yy = y(v);
      ctx.beginPath();
      ctx.moveTo(pad.l, yy);
      ctx.lineTo(W - pad.r, yy);
      ctx.stroke();
      ctx.fillText(def.fmt(v), pad.l - 6, yy);
    }

    // Grille verticale + labels X (dernier graphe seulement)
    const xTickCount = 6;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (let i = 0; i <= xTickCount; i++) {
      const d = Math.round((i / xTickCount) * n);
      const px = x(d);
      ctx.beginPath();
      ctx.moveTo(px, pad.t);
      ctx.lineTo(px, H - pad.b);
      ctx.stroke();
      if (isLast) ctx.fillText(`${unitLabel(axisUnit)} ${Math.round(d / axisDays)}`, px, H - pad.b + 6);
    }

    // Séries
    for (const s of def.series) {
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      let started = false;
      for (let d = 0; d <= n; d++) {
        const v = s.data[d];
        if (isNaN(v)) { started = false; continue; }
        const px = x(d);
        const py = y(v);
        if (!started) { ctx.moveTo(px, py); started = true; } else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }

    // Fin de la phase de réinvestissement
    if (rDays > 0 && rDays < n) {
      const tx = x(rDays);
      ctx.strokeStyle = 'rgba(245, 158, 11, 0.4)';
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(tx, pad.t);
      ctx.lineTo(tx, H - pad.b);
      ctx.stroke();
      ctx.setLineDash([]);
      if (isLast) {
        ctx.fillStyle = 'rgba(251, 191, 36, 0.9)';
        ctx.font = '9px Segoe UI, sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(I18N.t('rv.chartEndReinvest'), tx + 4, pad.t + 2);
      }
    }

    // Croisement des net cumulés (rattrapage de l'hybride)
    if (def.crossDay != null && def.crossDay > rDays && def.crossDay < n) {
      const cx = x(def.crossDay);
      ctx.strokeStyle = 'rgba(134, 239, 172, 0.55)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(cx, pad.t);
      ctx.lineTo(cx, H - pad.b);
      ctx.stroke();
      ctx.setLineDash([]);
      if (isLast) {
        ctx.fillStyle = 'rgba(134, 239, 172, 0.9)';
        ctx.font = '9px Segoe UI, sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(I18N.t('rv.chartCatchUp'), cx + 4, pad.t + 2);
      }
    }

    def.x = x;
    def.y = y;
    def.pad = pad;
    def.yMax = yMax;
  }

  function drawChart() {
    const pane = document.querySelector('[data-rv-view-pane="chart"]');
    const W = chartsWrap.clientWidth;
    if (pane.classList.contains('hidden') || W <= 0 || !chartState) return;

    const dpr = window.devicePixelRatio || 1;
    const H = CHART_H;
    const { n, rDays, axisUnit, axisDays } = chartState;
    const crossDay = findCashCrossing();

    chartDefs = [
      {
        canvas: chartCanvases.power,
        fmt: fmtAxisNum,
        series: [
          { data: chartState.hPower, color: COLORS.reinvest },
          { data: chartState.cPower, color: COLORS.classic },
        ],
      },
      {
        canvas: chartCanvases.wealth,
        fmt: fmtAxisMoney,
        series: [
          { data: chartState.hWealth, color: COLORS.reinvest },
          { data: chartState.cWealth, color: COLORS.classic },
        ],
      },
      {
        canvas: chartCanvases.cash,
        fmt: fmtAxisMoney,
        crossDay,
        series: [
          { data: chartState.hCash, color: COLORS.reinvest },
          { data: chartState.cCash, color: COLORS.classic },
        ],
      },
    ];

    chartDefs.forEach((def, i) => {
      const canvas = def.canvas;
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      canvas.style.width = `${W}px`;
      canvas.style.height = `${H}px`;
      const base = getBase(canvas);
      base.width = canvas.width;
      base.height = canvas.height;
      const baseCtx = base.getContext('2d');
      baseCtx.setTransform(1, 0, 0, 1, 0, 0);
      baseCtx.clearRect(0, 0, base.width, base.height);
      renderChartBase(baseCtx, def, {
        W, H, dpr, n, rDays, axisUnit, axisDays,
        isLast: i === chartDefs.length - 1,
      });
    });

    chartScale = { x: chartDefs[0].x, pad: chartDefs[0].pad, W, n, dpr };
    drawOverlay(null);
  }

  function drawOverlay(day) {
    if (day == null || !chartScale || !chartState) {
      if (day == null) hideTip();
      if (!chartScale || !chartState) return;
    }

    for (const def of chartDefs) {
      const canvas = def.canvas;
      const ctx = canvas.getContext('2d');
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(getBase(canvas), 0, 0);
      if (day == null) continue;

      const dpr = chartScale.dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const px = def.x(day);
      ctx.strokeStyle = 'rgba(226, 217, 255, 0.55)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(px, def.pad.t);
      ctx.lineTo(px, CHART_H - def.pad.b);
      ctx.stroke();
      ctx.setLineDash([]);

      for (const s of def.series) {
        const v = s.data[day];
        if (isNaN(v)) continue;
        ctx.fillStyle = s.color;
        ctx.beginPath();
        ctx.arc(px, def.y(v), 3.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#0f0f1a';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }

    if (day != null) showTip(day, chartScale.x(day));
  }

  function showTip(day, px) {
    const tip = chartTip;
    const wrap = chartsWrap;
    const { axisUnit, axisDays, rDays, hPower, cPower, hWealth, cWealth, hCash, cCash } = chartState;
    const label = `${unitLabel(axisUnit)} ${Math.round(day / axisDays)} · ${day <= rDays ? I18N.t('rv.phaseReinvest') : I18N.t('rv.phaseClassic')}`;
    tip.innerHTML = `
      <div class="rv-sim__chart-tip-title">${label}</div>
      <div class="rv-sim__chart-tip-row">
        <span>${I18N.t('rv.tipPower')}</span>
        <b class="rv-sim__chart-tip-val--h">${fmtTh(hPower[day])}</b>
        <b class="rv-sim__chart-tip-val--c">${fmtTh(cPower[day])}</b>
      </div>
      <div class="rv-sim__chart-tip-row">
        <span>${I18N.t('rv.tipWealth')}</span>
        <b class="rv-sim__chart-tip-val--h">${fmtMoney(hWealth[day])}</b>
        <b class="rv-sim__chart-tip-val--c">${fmtMoney(cWealth[day])}</b>
      </div>
      <div class="rv-sim__chart-tip-row">
        <span>${I18N.t('rv.tipCash')}</span>
        <b class="rv-sim__chart-tip-val--h">${fmtMoney(hCash[day])}</b>
        <b class="rv-sim__chart-tip-val--c">${fmtMoney(cCash[day])}</b>
      </div>`;
    tip.classList.add('visible');
    tip.style.left = '';
    tip.style.top = '';
    const tw = tip.offsetWidth;
    const left = px + 12 + tw > wrap.clientWidth - 8 ? px - tw - 12 : px + 12;
    tip.style.left = `${Math.max(8, left)}px`;
    tip.style.top = '12px';
  }

  function hideTip() {
    if (chartTip) chartTip.classList.remove('visible');
  }

  // ─── Popover de la ligne de croisement ─────────────────────────────

  let tableTip = null;

  function getTableTip() {
    if (tableTip) return tableTip;
    tableTip = document.createElement('div');
    tableTip.className = 'rv-sim__table-tip';
    document.body.appendChild(tableTip);
    return tableTip;
  }

  function positionTableTip(e, tip) {
    const pad = 12;
    const left = e.clientX + pad;
    tip.style.left = `${Math.min(left, window.innerWidth - tip.offsetWidth - pad)}px`;
    tip.style.top = `${e.clientY + pad}px`;
  }

  function showTableTip(e, cell) {
    const row = cell.closest('tr');
    if (!row || !row.dataset.rvCrossH) return;
    const tip = getTableTip();
    tip.innerHTML = `
      <div class="rv-sim__table-tip-title">${I18N.t('rv.tipCrossTitle')}</div>
      <div class="rv-sim__table-tip-text">${I18N.t('rv.tipCrossText')}</div>
      <div class="rv-sim__table-tip-row">${I18N.t('rv.tipCrossH')} <b>${fmtMoney(parseFloat(row.dataset.rvCrossH))}</b></div>
      <div class="rv-sim__table-tip-row">${I18N.t('rv.tipCrossC')} <b>${fmtMoney(parseFloat(row.dataset.rvCrossC))}</b></div>`;
    tip.classList.add('visible');
    positionTableTip(e, tip);
  }

  function hideTableTip() {
    if (tableTip) tableTip.classList.remove('visible');
  }

  function wireTableTip() {
    tbody.addEventListener('mouseover', (e) => {
      const cell = e.target.closest('.rv-sim__tip-cell');
      if (!cell) { hideTableTip(); return; }
      showTableTip(e, cell);
    });
    tbody.addEventListener('mousemove', (e) => {
      if (tableTip && tableTip.classList.contains('visible')) positionTableTip(e, tableTip);
    });
    tbody.addEventListener('mouseleave', hideTableTip);
    tbody.addEventListener('focusin', (e) => {
      const cell = e.target.closest('.rv-sim__tip-cell');
      if (cell) {
        const rect = cell.getBoundingClientRect();
        showTableTip({ clientX: rect.right, clientY: rect.top }, cell);
      }
    });
    tbody.addEventListener('focusout', hideTableTip);
  }

  // ─── Popover de répartition des gains (+TH) ───────────────────────

  let gainTip = null;

  function getGainTip() {
    if (gainTip) return gainTip;
    gainTip = document.createElement('div');
    gainTip.className = 'rv-sim__gain-tip';
    document.body.appendChild(gainTip);
    return gainTip;
  }

  function positionGainTip(e, tip) {
    const pad = 12;
    const left = e.clientX + pad;
    tip.style.left = `${Math.min(left, window.innerWidth - tip.offsetWidth - pad)}px`;
    tip.style.top = `${e.clientY + pad}px`;
  }

  function showGainTip(e, el) {
    const d = el.dataset;
    if (d.rvFarmTh === undefined || d.rvGreedyOrganicTh === undefined) return;
    const tip = getGainTip();
    const rows = [];
    rows.push(`<div class="rv-sim__gain-tip-row">${I18N.t('rv.gainTipGreedy')} <b>+${fmtThFixed(parseFloat(d.rvGreedyOrganicTh))} TH (+${d.rvGreedyOrganicPct}%)</b></div>`);
    if (parseFloat(d.rvFarmTh) > 0.01) {
      rows.push(`<div class="rv-sim__gain-tip-row">${I18N.t('rv.gainTipFarm')} <b>+${fmtThFixed(parseFloat(d.rvFarmTh))} TH (+${d.rvFarmPct}%)</b></div>`);
    }
    if (d.rvGreedyReinvestTh !== undefined && parseFloat(d.rvGreedyReinvestTh) > 0.01) {
      rows.push(`<div class="rv-sim__gain-tip-row">${I18N.t('rv.gainTipGreedyReinvest')} <b>+${fmtThFixed(parseFloat(d.rvGreedyReinvestTh))} TH (+${d.rvGreedyReinvestPct}%)</b></div>`);
    }
    tip.innerHTML = `
      <div class="rv-sim__gain-tip-title">${I18N.t('common.gainSplit')}</div>
      ${rows.join('')}`;
    tip.classList.add('visible');
    positionGainTip(e, tip);
  }

  function hideGainTip() {
    if (gainTip) gainTip.classList.remove('visible');
  }

  function wireGainTip() {
    tbody.addEventListener('mouseover', (e) => {
      const gain = e.target.closest('.rv-sim__gain');
      if (!gain) { hideGainTip(); return; }
      showGainTip(e, gain);
    });
    tbody.addEventListener('mousemove', (e) => {
      if (gainTip && gainTip.classList.contains('visible')) positionGainTip(e, gainTip);
    });
    tbody.addEventListener('mouseleave', hideGainTip);
    tbody.addEventListener('focusin', (e) => {
      const gain = e.target.closest('.rv-sim__gain');
      if (gain) {
        const rect = gain.getBoundingClientRect();
        showGainTip({ clientX: rect.right, clientY: rect.top }, gain);
      }
    });
    tbody.addEventListener('focusout', hideGainTip);
  }

  // ─── Popover du net de la période ─────────────────────────────────

  let netTip = null;

  function getNetTip() {
    if (netTip) return netTip;
    netTip = document.createElement('div');
    netTip.className = 'rv-sim__net-tip';
    document.body.appendChild(netTip);
    return netTip;
  }

  function positionNetTip(e, tip) {
    const pad = 12;
    const left = e.clientX + pad;
    tip.style.left = `${Math.min(left, window.innerWidth - tip.offsetWidth - pad)}px`;
    tip.style.top = `${e.clientY + pad}px`;
  }

  function showNetTip(e, el) {
    const d = el.dataset;
    if (d.rvNetGen === undefined) return;
    const tip = getNetTip();
    const gen = parseFloat(d.rvNetGen);
    const cash = parseFloat(d.rvNetCash);
    const reinvest = parseFloat(d.rvNetReinvest);
    tip.innerHTML = `
      <div class="rv-sim__net-tip-title">${I18N.t('rv.netTipTitle')}</div>
      <div class="rv-sim__net-tip-row">${I18N.t('rv.netTipGen')} <b>+${fmtMoney(gen)}</b></div>
      ${reinvest > 0.01 ? `<div class="rv-sim__net-tip-row">${I18N.t('rv.netTipReinvested')} <b>${fmtMoney(reinvest)}</b></div>` : ''}
      ${cash > 0.01 ? `<div class="rv-sim__net-tip-row">${I18N.t('rv.netTipWithdrawn')} <b>${fmtMoney(cash)}</b></div>` : ''}`;
    tip.classList.add('visible');
    positionNetTip(e, tip);
  }

  function hideNetTip() {
    if (netTip) netTip.classList.remove('visible');
  }

  function wireNetTip() {
    tbody.addEventListener('mouseover', (e) => {
      const net = e.target.closest('.rv-sim__net');
      if (!net) { hideNetTip(); return; }
      showNetTip(e, net);
    });
    tbody.addEventListener('mousemove', (e) => {
      if (netTip && netTip.classList.contains('visible')) positionNetTip(e, netTip);
    });
    tbody.addEventListener('mouseleave', hideNetTip);
    tbody.addEventListener('focusin', (e) => {
      const net = e.target.closest('.rv-sim__net');
      if (net) {
        const rect = net.getBoundingClientRect();
        showNetTip({ clientX: rect.right, clientY: rect.top }, net);
      }
    });
    tbody.addEventListener('focusout', hideNetTip);
  }

  // ─── Rendu global ─────────────────────────────────────────────────

  function renderAll() {
    const params = readParams();
    computed = compute(params);
    renderTable(computed);
    chartState = buildChartState(computed);
    if (!document.querySelector('[data-rv-view-pane="chart"]').classList.contains('hidden')) {
      drawChart();
    }
    updateWarning(params);
    updateGreedyVisibility(params);
  }

  function updateWarning(params) {
    const warn = simEl.querySelector('[data-rv-warning]');
    warn.classList.toggle('hidden', params.thPrice > 0);
  }

  function updateGreedyVisibility(params) {
    simEl.querySelectorAll('[data-rv-greedy-fields]').forEach((el) => {
      el.classList.toggle('hidden', !params.greedy);
    });
  }

  // ─── Entrées & persistance ────────────────────────────────────────

  function readParams() {
    const p = {};
    for (const el of simEl.querySelectorAll('[data-rv]')) {
      if (el.type === 'checkbox') p[el.dataset.rv] = el.checked;
      else if (el.tagName === 'SELECT') p[el.dataset.rv] = el.value;
      else p[el.dataset.rv] = parseFloat(el.value);
    }
    const clean = { ...DEFAULT_PARAMS, ...p };
    clean.th = Math.max(0, clean.th || 0);
    clean.eff = Math.max(0, clean.eff || 15);
    clean.discount = clamp(clean.discount || 0, 0, 100);
    clean.thPrice = Math.max(0, clean.thPrice || 0);
    clean.btcPrice = Math.max(0, clean.btcPrice || 0);
    clean.sats = Math.max(0, clean.sats || 0);
    clean.kwh = Math.max(0, clean.kwh || 0);
    clean.reinvestDuration = Math.max(1, Math.floor(clean.reinvestDuration) || 1);
    clean.classicDuration = Math.max(1, Math.floor(clean.classicDuration) || 1);
    clean.reinvestUnit = WEEKS_PER_UNIT[clean.reinvestUnit] ? clean.reinvestUnit : 'month';
    clean.classicUnit = WEEKS_PER_UNIT[clean.classicUnit] ? clean.classicUnit : 'month';
    clean.greedy = !!clean.greedy;
    clean.greedyTh = Math.max(0, clean.greedyTh || 0);
    clean.greedyRate = Math.max(0, clean.greedyRate || 0);
    clean.reinvestGreedy = !!clean.reinvestGreedy;
    return clean;
  }

  function applyParamsToDom(p) {
    for (const el of simEl.querySelectorAll('[data-rv]')) {
      const key = el.dataset.rv;
      if (p[key] === undefined) continue;
      if (el.type === 'checkbox') el.checked = !!p[key];
      else el.value = p[key];
    }
  }

  function autoPrice() {
    if (thPriceTouched) return;
    const th = Math.max(0, parseFloat(simEl.querySelector('[data-rv="th"]').value) || 0);
    const eff = parseFloat(simEl.querySelector('[data-rv="eff"]').value) || 15;
    simEl.querySelector('[data-rv="thPrice"]').value = powerRate(eff, Math.max(1, th)).toFixed(2);
  }

  async function loadState() {
    const res = await api.storage.local.get(STATE_KEY);
    const saved = res[STATE_KEY];
    if (saved && typeof saved === 'object') {
      for (const k of Object.keys(DEFAULT_PARAMS)) {
        if (saved[k] !== undefined && saved[k] !== null && saved[k] !== '') params[k] = saved[k];
      }
    }
    return saved;
  }

  let saveTimer = null;
  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      api.storage.local.set({ [STATE_KEY]: readParams() });
    }, 300);
  }

  let inputTimer = null;
  function scheduleRender() {
    clearTimeout(inputTimer);
    inputTimer = setTimeout(renderAll, 120);
  }

  // ─── Init ─────────────────────────────────────────────────────────

  let simEl, tbody, chartsWrap, chartCanvases, chartTip;
  let params = { ...DEFAULT_PARAMS };
  let computed = null;
  let chartState = null;
  let chartScale = null;
  let chartDefs = [];
  let thPriceTouched = false;

  document.addEventListener('DOMContentLoaded', async () => {
    I18N.apply();
    await I18N.init();
    I18N.apply();

    simEl = document.querySelector('[data-rv-sim]');
    tbody = simEl.querySelector('[data-rv-tbody]');
    chartsWrap = simEl.querySelector('[data-rv-charts]');
    chartCanvases = {
      power: simEl.querySelector('[data-rv-chart="power"]'),
      wealth: simEl.querySelector('[data-rv-chart="wealth"]'),
      cash: simEl.querySelector('[data-rv-chart="cash"]'),
    };
    chartTip = simEl.querySelector('[data-rv-chart-tip]');

    // Onglets Table / Graphique
    const tabs = simEl.querySelectorAll('[data-rv-view]');
    const panes = simEl.querySelectorAll('[data-rv-view-pane]');
    tabs.forEach((btn) => {
      btn.addEventListener('click', () => {
        tabs.forEach((b) => {
          const active = b === btn;
          b.classList.toggle('active', active);
          b.setAttribute('aria-selected', active);
        });
        const view = btn.dataset.rvView;
        panes.forEach((pane) => pane.classList.toggle('hidden', pane.dataset.rvViewPane !== view));
        if (view === 'chart') drawChart();
      });
    });

    wireTableTip();
    wireGainTip();
    wireNetTip();

    // Entrées
    simEl.addEventListener('input', (e) => {
      if (!e.target.hasAttribute('data-rv')) return;
      scheduleRender();
      scheduleSave();
    });
    simEl.addEventListener('change', (e) => {
      if (!e.target.hasAttribute('data-rv')) return;
      if (e.target.dataset.rv === 'eff') autoPrice();
      scheduleRender();
      scheduleSave();
    });

    // Survole des graphiques
    chartsWrap.addEventListener('mousemove', (e) => {
      if (document.querySelector('[data-rv-view-pane="chart"]').classList.contains('hidden')) return;
      const rect = chartsWrap.getBoundingClientRect();
      const x = e.clientX - rect.left;
      if (!chartScale) return;
      const day = clamp(Math.round(((x - chartScale.pad.l) / (chartScale.W - chartScale.pad.l - chartScale.pad.r)) * chartScale.n), 0, chartScale.n);
      drawOverlay(day);
    });
    chartsWrap.addEventListener('mouseleave', () => drawOverlay(null));

    // Redessine les graphiques quand la fenêtre change de taille
    new ResizeObserver(() => {
      if (!document.querySelector('[data-rv-view-pane="chart"]').classList.contains('hidden')) {
        drawChart();
      }
    }).observe(chartsWrap);

    const saved = await loadState();
    applyParamsToDom(params);
    if (saved && saved.thPrice !== undefined) thPriceTouched = true;
    autoPrice();
    const { table } = await PowerCosts.loadEffective(POWER_UPGRADE_COSTS);
    powerUpgradeCosts = table;
    renderAll();

    api.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes.gmLang) {
        I18N.init().then(() => {
          I18N.apply();
          renderAll();
        });
      }
      if (area === 'local' && changes[PowerCosts.STORAGE_KEY]) {
        PowerCosts.loadEffective(POWER_UPGRADE_COSTS).then(({ table }) => {
          powerUpgradeCosts = table;
          renderAll();
        });
      }
    });
  });
})();