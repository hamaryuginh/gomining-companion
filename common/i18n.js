/**
 * Module i18n : dictionnaires FR/EN, résolution de langue et helpers.
 * Utilisé par le popup, le dashboard et les content scripts (chargé en
 * premier dans manifest.json). Langue : override stocké (storage.local,
 * clé "gmLang") sinon langue du navigateur (fr supportée, sinon en).
 */
(function () {
  'use strict';

  const api = typeof browser !== 'undefined' ? browser : chrome;
  const STORAGE_KEY = 'gmLang';
  const SUPPORTED = ['fr', 'en'];

  const STRINGS = {
    fr: {
      'common.upgradeCost': "Coût upgrade",
      'common.totalPrice': "Prix total",
      'common.pricePerThUpgraded': "$/TH upgradé",
      'common.recommended': "Recommandée",
      'common.total': "Total",
      'common.power': "Puissance (TH)",
      'common.duration': "Durée",
      'common.thPrice': "Prix du TH ($)",
      'common.btcPrice': "Prix BTC ($)",
      'common.period': "Période",
      'common.baseRow': "Base",
      'common.gainSplit': "Répartition des gains",
      'common.netDay': "Net / jour",
      'common.netMonth': "Net / mois",
      'common.netYear': "Net / an",
      'common.powerIncreaseRate': "Taux d'augmentation de puissance (% / semaine)",
      'common.unitDayOpt': "Jour(s)",
      'common.unitWeekOpt': "Semaine(s)",
      'common.unitMonthOpt': "Mois",
      'common.unitYearOpt': "Année(s)",
      'common.unitDayShort': "Jour",
      'common.unitWeekShort': "Semaine",
      'common.unitMonthShort': "Mois",
      'common.unitYearShort': "Année",
      'popup.title': "GoMining Helper",
      'popup.statusLoading': "Chargement…",
      'popup.statusActive': "Actif sur GoMining ✓",
      'popup.statusInactive': "Naviguez sur app.gomining.com",
      'popup.statusRecalculated': "Calcul relancé ✓",
      'popup.statusError': "Erreur : page non disponible",
      'popup.costsTitle': "⚙ Coûts d'upgrade",
      'popup.costsReset': "Rétablir les défauts",
      'popup.costsSave': "Enregistrer",
      'popup.toolsBtn': "🛠 Ouvrir les outils",
      'popup.seeMore': "Voir plus...",
      'popup.seeLess': "Voir moins",
      'popup.language': "Langue",
      'popup.langAuto': "Auto (navigateur)",
      'dash.title': "GoMining Companion — Outils",
      'dash.subtitle': "Outils",
      'rv.title': "🔄 Simulateur de réinvestissement",
      'rv.subtitle': "Réinvestir les gains en TH puis retirer (classique)",
      'rv.eff': "Efficience (W/TH)",
      'rv.discount': "Remise maintenance (%)",
      'rv.sats': "Rendement réseau (sats/TH/jour)",
      'rv.kwh': "Électricité ($/kWh)",
      'rv.greedyCheck': "Avec Greedy Machines",
      'rv.greedyTh': "Puissance des Greedy (TH)",
      'rv.greedyReinvestLabel': "Réinvestissement",
      'rv.greedyReinvestCheck': "Réinvest. dans Greedy",
      'rv.strategyReinvestTitle': "🔄 Temporalité réinvestissement",
      'rv.strategyReinvestHint': "Les gains nets sont convertis en TH",
      'rv.strategyClassicTitle': "💰 Temporalité classique",
      'rv.strategyClassicHint': "Après la phase de réinvestissement, les gains sont retirés",
      'rv.unitAriaReinvest': "Unité réinvestissement",
      'rv.unitAriaClassic': "Unité classique",
      'rv.warning': "⚠ Prix du TH à 0 : le réinvestissement est désactivé.",
      'rv.tabTable': "📋 Table",
      'rv.tabChart': "📈 Graphique",
      'rv.thReinvest': "🔄 Réinvestissement",
      'rv.thClassic': "💰 Classique",
      'rv.thDeltaWealth': "Δ Patrimoine",
      'rv.thThBought': "+TH achetés",
      'rv.thNetCum': "Net cumulé ($)",
      'rv.thWealth': "Patrimoine ($)",
      'rv.thNetWithdrawn': "Net retiré ($)",
      'rv.legendReinvest': "🔄 Réinvest. → classique",
      'rv.legendClassic': "💰 Classique",
      'rv.chartPower': "⚡ Puissance (TH)",
      'rv.chartWealth': "🏦 Patrimoine ($)",
      'rv.chartCash': "💵 Net cumulé ($)",
      'rv.note': "Simulation indicative basée sur les formules GoMining (brut = sats/TH/jour × TH × BTC / 1e8 ; maintenance = électricité + service, remise déduite). La stratégie réinvestissement convertit le gain net quotidien en puissance au prix du TH indiqué (fixe sur la durée) pendant sa temporalité — le net cumulé reste à 0 car tout est réinvesti — puis repasse en retrait classique. La stratégie classique retire les gains pendant toute la durée. Avec l'option Greedy Machines, la puissance de la collection augmente chaque semaine selon le taux indiqué (votes veGOMINING), en plus du réinvestissement (survol des colonnes +TH pour le détail) ; « Réinvest. dans Greedy » oriente le réinvestissement vers la collection Greedy. Δ Patrimoine = patrimoine réinvestissement − classique (ferme valorisée au prix du TH).",
      'rv.rowSwitch': "⇄ Passage en classique",
      'rv.chartEndReinvest': "⇄ fin réinvest.",
      'rv.chartCatchUp': "⇌ rattrapage net",
      'rv.phaseReinvest': "réinvestissement",
      'rv.phaseClassic': "classique",
      'rv.tipPower': "⚡ Puissance",
      'rv.tipWealth': "🏦 Patrimoine",
      'rv.tipCash': "💵 Net cumulé",
      'rv.tipCrossTitle': "⇌ Rattrapage du net cumulé",
      'rv.tipCrossText': "Le net cumulé de la stratégie réinvestissement passe au-dessus de la classique à partir de cette période :",
      'rv.tipCrossH': "🔄 Réinvestissement :",
      'rv.tipCrossC': "💰 Classique :",
      'rv.gainTipGreedy': "🐺 Greedy (upgrade) :",
      'rv.gainTipFarm': "💸 Réinvest. ferme :",
      'rv.gainTipGreedyReinvest': "🔄 Réinvest. Greedy :",
      'rv.netTipTitle': "Net de la période",
      'rv.netTipGen': "📈 Net généré :",
      'rv.netTipReinvested': "🔄 Réinvesti en TH :",
      'rv.netTipWithdrawn': "💵 Retiré (cash) :",
      'panel.cardSelectTitle': "Sélectionner $1 W/TH dans le calculateur",
      'panel.alreadyOptimal': "Déjà optimal",
      'panel.headerTitle': "⚡ GoMining Companion — Upgrade",
      'panel.calcTitle': "🚀 Calculateur upgrade complet",
      'panel.targetEff': "Efficience cible (W/TH)",
      'panel.costPerTh': "Coût / TH",
      'panel.totalUpgraded': "Prix total upgradé",
      'panel.strategiesTitle': "Stratégies d'upgrade",
      'panel.strategyEffPower': "① Eff. → Puissance",
      'panel.strategyPowerEff': "② Puissance → Eff.",
      'panel.effRow': "Efficience",
      'panel.powerRow': "Puissance",
      'panel.yieldTitle': "📈 Simulateur de rendement",
      'panel.satsYield': "Rendement (sats/TH/j)",
      'panel.kwhCost': "Coût kWh ($)",
      'panel.maintDiscount': "Remise maint. (%)",
      'panel.maintenanceIn': "Maintenance en",
      'panel.curCol': "Actuel",
      'panel.tgtCol': "Après upgrade",
      'panel.deltaNet': "Gain net après upgrade",
      'panel.note': "Formules GoMining : brut = sats/TH/j × TH × BTC ; électricité = kWh × 24 × W/TH × TH ÷ 1000 ; service = $0.0089/TH/j. ROI et délai basés sur le prix + coût d'upgrade.",
      'panel.grossDay': "Revenu brut / jour",
      'panel.elecDay': "Électricité / jour",
      'panel.serviceDay': "Service / jour",
      'panel.maintDay': "Maintenance / jour",
      'panel.roiAnnual': "ROI annuel",
      'panel.payback': "Récupération",
      'panel.liveCurrent': "(actuel : $1)",
      'panel.liveClick': "Cliquer pour utiliser ce prix",
      'panel.liveGmt': "GOMINING : $1",
      'panel.paybackDays': "$1 j",
      'panel.paybackMonths': "$1 mois",
      'panel.deltaPerDay': "$1 / j",
      'greedy.title': "📊 Simulateur Greedy Machines",
      'greedy.subtitle': "Power up hebdomadaire • votes veGOMINING",
      'greedy.unitAria': "Unité de durée",
      'greedy.reinvestLabel': "Réinvestissement en puissance",
      'greedy.reinvestCheck': "Activer (net quotidien → TH)",
      'greedy.deltaNetDay': "Δ Net / jour",
      'greedy.netCum': "Net cumulé",
      'greedy.note': "La puissance de base et l'efficience cible suivent le calculateur d'upgrade ; les gains reprennent les paramètres du simulateur de rendement. Simulation indicative : l'augmentation hebdomadaire dépend des résultats des votes de la communauté (veGOMINING). Réinvestissement : gains nets quotidiens convertis en puissance au prix du TH indiqué (survol des colonnes +TH / +% pour le détail Greedy vs réinvestissement).",
      'greedy.tipGreedy': "🐺 Greedy :",
      'greedy.tipReinvest': "💸 Réinvestissement :",
      'badge.alreadyOptimal': "✅ Déjà optimal ($1 W/TH)",
      'badge.afterUpgradeOptimal': "⚡ Après upgrade → $1 W/TH (optimal)",
      'badge.upgradeTo': "⚡ Upgrade → $1 W/TH",
    },
    en: {
      'common.upgradeCost': "Upgrade cost",
      'common.totalPrice': "Total price",
      'common.pricePerThUpgraded': "$/TH upgraded",
      'common.recommended': "Recommended",
      'common.total': "Total",
      'common.power': "Power (TH)",
      'common.duration': "Duration",
      'common.thPrice': "TH price ($)",
      'common.btcPrice': "BTC price ($)",
      'common.period': "Period",
      'common.baseRow': "Baseline",
      'common.gainSplit': "Earnings breakdown",
      'common.netDay': "Net / day",
      'common.netMonth': "Net / month",
      'common.netYear': "Net / year",
      'common.powerIncreaseRate': "Power increase rate (% / week)",
      'common.unitDayOpt': "Day(s)",
      'common.unitWeekOpt': "Week(s)",
      'common.unitMonthOpt': "Month(s)",
      'common.unitYearOpt': "Year(s)",
      'common.unitDayShort': "Day",
      'common.unitWeekShort': "Week",
      'common.unitMonthShort': "Month",
      'common.unitYearShort': "Year",
      'popup.title': "GoMining Helper",
      'popup.statusLoading': "Loading…",
      'popup.statusActive': "Active on GoMining ✓",
      'popup.statusInactive': "Browse to app.gomining.com",
      'popup.statusRecalculated': "Calculation relaunched ✓",
      'popup.statusError': "Error: page unavailable",
      'popup.costsTitle': "⚙ Upgrade costs",
      'popup.costsReset': "Restore defaults",
      'popup.costsSave': "Save",
      'popup.toolsBtn': "🛠 Open tools",
      'popup.seeMore': "Show more...",
      'popup.seeLess': "Show less",
      'popup.language': "Language",
      'popup.langAuto': "Auto (browser)",
      'dash.title': "GoMining Companion — Tools",
      'dash.subtitle': "Tools",
      'rv.title': "🔄 Reinvestment simulator",
      'rv.subtitle': "Reinvest earnings into TH then withdraw (classic)",
      'rv.eff': "Efficiency (W/TH)",
      'rv.discount': "Maintenance discount (%)",
      'rv.sats': "Network yield (sats/TH/day)",
      'rv.kwh': "Electricity ($/kWh)",
      'rv.greedyCheck': "With Greedy Machines",
      'rv.greedyTh': "Greedy power (TH)",
      'rv.greedyReinvestLabel': "Reinvestment",
      'rv.greedyReinvestCheck': "Reinvest into Greedy",
      'rv.strategyReinvestTitle': "🔄 Reinvestment timeline",
      'rv.strategyReinvestHint': "Net earnings are converted into TH",
      'rv.strategyClassicTitle': "💰 Classic timeline",
      'rv.strategyClassicHint': "After the reinvestment phase, earnings are withdrawn",
      'rv.unitAriaReinvest': "Reinvestment unit",
      'rv.unitAriaClassic': "Classic unit",
      'rv.warning': "⚠ TH price is 0: reinvestment is disabled.",
      'rv.tabTable': "📋 Table",
      'rv.tabChart': "📈 Chart",
      'rv.thReinvest': "🔄 Reinvestment",
      'rv.thClassic': "💰 Classic",
      'rv.thDeltaWealth': "Δ Wealth",
      'rv.thThBought': "+TH bought",
      'rv.thNetCum': "Cumulative net ($)",
      'rv.thWealth': "Wealth ($)",
      'rv.thNetWithdrawn': "Net withdrawn ($)",
      'rv.legendReinvest': "🔄 Reinvest → classic",
      'rv.legendClassic': "💰 Classic",
      'rv.chartPower': "⚡ Power (TH)",
      'rv.chartWealth': "🏦 Wealth ($)",
      'rv.chartCash': "💵 Cumulative net ($)",
      'rv.note': "Indicative simulation based on GoMining formulas (gross = sats/TH/day × TH × BTC / 1e8; maintenance = electricity + service, discount applied). The reinvestment strategy converts the daily net gain into power at the specified TH price (fixed over the period) during its timeline — cumulative net stays at 0 because everything is reinvested — then switches back to classic withdrawals. The classic strategy withdraws earnings for the whole duration. With the Greedy Machines option, the collection's power increases weekly according to the specified rate (veGOMINING votes), on top of reinvestment (hover the +TH columns for details); \"Reinvest into Greedy\" directs reinvestment into the Greedy collection. Δ Wealth = reinvestment wealth − classic (farm valued at the TH price).",
      'rv.rowSwitch': "⇄ Switch to classic",
      'rv.chartEndReinvest': "⇄ end reinvest.",
      'rv.chartCatchUp': "⇌ net catch-up",
      'rv.phaseReinvest': "reinvestment",
      'rv.phaseClassic': "classic",
      'rv.tipPower': "⚡ Power",
      'rv.tipWealth': "🏦 Wealth",
      'rv.tipCash': "💵 Cumulative net",
      'rv.tipCrossTitle': "⇌ Cumulative net catch-up",
      'rv.tipCrossText': "The reinvestment strategy's cumulative net overtakes the classic one from this period:",
      'rv.tipCrossH': "🔄 Reinvestment:",
      'rv.tipCrossC': "💰 Classic:",
      'rv.gainTipGreedy': "🐺 Greedy (upgrade):",
      'rv.gainTipFarm': "💸 Farm reinvest:",
      'rv.gainTipGreedyReinvest': "🔄 Greedy reinvest:",
      'rv.netTipTitle': "Period net",
      'rv.netTipGen': "📈 Net generated:",
      'rv.netTipReinvested': "🔄 Reinvested in TH:",
      'rv.netTipWithdrawn': "💵 Withdrawn (cash):",
      'panel.cardSelectTitle': "Select $1 W/TH in the calculator",
      'panel.alreadyOptimal': "Already optimal",
      'panel.headerTitle': "⚡ GoMining Companion — Upgrade",
      'panel.calcTitle': "🚀 Full upgrade calculator",
      'panel.targetEff': "Target efficiency (W/TH)",
      'panel.costPerTh': "Cost / TH",
      'panel.totalUpgraded': "Total upgraded price",
      'panel.strategiesTitle': "Upgrade strategies",
      'panel.strategyEffPower': "① Eff. → Power",
      'panel.strategyPowerEff': "② Power → Eff.",
      'panel.effRow': "Efficiency",
      'panel.powerRow': "Power",
      'panel.yieldTitle': "📈 Yield simulator",
      'panel.satsYield': "Yield (sats/TH/day)",
      'panel.kwhCost': "kWh cost ($)",
      'panel.maintDiscount': "Maint. discount (%)",
      'panel.maintenanceIn': "Maintenance in",
      'panel.curCol': "Current",
      'panel.tgtCol': "After upgrade",
      'panel.deltaNet': "Net gain after upgrade",
      'panel.note': "GoMining formulas: gross = sats/TH/day × TH × BTC; electricity = kWh × 24 × W/TH × TH ÷ 1000; service = $0.0089/TH/day. ROI and payback based on price + upgrade cost.",
      'panel.grossDay': "Gross income / day",
      'panel.elecDay': "Electricity / day",
      'panel.serviceDay': "Service / day",
      'panel.maintDay': "Maintenance / day",
      'panel.roiAnnual': "Annual ROI",
      'panel.payback': "Payback",
      'panel.liveCurrent': "(current: $1)",
      'panel.liveClick': "Click to use this price",
      'panel.liveGmt': "GOMINING: $1",
      'panel.paybackDays': "$1 d",
      'panel.paybackMonths': "$1 mo",
      'panel.deltaPerDay': "$1 / day",
      'greedy.title': "📊 Greedy Machines simulator",
      'greedy.subtitle': "Weekly power up • veGOMINING votes",
      'greedy.unitAria': "Duration unit",
      'greedy.reinvestLabel': "Reinvest in power",
      'greedy.reinvestCheck': "Enable (daily net → TH)",
      'greedy.deltaNetDay': "Δ Net / day",
      'greedy.netCum': "Cumulative net",
      'greedy.note': "Base power and target efficiency follow the upgrade calculator; earnings reuse the yield simulator parameters. Indicative simulation: the weekly increase depends on community vote results (veGOMINING). Reinvestment: daily net gains converted into power at the specified TH price (hover the +TH / +% columns for the Greedy vs reinvestment breakdown).",
      'greedy.tipGreedy': "🐺 Greedy:",
      'greedy.tipReinvest': "💸 Reinvestment:",
      'badge.alreadyOptimal': "✅ Already optimal ($1 W/TH)",
      'badge.afterUpgradeOptimal': "⚡ After upgrade → $1 W/TH (optimal)",
      'badge.upgradeTo': "⚡ Upgrade → $1 W/TH",
    },
  };

  function resolveBrowserLang() {
    const ui = (api.i18n && api.i18n.getUILanguage ? api.i18n.getUILanguage() : '') || (typeof navigator !== 'undefined' ? navigator.language : '') || '';
    return ui.toLowerCase().startsWith('fr') ? 'fr' : 'en';
  }

  let lang = resolveBrowserLang();

  async function init() {
    const stored = (await api.storage.local.get(STORAGE_KEY))[STORAGE_KEY];
    lang = SUPPORTED.includes(stored) ? stored : resolveBrowserLang();
    return lang;
  }

  async function setLang(value) {
    lang = SUPPORTED.includes(value) ? value : resolveBrowserLang();
    await api.storage.local.set({ [STORAGE_KEY]: SUPPORTED.includes(value) ? value : null });
    return lang;
  }

  function t(key, subs) {
    let s = (STRINGS[lang] && STRINGS[lang][key]) || STRINGS.en[key] || key;
    if (subs && subs.length) {
      subs.forEach((v, i) => {
        s = s.replace(new RegExp('\\$' + (i + 1), 'g'), String(v));
      });
    }
    return s;
  }

  function locale() {
    return lang === 'fr' ? 'fr-FR' : 'en-US';
  }

  function apply(root) {
    root = root || document;
    const titleEl = root.querySelector('title[data-i18n]');
    if (titleEl) document.title = t(titleEl.dataset.i18n);
    root.querySelectorAll('[data-i18n]').forEach((el) => {
      el.textContent = t(el.dataset.i18n);
    });
    root.querySelectorAll('[data-i18n-title]').forEach((el) => {
      el.title = t(el.dataset.i18nTitle);
    });
    root.querySelectorAll('[data-i18n-aria]').forEach((el) => {
      el.setAttribute('aria-label', t(el.dataset.i18nAria));
    });
    root.querySelectorAll('[data-i18n-option]').forEach((el) => {
      el.textContent = t(el.dataset.i18nOption);
    });
    if (root === document || root.nodeType === 9) {
      document.documentElement.lang = locale().slice(0, 2);
    }
  }

  const GM = (globalThis.GM = globalThis.GM || {});
  GM.I18N = { t, locale, lang: () => lang, init, setLang, apply };
  globalThis.I18N = GM.I18N;
})();