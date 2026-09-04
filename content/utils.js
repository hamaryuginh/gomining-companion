/**
 * Utilitaires réutilisables du content script.
 * Exposés sur le namespace global partagé `GM` (même isolated world pour tous
 * les content scripts déclarés dans le manifest).
 */
(function () {
  'use strict';

  const GM = (globalThis.GM = globalThis.GM || {});

  /** API navigateur (Firefox `browser` / Chrome `chrome`) */
  GM.api = typeof browser !== 'undefined' ? browser : chrome;

  /** Log console préfixé */
  GM.log = (...args) => console.log('[GoMining Companion]', ...args);

  /**
   * Parse un nombre depuis une string (enlève $, virgules, espaces)
   * @param {string} str
   * @returns {number|null}
   */
  GM.parseNumber = (str) => {
    if (!str) return null;
    const cleaned = str.replace(/[^0-9.]/g, '');
    const num = parseFloat(cleaned);
    return isNaN(num) ? null : num;
  };

  /**
   * Formate un nombre en $ avec 2 décimales
   * @param {number|null} n
   * @returns {string}
   */
  GM.fmt = (n) => (n !== null ? `${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)}` : '—');

  /** Borne une valeur entre min et max */
  GM.clamp = (v, min, max) => Math.min(max, Math.max(min, v));
})();