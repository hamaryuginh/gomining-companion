/**
 * Module : capture des coûts d'upgrade par palier via les appels de quote
 * (installment-api.gomining.com/api/v2/payment/quote). Activé depuis la
 * popup (section « Upgrade listener »). Le hook lui-même est un content
 * script world: MAIN (content/hooks/quote-listener-hook.js, non soumis à
 * la CSP de la page) ; ce module pilote son activation via window.postMessage
 * et agrège les paliers par efficience dans storage.local. À l'arrêt, le
 * tableau complet est affiché en console au format POWER_UPGRADE_COSTS et
 * les données restent stockées : elles sont prioritaires sur les valeurs
 * par défaut pour tous les calculs (voir common/power-costs.js).
 * Exposé sur `GM.upgradeListener`.
 */
(function () {
  'use strict';

  const GM = (globalThis.GM = globalThis.GM || {});
  const { api, log } = GM;
  const STORAGE_KEY = 'upgradeListener';
  const LISTENER_SOURCE = 'gm-companion-upgrade-listener';
  const CTL_SOURCE = 'gm-companion-upgrade-listener-ctl';

  function setActive(active) {
    window.postMessage({ source: CTL_SOURCE, active: !!active }, '*');
    log('Upgrade listener : ' + (active ? 'hook activé (monde principal)' : 'hook désactivé (monde principal)'));
  }

  async function addCapture(flow, quote) {
    let span = flow.toPower - flow.fromPower;
    if (span === 4999) span = 5000;
    const rate = quote.baseAmountInUsd / span;
    log('Upgrade listener : capture reçue', { from: flow.fromPower, to: flow.toPower, base: quote.baseAmountInUsd, span, rate });
    if (!isFinite(rate) || rate <= 0) {
      log('Upgrade listener : taux invalide, capture ignorée');
      return;
    }
    const stored = (await api.storage.local.get(STORAGE_KEY))[STORAGE_KEY] || {};
    if (!stored.active) {
      log('Upgrade listener : listener inactif, capture ignorée');
      return;
    }
    const eff = String(stored.eff || 15);
    const data = stored.data || {};
    const tiers = data[eff] || {};
    tiers[span] = Math.round(rate * 1e5) / 1e5;
    data[eff] = tiers;
    await api.storage.local.set({ [STORAGE_KEY]: { ...stored, data } });
    log(`Upgrade listener : palier ${span} → ${tiers[span]} $/TH (${eff} W/TH), total ${Object.keys(tiers).length} palier(s)`);
  }

  function formatTable(data) {
    const effs = Object.keys(data || {}).map(Number).sort((a, b) => a - b);
    if (!effs.length) return null;
    const blocks = effs.map((eff) => {
      const pairs = Object.entries(data[eff])
        .map(([to, rate]) => [Number(to), rate])
        .sort((a, b) => a[0] - b[0]);
      const lines = [];
      for (let i = 0; i < pairs.length; i += 7) {
        lines.push('      ' + pairs.slice(i, i + 7).map(([to, rate]) => `[${to}, ${rate}]`).join(', ') + ',');
      }
      return `    ${eff}: [\n${lines.join('\n')}\n    ],`;
    });
    return `{\n${blocks.join('\n')}\n}`;
  }

  window.addEventListener('message', (event) => {
    if (event.source !== window && event.source !== null) return;
    const msg = event.data;
    if (!msg || msg.source !== LISTENER_SOURCE) return;
    log('Upgrade listener : message du hook reçu', msg.payload);
    addCapture(msg.payload.flow, msg.payload.quote);
  });

  api.storage.onChanged.addListener(async (changes, area) => {
    if (area !== 'local' || !changes[STORAGE_KEY]) return;
    const next = changes[STORAGE_KEY].newValue;
    if (next && next.active) {
      log(`Upgrade listener : activation demandée (efficience ${next.eff})`);
      setActive(true);
    } else {
      log('Upgrade listener : arrêt demandé');
      setActive(false);
      const stored = (await api.storage.local.get(STORAGE_KEY))[STORAGE_KEY] || {};
      log('Upgrade listener : données stockées au moment de l\'arrêt', stored.data || {});
      const table = formatTable(stored.data);
      if (table) {
        console.log(table);
        log('Upgrade listener : tableau affiché en console (copiez-le dans config.js)');
      } else {
        log('Upgrade listener : aucune donnée capturée');
      }
      await api.storage.local.set({ [STORAGE_KEY]: { active: false, eff: stored.eff || 15, data: stored.data || {} } });
      log('Upgrade listener : arrêté, données conservées (prioritaires pour les calculs)');
    }
  });

  (async () => {
    const stored = (await api.storage.local.get(STORAGE_KEY))[STORAGE_KEY];
    log('Upgrade listener : module chargé, état du listener =', JSON.stringify(stored));
    if (stored && stored.active) setActive(true);
  })();

  GM.upgradeListener = { setActive, formatTable };
})();