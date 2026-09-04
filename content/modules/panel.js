/**
 * Module business/UI : panneau de la page détail d'un mineur
 * (calculateur d'upgrade + simulateur de rendement).
 * Exposé sur `GM.panel`.
 */
(function () {
  'use strict';

  const GM = (globalThis.GM = globalThis.GM || {});
  const { C, log, fmt } = GM;
  const {
    DETAIL_DESC_CLASS, UPGRADE_PANEL_CLASS, YIELD_SIM_CLASS,
    TARGET_EFFICIENCY_15, TARGET_EFFICIENCY_12,
    POWER_REF_EFFS, DAYS_PER_MONTH, DEFAULT_KWH, DEFAULT_GMT_PRICE,
  } = C;
  const { computeUpgradeCost, computeUpgradeStrategies } = GM.costs;
  const { computeYield, resolveGmtPrice, LIVE_PRICE, onLivePrice } = GM.rewards;
  const { extractDetailData, extractRewardCalculatorData } = GM.extract;

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
      <div class="${UPGRADE_PANEL_CLASS}__card${optimal ? ` ${UPGRADE_PANEL_CLASS}__card--disabled` : ''}" data-gm-card-target="${target}" ${optimal ? '' : `title="Sélectionner ${target} W/TH dans le calculateur"`}>
        <div class="${UPGRADE_PANEL_CLASS}__card-head">
          <span class="${UPGRADE_PANEL_CLASS}__card-target">→ ${target} W/TH</span>
          ${optimal ? `<span class="${UPGRADE_PANEL_CLASS}__card-optimal">Déjà optimal</span>` : ''}
        </div>
        <div class="${UPGRADE_PANEL_CLASS}__card-cost">
          <span class="${UPGRADE_PANEL_CLASS}__card-label">Coût upgrade</span>
          <span class="${UPGRADE_PANEL_CLASS}__card-value">${fmt(cost)}</span>
        </div>
        ${priceUsd ? `
        <div class="${UPGRADE_PANEL_CLASS}__card-row">
          <span>Prix total</span><span>${fmt(total)}</span>
        </div>
        <div class="${UPGRADE_PANEL_CLASS}__card-row ${UPGRADE_PANEL_CLASS}__card-row--highlight">
          <span>$/TH upgradé</span><span>${fmt(pTh)}</span>
        </div>` : ''}
      </div>`;

    const quickCards = `
      <div class="${UPGRADE_PANEL_CLASS}__quick">
        ${card(TARGET_EFFICIENCY_15, costTo15, totalTo15, pThTo15, isOptimal15)}
        ${card(TARGET_EFFICIENCY_12, costTo12, totalTo12, pThTo12, isOptimal12)}
      </div>`;

    const calculator = `
      <div class="${UPGRADE_PANEL_CLASS}__calc">
        <div class="${UPGRADE_PANEL_CLASS}__calc-title">Calculateur upgrade complet</div>
        <div class="${UPGRADE_PANEL_CLASS}__calc-grid">
          <div class="${UPGRADE_PANEL_CLASS}__field">
            <label class="${UPGRADE_PANEL_CLASS}__label" for="gm-efficiency">Efficience cible (W/TH)</label>
            <select class="${UPGRADE_PANEL_CLASS}__select" id="gm-efficiency">
              ${buildEfficiencyOptions(wth, Math.min(TARGET_EFFICIENCY_15, Math.floor(wth)))}
            </select>
          </div>
          <div class="${UPGRADE_PANEL_CLASS}__field">
            <label class="${UPGRADE_PANEL_CLASS}__label" for="gm-power">Puissance (TH)</label>
            <input class="${UPGRADE_PANEL_CLASS}__input" id="gm-power" type="number" min="0" step="0.01" value="${th}">
          </div>
        </div>
        <div class="${UPGRADE_PANEL_CLASS}__calc-result">
          <div class="${UPGRADE_PANEL_CLASS}__row">
            <span>Coût upgrade</span><span class="${UPGRADE_PANEL_CLASS}__row-value" data-gm-cost>—</span>
          </div>
          <div class="${UPGRADE_PANEL_CLASS}__row">
            <span>Coût / TH</span><span class="${UPGRADE_PANEL_CLASS}__row-value" data-gm-cost-pth>—</span>
          </div>
          ${priceUsd ? `
          <div class="${UPGRADE_PANEL_CLASS}__row">
            <span>Prix total upgradé</span><span class="${UPGRADE_PANEL_CLASS}__row-value" data-gm-total>—</span>
          </div>
          <div class="${UPGRADE_PANEL_CLASS}__row ${UPGRADE_PANEL_CLASS}__row--highlight">
            <span>$/TH upgradé</span><span class="${UPGRADE_PANEL_CLASS}__row-value" data-gm-pth-upgraded>—</span>
          </div>` : ''}
        </div>
        <div class="${UPGRADE_PANEL_CLASS}__strategies" data-gm-strategies></div>
      </div>`;

    return `
      <div class="${UPGRADE_PANEL_CLASS}" data-gm-upgrade-panel>
        <div class="${UPGRADE_PANEL_CLASS}__header">
          <span class="${UPGRADE_PANEL_CLASS}__title">⚡ GoMining Companion — Upgrade</span>
          <span class="${UPGRADE_PANEL_CLASS}__subtitle">${th} TH • ${wth} W/TH</span>
        </div>
        ${quickCards}
        ${calculator}
        ${buildYieldSimHtml(data, reward)}
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
      <div class="${UPGRADE_PANEL_CLASS}__strategies-title">Stratégies d'upgrade</div>
      <div class="${UPGRADE_PANEL_CLASS}__strategies-grid">
        ${buildStrategyCard('① Eff. → Power', strategies.strategy1, strategies.cost === strategies.strategy1.total, true)}
        ${buildStrategyCard('② Power → Eff.', strategies.strategy2, strategies.cost === strategies.strategy2.total, false)}
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
          <span>Efficience</span><span class="${UPGRADE_PANEL_CLASS}__row-value">${fmt(strategy.effCost)}</span>
        </div>
        <div class="${UPGRADE_PANEL_CLASS}__strategy-row">
          <span>Puissance</span><span class="${UPGRADE_PANEL_CLASS}__row-value">${fmt(strategy.powerCost)}</span>
        </div>`
      : `<div class="${UPGRADE_PANEL_CLASS}__strategy-row">
          <span>Puissance</span><span class="${UPGRADE_PANEL_CLASS}__row-value">${fmt(strategy.powerCost)}</span>
        </div>
        <div class="${UPGRADE_PANEL_CLASS}__strategy-row">
          <span>Efficience</span><span class="${UPGRADE_PANEL_CLASS}__row-value">${fmt(strategy.effCost)}</span>
        </div>`;

    return `
      <div class="${UPGRADE_PANEL_CLASS}__strategy ${recommended ? `${UPGRADE_PANEL_CLASS}__strategy--recommended` : ''}">
        <div class="${UPGRADE_PANEL_CLASS}__strategy-head">
          <span>${label}</span>
          ${recommended ? `<span class="${UPGRADE_PANEL_CLASS}__strategy-badge">Recommandée</span>` : ''}
        </div>
        <div class="${UPGRADE_PANEL_CLASS}__strategy-body">
          ${rows}
          <div class="${UPGRADE_PANEL_CLASS}__strategy-row ${UPGRADE_PANEL_CLASS}__strategy-total">
            <span>Total</span><span class="${UPGRADE_PANEL_CLASS}__row-value">${fmt(strategy.total)}</span>
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
        ${row('Revenu brut / jour', `${prefix}-gross-d`)}
        ${row('Électricité / jour', `${prefix}-elec-d`, false, true)}
        ${row('Service / jour', `${prefix}-serv-d`, false, true)}
        ${row('Maintenance / jour', `${prefix}-maint-d`, false, true)}
        ${row('Net / jour', `${prefix}-net-d`, true)}
        ${row('Net / mois', `${prefix}-net-m`)}
        ${row('Net / an', `${prefix}-net-y`, true)}
        ${row('ROI annuel', `${prefix}-roi`)}
        ${row('Récupération', `${prefix}-payback`)}
      </div>`;

    return `
      <div class="${YIELD_SIM_CLASS}" data-gm-yield-sim>
        <div class="${YIELD_SIM_CLASS}__header">
          <span class="${YIELD_SIM_CLASS}__title">📈 Simulateur de rendement</span>
          <span class="${YIELD_SIM_CLASS}__subtitle">${th} TH → ${wth} W/TH</span>
        </div>
        <div class="${YIELD_SIM_CLASS}__params">
          ${field('btc', `Prix BTC ($) <span class="${YIELD_SIM_CLASS}__live" data-gm-sim-live-btc></span>`, btcPrice, '1')}
          ${field('sats', 'Rendement (sats/TH/j)', satsPerThDay.toFixed(1), '0.1')}
          ${field('kwh', 'Coût kWh ($)', kwh.toFixed(4), '0.0001')}
          ${field('discount', 'Remise maint. (%)', 0, '0.5')}
        </div>
        <div class="${YIELD_SIM_CLASS}__currency">
          <span class="${YIELD_SIM_CLASS}__label">Maintenance en</span>
          <div class="${YIELD_SIM_CLASS}__tabs">
            <button type="button" class="${YIELD_SIM_CLASS}__tab active" data-gm-sim-currency="GMT">GOMINING</button>
            <button type="button" class="${YIELD_SIM_CLASS}__tab" data-gm-sim-currency="BTC">BTC</button>
          </div>
          <span class="${YIELD_SIM_CLASS}__live" data-gm-sim-live-gmt></span>
        </div>
        <div class="${YIELD_SIM_CLASS}__compare">
          ${col('Actuel', 'cur')}
          ${col('Après upgrade', 'tgt', true)}
        </div>
        <div class="${YIELD_SIM_CLASS}__delta">
          <span>Gain net après upgrade</span>
          <span class="${YIELD_SIM_CLASS}__row-value ${YIELD_SIM_CLASS}__delta-value" data-gm-sim-value="delta-net">—</span>
        </div>
        <div class="${YIELD_SIM_CLASS}__note">
          Formules GoMining : brut = sats/TH/j × TH × BTC ; électricité = kWh × 24 × W/TH × TH ÷ 1000 ;
          service = $0.0089/TH/j. ROI et délai basés sur le prix + coût d'upgrade.
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
      return days < 90 ? `${Math.round(days)} j` : `${(days / DAYS_PER_MONTH).toFixed(1)} mois`;
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
      deltaEl.textContent = `${delta >= 0 ? '+' : '−'}${fmt(Math.abs(delta))} / j`;
      deltaEl.classList.toggle(`${YIELD_SIM_CLASS}__delta-value--negative`, delta < 0);
    }
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
      btcEl.textContent = btc ? `(actuel : ${fmt(btc)})` : '';
      btcEl.classList.toggle(`${YIELD_SIM_CLASS}__live--clickable`, btc !== null);
      if (btc !== null) {
        btcEl.setAttribute('role', 'button');
        btcEl.setAttribute('tabindex', '0');
        btcEl.title = 'Cliquer pour utiliser ce prix';
      } else {
        btcEl.removeAttribute('role');
        btcEl.removeAttribute('tabindex');
        btcEl.title = '';
      }
    }

    const gmtEl = sim.querySelector('[data-gm-sim-live-gmt]');
    if (gmtEl) {
      const gmt = resolveGmtPrice(panel);
      gmtEl.textContent = `GOMINING : $${(gmt ?? DEFAULT_GMT_PRICE).toFixed(4)}`;
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
    panel.querySelectorAll('[data-gm-card-target]').forEach((cardEl) => {
      cardEl.addEventListener('click', () => {
        if (cardEl.classList.contains(`${UPGRADE_PANEL_CLASS}__card--disabled`)) return;
        const target = parseInt(cardEl.dataset.gmCardTarget, 10);
        if (!effSelect) return;
        effSelect.value = String(target);
        updateCalculator(panel, data);
        const calcEl = panel.querySelector('.gm-upgrade-panel__calc');
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