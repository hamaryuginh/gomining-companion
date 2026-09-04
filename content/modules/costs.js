/**
 * Module business : coûts et stratégies d'upgrade des mineurs.
 * Exposé sur `GM.costs`.
 */
(function () {
  'use strict';

  const GM = (globalThis.GM = globalThis.GM || {});
  const { C, api, log } = GM;
  const { DEFAULT_UPGRADE_COSTS, POWER_UPGRADE_COSTS, POWER_TIERS, TARGET_EFFICIENCY_15 } = C;

  /**
   * Charge les coûts d'upgrade personnalisés depuis le stockage local.
   */
  async function loadUpgradeCosts() {
    try {
      const result = await api.storage.local.get('upgradeCosts');
      if (result.upgradeCosts) {
        GM.UPGRADE_COSTS = { ...DEFAULT_UPGRADE_COSTS, ...result.upgradeCosts };
        log('Coûts chargés depuis le stockage local');
      }
    } catch (e) {
      log('Impossible de charger les coûts, utilisation des valeurs par défaut:', e);
    }
  }

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
      const costPerTh = GM.UPGRADE_COSTS[wth];
      if (costPerTh === undefined) {
        log(`Coût d'upgrade inconnu pour ${wth} W/TH`);
        continue;
      }
      totalCostPerTh += costPerTh;
    }

    return totalCostPerTh * thCount;
  }

  /**
   * Taux marginal (amountPerTh) pour une efficience de référence donnée.
   * @param {number} refEff - Efficience de référence (12/15/20)
   * @param {number} powerTh - Puissance (TH)
   * @returns {number} coût par TH
   */
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

  GM.costs = {
    loadUpgradeCosts,
    computeUpgradeCost,
    powerRate,
    powerUpgradeCost,
    computeUpgradeStrategies,
  };
})();