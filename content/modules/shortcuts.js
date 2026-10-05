/**
 * Module business/UI : raccourcis de filtres sur la page marketplace.
 * - Injecte les raccourcis prédéfinis (`C.MARKETPLACE_SHORTCUTS`) dans
 *   `.catalog-index__block-filter .group-elements`, même style que les boutons
 *   natifs (Hot deals / Auction / Jacob).
 * - Bouton « ➕ » en bout de barre : popin de création (emoji + nom) qui
 *   enregistre un raccourci vers l'URL courante (stockage extension,
 *   clé `userShortcuts`).
 * - Clic sur un raccourci : navigation SPA (pushState + popstate, sans
 *   rechargement) avec repli en rechargement si l'app ne réagit pas — la page
 *   n'expose aucun `<form>` de filtres soumettable (composants Angular, état
 *   piloté par les query params `filters` / `sort.key`).
 * Exposé sur `GM.shortcuts`.
 */
(function () {
  'use strict';

  const GM = (globalThis.GM = globalThis.GM || {});
  const { C, api, log } = GM;
  const t = GM.I18N.t;

  const CONTAINER_SELECTOR = '.catalog-index__block-filter .group-elements';
  const CARDS_SELECTOR = '.catalog-index__cards-row';
  const ITEM_ATTR = 'data-gm-shortcut';
  const ADD_ATTR = 'data-gm-shortcut-add';
  const MODAL_ATTR = 'data-gm-shortcut-modal';
  const STORAGE_KEY = 'userShortcuts';
  const SPA_VERIFY_DELAY = 1500;

  const EMOJI_PRESETS = ['🐺', '⚡', '💰', '🔥', '⭐', '🚀', '💎', '🎯', '📈', '💸', '🏆', '🌙',
    '⛏️', '🪙', '📊', '🔎', '💵', '🏅'];
  const DEFAULT_EMOJI = '🎯';

  // ─── Persistance ───────────────────────────────────────────────

  /**
   * @returns {Promise<Array>} raccourcis utilisateur [{ id, label, url }]
   */
  async function loadUserShortcuts() {
    try {
      const stored = (await api.storage.local.get(STORAGE_KEY))[STORAGE_KEY];
      if (!Array.isArray(stored)) return [];
      return stored.filter((d) => d && typeof d.url === 'string' && typeof d.label === 'string');
    } catch (e) {
      log('Lecture des raccourcis utilisateur impossible', e);
      return [];
    }
  }

  async function saveUserShortcuts(list) {
    await api.storage.local.set({ [STORAGE_KEY]: list });
  }

  // ─── Helpers DOM ───────────────────────────────────────────────

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function sameFilterState(a, b) {
    return a.searchParams.get('filters') === b.searchParams.get('filters') &&
      a.searchParams.get('sort.key') === b.searchParams.get('sort.key');
  }

  function refreshActiveStates() {
    const container = document.querySelector(CONTAINER_SELECTOR);
    if (!container) return;
    let current;
    try {
      current = new URL(window.location.href);
    } catch (e) {
      return;
    }
    container.querySelectorAll(`[${ITEM_ATTR}] a`).forEach((a) => {
      try {
        a.classList.toggle('active', sameFilterState(current, new URL(a.dataset.gmShortcutUrl, window.location.origin)));
      } catch (e) {
        // URL incomparable, on ignore
      }
    });
  }

  // ─── Navigation SPA (sans rechargement) avec repli ────────────

  function cardsSignature() {
    const container = document.querySelector(CARDS_SELECTOR);
    if (!container) return null;
    const first = container.querySelector('nft-card a.catalog-item-card');
    return `${container.querySelectorAll('nft-card').length}|${first ? first.getAttribute('href') : ''}`;
  }

  /**
   * Navigue vers l'URL du raccourci sans recharger la page si l'app suit.
   * @param {string} url
   */
  function navigateToShortcut(url) {
    let target;
    try {
      target = new URL(url, window.location.origin);
    } catch (e) {
      window.location.href = url;
      return;
    }
    const relative = target.pathname + target.search + target.hash;
    const current = window.location.pathname + window.location.search + window.location.hash;
    if (relative === current) {
      log('Raccourci déjà actif, rien à faire');
      return;
    }
    const before = cardsSignature();
    try {
      history.pushState(null, '', relative);
      window.dispatchEvent(new PopStateEvent('popstate'));
    } catch (e) {
      log('Navigation SPA impossible, rechargement', e);
      window.location.href = url;
      return;
    }
    // Si l'app Angular ne réagit pas au popstate, on recharge
    // (l'URL cible est déjà en place dans la barre d'adresse).
    setTimeout(() => {
      if (cardsSignature() !== before) {
        log('Navigation SPA vers le raccourci réussie');
        refreshActiveStates();
        return;
      }
      log("L'app n'a pas réagi à la navigation SPA, rechargement de la page");
      window.location.reload();
    }, SPA_VERIFY_DELAY);
  }

  // ─── Items de raccourcis ───────────────────────────────────────

  /**
   * Construit un item avec le même style que les boutons natifs :
   * wrapper `.group-elements__item` + lien `.btn.btn-form.catalog-index__btn-filter`.
   * @param {Object} def - { id, label, url }
   * @returns {Element}
   */
  function buildItem(def) {
    const wrap = el('div', 'group-elements__item ng-star-inserted');
    wrap.setAttribute(ITEM_ATTR, def.id);

    const link = el('a', 'btn btn-form catalog-index__btn-filter mw-100 overflow-hidden');
    link.setAttribute('btn', '');
    link.href = def.url;
    link.title = def.label;
    link.dataset.gmShortcutUrl = def.url;
    // Clic gauche : SPA sans rechargement ; href conservé (clic molette / nouvel onglet OK)
    link.addEventListener('click', (e) => {
      e.preventDefault();
      navigateToShortcut(def.url);
    });

    link.appendChild(el('span', 'btn__text hidden-empty text-truncate', def.label));
    wrap.appendChild(link);
    return wrap;
  }

  function insertDef(container, def) {
    const item = buildItem(def);
    try {
      if (sameFilterState(new URL(window.location.href), new URL(def.url, window.location.origin))) {
        item.querySelector('a').classList.add('active');
      }
    } catch (e) {
      // URL incomparable, on ignore l'état actif
    }
    // Toujours avant le bouton « + » pour le garder à l'extrême droite
    const add = container.querySelector(`[${ADD_ATTR}]`);
    if (add) container.insertBefore(item, add);
    else container.appendChild(item);
  }

  // ─── Bouton « + » ─────────────────────────────────────────────

  function ensureAddButton(container) {
    if (container.querySelector(`[${ADD_ATTR}]`)) return;
    const wrap = el('div', 'group-elements__item ng-star-inserted');
    wrap.setAttribute(ADD_ATTR, 'true');

    const btn = el('button', 'btn btn-sm btn-form btn-circle gm-shortcut-add overflow-hidden');
    btn.setAttribute('btn', '');
    btn.type = 'button';
    btn.title = t('shortcuts.addTitle');
    btn.setAttribute('aria-label', t('shortcuts.addTitle'));
    btn.appendChild(el('span', 'btn__icon hidden-empty btn__icon--center gm-shortcut-add__icon', '➕'));
    btn.appendChild(el('span', 'btn__text hidden-empty text-truncate'));
    btn.addEventListener('click', openModal);

    wrap.appendChild(btn);
    container.appendChild(wrap);
  }

  // ─── Popin de création ─────────────────────────────────────────

  let modal = null;
  let escWired = false;

  function buildModal() {
    const overlay = el('div', 'gm-shortcut-modal-overlay');
    overlay.setAttribute(MODAL_ATTR, 'true');
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeModal();
    });

    const box = el('div', 'gm-shortcut-modal');
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');

    box.appendChild(el('div', 'gm-shortcut-modal__title', t('shortcuts.modalTitle')));

    box.appendChild(el('label', 'gm-shortcut-modal__label', t('shortcuts.emojiLabel')));
    const emojiRow = el('div', 'gm-shortcut-modal__row-emoji');
    const emojiInput = el('input', 'gm-shortcut-modal__input gm-shortcut-modal__input--emoji');
    emojiInput.type = 'text';
    emojiInput.value = DEFAULT_EMOJI;
    emojiInput.setAttribute('aria-label', t('shortcuts.emojiLabel'));
    emojiRow.appendChild(emojiInput);
    const presets = el('div', 'gm-shortcut-modal__presets');
    for (const emoji of EMOJI_PRESETS) {
      const b = el('button', 'gm-shortcut-modal__preset', emoji);
      b.type = 'button';
      b.addEventListener('click', () => {
        emojiInput.value = emoji;
      });
      presets.appendChild(b);
    }
    emojiRow.appendChild(presets);
    box.appendChild(emojiRow);

    const nameLabel = el('label', 'gm-shortcut-modal__label', t('shortcuts.nameLabel'));
    const nameInput = el('input', 'gm-shortcut-modal__input');
    nameInput.type = 'text';
    nameInput.maxLength = 40;
    nameInput.placeholder = t('shortcuts.namePlaceholder');
    nameInput.setAttribute('aria-label', t('shortcuts.nameLabel'));
    nameLabel.htmlFor = 'gm-shortcut-name';
    nameInput.id = 'gm-shortcut-name';
    box.appendChild(nameLabel);
    box.appendChild(nameInput);

    box.appendChild(el('div', 'gm-shortcut-modal__label', t('shortcuts.urlLabel')));
    const urlPreview = el('div', 'gm-shortcut-modal__url');
    box.appendChild(urlPreview);

    const actions = el('div', 'gm-shortcut-modal__actions');
    const cancelBtn = el('button', 'gm-shortcut-modal__btn', t('shortcuts.cancel'));
    cancelBtn.type = 'button';
    cancelBtn.addEventListener('click', closeModal);
    const addBtn = el('button', 'gm-shortcut-modal__btn gm-shortcut-modal__btn--primary', t('shortcuts.add'));
    addBtn.type = 'button';
    addBtn.addEventListener('click', onAdd);
    actions.appendChild(cancelBtn);
    actions.appendChild(addBtn);
    box.appendChild(actions);

    box.appendChild(el('div', 'gm-shortcut-modal__list-title', t('shortcuts.myList')));
    const userList = el('div', 'gm-shortcut-modal__list');
    userList.setAttribute('data-gm-user-list', 'true');
    box.appendChild(userList);

    overlay.appendChild(box);

    // Refs pour openModal / onAdd (évite de re-requêter le DOM)
    overlay._gmEmoji = emojiInput;
    overlay._gmLabel = nameInput;
    overlay._gmUrlPreview = urlPreview;
    overlay._gmUserList = userList;
    return overlay;
  }

  function openModal() {
    if (modal) modal.remove();
    modal = buildModal();
    document.body.appendChild(modal);
    if (!escWired) {
      escWired = true;
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeModal();
      });
    }
    modal._gmEmoji.value = DEFAULT_EMOJI;
    modal._gmLabel.value = '';
    modal._gmUrlPreview.textContent = window.location.href;
    modal._gmUrlPreview.title = window.location.href;
    refreshUserList();
    modal.classList.add('visible');
    modal._gmLabel.focus();
  }

  function closeModal() {
    if (modal) modal.classList.remove('visible');
  }

  async function refreshUserList() {
    if (!modal) return;
    const listEl = modal._gmUserList;
    while (listEl.firstChild) listEl.removeChild(listEl.firstChild);
    const defs = await loadUserShortcuts();
    if (defs.length === 0) {
      listEl.appendChild(el('div', 'gm-shortcut-modal__empty', t('shortcuts.emptyList')));
      return;
    }
    for (const def of defs) {
      const row = el('div', 'gm-shortcut-modal__row');
      const label = el('span', 'gm-shortcut-modal__row-label', def.label);
      label.title = def.url;
      row.appendChild(label);
      const del = el('button', 'gm-shortcut-modal__del', '✕');
      del.type = 'button';
      del.title = t('shortcuts.deleteTitle');
      del.setAttribute('aria-label', `${t('shortcuts.deleteTitle')} : ${def.label}`);
      del.addEventListener('click', () => onDelete(def.id));
      row.appendChild(del);
      listEl.appendChild(row);
    }
  }

  async function onAdd() {
    if (!modal) return;
    const emoji = modal._gmEmoji.value.trim() || DEFAULT_EMOJI;
    const name = modal._gmLabel.value.trim();
    if (!name) {
      modal._gmLabel.focus();
      return;
    }
    // Le raccourci pointe vers l'URL courante (filtres / tri en cours)
    const def = { id: `user-${Date.now()}`, label: `${emoji} ${name}`, url: window.location.href };
    try {
      const list = await loadUserShortcuts();
      list.push(def);
      await saveUserShortcuts(list);
      const container = document.querySelector(CONTAINER_SELECTOR);
      if (container) insertDef(container, def);
      log('Raccourci utilisateur enregistré :', def.label);
    } catch (e) {
      log("Échec de l'enregistrement du raccourci", e);
    }
    closeModal();
  }

  async function onDelete(id) {
    try {
      await saveUserShortcuts((await loadUserShortcuts()).filter((d) => d.id !== id));
      document.querySelector(`[${ITEM_ATTR}="${id}"]`)?.remove();
      log('Raccourci utilisateur supprimé :', id);
    } catch (e) {
      log('Échec de la suppression du raccourci', e);
    }
    refreshUserList();
  }

  // ─── Injection ─────────────────────────────────────────────────

  /**
   * Injecte les raccourcis prédéfinis + utilisateur, puis le bouton « + ».
   * Idempotent : les items déjà présents sont ignorés, car la barre de filtres
   * est re-rendue par l'app Angular lors de la navigation.
   */
  async function injectShortcuts() {
    const container = document.querySelector(CONTAINER_SELECTOR);
    if (!container) return;

    let injected = 0;
    for (const def of C.MARKETPLACE_SHORTCUTS || []) {
      if (container.querySelector(`[${ITEM_ATTR}="${def.id}"]`)) continue;
      insertDef(container, def);
      injected++;
    }
    ensureAddButton(container);
    for (const def of await loadUserShortcuts()) {
      if (container.querySelector(`[${ITEM_ATTR}="${def.id}"]`)) continue;
      insertDef(container, def);
      injected++;
    }
    if (injected > 0) log(`${injected} raccourci(s) injecté(s) dans les filtres marketplace`);
  }

  GM.shortcuts = {
    injectShortcuts,
    refreshActiveStates,
  };
})();
