# AGENTS.md — GoMining Companion

MV3 browser extension (vanilla JS, no npm / build / tests / CI). Load unpacked per `README.md`: Chrome `chrome://extensions/` dev mode, Firefox `about:debugging#/runtime/this-firefox` → `manifest.json`.

## Load order is the architecture

- `manifest.json:26-54` declares two content-script blocks; order inside the second block is the dependency order. Do not reorder or add files without updating it.
- `content/hooks/*` run in `world: MAIN` at `document_start` (before the page app, CSP-exempt). Everything else runs in the isolated world at `document_idle`.
- Shared state is `globalThis.GM` (+ `globalThis.I18N`, `globalThis.PowerCosts`). All files are IIFEs attaching to `GM` — no imports/exports/bundler.
- Entrypoint: `content/content.js` (`init()` → `I18N.init()` → `costs.loadUpgradeCosts()` → MutationObservers + initial dispatch). Routing: `MARKETPLACE_URL` prefix vs `MINER_DETAIL_URL_PATTERN` (`content/config.js:87-94`).

## Cross-world bridge (do not simplify)

- Isolated world cannot see page `fetch`; MAIN hooks intercept `fetch`+`XHR` and relay via `window.postMessage`. Sources: `gm-companion-live-price`, `gm-companion-upgrade-listener` (+ `-ctl` for start/stop).
- Hooks must rebuild the `Response` (`rebuiltResponse`) because the app aborts requests via `AbortController`. Dropping this breaks the GoMining app.
- `live-price-hook.js` is always-on (BTC/GMT); `quote-listener-hook.js` only captures when `listening=true` (popup Start button → storage → `-ctl` message).

## Config and storage — keep in sync

- Single source of business constants: `content/config.js` → `GM.C` (+ mutable `GM.UPGRADE_COSTS`). `popup/popup.js:4-13` duplicates `DEFAULT_UPGRADE_COSTS` — update both.
- `storage.local` keys: `upgradeCosts` (popup cost editor), `upgradeListener` (`{active, eff, data}`), `gmLang`. Captured quote tiers (`PowerCosts.loadEffective` in `common/power-costs.js`) override defaults per ref-eff (12/15/20); missing tiers fall back to defaults. Power cost interpolates linearly between ref-effs (`content/modules/costs.js:103-113`) and integrates per `POWER_TIERS`.
- Quirk: `content/modules/upgrade-listener.js:29` maps `span === 4999 → 5000`.
- i18n strings live in `common/i18n.js` `STRINGS` (fr/en), not in `_locales/` (manifest name/description only). New UI text = add both languages + `data-i18n*` attributes. Console logs stay in French by convention. Lang resolution: stored `gmLang` → browser `fr*` → `en`.

## Fragile DOM coupling

- All selectors in `content/modules/extract.js` (`.nft-label`, `nft-card-price`, `.catalog-item__feat`, `nft-reward-calculator`, `data-qa="card-reward-calculator__*"`). If the site redesigns, start there.
- SPA handling: debounced (300 ms) `MutationObserver` + URL-change watcher in `content.js`. Processed nodes are marked `data-gm-processed` / `data-gm-upgrade-panel`; `reprocessAll()` (popup `recalculate` message) clears them.
- Yield formulas (docs.gomining.com) in `content/modules/rewards.js:1-10`: gross = sats/TH/day × TH × BTC/1e8; elec = kWh×24×W/TH×TH/1000; service = $0.0089/TH/day.

## Verify (no automated tests)

- No linter/formatter config beyond `.editorconfig` (2-space, LF). Match surrounding IIFE/`'use strict'` style.
- Manual check: reload unpacked extension, open `https://app.gomining.com/marketplace` and an `/nft/view/<id>` page. Console prefixes: `[GoMining Companion]` (isolated), `[GM-LivePrice]` / `[GM-Listener]` (page context).
- Bump `manifest.json` `version` on release. Dashboard (`dashboard/dashboard.html` + `reinvest.js`) opens via popup tools button, not via content scripts.

## Do not commit

- `analysis/` is gitignored research (captured API payloads, HTML fixtures). It contains real Bearer tokens — never copy them into code, logs, or commits.
