/**
 * Module business/UI : panneau de la page détail d'un mineur
 * (calculateur d'upgrade + simulateur de rendement).
 * Exposé sur `GM.panel`.
 */
(function () {
  'use strict';

  const GM = (globalThis.GM = globalThis.GM || {});
  const { C, log, fmt } = GM;
  const t = GM.I18N.t;
  const {
    DETAIL_DESC_CLASS, UPGRADE_PANEL_CLASS, YIELD_SIM_CLASS,
    TARGET_EFFICIENCY_15, TARGET_EFFICIENCY_12,
    POWER_REF_EFFS, DAYS_PER_MONTH, DEFAULT_KWH, DEFAULT_GMT_PRICE,
  } = C;
  const { computeUpgradeCost, computeUpgradeStrategies } = GM.costs;
  const { computeYield, resolveGmtPrice, LIVE_PRICE, onLivePrice } = GM.rewards;
  const { extractDetailData, extractRewardCalculatorData } = GM.extract;
  const { buildGreedySimHtml, updateGreedySim, updateGreedyPrice, wireGreedySim } = GM.greedy;

  // ─── Calculateur d'upgrade ───────────────────────────────────────

  /**
   * Construit la liste des efficiences cibles proposées (de 12 à wth courant)
   * @param {number} currentWth
   * @param {number} defaultTarget
   * @returns {string} options HTML
   */
  function buildEfficiencyOptions(currentWth, defaultTarget) {
    const min = TARGET_EFFICIENCY_12;
    const max = Math.max(min, Math.floor(currentWth));
    let opts = '';
    for (let wth = max; wth >= min; wth--) {
      const selected = wth === defaultTarget ? ' selected' : '';
      opts += `<option value="${wth}"${selected}>${wth} W/TH</option>`;
    }
    return opts;
  }

  /**
   * Construit le bloc HTML du calculateur d'upgrade
   * @param {Object} data
   * @param {Object|null} reward - données du calculateur de récompenses
   * @returns {string}
   */
  function buildUpgradePanelHtml(data, reward) {
    const { th, wth, priceUsd } = data;

    const costTo15 = computeUpgradeCost(wth, th, TARGET_EFFICIENCY_15);
    const costTo12 = computeUpgradeCost(wth, th, TARGET_EFFICIENCY_12);
    const totalTo15 = priceUsd ? priceUsd + costTo15 : costTo15;
    const totalTo12 = priceUsd ? priceUsd + costTo12 : costTo12;
    const pThTo15 = priceUsd ? totalTo15 / th : null;
    const pThTo12 = priceUsd ? totalTo12 / th : null;

    const isOptimal12 = wth <= TARGET_EFFICIENCY_12;
    const isOptimal15 = wth <= TARGET_EFFICIENCY_15;

    const card = (target, cost, total, pTh, optimal) => `
      <div class="${UPGRADE_PANEL_CLASS}__card${optimal ? ` ${UPGRADE_PANEL_CLASS}__card--disabled` : ''}" data-gm-card-target="${target}" ${optimal ? '' : `title="${t('panel.cardSelectTitle', [target])}"`}>
        <div class="${UPGRADE_PANEL_CLASS}__card-head">
          <span class="${UPGRADE_PANEL_CLASS}__card-target">→ ${target} W/TH</span>
          ${optimal ? `<span class="${UPGRADE_PANEL_CLASS}__card-optimal">${t('panel.alreadyOptimal')}</span>` : ''}
        </div>
        <div class="${UPGRADE_PANEL_CLASS}__card-cost">
          <span class="${UPGRADE_PANEL_CLASS}__card-label">${t('common.upgradeCost')}</span>
          <span class="${UPGRADE_PANEL_CLASS}__card-value">${fmt(cost)}</span>
        </div>
        ${priceUsd ? `
        <div class="${UPGRADE_PANEL_CLASS}__card-row">
          <span>${t('common.totalPrice')}</span><span>${fmt(total)}</span>
        </div>
        <div class="${UPGRADE_PANEL_CLASS}__card-row ${UPGRADE_PANEL_CLASS}__card-row--highlight">
          <span>${t('common.pricePerThUpgraded')}</span><span>${fmt(pTh)}</span>
        </div>` : ''}
      </div>`;

    const quickCards = `
      <div class="${UPGRADE_PANEL_CLASS}__quick">
        ${card(TARGET_EFFICIENCY_15, costTo15, totalTo15, pThTo15, isOptimal15)}
        ${card(TARGET_EFFICIENCY_12, costTo12, totalTo12, pThTo12, isOptimal12)}
      </div>`;

    const calculator = `
      <div class="${UPGRADE_PANEL_CLASS}__calc" data-gm-fold>
        <div class="${UPGRADE_PANEL_CLASS}__calc-title" data-gm-fold-toggle role="button" tabindex="0" aria-expanded="false">
          <span>${t('panel.calcTitle')}</span>
          <span class="gm-fold-chevron">▾</span>
        </div>
        <div class="${UPGRADE_PANEL_CLASS}__calc-body" data-gm-fold-body>
          <div class="${UPGRADE_PANEL_CLASS}__calc-grid">
            <div class="${UPGRADE_PANEL_CLASS}__field">
              <label class="${UPGRADE_PANEL_CLASS}__label" for="gm-efficiency">${t('panel.targetEff')}</label>
              <select class="${UPGRADE_PANEL_CLASS}__select" id="gm-efficiency">
                ${buildEfficiencyOptions(wth, Math.min(TARGET_EFFICIENCY_15, Math.floor(wth)))}
              </select>
            </div>
            <div class="${UPGRADE_PANEL_CLASS}__field">
              <label class="${UPGRADE_PANEL_CLASS}__label" for="gm-power">${t('common.power')}</label>
              <input class="${UPGRADE_PANEL_CLASS}__input" id="gm-power" type="number" min="0" step="0.01" value="${th}">
            </div>
          </div>
          <div class="${UPGRADE_PANEL_CLASS}__calc-result">
            <div class="${UPGRADE_PANEL_CLASS}__row">
              <span>${t('common.upgradeCost')}</span><span class="${UPGRADE_PANEL_CLASS}__row-value" data-gm-cost>—</span>
            </div>
            <div class="${UPGRADE_PANEL_CLASS}__row">
              <span>${t('panel.costPerTh')}</span><span class="${UPGRADE_PANEL_CLASS}__row-value" data-gm-cost-pth>—</span>
            </div>
            ${priceUsd ? `
            <div class="${UPGRADE_PANEL_CLASS}__row">
              <span>${t('panel.totalUpgraded')}</span><span class="${UPGRADE_PANEL_CLASS}__row-value" data-gm-total>—</span>
            </div>
            <div class="${UPGRADE_PANEL_CLASS}__row ${UPGRADE_PANEL_CLASS}__row--highlight">
              <span>${t('common.pricePerThUpgraded')}</span><span class="${UPGRADE_PANEL_CLASS}__row-value" data-gm-pth-upgraded>—</span>
            </div>` : ''}
          </div>
          <div class="${UPGRADE_PANEL_CLASS}__strategies" data-gm-strategies></div>
        </div>
      </div>`;

    return `
      <div class="${UPGRADE_PANEL_CLASS}" data-gm-upgrade-panel>
        <div class="${UPGRADE_PANEL_CLASS}__header">
          <span class="${UPGRADE_PANEL_CLASS}__title">${t('panel.headerTitle')}</span>
          <span class="${UPGRADE_PANEL_CLASS}__subtitle">${th} TH • ${wth} W/TH</span>
        </div>
        ${quickCards}
        ${calculator}
        ${buildYieldSimHtml(data, reward)}
        ${data.isGreedyMachines ? buildGreedySimHtml(data) : ''}
      </div>`;
  }

  /**
   * Met à jour le résultat du calculateur en fonction des inputs
   * @param {Element} panel
   * @param {Object} data
   */
  function updateCalculator(panel, data) {
    const effSelect = panel.querySelector('#gm-efficiency');
    const powerInput = panel.querySelector('#gm-power');
    if (!effSelect || !powerInput) return;

    // Le prix du TH du simulateur Greedy suit efficience cible + puissance cible
    updateGreedyPrice(panel, data);

    const target = parseInt(effSelect.value, 10);
    const power = parseFloat(powerInput.value);
    if (isNaN(power) || power <= 0) {
      panel.querySelectorAll('[data-gm-cost], [data-gm-cost-pth], [data-gm-total], [data-gm-pth-upgraded]').forEach((el) => {
        el.textContent = '—';
      });
      renderStrategies(panel, null);
      updateYieldSim(panel, data);
      return;
    }

    const strategies = computeUpgradeStrategies(data, target, power);
    const cost = strategies.cost;
    const costPTh = cost / power;

    panel.querySelector('[data-gm-cost]').textContent = fmt(cost);
    panel.querySelector('[data-gm-cost-pth]').textContent = fmt(costPTh);

    if (data.priceUsd) {
      const total = data.priceUsd + cost;
      panel.querySelector('[data-gm-total]').textContent = fmt(total);
      panel.querySelector('[data-gm-pth-upgraded]').textContent = fmt(total / power);
    }

    renderStrategies(panel, strategies, target);
    updateYieldSim(panel, data);
  }

  /**
   * Affiche les deux stratégies d'upgrade (si applicable) dans le calculateur
   * @param {Element} panel
   * @param {Object|null} strategies
   * @param {number} targetEff - efficience cible sélectionnée
   */
  function renderStrategies(panel, strategies, targetEff) {
    const container = panel.querySelector('[data-gm-strategies]');
    if (!container) return;

    // Les coûts power ne sont fiables que pour les efficiences de référence (12/15/20)
    const isRefEff = POWER_REF_EFFS.includes(targetEff);
    const show = isRefEff && strategies && strategies.both;
    container.innerHTML = show ? `
      <div class="${UPGRADE_PANEL_CLASS}__strategies-title">${t('panel.strategiesTitle')}</div>
      <div class="${UPGRADE_PANEL_CLASS}__strategies-grid">
        ${buildStrategyCard(t('panel.strategyEffPower'), strategies.strategy1, strategies.cost === strategies.strategy1.total, true)}
        ${buildStrategyCard(t('panel.strategyPowerEff'), strategies.strategy2, strategies.cost === strategies.strategy2.total, false)}
      </div>
    ` : '';
  }

  /**
   * Construit la card d'une stratégie d'upgrade.
   * @param {string} label
   * @param {Object} strategy
   * @param {boolean} recommended
   * @param {boolean} effFirst - ordre d'affichage (efficience en premier)
   * @returns {string}
   */
  function buildStrategyCard(label, strategy, recommended, effFirst) {
    const rows = effFirst
      ? `<div class="${UPGRADE_PANEL_CLASS}__strategy-row">
          <span>${t('panel.effRow')}</span><span class="${UPGRADE_PANEL_CLASS}__row-value">${fmt(strategy.effCost)}</span>
        </div>
        <div class="${UPGRADE_PANEL_CLASS}__strategy-row">
          <span>${t('panel.powerRow')}</span><span class="${UPGRADE_PANEL_CLASS}__row-value">${fmt(strategy.powerCost)}</span>
        </div>`
      : `<div class="${UPGRADE_PANEL_CLASS}__strategy-row">
          <span>${t('panel.powerRow')}</span><span class="${UPGRADE_PANEL_CLASS}__row-value">${fmt(strategy.powerCost)}</span>
        </div>
        <div class="${UPGRADE_PANEL_CLASS}__strategy-row">
          <span>${t('panel.effRow')}</span><span class="${UPGRADE_PANEL_CLASS}__row-value">${fmt(strategy.effCost)}</span>
        </div>`;

    return `
      <div class="${UPGRADE_PANEL_CLASS}__strategy ${recommended ? `${UPGRADE_PANEL_CLASS}__strategy--recommended` : ''}">
        <div class="${UPGRADE_PANEL_CLASS}__strategy-head">
          <span>${label}</span>
          ${recommended ? `<span class="${UPGRADE_PANEL_CLASS}__strategy-badge">${t('common.recommended')}</span>` : ''}
        </div>
        <div class="${UPGRADE_PANEL_CLASS}__strategy-body">
          ${rows}
          <div class="${UPGRADE_PANEL_CLASS}__strategy-row ${UPGRADE_PANEL_CLASS}__strategy-total">
            <span>${t('common.total')}</span><span class="${UPGRADE_PANEL_CLASS}__row-value">${fmt(strategy.total)}</span>
          </div>
        </div>
      </div>`;
  }

  // ─── Simulateur de rendement ─────────────────────────────────────

  /**
   * Construit le HTML du simulateur de rendement.
   * Pré-rempli avec les valeurs extraites du calculateur GoMining.
   * @param {Object} data
   * @param {Object|null} reward
   * @returns {string}
   */
  function buildYieldSimHtml(data, reward) {
    const { th, wth } = data;

    const btcPrice = reward?.btcPrice ?? 90000;
    const satsPerThDay = reward && reward.gross && btcPrice
      ? (reward.gross / reward.factor) / btcPrice / th * 1e8
      : 45;
    const kwh = DEFAULT_KWH;

    const field = (key, label, value, step) => `
      <div class="${YIELD_SIM_CLASS}__field">
        <label class="${YIELD_SIM_CLASS}__label" for="gm-sim-${key}">${label}</label>
        <input class="${YIELD_SIM_CLASS}__input" id="gm-sim-${key}" data-gm-sim-input="${key}" type="number" step="${step}" min="0" value="${value}">
      </div>`;

    const row = (label, key, highlight, withCurr) => `
      <div class="${YIELD_SIM_CLASS}__row${highlight ? ` ${YIELD_SIM_CLASS}__row--highlight` : ''}">
        <span>${label}</span>
        <span class="${YIELD_SIM_CLASS}__row-value">
          <span data-gm-sim-value="${key}">—</span>
          ${withCurr ? `<span class="${YIELD_SIM_CLASS}__cur" data-gm-sim-cur="${key}"></span>` : ''}
        </span>
      </div>`;

    const col = (title, prefix, isTarget) => `
      <div class="${YIELD_SIM_CLASS}__col${isTarget ? ` ${YIELD_SIM_CLASS}__col--target` : ''}">
        <div class="${YIELD_SIM_CLASS}__col-title">${title}</div>
        ${row(t('panel.grossDay'), `${prefix}-gross-d`)}
        ${row(t('panel.elecDay'), `${prefix}-elec-d`, false, true)}
        ${row(t('panel.serviceDay'), `${prefix}-serv-d`, false, true)}
        ${row(t('panel.maintDay'), `${prefix}-maint-d`, false, true)}
        ${row(t('common.netDay'), `${prefix}-net-d`, true)}
        ${row(t('common.netMonth'), `${prefix}-net-m`)}
        ${row(t('common.netYear'), `${prefix}-net-y`, true)}
        ${row(t('panel.roiAnnual'), `${prefix}-roi`)}
        ${row(t('panel.payback'), `${prefix}-payback`)}
      </div>`;

    return `
      <div class="${YIELD_SIM_CLASS}" data-gm-yield-sim data-gm-fold>
        <div class="${YIELD_SIM_CLASS}__header" data-gm-fold-toggle role="button" tabindex="0" aria-expanded="false">
          <div class="${YIELD_SIM_CLASS}__head">
            <span class="${YIELD_SIM_CLASS}__title">${t('panel.yieldTitle')}</span>
            <span class="${YIELD_SIM_CLASS}__subtitle">${th} TH → ${wth} W/TH</span>
          </div>
          <span class="gm-fold-chevron">▾</span>
        </div>
        <div class="${YIELD_SIM_CLASS}__body" data-gm-fold-body>
          <div class="${YIELD_SIM_CLASS}__params">
            ${field('btc', `${t('common.btcPrice')} <span class="${YIELD_SIM_CLASS}__live" data-gm-sim-live-btc></span>`, btcPrice, '1')}
            ${field('sats', t('panel.satsYield'), satsPerThDay.toFixed(1), '0.1')}
            ${field('kwh', t('panel.kwhCost'), kwh.toFixed(4), '0.0001')}
            ${field('discount', t('panel.maintDiscount'), 0, '0.1')}
          </div>
          <div class="${YIELD_SIM_CLASS}__currency">
            <span class="${YIELD_SIM_CLASS}__label">${t('panel.maintenanceIn')}</span>
            <div class="${YIELD_SIM_CLASS}__tabs">
              <button type="button" class="${YIELD_SIM_CLASS}__tab active" data-gm-sim-currency="GMT">GOMINING</button>
              <button type="button" class="${YIELD_SIM_CLASS}__tab" data-gm-sim-currency="BTC">BTC</button>
            </div>
            <span class="${YIELD_SIM_CLASS}__live" data-gm-sim-live-gmt></span>
          </div>
          <div class="${YIELD_SIM_CLASS}__compare">
            ${col(t('panel.curCol'), 'cur')}
            ${col(t('panel.tgtCol'), 'tgt', true)}
          </div>
          <div class="${YIELD_SIM_CLASS}__delta">
            <span>${t('panel.deltaNet')}</span>
            <span class="${YIELD_SIM_CLASS}__row-value ${YIELD_SIM_CLASS}__delta-value" data-gm-sim-value="delta-net">—</span>
          </div>
          <div class="${YIELD_SIM_CLASS}__note">
            ${t('panel.note')}
          </div>
        </div>
      </div>`;
  }

  /**
   * Met à jour les valeurs du simulateur pour l'état actuel et après upgrade.
   * @param {Element} panel
   * @param {Object} data
   */
  function updateYieldSim(panel, data) {
    const sim = panel.querySelector('[data-gm-yield-sim]');
    if (!sim) return;

    const read = (key, fallback) => {
      const el = sim.querySelector(`[data-gm-sim-input="${key}"]`);
      const v = el ? parseFloat(el.value) : NaN;
      return isNaN(v) || v < 0 ? fallback : v;
    };

    const btcPrice = read('btc', 90000);
    const satsPerThDay = read('sats', 45);
    const kwhCost = read('kwh', DEFAULT_KWH);
    const discountPct = read('discount', 0);

    // Devise d'affichage de la maintenance (GOMINING ou BTC)
    const currency = sim.querySelector('[data-gm-sim-currency].active')?.dataset.gmSimCurrency || 'GMT';
    const gmtPrice = resolveGmtPrice(panel);

    const effSelect = panel.querySelector('#gm-efficiency');
    const powerInput = panel.querySelector('#gm-power');
    const targetEff = effSelect ? parseInt(effSelect.value, 10) : Math.floor(data.wth);
    const targetTh = powerInput && !isNaN(parseFloat(powerInput.value)) && parseFloat(powerInput.value) > 0
      ? parseFloat(powerInput.value)
      : data.th;

    const curYield = computeYield({ th: data.th, wth: data.wth, btcPrice, satsPerThDay, kwhCost, discountPct });
    const tgtYield = computeYield({
      th: targetTh,
      wth: Math.min(targetEff, data.wth),
      btcPrice,
      satsPerThDay,
      kwhCost,
      discountPct,
    });

    const strategies = computeUpgradeStrategies(data, targetEff, targetTh);
    const upgradeCost = strategies.cost;

    const investCur = data.priceUsd ?? null;
    const investTgt = data.priceUsd ? data.priceUsd + upgradeCost : (upgradeCost || null);

    const roiPct = (invest, netYearly) => (invest ? (netYearly / invest) * 100 : null);
    const fmtPayback = (invest, netDaily) => {
      if (!invest || !netDaily || netDaily <= 0) return '—';
      const days = invest / netDaily;
      return days < 90 ? t('panel.paybackDays', [Math.round(days)]) : t('panel.paybackMonths', [(days / DAYS_PER_MONTH).toFixed(1)]);
    };

    const fmtBtc = (v) => {
      if (v >= 1) return v.toFixed(4);
      return v.toFixed(8).replace(/0+$/, '').replace(/\.$/, '');
    };

    const set = (key, value) => {
      const el = sim.querySelector(`[data-gm-sim-value="${key}"]`);
      if (el) el.textContent = value;
    };

    // Estimation de la maintenance dans la devise sélectionnée
    const setCur = (key, usd) => {
      const el = sim.querySelector(`[data-gm-sim-cur="${key}"]`);
      if (!el) return;
      el.textContent = currency === 'GMT'
        ? `(${(usd / gmtPrice).toFixed(1)} GMT)`
        : `(${fmtBtc(usd / btcPrice)} BTC)`;
    };

    const fill = (prefix, y, invest) => {
      set(`${prefix}-gross-d`, fmt(y.grossDaily));
      set(`${prefix}-elec-d`, fmt(y.electricityDaily));
      set(`${prefix}-serv-d`, fmt(y.serviceDaily));
      set(`${prefix}-maint-d`, fmt(y.maintenanceDaily));
      set(`${prefix}-net-d`, fmt(y.netDaily));
      set(`${prefix}-net-m`, fmt(y.netMonthly));
      set(`${prefix}-net-y`, fmt(y.netYearly));
      const roi = roiPct(invest, y.netYearly);
      set(`${prefix}-roi`, roi !== null ? `${roi.toFixed(1)}%` : '—');
      set(`${prefix}-payback`, fmtPayback(invest, y.netDaily));
      setCur(`${prefix}-elec-d`, y.electricityDaily);
      setCur(`${prefix}-serv-d`, y.serviceDaily);
      setCur(`${prefix}-maint-d`, y.maintenanceDaily);
    };

    fill('cur', curYield, investCur);
    fill('tgt', tgtYield, investTgt);

    const delta = tgtYield.netDaily - curYield.netDaily;
    const deltaEl = sim.querySelector('[data-gm-sim-value="delta-net"]');
    if (deltaEl) {
      deltaEl.textContent = t('panel.deltaPerDay', [`${delta >= 0 ? '+' : '−'}${fmt(Math.abs(delta))}`]);
      deltaEl.classList.toggle(`${YIELD_SIM_CLASS}__delta-value--negative`, delta < 0);
    }

    // Le simulateur Greedy Machines partage les mêmes paramètres de rendement
    updateGreedySim(panel, data);
  }

  /**
   * Rafraîchit les annotations de prix live (BTC/GMT) du simulateur.
   * @param {Element} panel
   */
  function updateLivePriceAnnotations(panel) {
    const sim = panel.querySelector('[data-gm-yield-sim]');
    if (!sim) return;

    const btcEl = sim.querySelector('[data-gm-sim-live-btc]');
    if (btcEl) {
      const btc = LIVE_PRICE.btc ?? panel._gmReward?.btcPrice ?? null;
      btcEl.textContent = btc ? t('panel.liveCurrent', [fmt(btc)]) : '';
      btcEl.classList.toggle(`${YIELD_SIM_CLASS}__live--clickable`, btc !== null);
      if (btc !== null) {
        btcEl.setAttribute('role', 'button');
        btcEl.setAttribute('tabindex', '0');
        btcEl.title = t('panel.liveClick');
      } else {
        btcEl.removeAttribute('role');
        btcEl.removeAttribute('tabindex');
        btcEl.title = '';
      }
    }

    const gmtEl = sim.querySelector('[data-gm-sim-live-gmt]');
    if (gmtEl) {
      const gmt = resolveGmtPrice(panel);
      gmtEl.textContent = t('panel.liveGmt', ['$' + (gmt ?? DEFAULT_GMT_PRICE).toFixed(4)]);
    }

    updateYieldSim(panel, panel._gmData);
  }

  // ─── Injection du panneau ────────────────────────────────────────

  /**
   * Injecte le panneau d'upgrade sous .catalog-item__description--last
   * @param {Object} data
   * @param {Object|null} reward - données du calculateur de récompenses
   */
  function injectUpgradePanel(data, reward) {
    const container = document.querySelector(`.${DETAIL_DESC_CLASS}`);
    if (!container) return;

    const existing = container.nextElementSibling;
    if (existing?.hasAttribute('data-gm-upgrade-panel')) existing.remove();

    const wrapper = document.createElement('div');
    wrapper.innerHTML = buildUpgradePanelHtml(data, reward);
    const panel = wrapper.firstElementChild;

    panel._gmData = data;
    panel._gmReward = reward;

    container.insertAdjacentElement('afterend', panel);

    const effSelect = panel.querySelector('#gm-efficiency');
    const powerInput = panel.querySelector('#gm-power');
    if (effSelect) {
      effSelect.addEventListener('change', () => updateCalculator(panel, data));
    }
    if (powerInput) {
      powerInput.addEventListener('input', () => updateCalculator(panel, data));
    }

    // Inputs du simulateur de rendement → recalcul seul
    panel.querySelectorAll('[data-gm-sim-input]').forEach((input) => {
      input.addEventListener('input', () => updateYieldSim(panel, data));
    });

    // Inputs du simulateur Greedy Machines → recalcul de la table
    panel.querySelectorAll('[data-gm-greedy-rate], [data-gm-greedy-duration], [data-gm-greedy-unit], [data-gm-greedy-reinvest], [data-gm-greedy-price]').forEach((el) => {
      el.addEventListener('input', () => updateGreedySim(panel, data));
      el.addEventListener('change', () => updateGreedySim(panel, data));
    });

    // Popover de décomposition des gains Greedy / réinvestissement
    wireGreedySim(panel);

    // Onglets GOMINING / BTC (devise d'affichage de la maintenance)
    panel.querySelectorAll('[data-gm-sim-currency]').forEach((tab) => {
      tab.addEventListener('click', () => {
        panel.querySelectorAll('[data-gm-sim-currency]').forEach((t) => t.classList.remove('active'));
        tab.classList.add('active');
        updateYieldSim(panel, data);
      });
    });

    // Clic sur le prix live BTC → préremplit le champ "Prix BTC ($)"
    const liveBtcEl = panel.querySelector('[data-gm-sim-live-btc]');
    if (liveBtcEl) {
      const applyLiveBtc = () => {
        const live = LIVE_PRICE.btc ?? panel._gmReward?.btcPrice ?? null;
        if (live === null) return;
        const btcInput = panel.querySelector('#gm-sim-btc');
        if (!btcInput) return;
        btcInput.value = live.toFixed(2);
        updateYieldSim(panel, data);
      };
      liveBtcEl.addEventListener('click', applyLiveBtc);
      liveBtcEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          applyLiveBtc();
        }
      });
    }

    // Clic sur une carte rapide → présélectionne l'efficience cible dans le calculateur
    // et déplie le calculateur (fermé par défaut).
    const setFold = (toggle, open) => {
      const block = toggle.closest('[data-gm-fold]');
      if (!block) return;
      block.classList.toggle('gm-fold--open', open);
      toggle.setAttribute('aria-expanded', String(open));
    };

    panel.querySelectorAll('[data-gm-fold-toggle]').forEach((toggle) => {
      const toggleFold = () => {
        const block = toggle.closest('[data-gm-fold]');
        setFold(toggle, !block?.classList.contains('gm-fold--open'));
      };
      toggle.addEventListener('click', toggleFold);
      toggle.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          toggleFold();
        }
      });
    });

    panel.querySelectorAll('[data-gm-card-target]').forEach((cardEl) => {
      cardEl.addEventListener('click', () => {
        if (cardEl.classList.contains(`${UPGRADE_PANEL_CLASS}__card--disabled`)) return;
        const target = parseInt(cardEl.dataset.gmCardTarget, 10);
        if (!effSelect) return;
        effSelect.value = String(target);
        updateCalculator(panel, data);
        const calcEl = panel.querySelector('.gm-upgrade-panel__calc');
        if (calcEl) {
          const calcToggle = calcEl.querySelector('[data-gm-fold-toggle]');
          if (calcToggle) setFold(calcToggle, true);
        }
        if (calcEl && typeof calcEl.scrollIntoView === 'function') {
          calcEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
        if (calcEl) {
          calcEl.classList.remove('gm-upgrade-panel__calc--pulse');
          void calcEl.offsetWidth; // force reflow pour relancer l'animation
          calcEl.classList.add('gm-upgrade-panel__calc--pulse');
          setTimeout(() => calcEl.classList.remove('gm-upgrade-panel__calc--pulse'), 1200);
        }
      });
    });
    updateCalculator(panel, data);
    updateLivePriceAnnotations(panel);
  }

  /**
   * Traite la page détail : extraction puis injection du panneau.
   */
  function processMinerDetail() {
    const container = document.querySelector(`.${DETAIL_DESC_CLASS}`);
    if (!container) return;
    if (container.nextElementSibling?.hasAttribute('data-gm-upgrade-panel')) return;

    const data = extractDetailData();
    if (!data || data.th === null || data.wth === null) {
      log('Données insuffisantes pour la page détail, skip.');
      return;
    }

    log('Détail extrait:', data);
    const reward = extractRewardCalculatorData();
    log('Calculateur récompenses extrait:', reward);
    injectUpgradePanel(data, reward);
  }

  GM.panel = {
    processMinerDetail,
    injectUpgradePanel,
    updateCalculator,
    updateYieldSim,
    updateLivePriceAnnotations,
  };

  // Quand un prix live arrive, on rafraîchit tous les panneaux affichés.
  onLivePrice(() => {
    document.querySelectorAll('[data-gm-upgrade-panel]').forEach((panel) => {
      updateLivePriceAnnotations(panel);
    });
  });
})();