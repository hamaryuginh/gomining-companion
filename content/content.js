/**
 * Point d'entrée du content script : détection de page, observation du DOM,
 * navigation SPA, listener popup et initialisation.
 * Dépend des modules chargés avant lui (voir l'ordre dans manifest.json).
 */
(function () {
  'use strict';

  const GM = (globalThis.GM = globalThis.GM || {});
  const { api, log } = GM;
  const { C } = GM;
  const { costs, rewards, marketplace, panel } = GM;
  const { MARKETPLACE_URL, MINER_DETAIL_URL_PATTERN } = C;

  // ─── Détection de page ───────────────────────────────────────────

  function isMinerDetailPage() {
    return MINER_DETAIL_URL_PATTERN.test(window.location.href);
  }

  function isMarketplacePage() {
    return window.location.href.startsWith(MARKETPLACE_URL);
  }

  // ─── Observation du DOM (SPA + chargement dynamique) ────────────

  let observerTimeout = null;

  function setupObserver() {
    const observer = new MutationObserver(() => {
      // Debounce : on attend que les mutations se stabilisent
      clearTimeout(observerTimeout);
      observerTimeout = setTimeout(() => {
        if (isMinerDetailPage()) {
          panel.processMinerDetail();
        } else if (isMarketplacePage()) {
          marketplace.processAllCards();
        }
      }, 300);
    });

    observer.observe(document.body, { childList: true, subtree: true });
    log('Observer démarré');
  }

  // ─── Détection de navigation SPA ────────────────────────────────

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
      await costs.loadUpgradeCosts();
      document.querySelectorAll('[data-gm-processed]').forEach((el) => {
        delete el.dataset.gmProcessed;
      });
      document.querySelectorAll('[data-gm-upgrade-panel]').forEach((el) => {
        el.remove();
      });
      marketplace.processAllCards();
      panel.processMinerDetail();
    }
  });

  // ─── Init ────────────────────────────────────────────────────────

  async function init() {
    log('Chargé sur', window.location.href);
    await costs.loadUpgradeCosts();
    rewards.injectLivePriceHook();
    setupObserver();
    watchNavigation();

    // Si l'interception n'a rien capté (appels déjà passés, CSP…),
    // on récupère les prix directement (utile uniquement sur la page détail).
    setTimeout(() => {
      if (isMinerDetailPage() && (!rewards.LIVE_PRICE.btc || !rewards.LIVE_PRICE.gmt)) {
        log('Prix live non captés via interception, récupération directe');
        rewards.fetchLivePrices();
      }
    }, 3000);

    // Traitement initial (les mutations ne déclenchent pas forcément au chargement)
    if (isMinerDetailPage()) {
      panel.processMinerDetail();
    } else if (isMarketplacePage()) {
      marketplace.processAllCards();
    }
  }

  init();
})();