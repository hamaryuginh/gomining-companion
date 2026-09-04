/**
 * Module business/UI : simulateur d'évolution de puissance pour la collection
 * "The Greedy Machines" — machines dont la puissance augmente chaque semaine
 * en fonction des résultats des votes de la communauté (veGOMINING).
 * Option « Réinvestissement » : les gains nets quotidiens sont convertis en
 * puissance au prix du TH indiqué.
 * Exposé sur `GM.greedy`.
 */
(function () {
  'use strict';

  const GM = (globalThis.GM = globalThis.GM || {});
  const { C, fmt, clamp } = GM;
  const {
    GREEDY_SIM_CLASS, GREEDY_DEFAULT_RATE, GREEDY_DEFAULT_DURATION,
    GREEDY_MAX_ROWS, GREEDY_DEFAULT_TH_PRICE, GREEDY_MAX_SIM_DAYS,
    DAYS_PER_MONTH, DAYS_PER_YEAR, DEFAULT_KWH,
  } = C;
  const { computeYield } = GM.rewards;
  const { powerRate } = GM.costs;

  // ─── Conversion des unités temporelles ───────────────────────────

  const WEEKS_PER_UNIT = {
    day: 1 / 7,
    week: 1,
    month: DAYS_PER_MONTH / 7,
    year: DAYS_PER_YEAR / 7,
  };

  const UNIT_OPTIONS = [
    ['day', 'Jour(s)'],
    ['week', 'Semaine(s)'],
    ['month', 'Mois'],
    ['year', 'Année(s)'],
  ];

  const UNIT_LABEL = {
    day: 'Jour',
    week: 'Semaine',
    month: 'Mois',
    year: 'Année',
  };

  /**
   * Construit le HTML du simulateur Greedy Machines.
   * La puissance de base est celle du champ « Puissance » du calculateur d'upgrade.
   * @param {Object} data
   * @returns {string}
   */
  function buildGreedySimHtml(data) {
    const unitOptions = UNIT_OPTIONS
      .map(([value, label], i) => `<option value="${value}"${i === 1 ? ' selected' : ''}>${label}</option>`)
      .join('');

    // Prix du TH par défaut : taux marginal d'upgrade power (POWER_UPGRADE_COSTS)
    // à l'efficience de la machine (12/15/20, sinon efficience de référence la plus proche)
    const defaultThPrice = data && data.th > 0 && data.wth > 0
      ? powerRate(data.wth, data.th).toFixed(2)
      : GREEDY_DEFAULT_TH_PRICE;

    return `
      <div class="${GREEDY_SIM_CLASS}" data-gm-greedy-sim data-gm-fold>
        <div class="${GREEDY_SIM_CLASS}__header" data-gm-fold-toggle role="button" tabindex="0" aria-expanded="false">
          <div class="${GREEDY_SIM_CLASS}__head">
            <span class="${GREEDY_SIM_CLASS}__title">📊 Simulateur Greedy Machines</span>
            <span class="${GREEDY_SIM_CLASS}__subtitle">Power up hebdomadaire • votes veGOMINING</span>
          </div>
          <span class="gm-fold-chevron">▾</span>
        </div>
        <div class="${GREEDY_SIM_CLASS}__body" data-gm-fold-body>
          <div class="${GREEDY_SIM_CLASS}__params">
            <div class="${GREEDY_SIM_CLASS}__field">
              <label class="${GREEDY_SIM_CLASS}__label" for="gm-greedy-rate">Power increase rate (% / semaine)</label>
              <input class="${GREEDY_SIM_CLASS}__input" id="gm-greedy-rate" data-gm-greedy-rate type="number" min="0" step="0.01" value="${GREEDY_DEFAULT_RATE}">
            </div>
            <div class="${GREEDY_SIM_CLASS}__field">
              <label class="${GREEDY_SIM_CLASS}__label" for="gm-greedy-duration">Durée</label>
              <div class="${GREEDY_SIM_CLASS}__duration">
                <input class="${GREEDY_SIM_CLASS}__input" id="gm-greedy-duration" data-gm-greedy-duration type="number" min="1" step="1" value="${GREEDY_DEFAULT_DURATION}">
                <select class="${GREEDY_SIM_CLASS}__select" data-gm-greedy-unit aria-label="Unité de durée">${unitOptions}</select>
              </div>
            </div>
            <div class="${GREEDY_SIM_CLASS}__field">
              <label class="${GREEDY_SIM_CLASS}__label">Réinvestissement en puissance</label>
              <label class="${GREEDY_SIM_CLASS}__check">
                <input type="checkbox" data-gm-greedy-reinvest>
                <span>Activer (net quotidien → TH)</span>
              </label>
            </div>
            <div class="${GREEDY_SIM_CLASS}__field" data-gm-greedy-price-wrap>
              <label class="${GREEDY_SIM_CLASS}__label" for="gm-greedy-th-price">Prix du TH ($)</label>
              <input class="${GREEDY_SIM_CLASS}__input" id="gm-greedy-th-price" data-gm-greedy-price type="number" min="0" step="0.01" value="${defaultThPrice}">
            </div>
          </div>
          <div class="${GREEDY_SIM_CLASS}__table-wrap">
            <table class="${GREEDY_SIM_CLASS}__table">
              <thead>
                <tr>
                  <th>Période</th>
                  <th>Puissance (TH)</th>
                  <th>+TH</th>
                  <th>+%</th>
                  <th>Net / jour</th>
                  <th>Net / mois</th>
                  <th>Net / an</th>
                  <th>Δ Net / jour</th>
                  <th>Net cumulé</th>
                </tr>
              </thead>
              <tbody data-gm-greedy-tbody></tbody>
            </table>
          </div>
          <div class="${GREEDY_SIM_CLASS}__note">
            La puissance de base et l'efficience cible suivent le calculateur d'upgrade ; les gains
            reprennent les paramètres du simulateur de rendement. Simulation indicative : l'augmentation
            hebdomadaire dépend des résultats des votes de la communauté (veGOMINING).
            Réinvestissement : gains nets quotidiens convertis en puissance au prix du TH indiqué
            (survol des colonnes +TH / +% pour le détail Greedy vs réinvestissement).
          </div>
        </div>
      </div>`;
  }

  /**
   * Formate un delta signé (montant $).
   * @param {number} v
   * @returns {string}
   */
  function fmtSigned(v) {
    return `${v >= 0 ? '+' : '−'}${fmt(Math.abs(v))}`;
  }

  /**
   * Formate une puissance en TH (2 décimales max, séparateur de milliers).
   * @param {number} th
   * @returns {string}
   */
  function fmtTh(th) {
    return th.toLocaleString('en-US', { maximumFractionDigits: 2 });
  }

  /**
   * Formate un gain en TH avec exactement 2 décimales (popover).
   * @param {number} th
   * @returns {string}
   */
  function fmtThFixed(th) {
    return th.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  /**
   * Simule la puissance avec réinvestissement quotidien des gains nets.
   * Croissance journalière continue (équivalente au bonus hebdomadaire),
   * achat de TH chaque jour au prix indiqué.
   * @param {number} baseTh - puissance de départ (TH)
   * @param {number} dailyRate - croissance journalière (0.00057…)
   * @param {number} totalWeeks - durée totale en semaines
   * @param {number[]} indices - indices de lignes à échantillonner
   * @param {number} weeksPerUnit
   * @param {Function} yieldFor - (th) => rendement
   * @param {number} thPrice - $/TH d'achat
   * @returns {Map<number, number>} index → puissance totale
   */
  function simulateReinvest(baseTh, dailyRate, totalWeeks, indices, weeksPerUnit, yieldFor, thPrice) {
    const totalDays = Math.round(totalWeeks * 7);
    const weekly = totalDays > GREEDY_MAX_SIM_DAYS;

    // Jours cibles des lignes du tableau (arrondis à la semaine au-delà de 100 ans)
    const wants = new Map();
    for (const i of indices) {
      let day = Math.round(i * weeksPerUnit * 7);
      if (weekly) day = Math.round(day / 7) * 7;
      wants.set(day, i);
    }

    const out = new Map();
    let power = baseTh;

    if (!weekly) {
      for (let d = 1; d <= totalDays; d++) {
        power *= 1 + dailyRate;
        power += yieldFor(power).netDaily / thPrice;
        if (wants.has(d)) out.set(wants.get(d), power);
      }
    } else {
      const weeks = Math.ceil(totalDays / 7);
      const weekGrowth = Math.pow(1 + dailyRate, 7);
      for (let w = 1; w <= weeks; w++) {
        power *= weekGrowth;
        power += (yieldFor(power).netDaily * 7) / thPrice;
        const day = w * 7;
        if (wants.has(day)) out.set(wants.get(day), power);
      }
    }

    return out;
  }

  /**
   * Met à jour la table du simulateur Greedy Machines.
   * @param {Element} panel
   * @param {Object} data
   */
  function updateGreedySim(panel, data) {
    const sim = panel.querySelector('[data-gm-greedy-sim]');
    const tbody = sim ? sim.querySelector('[data-gm-greedy-tbody]') : null;
    if (!sim || !tbody) return;

    // Puissance de base = champ « Puissance » du calculateur d'upgrade
    const powerInput = panel.querySelector('#gm-power');
    const baseTh = powerInput && !isNaN(parseFloat(powerInput.value)) && parseFloat(powerInput.value) > 0
      ? parseFloat(powerInput.value)
      : data.th;

    const readParam = (key, fallback) => {
      const el = sim.querySelector(`[data-gm-greedy-${key}]`);
      const v = el ? parseFloat(el.value) : NaN;
      return isNaN(v) ? fallback : v;
    };
    const ratePct = clamp(readParam('rate', GREEDY_DEFAULT_RATE), 0, 100);
    const duration = Math.max(1, Math.floor(readParam('duration', GREEDY_DEFAULT_DURATION)));
    const unitEl = sim.querySelector('[data-gm-greedy-unit]');
    const unit = unitEl && WEEKS_PER_UNIT[unitEl.value] ? unitEl.value : 'week';

    const reinvest = sim.querySelector('[data-gm-greedy-reinvest]')?.checked ?? false;
    const thPrice = Math.max(0, readParam('price', GREEDY_DEFAULT_TH_PRICE));
    sim.classList.toggle(`${GREEDY_SIM_CLASS}--no-reinvest`, !reinvest || thPrice <= 0);

    // Paramètres de rendement partagés avec le simulateur de rendement
    const read = (key, fallback) => {
      const el = panel.querySelector(`[data-gm-sim-input="${key}"]`);
      const v = el ? parseFloat(el.value) : NaN;
      return isNaN(v) || v < 0 ? fallback : v;
    };
    const btcPrice = read('btc', panel._gmReward?.btcPrice ?? 90000);
    const satsPerThDay = read('sats', 45);
    const kwhCost = read('kwh', DEFAULT_KWH);
    const discountPct = read('discount', 0);

    // Efficience cible = sélecteur du calculateur d'upgrade
    const effSelect = panel.querySelector('#gm-efficiency');
    const targetEff = effSelect && !isNaN(parseInt(effSelect.value, 10))
      ? parseInt(effSelect.value, 10)
      : Math.floor(data.wth);
    const eff = Math.min(targetEff, data.wth);

    const yieldFor = (th) => computeYield({
      th, wth: eff, btcPrice, satsPerThDay, kwhCost, discountPct,
    });

    const rate = ratePct / 100;
    const dailyRate = Math.pow(1 + rate, 1 / 7) - 1;
    const weeksPerUnit = WEEKS_PER_UNIT[unit];
    const periodLabel = UNIT_LABEL[unit];

    // Lignes : une par unité temporelle, plafonnées pour rester lisible.
    // La dernière ligne tombe toujours exactement sur la durée choisie.
    const step = Math.max(1, Math.ceil(duration / GREEDY_MAX_ROWS));
    const indices = [];
    for (let i = step; i < duration; i += step) indices.push(i);
    if (indices[indices.length - 1] !== duration) indices.push(duration);

    // Puissance avec réinvestissement (simulation jour par jour)
    const reinvestAt = reinvest && thPrice > 0
      ? simulateReinvest(baseTh, dailyRate, duration * weeksPerUnit, indices, weeksPerUnit, yieldFor, thPrice)
      : new Map();

    const baseYield = yieldFor(baseTh);
    const rows = [];

    // Ligne de départ (période 0)
    rows.push(`
      <tr class="${GREEDY_SIM_CLASS}__row ${GREEDY_SIM_CLASS}__row--base">
        <td>Base</td>
        <td>${fmtTh(baseTh)}</td>
        <td>—</td>
        <td>—</td>
        <td>${fmt(baseYield.netDaily)}</td>
        <td>${fmt(baseYield.netMonthly)}</td>
        <td>${fmt(baseYield.netYearly)}</td>
        <td>—</td>
        <td>—</td>
      </tr>`);

    let cumNet = 0;
    let prevYield = baseYield;
    let prevI = 0;

    for (const i of indices) {
      // Gains Greedy = croissance hebdomadaire seule ; gains réinvestissement = le surplus
      const greedyPower = baseTh * Math.pow(1 + rate, i * weeksPerUnit);
      const totalPower = reinvestAt.has(i) ? reinvestAt.get(i) : greedyPower;

      const greedyTh = greedyPower - baseTh;
      const greedyPct = (greedyTh / baseTh) * 100;
      const reinvestTh = totalPower - greedyPower;
      const reinvestPct = (reinvestTh / baseTh) * 100;
      const deltaTh = totalPower - baseTh;
      const deltaPct = (deltaTh / baseTh) * 100;

      const y = yieldFor(totalPower);

      // Net cumulé : moyenne des nets de début/fin de segment × jours écoulés
      const segDays = (i - prevI) * weeksPerUnit * 7;
      cumNet += ((prevYield.netDaily + y.netDaily) / 2) * segDays;

      const deltaNet = y.netDaily - baseYield.netDaily;

      rows.push(`
        <tr class="${GREEDY_SIM_CLASS}__row"
            data-gm-greedy-th="${greedyTh.toFixed(2)}" data-gm-greedy-pct="${greedyPct.toFixed(2)}"
            data-gm-reinvest-th="${reinvestTh.toFixed(2)}" data-gm-reinvest-pct="${reinvestPct.toFixed(2)}"
            data-gm-gain-th="${deltaTh.toFixed(2)}" data-gm-gain-pct="${deltaPct.toFixed(2)}">
          <td>${periodLabel} ${i}</td>
          <td>${fmtTh(totalPower)}</td>
          <td class="${GREEDY_SIM_CLASS}__cell--pos"><span class="${GREEDY_SIM_CLASS}__gain" tabindex="0">+${fmtTh(deltaTh)}</span></td>
          <td class="${GREEDY_SIM_CLASS}__cell--pos"><span class="${GREEDY_SIM_CLASS}__gain" tabindex="0">+${deltaPct.toFixed(2)}%</span></td>
          <td>${fmt(y.netDaily)}</td>
          <td>${fmt(y.netMonthly)}</td>
          <td>${fmt(y.netYearly)}</td>
          <td class="${GREEDY_SIM_CLASS}__cell--${deltaNet >= 0 ? 'pos' : 'neg'}">${fmtSigned(deltaNet)}</td>
          <td>${fmt(cumNet)}</td>
        </tr>`);

      prevYield = y;
      prevI = i;
    }

    tbody.innerHTML = rows.join('');
  }

  /**
   * Remet à jour le champ « Prix du TH ($) » d'après l'efficience cible
   * et la puissance cible du calculateur d'upgrade (tables POWER_UPGRADE_COSTS).
   * @param {Element} panel
   * @param {Object} data
   */
  function updateGreedyPrice(panel, data) {
    const sim = panel.querySelector('[data-gm-greedy-sim]');
    const priceInput = sim ? sim.querySelector('[data-gm-greedy-price]') : null;
    if (!sim || !priceInput) return;

    const effSelect = panel.querySelector('#gm-efficiency');
    const powerInput = panel.querySelector('#gm-power');
    const targetEff = effSelect && !isNaN(parseInt(effSelect.value, 10))
      ? parseInt(effSelect.value, 10)
      : Math.floor(data.wth);
    const targetTh = powerInput && !isNaN(parseFloat(powerInput.value)) && parseFloat(powerInput.value) > 0
      ? parseFloat(powerInput.value)
      : data.th;

    priceInput.value = powerRate(targetEff, targetTh).toFixed(2);
  }

  /**
   * Branche la popover de décomposition des gains (Greedy vs réinvestissement)
   * sur les cellules +TH / +% — délégation sur le tbody (persiste après re-render).
   * @param {Element} panel
   */
  function wireGreedySim(panel) {
    const tbody = panel.querySelector('[data-gm-greedy-tbody]');
    if (!tbody || tbody.dataset.gmGreedyWired === 'true') return;
    tbody.dataset.gmGreedyWired = 'true';

    let tip = null;
    const getTip = () => {
      if (tip) return tip;
      tip = document.createElement('div');
      tip.className = `${GREEDY_SIM_CLASS}__tooltip`;
      document.body.appendChild(tip);
      return tip;
    };

    const showAt = (e, el) => {
      const row = el.closest('tr');
      if (!row) return;
      const d = row.dataset;
      const tipEl = getTip();
      tipEl.innerHTML = `
        <div class="${GREEDY_SIM_CLASS}__tooltip-title">Répartition des gains</div>
        <div class="${GREEDY_SIM_CLASS}__tooltip-row">🐺 Greedy : <b>+${fmtThFixed(parseFloat(d.gmGreedyTh))} TH (+${d.gmGreedyPct}%)</b></div>
        <div class="${GREEDY_SIM_CLASS}__tooltip-row">💸 Réinvestissement : <b>+${fmtThFixed(parseFloat(d.gmReinvestTh))} TH (+${d.gmReinvestPct}%)</b></div>`;
      tipEl.classList.add('visible');
      positionAt(e, tipEl);
    };

    const positionAt = (e, tipEl) => {
      const pad = 12;
      const left = e.clientX + pad;
      tipEl.style.left = `${Math.min(left, window.innerWidth - tipEl.offsetWidth - pad)}px`;
      tipEl.style.top = `${e.clientY + pad}px`;
    };

    const hide = () => getTip().classList.remove('visible');

    tbody.addEventListener('mouseover', (e) => {
      const gain = e.target.closest(`.${GREEDY_SIM_CLASS}__gain`);
      if (!gain) { hide(); return; }
      showAt(e, gain);
    });
    tbody.addEventListener('mousemove', (e) => {
      if (getTip().classList.contains('visible')) positionAt(e, getTip());
    });
    tbody.addEventListener('mouseleave', hide);
    tbody.addEventListener('focusin', (e) => {
      const gain = e.target.closest(`.${GREEDY_SIM_CLASS}__gain`);
      if (gain) {
        const rect = gain.getBoundingClientRect();
        showAt({ clientX: rect.right, clientY: rect.top }, gain);
      }
    });
    tbody.addEventListener('focusout', hide);
  }

  GM.greedy = {
    buildGreedySimHtml,
    updateGreedySim,
    updateGreedyPrice,
    wireGreedySim,
  };
})();