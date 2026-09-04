/**
 * Module business/UI : métriques d'upgrade affichées sur les cards du
 * marketplace (badge enrichi : coût d'upgrade, prix total upgradé, $/TH).
 * Exposé sur `GM.marketplace`.
 */
(function () {
  'use strict';

  const GM = (globalThis.GM = globalThis.GM || {});
  const { C, log, fmt } = GM;
  const { BADGE_CLASS, CARDS_CONTAINER_CLASS, TARGET_EFFICIENCY_15, TARGET_EFFICIENCY_12 } = C;
  const { computeUpgradeCost } = GM.costs;
  const { extractCardData } = GM.extract;

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

  /**
   * Traite une card : extraction, calcul puis injection du badge.
   * @param {Element} card
   */
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

  /**
   * Traite toutes les cards du marketplace.
   */
  function processAllCards() {
    const container = document.querySelector(`.${CARDS_CONTAINER_CLASS}`);
    if (!container) return;

    const cards = container.querySelectorAll('nft-card');
    if (cards.length === 0) return;

    console.groupCollapsed(`Traitement de ${cards.length} card(s)`);
    cards.forEach(processCard);
    console.groupEnd();
  }

  GM.marketplace = {
    computeMetrics,
    injectMetrics,
    processCard,
    processAllCards,
  };
})();