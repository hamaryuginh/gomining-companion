/**
 * Constantes & données de configuration du content script.
 * Exposées sur `GM.C` ; l'état mutable des coûts sur `GM.UPGRADE_COSTS`.
 */
(function () {
  'use strict';

  const GM = (globalThis.GM = globalThis.GM || {});

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

  GM.C = {
    // ─── Pages & sélecteurs DOM ─────────────────────────────────────
    MARKETPLACE_URL: 'https://app.gomining.com/marketplace',
    CARDS_CONTAINER_CLASS: 'catalog-index__cards-row',
    BADGE_CLASS: 'gm-helper-badge',
    MINER_DETAIL_URL_PATTERN: /^https:\/\/app\.gomining\.com\/nft\/view\//,
    UPGRADE_PANEL_CLASS: 'gm-upgrade-panel',
    DETAIL_DESC_CLASS: 'catalog-item__description--last',

    // ─── Cibles d'upgrade ───────────────────────────────────────────
    TARGET_EFFICIENCY_15: 15,
    TARGET_EFFICIENCY_12: 12,

    // ─── Coûts d'upgrade ────────────────────────────────────────────
    DEFAULT_UPGRADE_COSTS,
    POWER_UPGRADE_COSTS,
    POWER_REF_EFFS,
    POWER_TIERS,

    // ─── Simulateur de rendement ────────────────────────────────────
    YIELD_SIM_CLASS: 'gm-yield-sim',
    SERVICE_FEE_PER_TH: 0.0089,   // $/TH/jour (tarif de service officiel)
    DAYS_PER_MONTH: 30,
    DAYS_PER_YEAR: 365,
    DEFAULT_KWH: 0.05,
    DEFAULT_GMT_PRICE: 0.34,

    // ─── Simulateur Greedy Machines ─────────────────────────────────
    GREEDY_SIM_CLASS: 'gm-greedy-sim',
    GREEDY_NAME_PATTERN: /greedy machines/i,
    GREEDY_DEFAULT_RATE: 0.4,     // % / semaine (résultats des votes veGOMINING)
    GREEDY_DEFAULT_DURATION: 12,  // en semaines
    GREEDY_MAX_ROWS: 60,
    GREEDY_DEFAULT_TH_PRICE: 15,  // $/TH pour le réinvestissement (défaut)
    GREEDY_MAX_SIM_DAYS: 36500,   // 100 ans : au-delà, pas hebdomadaires

    // ─── Endpoints de prix live ─────────────────────────────────────
    API_PRICE_URL: 'https://api.gomining.com/api/exchanges/getPrice?symbol=BTC&value=1',
    API_TOKEN_PRICE_URL: 'https://api.gomining.com/api/exchanges/getTokenPrice',
  };

  /** Coûts d'upgrade effectifs (chargés depuis le stockage, modifiables) */
  GM.UPGRADE_COSTS = { ...DEFAULT_UPGRADE_COSTS };
})();