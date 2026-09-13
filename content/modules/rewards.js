/**
 * Module business : rendement (récompenses) et prix live.
 * Formules officielles GoMining (docs.gomining.com) :
 *   Brut        = sats/TH/jour × TH × BTC price / 1e8
 *   Électricité = kWh × 24 × W/TH × TH / 1000   (kWh de 0.05 à 0.07 $)
 *   Service     = 0.0089 $/TH/jour
 *   Net         = Brut − Maintenance (élec + service, remises déduites)
 *   ROI annuel  = Net/an ÷ investissement total (prix + coût d'upgrade)
 * Exposé sur `GM.rewards`.
 */
(function () {
  'use strict';

  const GM = (globalThis.GM = globalThis.GM || {});
  const { C, log, clamp } = GM;
  const { DAYS_PER_MONTH, DAYS_PER_YEAR, SERVICE_FEE_PER_TH, DEFAULT_KWH, DEFAULT_GMT_PRICE, API_PRICE_URL, API_TOKEN_PRICE_URL } = C;

  /** État des prix live captés (interception des appels API GoMining) */
  const LIVE_PRICE = { btc: null, gmt: null, btcTs: 0, gmtTs: 0 };

  const livePriceListeners = [];

  /**
   * Enregistre une réponse de prix live et notifie les abonnés.
   * @param {string} type - 'btc' | 'gmt'
   * @param {Object|null} payload - réponse API brute
   */
  function handleLivePrice(type, payload) {
    if (!payload || payload.data === undefined || payload.data === null) return;
    if (type === 'btc' && typeof payload.data === 'number') {
      LIVE_PRICE.btc = payload.data;
      LIVE_PRICE.btcTs = Date.now();
    } else if (type === 'gmt' && payload.data && typeof payload.data.value === 'number') {
      LIVE_PRICE.gmt = payload.data.value;
      LIVE_PRICE.gmtTs = Date.now();
    } else {
      return;
    }
    log('Prix live reçu:', type, payload.data);
    livePriceListeners.forEach((fn) => fn(type, payload.data));
  }

  // Messages relayés par le hook du monde principal (content/hooks/live-price-hook.js)
  window.addEventListener('message', (event) => {
    if (event.source !== window && event.source !== null) return;
    const msg = event.data;
    if (!msg || msg.source !== 'gm-companion-live-price') return;
    handleLivePrice(msg.type, msg.payload);
  });

  /**
   * Récupère directement les prix BTC/GMT (fallback si le hook n'a rien capté).
   */
  async function fetchLivePrices() {
    try {
      const [btcRes, gmtRes] = await Promise.all([
        fetch(API_PRICE_URL).then((r) => r.json()).catch(() => null),
        fetch(API_TOKEN_PRICE_URL).then((r) => r.json()).catch(() => null),
      ]);
      handleLivePrice('btc', btcRes);
      handleLivePrice('gmt', gmtRes);
    } catch (e) {
      log('Impossible de récupérer les prix live:', e);
    }
  }

  /**
   * Prix GOMINING effectif : live capté → dérivé du calculateur → défaut.
   * @param {Element} panel - panneau ayant une référence `_gmReward`
   * @returns {number}
   */
  function resolveGmtPrice(panel) {
    if (LIVE_PRICE.gmt) return LIVE_PRICE.gmt;
    const reward = panel?._gmReward;
    if (reward?.gmtPrice) return reward.gmtPrice;
    return DEFAULT_GMT_PRICE;
  }

  /**
   * Calcule le rendement journalier/mensuel/annuel selon les formules GoMining.
   * @param {Object} params
   * @param {number} params.th - Puissance (TH)
   * @param {number} params.wth - Efficience (W/TH)
   * @param {number} params.btcPrice - Prix BTC ($)
   * @param {number} params.satsPerThDay - Rendement réseau (sats/TH/jour)
   * @param {number} params.kwhCost - Coût de l'électricité ($/kWh)
   * @param {number} [params.discountPct=0] - Remise maintenance (%)
   * @returns {Object}
   */
  function computeYield({ th, wth, btcPrice, satsPerThDay, kwhCost, discountPct = 0 }) {
    discountPct = clamp(discountPct, 0, 100);
    const grossDaily = (satsPerThDay * th * btcPrice) / 1e8;
    const electricityDaily = (kwhCost * 24 * wth * th) / 1000;
    const serviceDaily = SERVICE_FEE_PER_TH * th;
    const maintenanceDaily = (electricityDaily + serviceDaily) * (1 - discountPct / 100);
    const netDaily = Math.max(0, grossDaily - maintenanceDaily);

    return {
      grossDaily,
      electricityDaily,
      serviceDaily,
      maintenanceDaily,
      netDaily,
      grossMonthly: grossDaily * DAYS_PER_MONTH,
      netMonthly: netDaily * DAYS_PER_MONTH,
      grossYearly: grossDaily * DAYS_PER_YEAR,
      netYearly: netDaily * DAYS_PER_YEAR,
    };
  }

  GM.rewards = {
    LIVE_PRICE,
    onLivePrice: (fn) => livePriceListeners.push(fn),
    fetchLivePrices,
    resolveGmtPrice,
    computeYield,
  };
})();