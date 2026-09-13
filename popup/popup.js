const api = typeof browser !== 'undefined' ? browser : chrome;
const STORAGE_KEY = 'upgradeCosts';

const DEFAULT_COSTS = {
  13: 2.67, 14: 2.67, 15: 2.67,
  16: 1.10, 17: 1.10, 18: 1.10, 19: 1.10, 20: 1.10,
  21: 1.00, 22: 1.00, 23: 1.00, 24: 1.00, 25: 1.00,
  26: 1.00, 27: 1.00, 28: 1.00, 29: 0.50, 30: 0.50,
  31: 0.50, 32: 0.50, 33: 0.50, 34: 0.50, 35: 0.50,
  36: 0.10, 37: 0.10, 38: 0.10, 39: 0.10, 40: 0.10,
  41: 0.10, 42: 0.10, 43: 0.10, 44: 0.10, 45: 0.10,
  46: 0.10, 47: 0.10, 48: 0.10, 49: 0.10, 50: 0.10,
};

document.addEventListener('DOMContentLoaded', async () => {
  I18N.apply();
  await I18N.init();
  I18N.apply();

  const dot = document.getElementById('status-dot');
  const statusText = document.getElementById('status-text');

  const [tab] = await api.tabs.query({ active: true, currentWindow: true });
  const isOnSite = tab?.url?.startsWith('https://app.gomining.com/');

  function refreshStatus() {
    if (isOnSite) {
      dot.classList.add('active');
      statusText.textContent = I18N.t('popup.statusActive');
    } else {
      statusText.textContent = I18N.t('popup.statusInactive');
    }
  }
  refreshStatus();

  // ── Sélecteur de langue ─────────────────────────────────────────

  const langSelect = document.getElementById('lang-select');
  langSelect.value = (await api.storage.local.get('gmLang')).gmLang || 'auto';
  langSelect.addEventListener('change', async () => {
    const value = langSelect.value === 'auto' ? null : langSelect.value;
    await I18N.setLang(value);
    refreshStatus();
    I18N.apply();
    updateLink();
  });

  // ── Éditeur de coûts ────────────────────────────────────────────

  const grid = document.getElementById('costs-grid');
  const toggleBtn = document.getElementById('costs-toggle');
  const panel = document.getElementById('costs-panel');
  const resetBtn = document.getElementById('costs-reset');
  const recalcBtn = document.getElementById('recalculate-btn');

  let costs = {};
  let savedCosts = {};

  function hasModifications() {
    return Object.keys(savedCosts).some(
      (k) => costs[k] !== savedCosts[k]
    );
  }

  function updateRecalcButton() {
    recalcBtn.classList.toggle('hidden', !hasModifications());
  }

  function updateInputHighlight(input) {
    const wth = Number(input.dataset.wth);
    input.classList.toggle('cost-input--modified', costs[wth] !== savedCosts[wth]);
  }

  function createCostEntry(wth) {
    const label = document.createElement('label');
    label.className = 'cost-entry';
    label.innerHTML = `<span class="cost-label">${wth} W/TH</span>`;
    const input = document.createElement('input');
    input.type = 'number';
    input.step = '0.1';
    input.min = '0';
    input.className = 'cost-input';
    input.dataset.wth = wth;
    input.value = costs[wth] ?? '';
    updateInputHighlight(input);
    input.addEventListener('input', () => {
      const val = parseFloat(input.value);
      costs[wth] = isNaN(val) ? 0 : val;
      updateInputHighlight(input);
      updateRecalcButton();
    });
    label.appendChild(input);
    return label;
  }

  function buildGrid() {
    grid.innerHTML = '';
    const sorted = Object.keys(DEFAULT_COSTS).map(Number).sort((a, b) => a - b);

    const baseGrid = document.createElement('div');
    baseGrid.className = 'costs-grid';

    for (const wth of sorted) {
      if (wth >= 36) continue;
      baseGrid.appendChild(createCostEntry(wth));
    }
    grid.appendChild(baseGrid);

    const toggleExtra = document.createElement('div');
    toggleExtra.className = 'costs-extra-toggle';

    const extraWrap = document.createElement('div');
    extraWrap.className = 'costs-extra hidden';
    extraWrap.id = 'costs-extra';

    for (const wth of sorted) {
      if (wth < 36) continue;
      extraWrap.appendChild(createCostEntry(wth));
    }
    grid.appendChild(extraWrap);
    grid.appendChild(toggleExtra);

    const link = document.createElement('a');
    link.href = '#';
    link.className = 'costs-extra-link';
    link.textContent = I18N.t('popup.seeMore');

    function updateLink() {
      const hidden = extraWrap.classList.contains('hidden');
      link.textContent = hidden ? I18N.t('popup.seeMore') : I18N.t('popup.seeLess');
    }

    link.addEventListener('click', (e) => {
      e.preventDefault();
      extraWrap.classList.toggle('hidden');
      updateLink();
    });

    toggleExtra.appendChild(link);
    updateLink();
    updateRecalcButton();
  }

  async function loadCosts() {
    const result = await api.storage.local.get(STORAGE_KEY);
    costs = { ...DEFAULT_COSTS, ...(result[STORAGE_KEY] || {}) };
    savedCosts = { ...costs };
    buildGrid();
  }

  async function saveCosts() {
    await api.storage.local.set({ [STORAGE_KEY]: costs });
  }

  async function resetCosts() {
    costs = { ...DEFAULT_COSTS };
    savedCosts = { ...costs };
    buildGrid();
    await saveCosts();
    updateRecalcButton();
    await recalculate();
  }

  function refreshAllHighlights() {
    const inputs = grid.querySelectorAll('.cost-input');
    inputs.forEach(updateInputHighlight);
    updateRecalcButton();
  }

  async function saveAndRecalculate() {
    await saveCosts();
    savedCosts = { ...costs };
    refreshAllHighlights();
    await recalculate();
  }

  async function recalculate() {
    if (tab?.id) {
      try {
        await api.tabs.sendMessage(tab.id, { action: 'recalculate' });
        statusText.textContent = I18N.t('popup.statusRecalculated');
        setTimeout(() => {
          statusText.textContent = I18N.t('popup.statusActive');
        }, 2000);
      } catch (e) {
        statusText.textContent = I18N.t('popup.statusError');
      }
    }
  }

  toggleBtn.addEventListener('click', () => {
    const hidden = panel.classList.toggle('hidden');
    toggleBtn.textContent = hidden ? '▶' : '▼';
  });

  resetBtn.addEventListener('click', resetCosts);
  recalcBtn.addEventListener('click', saveAndRecalculate);

  // ── Upgrade listener ────────────────────────────────────────────

  const listenerKey = 'upgradeListener';
  const listenerEffSel = document.getElementById('listener-eff');
  const listenerStartBtn = document.getElementById('listener-start');
  const listenerStopBtn = document.getElementById('listener-stop');
  const listenerStatus = document.getElementById('listener-status');

  async function refreshListener() {
    const stored = (await api.storage.local.get(listenerKey))[listenerKey] || {};
    const active = !!stored.active;
    listenerStartBtn.disabled = active;
    listenerStopBtn.disabled = !active;
    listenerEffSel.disabled = active;
    listenerEffSel.value = String(stored.eff || 15);
    const count = Object.keys((stored.data || {})[String(stored.eff || 15)] || {}).length;
    listenerStatus.textContent = active
      ? I18N.t('popup.listenerStatusActive', [count])
      : I18N.t('popup.listenerStatusIdle');
  }

  listenerEffSel.addEventListener('change', async () => {
    if (listenerEffSel.disabled) return;
    const stored = (await api.storage.local.get(listenerKey))[listenerKey] || {};
    await api.storage.local.set({ [listenerKey]: { ...stored, active: false, eff: Number(listenerEffSel.value) } });
    refreshListener();
  });

  function formatListenerTable(data) {
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

  listenerStartBtn.addEventListener('click', async () => {
    const eff = Number(listenerEffSel.value);
    const stored = (await api.storage.local.get(listenerKey))[listenerKey] || {};
    await api.storage.local.set({ [listenerKey]: { ...stored, active: true, eff } });
    console.log(`[GoMining Companion] Upgrade listener démarré (${eff} W/TH) — effectuez vos upgrades puis cliquez sur Arrêter`);
    refreshListener();
  });

  listenerStopBtn.addEventListener('click', async () => {
    const stored = (await api.storage.local.get(listenerKey))[listenerKey] || {};
    await api.storage.local.set({ [listenerKey]: { ...stored, active: false } });
    console.log('[GoMining Companion] Upgrade listener arrêté');
    console.log(formatListenerTable(stored.data) || '[GoMining Companion] aucune donnée capturée');
    refreshListener();
  });

  const toolsBtn = document.getElementById('tools-btn');
  toolsBtn.addEventListener('click', () => {
    api.tabs.create({ url: api.runtime.getURL('dashboard/dashboard.html') });
  });

  await loadCosts();
  await refreshListener();
});