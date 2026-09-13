/**
 * Hook du monde principal (content script world: MAIN, run_at document_start).
 * Écoute les appels fetch/XHR vers /api/v2/payment/quote et relaie au module
 * upgrade-listener (monde isolé) le couple requête (flowData) / réponse
 * (baseAmountInUsd). Actif uniquement après réception du message de contrôle
 * envoyé par le module (activation depuis la popup). Exécuté avant l'app :
 * non soumis à la CSP de la page. Logs de debug avec le préfixe [GM-Listener]
 * dans la console de la page.
 *
 * Note : l'app annule ses requêtes (AbortController) ; on lit donc le corps
 * original puis on remplace la réponse par une Response reconstruite,
 * détachée du signal d'annulation, pour que l'app continue de fonctionner.
 */
(function () {
  'use strict';

  if (window.__gmUpgradeListenerHook) return;
  window.__gmUpgradeListenerHook = true;

  const CTL_SOURCE = 'gm-companion-upgrade-listener-ctl';
  const POST_SOURCE = 'gm-companion-upgrade-listener';
  let listening = false;

  console.log('[GM-Listener] hook installé (world MAIN)');

  function post(payload) {
    try {
      window.postMessage({ source: POST_SOURCE, payload }, '*');
    } catch (e) {
      console.log('[GM-Listener] postMessage en échec:', e);
    }
  }

  function isQuote(url) {
    return !!url && String(url).indexOf('/api/v2/payment/quote') !== -1;
  }

  function bodyTextOf(body) {
    if (!body) return null;
    if (typeof body === 'string') return body;
    try { return JSON.stringify(body); } catch (e) { return null; }
  }

  function flowOf(bodyText) {
    try {
      const obj = JSON.parse(bodyText);
      const fd = obj && obj.flowData;
      if (fd) {
        const from = Number(fd.fromPower);
        const to = Number(fd.toPower);
        if (isFinite(from) && isFinite(to)) {
          return { fromPower: from, toPower: to, flowType: obj.flowType };
        }
        console.log('[GM-Listener] flowData sans fromPower/toPower:', JSON.stringify(fd));
      } else {
        console.log('[GM-Listener] flowData absent du payload:', bodyText ? String(bodyText).slice(0, 300) : '(vide)');
      }
    } catch (e) {
      console.log('[GM-Listener] payload non parsable:', bodyText ? String(bodyText).slice(0, 300) : '(vide)');
    }
    return null;
  }

  function quoteOf(text) {
    try {
      const obj = JSON.parse(text);
      const b = obj && obj.data && obj.data.breakdown;
      if (b && b.baseAmountInUsd != null) return { baseAmountInUsd: parseFloat(b.baseAmountInUsd) };
      console.log('[GM-Listener] réponse sans breakdown.baseAmountInUsd:', text ? String(text).slice(0, 300) : '(vide)');
    } catch (e) {
      console.log('[GM-Listener] réponse non parsable:', text ? String(text).slice(0, 300) : '(vide)');
    }
    return null;
  }

  function relay(flow, quote) {
    console.log('[GM-Listener] quote capturée → flow:', JSON.stringify(flow), '| baseAmountInUsd:', quote.baseAmountInUsd);
    post({ flow, quote });
  }

  function rebuiltResponse(res, text) {
    const headers = new Headers(res.headers);
    headers.delete('content-encoding');
    headers.delete('content-length');
    return new Response(text, { status: res.status, statusText: res.statusText, headers });
  }

  window.addEventListener('message', (event) => {
    if (event.source !== window && event.source !== null) return;
    const msg = event.data;
    if (!msg || msg.source !== CTL_SOURCE) return;
    listening = !!msg.active;
    console.log('[GM-Listener] écoute ' + (listening ? 'ACTIVÉE' : 'ARRÊTÉE'));
  });

  const origFetch = window.fetch;
  if (origFetch) {
    window.fetch = function () {
      const args = arguments;
      const url = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url) || '';
      if (listening && isQuote(url)) {
        console.log('[GM-Listener] fetch quote détecté:', url);
        const flow = flowOf(bodyTextOf(args[1] && args[1].body));
        if (flow) {
          return origFetch.apply(this, args).then((res) => {
            try {
              return res.text().then((text) => {
                const quote = quoteOf(text);
                if (quote) relay(flow, quote);
                else console.log('[GM-Listener] quote non exploitée — statut', res.status, '| content-type:', res.headers.get('content-type'), '| body:', String(text).slice(0, 300));
                return rebuiltResponse(res, text);
              }).catch((e) => {
                console.log('[GM-Listener] échec lecture du corps:', e && e.message);
                return res;
              });
            } catch (e) {
              console.log('[GM-Listener] erreur interception:', e && e.message);
              return res;
            }
          });
        }
      }
      return origFetch.apply(this, args);
    };
  }

  const origOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function () {
    this.__gmQuoteUrl = arguments[1] || '';
    return origOpen.apply(this, arguments);
  };
  const origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function () {
    if (listening && isQuote(this.__gmQuoteUrl)) {
      console.log('[GM-Listener] XHR quote détecté:', this.__gmQuoteUrl);
      const flow = flowOf(bodyTextOf(arguments[0]));
      if (flow) {
        this.addEventListener('load', () => {
          const raw = this.response;
          const text = typeof raw === 'string' ? raw : (raw != null ? JSON.stringify(raw) : this.responseText);
          const quote = quoteOf(text);
          if (quote) relay(flow, quote);
        });
      }
    }
    return origSend.apply(this, arguments);
  };
})();