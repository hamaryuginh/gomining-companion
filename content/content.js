(function () {
  'use strict';

  const MARKETPLACE_URL = 'https://app.gomining.com/marketplace';
  const CARDS_CONTAINER_CLASS = 'catalog-index__cards-row';
  const BADGE_CLASS = 'gm-helper-badge';

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

  const TARGET_EFFICIENCY = 15; // W/TH cible

  const log = (...args) => console.log('[GoMining Companion]', ...args);

  // ─── Calcul du coût total d'upgrade vers 15 W/TH ────────────────

  /**
   * Calcule le coût total en $ pour upgrader de `fromWth` jusqu'à 15 W/TH
   * @param {number} fromWth - Efficience actuelle (ex: 18)
   * @param {number} thCount - Nombre de TH du mineur
   * @returns {number} Coût total en $
   */
  function computeUpgradeCost(fromWth, thCount) {
    if (fromWth <= TARGET_EFFICIENCY) return 0;

    // Arrondi supérieur
    fromWth = Math.ceil(fromWth);

    let totalCostPerTh = 0;
    for (let wth = fromWth; wth > TARGET_EFFICIENCY; wth--) {
      const costPerTh = UPGRADE_COSTS[wth];
      if (costPerTh === undefined) {
        log(`Coût d'upgrade inconnu pour ${wth} W/TH`);
        continue;
      }
      totalCostPerTh += costPerTh;
    }

    return totalCostPerTh * thCount;
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

    const alreadyOptimal = wth <= TARGET_EFFICIENCY;
    const upgradeCost = alreadyOptimal ? 0 : computeUpgradeCost(wth, th);
    const totalPriceUpgraded = priceUsd + upgradeCost;
    const pricePerThUpgraded = totalPriceUpgraded / th;

    return {
      alreadyOptimal,
      upgradeCost,
      totalPriceUpgraded,
      pricePerThUpgraded,
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
    // Supprime un éventuel badge précédent (ex: re-rendu SPA)
    card.querySelector(`.${BADGE_CLASS}`)?.remove();

    const { th, wth, priceUsd, priceUsdPTh } = data;
    const { alreadyOptimal, upgradeCost, totalPriceUpgraded, pricePerThUpgraded } = metrics;

    const footer = card.querySelector('.catalog-item-card__footer');
    if (!footer) return;

    const footerContent = card.querySelector('.catalog-item-card__footer-content')
    if (!footerContent) return;

    const badge = document.createElement('div');
    badge.className = BADGE_CLASS;

    if (alreadyOptimal) {
      // Déjà à 15 W/TH ou mieux → on affiche juste une confirmation
      badge.innerHTML = `
        <div class="${BADGE_CLASS}__row ${BADGE_CLASS}__optimal">
          <span>✅ Déjà optimal (${wth} W/TH)</span>
          <span class="${BADGE_CLASS}__value">${fmt(priceUsdPTh)} / TH</span>
        </div>
      `;
    } else {
      badge.innerHTML = `
        <div class="${BADGE_CLASS}__title">⚡ Après upgrade → ${TARGET_EFFICIENCY} W/TH</div>
        <div class="${BADGE_CLASS}__row">
          <span class="${BADGE_CLASS}__label">Coût upgrade</span>
          <span class="${BADGE_CLASS}__value">${fmt(upgradeCost)}</span>
        </div>
        <div class="${BADGE_CLASS}__row">
          <span class="${BADGE_CLASS}__label">Prix total</span>
          <span class="${BADGE_CLASS}__value">${fmt(totalPriceUpgraded)}</span>
        </div>
        <div class="${BADGE_CLASS}__row ${BADGE_CLASS}__highlight">
          <span class="${BADGE_CLASS}__label">$/TH upgradé</span>
          <span class="${BADGE_CLASS}__value">${fmt(pricePerThUpgraded)}</span>
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

  // ─── Observation du DOM (SPA + chargement dynamique) ────────────

  let observerTimeout = null;

  function setupObserver() {
    const observer = new MutationObserver(() => {
      // Debounce : on attend que les mutations se stabilisent
      clearTimeout(observerTimeout);
      observerTimeout = setTimeout(() => {
        if (isMarketplacePage()) {
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
      processAllCards();
    }
  });

  // ─── Init ────────────────────────────────────────────────────────

  async function init() {
    log('Chargé sur', window.location.href);
    await loadUpgradeCosts();
    setupObserver();
    watchNavigation();
  }

  init();
})();
