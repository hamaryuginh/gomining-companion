/**
 * Hook du monde principal (content script world: MAIN, run_at document_start).
 * Observe les appels fetch/XHR de l'application GoMining vers getPrice (BTC)
 * et getTokenPrice (GMT) et relaie les réponses au module rewards (monde
 * isolé) via window.postMessage. Toujours actif, exécuté avant l'app : non
 * soumis à la CSP de la page. Logs de debug avec le préfixe [GM-LivePrice]
 * dans la console de la page.
 *
 * Note : l'app annule ses requêtes (AbortController) ; on lit donc le corps
 * original puis on remplace la réponse par une Response reconstruite,
 * détachée du signal d'annulation, pour que l'app continue de fonctionner.
 */
(function () {
  'use strict';

  if (window.__gmLivePriceHook) return;
  window.__gmLivePriceHook = true;

  const POST_SOURCE = 'gm-companion-live-price';

  console.log('[GM-LivePrice] hook installé (world MAIN)');

  function post(type, payload) {
    try {
      window.postMessage({ source: POST_SOURCE, type, payload }, '*');
    } catch (e) {
      console.log('[GM-LivePrice] postMessage en échec:', e);
    }
  }

  function kindOf(url) {
    if (!url) return null;
    const str = String(url);
    if (str.indexOf('/api/exchanges/getPrice') !== -1) {
      const m = str.match(/[?&]symbol=([^&]+)/);
      return m && m[1].toUpperCase() === 'BTC' ? 'btc' : null;
    }
    if (str.indexOf('/api/exchanges/getTokenPrice') !== -1) return 'gmt';
    return null;
  }

  function jsonOf(text) {
    try { return JSON.parse(text); } catch (e) { return null; }
  }

  function relay(kind, payload) {
    console.log('[GM-LivePrice] prix capté:', kind, payload && payload.data);
    post(kind, payload);
  }

  function rebuiltResponse(res, text) {
    const headers = new Headers(res.headers);
    headers.delete('content-encoding');
    headers.delete('content-length');
    return new Response(text, { status: res.status, statusText: res.statusText, headers });
  }

  const origFetch = window.fetch;
  if (origFetch) {
    window.fetch = function () {
      const args = arguments;
      const url = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url) || '';
      const kind = kindOf(url);
      if (kind) {
        return origFetch.apply(this, args).then((res) => {
          try {
            return res.text().then((text) => {
              const json = jsonOf(text);
              if (json) relay(kind, json);
              else console.log('[GM-LivePrice] prix non exploité — statut', res.status, '| content-type:', res.headers.get('content-type'), '| body:', String(text).slice(0, 200));
              return rebuiltResponse(res, text);
            }).catch((e) => {
              console.log('[GM-LivePrice] échec lecture du corps:', e && e.message);
              return res;
            });
          } catch (e) {
            console.log('[GM-LivePrice] erreur interception:', e && e.message);
            return res;
          }
        });
      }
      return origFetch.apply(this, args);
    };
  }

  const origOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function () {
    this.__gmUrl = arguments[1] || '';
    return origOpen.apply(this, arguments);
  };
  const origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function () {
    const kind = kindOf(this.__gmUrl);
    if (kind) {
      this.addEventListener('load', () => {
        let text = null;
        try {
          const raw = this.response;
          text = typeof raw === 'string' ? raw : (raw != null ? JSON.stringify(raw) : this.responseText);
        } catch (e) {
          console.log('[GM-LivePrice] réponse illisible:', e);
        }
        const json = jsonOf(text);
        if (json) relay(kind, json);
      });
    }
    return origSend.apply(this, arguments);
  };
})();