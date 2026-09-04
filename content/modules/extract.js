/**
 * Module : extraction des données depuis le DOM
 * (cards marketplace, page détail, calculateur de récompenses).
 * Exposé sur `GM.extract`.
 */
(function () {
  'use strict';

  const GM = (globalThis.GM = globalThis.GM || {});
  const { C, log, parseNumber } = GM;
  const { DAYS_PER_MONTH, DAYS_PER_YEAR } = C;

  /**
   * Extrait les données brutes d'une card
   * @param {Element} card
   * @returns {Object|null}
   */
  function extractCardData(card) {
    try {
      // ── Labels (TH + W/TH) ──────────────────────────────────────
      // Les deux premiers nft-label contiennent le hashrate et l'efficience
      const labels = card.querySelectorAll('.nft-label');

      let thRaw = null;
      let wthRaw = null;

      labels.forEach((label) => {
        const text = label.textContent.trim();
        if (text.includes('TH') && !text.includes('W/TH')) {
          thRaw = text;
        } else if (text.includes('W/TH')) {
          wthRaw = text;
        }
      });

      const th = parseNumber(thRaw);   // ex: 64
      const wth = parseNumber(wthRaw);  // ex: 15

      // ── ROI ─────────────────────────────────────────────────────
      const roiEl = card.querySelector('[title^="ROI"]');
      const roiRaw = roiEl?.textContent ?? null;
      // extrait le % numérique depuis "ROI 45.24%"
      const roiMatch = roiRaw?.match(/([\d.]+)\s*%/);
      const roi = roiMatch ? parseFloat(roiMatch[1]) : null;

      // ── Prix GMT ─────────────────────────────────────────────────
      // "2,397.29" dans le span après l'icône GMT
      const gmtPriceEl = card.querySelector('icon-gmt + span, .icon-gmt ~ span');
      // fallback : on cherche dans nft-card-price le premier span avec chiffres+virgule
      const nftCardPrice = card.querySelector('nft-card-price');
      let gmtPrice = null;
      if (nftCardPrice) {
        const spans = nftCardPrice.querySelectorAll('span');
        for (const span of spans) {
          const t = span.textContent.trim();
          // le prix GMT ressemble à "2,397.29" (contient une virgule ou un point, pas de $)
          if (/^[\d,]+\.?\d*$/.test(t) && t.length > 3) {
            gmtPrice = parseNumber(t);
            break;
          }
        }
      }

      // ── Prix $ et $/TH ───────────────────────────────────────────
      // Le bloc "$725.66 • $11.34 / TH" est dans un span.small
      let priceUsd = null;
      let priceUsdPTh = null;

      if (nftCardPrice) {
        const smallSpan = nftCardPrice.querySelector('span.small, span.text-grey.small');
        if (smallSpan) {
          const innerSpans = smallSpan.querySelectorAll('span');
          innerSpans.forEach((s) => {
            const t = s.textContent.trim();
            if (t.startsWith('$') && t.includes('/ TH')) {
              priceUsdPTh = parseNumber(t); // "$11.34 / TH" → 11.34
            } else if (t.startsWith('$') && !t.includes('TH')) {
              priceUsd = parseNumber(t);    // "$725.66" → 725.66
            }
          });
        }
      }

      return { th, wth, roi, gmtPrice, priceUsd, priceUsdPTh };

    } catch (e) {
      log('Erreur extraction card:', e);
      return null;
    }
  }

  /**
   * Extrait les données de la page détail (/nft/view/<id>)
   * @returns {Object|null}
   */
  function extractDetailData() {
    try {
      const featPower = document.querySelector('.catalog-item__feat .catalog-item__feat-name span.text-truncate');
      if (!featPower) return null;

      const feats = document.querySelectorAll('.catalog-item__feat');
      let th = null;
      let wth = null;

      feats.forEach((feat) => {
        const name = feat.querySelector('.catalog-item__feat-name span.text-truncate')?.textContent.trim();
        const value = feat.querySelector('.fw-medium.text-truncate')?.textContent.trim();
        if (name === 'Power') th = parseNumber(value);       // "151.06 TH" → 151.06
        else if (name === 'Efficiency') wth = parseNumber(value); // "27 W/TH" → 27
      });

      // ── Prix (GMT + USD + $/TH) ──────────────────────────────────
      const nftCardPrice = document.querySelector('nft-card-price');
      let gmtPrice = null;
      let priceUsd = null;
      let priceUsdPTh = null;
      if (nftCardPrice) {
        const lead = nftCardPrice.querySelector('.lead');
        if (lead) gmtPrice = parseNumber(lead.textContent); // "8,000.00"

        const small = nftCardPrice.querySelector('span.text-grey.small');
        if (small) {
          const innerSpans = small.querySelectorAll('span');
          innerSpans.forEach((s) => {
            const t = s.textContent.trim();
            if (t.startsWith('$') && t.includes('/ TH')) {
              priceUsdPTh = parseNumber(t); // "$18.19 / TH" → 18.19
            } else if (t.startsWith('$') && !t.includes('TH')) {
              priceUsd = parseNumber(t);    // "$2,747.20" → 2747.20
            }
          });
        }
      }

      return { th, wth, gmtPrice, priceUsd, priceUsdPTh };
    } catch (e) {
      log('Erreur extraction détail:', e);
      return null;
    }
  }

  /**
   * Extrait les données du calculateur de récompenses GoMining présent
   * sur la page détail (pool payout, maintenance, net, prix BTC, période).
   * @returns {Object|null}
   */
  function extractRewardCalculatorData() {
    try {
      const calc = document.querySelector('nft-reward-calculator');
      if (!calc) return null;

      const incomeEl = calc.querySelector('[data-qa="card-reward-calculator__value-income"]');
      const feeEl = calc.querySelector('[data-qa="card-reward-calculator__value-fee"]');
      const netEl = calc.querySelector('[data-qa="card-reward-calculator__value-netIncome"]');
      if (!incomeEl || !feeEl || !netEl) return null;

      const period = calc.querySelector('.btn.active .btn__text')?.textContent.trim() || 'Monthly';
      const factor = period === 'Daily' ? 1 : period === 'Yearly' ? DAYS_PER_YEAR : DAYS_PER_MONTH;

      // Prix BTC sélectionné dans le calculateur (ex: "$90,000")
      const btcEl = calc.querySelector('ng-select.miner-create-modal__select-price .ng-value');
      const btcPrice = btcEl ? parseNumber(btcEl.textContent) : null;

      // Montant brut en BTC (plus précis que le $ arrondi)
      const btcAmountEl = calc.querySelector('currency-display .fw-semibold');
      const grossBtc = btcAmountEl ? parseFloat(String(btcAmountEl.textContent).replace(/[^0-9.]/g, '')) : null;

      // Montant de la maintenance en GMT (2e currency-display du calculateur)
      const gmtAmountEl = calc.querySelectorAll('currency-display .fw-semibold')[1];
      const feeGmt = gmtAmountEl ? parseFloat(String(gmtAmountEl.textContent).replace(/[^0-9.]/g, '')) : null;

      const fee = parseNumber(feeEl.textContent);
      const gmtPrice = fee && feeGmt ? fee / feeGmt : null;

      return {
        gross: parseNumber(incomeEl.textContent),
        fee,
        net: parseNumber(netEl.textContent),
        btcPrice,
        grossBtc,
        feeGmt,
        gmtPrice,
        period,
        factor,
      };
    } catch (e) {
      log('Erreur extraction calculateur récompenses:', e);
      return null;
    }
  }

  GM.extract = {
    extractCardData,
    extractDetailData,
    extractRewardCalculatorData,
  };
})();