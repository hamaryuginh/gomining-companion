(function () {
  'use strict';

  const MARKETPLACE_URL = 'https://app.gomining.com/marketplace';
  const CARDS_CONTAINER_CLASS = 'catalog-index__cards-row';
  const BADGE_CLASS = 'gm-helper-badge';
  const MINER_DETAIL_URL_PATTERN = /^https:\/\/app\.gomining\.com\/nft\/view\//;
  const UPGRADE_PANEL_CLASS = 'gm-upgrade-panel';
  const DETAIL_DESC_CLASS = 'catalog-item__description--last';

  // ─── Table des coûts d'upgrade (W/TH source → coût par TH en $) ─
  const DEFAULT_UPGRADE_COSTS = {
    13: 2.67,
    14: 2.67,
    15: 2.67,
    16: 1.10,
    17: 1.10,
    18: 1.10,
    19: 1.10,
    20: 1.10,
    21: 1.00,
    22: 1.00,
    23: 1.00,
    24: 1.00,
    25: 1.00,
    26: 1.00,
    27: 1.00,
    28: 1.00,
    29: 0.50,
    30: 0.50,
    31: 0.50,
    32: 0.50,
    33: 0.50,
    34: 0.50,
    35: 0.50,
    36: 0.10,
    37: 0.10,
    38: 0.10,
    39: 0.10,
    40: 0.10,
    41: 0.10,
    42: 0.10,
    43: 0.10,
    44: 0.10,
    45: 0.10,
    46: 0.10,
    47: 0.10,
    48: 0.10,
    49: 0.10,
    50: 0.10,
  };

  let UPGRADE_COSTS = { ...DEFAULT_UPGRADE_COSTS };

  // ─── Coûts d'upgrade de puissance par efficience (paliers) ─────
  // amountPerTh = coût marginal par TH dans le palier (prevTo, to]
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
  const POWER_REF_EFFS = [12, 15, 20];

  // Paliers fusionnés (union de tous les `to`) pour l'intégration
  const POWER_TIERS = [...new Set(
    POWER_REF_EFFS.flatMap((e) => POWER_UPGRADE_COSTS[e].map(([to]) => to))
  )].sort((a, b) => a - b);

  const api = typeof browser !== 'undefined' ? browser : chrome;

  async function loadUpgradeCosts() {
    try {
      const result = await api.storage.local.get('upgradeCosts');
      if (result.upgradeCosts) {
        UPGRADE_COSTS = { ...DEFAULT_UPGRADE_COSTS, ...result.upgradeCosts };
        log('Coûts chargés depuis le stockage local');
      }
    } catch (e) {
      log('Impossible de charger les coûts, utilisation des valeurs par défaut:', e);
    }
  }

  const TARGET_EFFICIENCY_15 = 15;
  const TARGET_EFFICIENCY_12 = 12;

  const log = (...args) => console.log('[GoMining Companion]', ...args);

  // ─── Calcul du coût total d'upgrade ────────────────────────────

  /**
   * Calcule le coût total en $ pour upgrader de `fromWth` jusqu'à la cible
   * @param {number} fromWth - Efficience actuelle
   * @param {number} thCount - Nombre de TH du mineur
   * @param {number} target - Efficience cible (défaut: 15)
   * @returns {number} Coût total en $
   */
  function computeUpgradeCost(fromWth, thCount, target = TARGET_EFFICIENCY_15) {
    if (fromWth <= target) return 0;

    fromWth = Math.ceil(fromWth);

    let totalCostPerTh = 0;
    for (let wth = fromWth; wth > target; wth--) {
      const costPerTh = UPGRADE_COSTS[wth];
      if (costPerTh === undefined) {
        log(`Coût d'upgrade inconnu pour ${wth} W/TH`);
        continue;
      }
      totalCostPerTh += costPerTh;
    }

    return totalCostPerTh * thCount;
  }

  // ─── Coût d'upgrade de puissance ────────────────────────────────

  /**
   * Taux marginal (amountPerTh) pour une efficience et une puissance données.
   * Interpole linéairement entre les 3 efficiencies de référence (12/15/20).
   * @param {number} eff - Efficience (W/TH)
   * @param {number} powerTh - Puissance (TH)
   * @returns {number} coût par TH
   */
  function powerRate(eff, powerTh) {
    if (eff <= 12) return rateInRef(12, powerTh);
    if (eff >= 20) return rateInRef(20, powerTh);

    if (eff <= 15) {
      const t = (eff - 12) / 3;
      return rateInRef(12, powerTh) * (1 - t) + rateInRef(15, powerTh) * t;
    }
    const t = (eff - 15) / 5;
    return rateInRef(15, powerTh) * (1 - t) + rateInRef(20, powerTh) * t;
  }

  function rateInRef(refEff, powerTh) {
    const steps = POWER_UPGRADE_COSTS[refEff];
    let rate = 0;
    for (const [to, amountPerTh] of steps) {
      if (powerTh <= to) {
        rate = amountPerTh;
        break;
      }
      rate = amountPerTh; // au-delà du dernier palier, on garde le dernier taux
    }
    return rate;
  }

  /**
   * Coût total pour passer de `fromTh` à `toTh` TH à une efficience donnée.
   * Intègre le taux marginal par palier.
   * @param {number} eff - Efficience (W/TH)
   * @param {number} fromTh - Puissance actuelle (TH)
   * @param {number} toTh - Puissance cible (TH)
   * @returns {number} coût total en $
   */
  function powerUpgradeCost(eff, fromTh, toTh) {
    if (toTh <= fromTh) return 0;

    let total = 0;
    let prev = fromTh;
    for (const tier of POWER_TIERS) {
      if (tier <= fromTh) continue;
      if (tier >= toTh) {
        total += (toTh - prev) * powerRate(eff, toTh);
        prev = toTh;
        break;
      }
      total += (tier - prev) * powerRate(eff, tier);
      prev = tier;
    }
    if (prev < toTh) {
      total += (toTh - prev) * powerRate(eff, toTh);
    }
    return total;
  }

  /**
   * Calcule les deux stratégies d'upgrade (efficience↔puissance).
   * @param {Object} data - données du mineur
   * @param {number} targetEff - efficience cible (W/TH)
   * @param {number} targetTh - puissance cible (TH)
   * @returns {Object}
   */
  function computeUpgradeStrategies(data, targetEff, targetTh) {
    const currentTh = data.th;
    const currentWth = data.wth;

    const effNeeded = targetEff < currentWth;
    const powerNeeded = targetTh > currentTh;

    if (!effNeeded && !powerNeeded) {
      return { cost: 0, effCost: 0, powerCost: 0, strategy1: null, strategy2: null, both: false };
    }

    // Stratégie 1 : efficience d'abord, puis puissance
    const effCost1 = computeUpgradeCost(currentWth, currentTh, targetEff);
    const powerCost1 = powerNeeded ? powerUpgradeCost(targetEff, currentTh, targetTh) : 0;
    const total1 = effCost1 + powerCost1;

    // Stratégie 2 : puissance d'abord, puis efficience
    const powerCost2 = powerNeeded ? powerUpgradeCost(currentWth, currentTh, targetTh) : 0;
    const effTh2 = Math.max(targetTh, currentTh); // efficience appliquée après power
    const effCost2 = computeUpgradeCost(currentWth, effTh2, targetEff);
    const total2 = powerCost2 + effCost2;

    const both = effNeeded && powerNeeded;
    return {
      effNeeded,
      powerNeeded,
      both,
      strategy1: { effCost: effCost1, powerCost: powerCost1, total: total1 },
      strategy2: { effCost: effCost2, powerCost: powerCost2, total: total2 },
      cost: both ? Math.min(total1, total2) : (effNeeded ? total1 : total2),
    };
  }

  // ─── Extraction des données d'une card ──────────────────────────

  /**
   * Parse un nombre depuis une string (enlève $, virgules, espaces)
   * @param {string} str
   * @returns {number|null}
   */
  function parseNumber(str) {
    if (!str) return null;
    const cleaned = str.replace(/[^0-9.]/g, '');
    const num = parseFloat(cleaned);
    return isNaN(num) ? null : num;
  }

  /**
   * Extrait les données brutes d'une card
   * @param {Element} card
   * @returns {Object|null}
   */
  function extractCardData(card) {
    try {
      // ── Labels (TH + W/TH) ──────────────────────────────────────
      // Les deux premiers nft-label contiennent le hashrate et l'efficience
      const labels = card.querySelectorAll('.nft-label');

      let thRaw = null;
      let wthRaw = null;

      labels.forEach((label) => {
        const text = label.textContent.trim();
        if (text.includes('TH') && !text.includes('W/TH')) {
          thRaw = text;
        } else if (text.includes('W/TH')) {
          wthRaw = text;
        }
      });

      const th = parseNumber(thRaw);   // ex: 64
      const wth = parseNumber(wthRaw);  // ex: 15

      // ── ROI ─────────────────────────────────────────────────────
      const roiEl = card.querySelector('[title^="ROI"]');
      const roiRaw = roiEl?.textContent ?? null;
      // extrait le % numérique depuis "ROI 45.24%"
      const roiMatch = roiRaw?.match(/([\d.]+)\s*%/);
      const roi = roiMatch ? parseFloat(roiMatch[1]) : null;

      // ── Prix GMT ─────────────────────────────────────────────────
      // "2,397.29" dans le span après l'icône GMT
      const gmtPriceEl = card.querySelector('icon-gmt + span, .icon-gmt ~ span');
      // fallback : on cherche dans nft-card-price le premier span avec chiffres+virgule
      const nftCardPrice = card.querySelector('nft-card-price');
      let gmtPrice = null;
      if (nftCardPrice) {
        const spans = nftCardPrice.querySelectorAll('span');
        for (const span of spans) {
          const t = span.textContent.trim();
          // le prix GMT ressemble à "2,397.29" (contient une virgule ou un point, pas de $)
          if (/^[\d,]+\.?\d*$/.test(t) && t.length > 3) {
            gmtPrice = parseNumber(t);
            break;
          }
        }
      }

      // ── Prix $ et $/TH ───────────────────────────────────────────
      // Le bloc "$725.66 • $11.34 / TH" est dans un span.small
      let priceUsd = null;
      let priceUsdPTh = null;

      if (nftCardPrice) {
        const smallSpan = nftCardPrice.querySelector('span.small, span.text-grey.small');
        if (smallSpan) {
          const innerSpans = smallSpan.querySelectorAll('span');
          innerSpans.forEach((s) => {
            const t = s.textContent.trim();
            if (t.startsWith('$') && t.includes('/ TH')) {
              priceUsdPTh = parseNumber(t); // "$11.34 / TH" → 11.34
            } else if (t.startsWith('$') && !t.includes('TH')) {
              priceUsd = parseNumber(t);    // "$725.66" → 725.66
            }
          });
        }
      }

      return { th, wth, roi, gmtPrice, priceUsd, priceUsdPTh };

    } catch (e) {
      log('Erreur extraction card:', e);
      return null;
    }
  }

  // ─── Calcul des métriques enrichies ─────────────────────────────

  /**
   * @param {Object} data - données brutes extraites
   * @returns {Object} métriques calculées
   */
  function computeMetrics(data) {
    const { th, wth, priceUsd } = data;

    if (!th || !wth || !priceUsd) {
      return { upgradeCost: null, totalPriceUpgraded: null, pricePerThUpgraded: null };
    }

    const isOptimal = wth <= TARGET_EFFICIENCY_12;
    const isPartiallyOptimal = !isOptimal && wth <= TARGET_EFFICIENCY_15;

    const upgradeCostTo15 = (isOptimal || isPartiallyOptimal) ? 0 : computeUpgradeCost(wth, th, TARGET_EFFICIENCY_15);
    const upgradeCostTo12 = isOptimal ? 0 : computeUpgradeCost(wth, th, TARGET_EFFICIENCY_12);

    const totalPriceUpgradedTo15 = priceUsd + upgradeCostTo15;
    const totalPriceUpgradedTo12 = priceUsd + upgradeCostTo12;
    const pricePerThUpgradedTo15 = totalPriceUpgradedTo15 / th;
    const pricePerThUpgradedTo12 = totalPriceUpgradedTo12 / th;

    return {
      isOptimal,
      isPartiallyOptimal,
      upgradeCostTo15,
      upgradeCostTo12,
      totalPriceUpgradedTo15,
      totalPriceUpgradedTo12,
      pricePerThUpgradedTo15,
      pricePerThUpgradedTo12,
    };
  }

  // ─── Injection dans le DOM ───────────────────────────────────────

  /**
   * Formate un nombre en $ avec 2 décimales
   */
  const fmt = (n) => (n !== null ? `${new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n)}` : '—');

  /**
   * Injecte le badge d'infos calculées dans le footer de la card
   * @param {Element} card
   * @param {Object} data     - données brutes
   * @param {Object} metrics  - métriques calculées
   */
  function injectMetrics(card, data, metrics) {
    card.querySelector(`.${BADGE_CLASS}`)?.remove();

    const { th, wth, priceUsd, priceUsdPTh } = data;
    const { isOptimal, isPartiallyOptimal, upgradeCostTo15, upgradeCostTo12, totalPriceUpgradedTo15, totalPriceUpgradedTo12, pricePerThUpgradedTo15, pricePerThUpgradedTo12 } = metrics;

    const footer = card.querySelector('.catalog-item-card__footer');
    if (!footer) return;

    const footerContent = card.querySelector('.catalog-item-card__footer-content')
    if (!footerContent) return;

    const badge = document.createElement('div');
    badge.className = BADGE_CLASS;

    if (isOptimal) {
      badge.innerHTML = `
        <div class="${BADGE_CLASS}__row ${BADGE_CLASS}__optimal">
          <span>✅ Déjà optimal (${wth} W/TH)</span>
          <span class="${BADGE_CLASS}__value">${fmt(priceUsdPTh)} / TH</span>
        </div>
      `;
    } else if (isPartiallyOptimal) {
      badge.innerHTML = `
        <div class="${BADGE_CLASS}__title">⚡ Après upgrade → ${TARGET_EFFICIENCY_12} W/TH (optimal)</div>
        <div class="${BADGE_CLASS}__row">
          <span class="${BADGE_CLASS}__label">Coût upgrade</span>
          <span class="${BADGE_CLASS}__value">${fmt(upgradeCostTo12)}</span>
        </div>
        <div class="${BADGE_CLASS}__row">
          <span class="${BADGE_CLASS}__label">Prix total</span>
          <span class="${BADGE_CLASS}__value">${fmt(totalPriceUpgradedTo12)}</span>
        </div>
        <div class="${BADGE_CLASS}__row ${BADGE_CLASS}__highlight">
          <span class="${BADGE_CLASS}__label">$/TH upgradé</span>
          <span class="${BADGE_CLASS}__value">${fmt(pricePerThUpgradedTo12)}</span>
        </div>
      `;
    } else {
      badge.innerHTML = `
        <div class="${BADGE_CLASS}__container">
          <div class="${BADGE_CLASS}__wrapper">
            <div class="${BADGE_CLASS}__title">⚡ Upgrade → ${TARGET_EFFICIENCY_15} W/TH</div>
            <div class="${BADGE_CLASS}__row">
              <span class="${BADGE_CLASS}__label">Coût upgrade</span>
              <span class="${BADGE_CLASS}__value">${fmt(upgradeCostTo15)}</span>
            </div>
            <div class="${BADGE_CLASS}__row">
              <span class="${BADGE_CLASS}__label">Prix total</span>
              <span class="${BADGE_CLASS}__value">${fmt(totalPriceUpgradedTo15)}</span>
            </div>
            <div class="${BADGE_CLASS}__row ${BADGE_CLASS}__highlight">
              <span class="${BADGE_CLASS}__label">$/TH upgradé</span>
              <span class="${BADGE_CLASS}__value">${fmt(pricePerThUpgradedTo15)}</span>
            </div>
          </div>
          <div class="${BADGE_CLASS}__separator"></div>
          <div class="${BADGE_CLASS}__wrapper">
            <div class="${BADGE_CLASS}__title">⚡ Upgrade → ${TARGET_EFFICIENCY_12} W/TH</div>
            <div class="${BADGE_CLASS}__row">
              <span class="${BADGE_CLASS}__label">Coût upgrade</span>
              <span class="${BADGE_CLASS}__value">${fmt(upgradeCostTo12)}</span>
            </div>
            <div class="${BADGE_CLASS}__row">
              <span class="${BADGE_CLASS}__label">Prix total</span>
              <span class="${BADGE_CLASS}__value">${fmt(totalPriceUpgradedTo12)}</span>
            </div>
            <div class="${BADGE_CLASS}__row ${BADGE_CLASS}__highlight">
              <span class="${BADGE_CLASS}__label">$/TH upgradé</span>
              <span class="${BADGE_CLASS}__value">${fmt(pricePerThUpgradedTo12)}</span>
            </div>
          </div>
        </div>
      `;
    }

    footerContent.insertAdjacentElement('afterend', badge);
  }

  // ─── Traitement des cards ────────────────────────────────────────

  function processCard(card) {
    if (card.dataset.gmProcessed === 'true') return;
    card.dataset.gmProcessed = 'true';

    const data = extractCardData(card);
    if (!data || data.th === null) {
      log('Données insuffisantes pour une card, skip.');
      return;
    }

    log('Card extraite:', data);

    const metrics = computeMetrics(data);
    log('Métriques calculées:', metrics);

    injectMetrics(card, data, metrics);
  }

  function processAllCards() {
    const container = document.querySelector(`.${CARDS_CONTAINER_CLASS}`);
    if (!container) return;

    const cards = container.querySelectorAll('nft-card');
    if (cards.length === 0) return;

    console.groupCollapsed(`Traitement de ${cards.length} card(s)`);
    cards.forEach(processCard);
    console.groupEnd();
  }

  // ─── Page détail d'un mineur NFT ─────────────────────────────────

  function isMinerDetailPage() {
    return MINER_DETAIL_URL_PATTERN.test(window.location.href);
  }

  /**
   * Extrait les données de la page détail (/nft/view/<id>)
   * @returns {Object|null}
   */
  function extractDetailData() {
    try {
      const featPower = document.querySelector('.catalog-item__feat .catalog-item__feat-name span.text-truncate');
      if (!featPower) return null;

      const feats = document.querySelectorAll('.catalog-item__feat');
      let th = null;
      let wth = null;

      feats.forEach((feat) => {
        const name = feat.querySelector('.catalog-item__feat-name span.text-truncate')?.textContent.trim();
        const value = feat.querySelector('.fw-medium.text-truncate')?.textContent.trim();
        if (name === 'Power') th = parseNumber(value);       // "151.06 TH" → 151.06
        else if (name === 'Efficiency') wth = parseNumber(value); // "27 W/TH" → 27
      });

      // ── Prix (GMT + USD + $/TH) ──────────────────────────────────
      const nftCardPrice = document.querySelector('nft-card-price');
      let gmtPrice = null;
      let priceUsd = null;
      let priceUsdPTh = null;
      if (nftCardPrice) {
        const lead = nftCardPrice.querySelector('.lead');
        if (lead) gmtPrice = parseNumber(lead.textContent); // "8,000.00"

        const small = nftCardPrice.querySelector('span.text-grey.small');
        if (small) {
          const innerSpans = small.querySelectorAll('span');
          innerSpans.forEach((s) => {
            const t = s.textContent.trim();
            if (t.startsWith('$') && t.includes('/ TH')) {
              priceUsdPTh = parseNumber(t); // "$18.19 / TH" → 18.19
            } else if (t.startsWith('$') && !t.includes('TH')) {
              priceUsd = parseNumber(t);    // "$2,747.20" → 2747.20
            }
          });
        }
      }

      return { th, wth, gmtPrice, priceUsd, priceUsdPTh };
    } catch (e) {
      log('Erreur extraction détail:', e);
      return null;
    }
  }

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
   * @returns {string}
   */
  function buildUpgradePanelHtml(data) {
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

  /**
   * Injecte le panneau d'upgrade sous .catalog-item__description--last
   * @param {Object} data
   */
  function injectUpgradePanel(data) {
    const container = document.querySelector(`.${DETAIL_DESC_CLASS}`);
    if (!container) return;

    const existing = container.nextElementSibling;
    if (existing?.hasAttribute('data-gm-upgrade-panel')) existing.remove();

    const wrapper = document.createElement('div');
    wrapper.innerHTML = buildUpgradePanelHtml(data);
    const panel = wrapper.firstElementChild;

    container.insertAdjacentElement('afterend', panel);

    const effSelect = panel.querySelector('#gm-efficiency');
    const powerInput = panel.querySelector('#gm-power');
    if (effSelect) {
      effSelect.addEventListener('change', () => updateCalculator(panel, data));
    }
    if (powerInput) {
      powerInput.addEventListener('input', () => updateCalculator(panel, data));
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
  }

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
    injectUpgradePanel(data);
  }

  // ─── Observation du DOM (SPA + chargement dynamique) ────────────

  let observerTimeout = null;

  function setupObserver() {
    const observer = new MutationObserver(() => {
      // Debounce : on attend que les mutations se stabilisent
      clearTimeout(observerTimeout);
      observerTimeout = setTimeout(() => {
        if (isMinerDetailPage()) {
          processMinerDetail();
        } else if (isMarketplacePage()) {
          processAllCards();
        }
      }, 300);
    });

    observer.observe(document.body, { childList: true, subtree: true });
    log('Observer démarré');
  }

  // ─── Détection de navigation SPA ────────────────────────────────

  function isMarketplacePage() {
    return window.location.href.startsWith(MARKETPLACE_URL);
  }

  let lastUrl = window.location.href;
  let navObserver = null;

  function watchNavigation() {
    if (navObserver) navObserver.disconnect();

    navObserver = new MutationObserver(() => {
      if (window.location.href !== lastUrl) {
        lastUrl = window.location.href;
        log('Navigation →', lastUrl);

        // Reset des cards déjà traitées lors d'un changement de page
        document.querySelectorAll('[data-gm-processed]').forEach((el) => {
          delete el.dataset.gmProcessed;
        });
        document.querySelectorAll('[data-gm-upgrade-panel]').forEach((el) => {
          el.remove();
        });
      }
    });
    navObserver.observe(document.body, { childList: true, subtree: true });
  }

  // ─── Message listener (depuis la popup) ──────────────────────────

  api.runtime.onMessage.addListener(async (msg) => {
    if (msg.action === 'recalculate') {
      log('Recalcul demandé par la popup');
      await loadUpgradeCosts();
      document.querySelectorAll('[data-gm-processed]').forEach((el) => {
        delete el.dataset.gmProcessed;
      });
      document.querySelectorAll('[data-gm-upgrade-panel]').forEach((el) => {
        el.remove();
      });
      processAllCards();
      processMinerDetail();
    }
  });

  // ─── Init ────────────────────────────────────────────────────────

  async function init() {
    log('Chargé sur', window.location.href);
    await loadUpgradeCosts();
    setupObserver();
    watchNavigation();

    // Traitement initial (les mutations ne déclenchent pas forcément au chargement)
    if (isMinerDetailPage()) {
      processMinerDetail();
    } else if (isMarketplacePage()) {
      processAllCards();
    }
  }

  init();
})();
