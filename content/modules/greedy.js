/**
 * Module business/UI : simulateur d'évolution de puissance pour la collection
 * "The Greedy Machines" — machines dont la puissance augmente chaque semaine
 * en fonction des résultats des votes de la communauté (veGOMINING).
 * Exposé sur `GM.greedy`.
 */
(function () {
  'use strict';

  const GM = (globalThis.GM = globalThis.GM || {});
  const { C, fmt, clamp } = GM;
  const { GREEDY_SIM_CLASS, GREEDY_DEFAULT_RATE, GREEDY_DEFAULT_DURATION, GREEDY_MAX_ROWS, DAYS_PER_MONTH, DAYS_PER_YEAR, DEFAULT_KWH } = C;
  const { computeYield } = GM.rewards;

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
  function buildGreedySimHtml() {
    const unitOptions = UNIT_OPTIONS
      .map(([value, label], i) => `<option value="${value}"${i === 1 ? ' selected' : ''}>${label}</option>`)
      .join('');

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
    const weeksPerUnit = WEEKS_PER_UNIT[unit];
    const periodLabel = UNIT_LABEL[unit];

    // Lignes : une par unité temporelle, plafonnées pour rester lisible.
    // La dernière ligne tombe toujours exactement sur la durée choisie.
    const step = Math.max(1, Math.ceil(duration / GREEDY_MAX_ROWS));
    const indices = [];
    for (let i = step; i < duration; i += step) indices.push(i);
    if (indices[indices.length - 1] !== duration) indices.push(duration);

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
      const th = baseTh * Math.pow(1 + rate, i * weeksPerUnit);
      const y = yieldFor(th);

      // Net cumulé : moyenne des nets de début/fin de segment × jours écoulés
      const segDays = (i - prevI) * weeksPerUnit * 7;
      cumNet += ((prevYield.netDaily + y.netDaily) / 2) * segDays;

      const deltaTh = th - baseTh;
      const deltaPct = (deltaTh / baseTh) * 100;
      const deltaNet = y.netDaily - baseYield.netDaily;

      rows.push(`
        <tr class="${GREEDY_SIM_CLASS}__row">
          <td>${periodLabel} ${i}</td>
          <td>${fmtTh(th)}</td>
          <td class="${GREEDY_SIM_CLASS}__cell--pos">+${fmtTh(deltaTh)}</td>
          <td class="${GREEDY_SIM_CLASS}__cell--pos">+${deltaPct.toFixed(2)}%</td>
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

  GM.greedy = {
    buildGreedySimHtml,
    updateGreedySim,
  };
})();