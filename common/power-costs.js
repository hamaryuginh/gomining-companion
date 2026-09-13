/**
 * Helper : coûts d'upgrade de puissance effectifs, en donnant la priorité
 * aux données capturées par l'upgrade listener (storage.local, clé
 * "upgradeListener") sur les valeurs par défaut des tables JS. Pour chaque
 * efficience de référence (12/15/20), les paliers capturés remplacent les
 * défauts ; les paliers non capturés retombent sur les valeurs par défaut.
 * Exposé sur `globalThis.PowerCosts`.
 */
(function () {
  'use strict';

  const api = typeof browser !== 'undefined' ? browser : chrome;
  const STORAGE_KEY = 'upgradeListener';
  const REF_EFFS = [12, 15, 20];

  function mergeCaptured(defaultTable, capturedData) {
    const table = {};
    const captured = {};
    for (const eff of REF_EFFS) {
      const defaults = defaultTable[eff] || [];
      const tiers = (capturedData || {})[String(eff)] || {};
      const merged = new Map(defaults.map(([to, rate]) => [to, rate]));
      const capturedTiers = [];
      for (const [to, rate] of Object.entries(tiers)) {
        const toNum = Number(to);
        const rateNum = Number(rate);
        merged.set(toNum, rateNum);
        capturedTiers.push([toNum, rateNum]);
      }
      table[eff] = [...merged.entries()].sort((a, b) => a[0] - b[0]);
      captured[eff] = capturedTiers.sort((a, b) => a[0] - b[0]);
    }
    return { table, captured };
  }

  async function loadEffective(defaultTable) {
    let capturedData = null;
    try {
      const stored = (await api.storage.local.get(STORAGE_KEY))[STORAGE_KEY];
      capturedData = stored && stored.data;
    } catch (e) {
      capturedData = null;
    }
    return mergeCaptured(defaultTable, capturedData);
  }

  globalThis.PowerCosts = { mergeCaptured, loadEffective, STORAGE_KEY };
})();