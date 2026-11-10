# Pocket Games: agent instructions

## Product and architecture
- Static SvelteKit 3 / Svelte 5 / TypeScript application, built with Vite and adapter-static. Supported Node range: ^22.17.0 || ^24.0.0 || >=26.0.0; Node 23 and 25 are unsupported by the build/test toolchain.
- No runtime server, database, accounts, external game-data requests, analytics/ad SDKs, or scheduled generation. Do not add them to implement a game.
- Daily puzzles use the calendar date in America/Chicago (DST-aware). Browser clock is authoritative. Never use UTC date slicing or a fixed CST offset for daily selection.
- Generate only the selected puzzle in the browser. Catalog imports metadata only. Game components, engines, dictionaries, assets, and workers stay behind explicit dynamic imports.
- Prerender catalog and game shells, not puzzle instances. Dates/seeds are browser-resolved query parameters. Do not disable SSR globally or require a catch-all SPA rewrite.
- Game logic is pure TypeScript, separate from Svelte and persistence. No Math.random(), time, locale sorting, or mutable global RNG in generators.
- Keep the exact seed-to-puzzle mapping stable under a generator version, including word-list ordering and all generation data. Version saves independently. Preserve published reproducibility when intentionally upgrading.
- Local-only progress is intentionally untrusted. Do not add fairness enforcement or account-shaped abstractions. Possible future AT Protocol support is not current work.

## Commands
- npm install (or npm ci with the committed lockfile)
- npm run dev -- --port 5173
- npm run check
- npm test
- npm run build
- npm run preview -- --port 4173

## Source map
- src/lib/catalog.ts: small metadata-only catalog; never re-export game code here.
- src/lib/platform/daily.ts: Chicago dates and v1 puzzle identities/link validation.
- src/lib/platform/types.ts: PuzzleIdentity, puzzleKey, pinned share URLs.
- src/lib/platform/storage.ts: guarded small localStorage saves and warnings.
- src/lib/games/fivefold/: reference implementation, frozen word data, engine tests, license attribution.
- src/routes/games/fivefold/+page.svelte: reference lazy route, puzzle picker, rollover lifecycle.
- src/app.css: global tokens, focus, reduced motion, shared button/notice styles.
- vite.config.ts: SvelteKit 3 configuration and static prerender entries. There is no svelte.config.js.
- Dockerfile builds/checks/tests the static site; nginx.conf serves it as non-root on port 8080 with real prerendered routes, immutable hashed assets, and no SPA fallback. .github/workflows/push-and-deploy.yaml publishes multi-architecture images and dispatches homepi deployment; infrastructure/hostname routing prerequisites are in README.
- package.json defines native #lib/* subpath imports. Use #lib/platform/daily.js for TypeScript modules; do not reintroduce the legacy $lib alias or .svelte-kit/tsconfig.json.
- static/word-list-license.txt publishes the vocabulary notice. Keep it in sync with src/lib/games/fivefold/DICTIONARY-LICENSE.txt when changing provenance.

## Adding a game
Read docs/ADDING_GAMES.md first. Add only real playable catalog entries. Every game needs a stable ID, metadata, deterministic generator, accessible component, versioned save validation, statically prerendered lazy route, and behavioral verification. Extend the existing small contracts only when necessary; do not introduce a universal game engine or plugin system.

Use that guide's generator-diversity, puzzle-aware save-validation, native-dialog/keyboard, and loading-recovery checks. A successful build alone is not proof that a route loads and plays.

## UX invariants
- Mobile web is the primary surface, not a desktop UI scaled down. Design for 320–430px phone widths and short portrait screens first; retain desktop keyboard play.
- Compact game keyboards must retain clear, separated keys.
- Keep the board and controls together on normal portrait screens; allow scrolling on very short screens instead of shrinking controls beyond usability.
- Shared chrome stays quiet. Scope game CSS. Game keyboard handlers must not capture keys in text inputs, editable content, or with control/meta/alt modifiers.
- Visible copy should explain rules, state, controls, and necessary storage/timezone behavior. Do not add slogans, promotional sections, brand narratives, or descriptions of the site's personality.
- Use compact navigation, direct game lists, and a single-column playing area. Retain considered typography, restrained color, spacing, and styled controls; avoiding promotional content does not mean removing visual design. Keep decorative catalog artwork and oversized introductions out of the interface.
- Shared interface colors use the plum/lilac tokens in src/app.css. Reuse those tokens for links, controls, surfaces, borders, and focus. Keep game feedback colors semantically separate; do not recolor correct/present/absent states to match the brand palette.
- The shared header contains only a centered, home-linked Pocket Games wordmark. The catalog has no visible "Games" section heading; its cards cycle through the vibrant gameCardColors array in src/routes/+page.svelte with dark, contrast-checked text. Keep that card palette separate from the shared plum/lilac controls.
- Use self-hosted Lilita One at its native 400 weight only for the wordmark. Body/game text stays in system fonts. Keep the Latin-only import/preload and public font license; do not add Google Fonts runtime requests or synthetic font weights.
- Keep the subtle neutral console/controller outline pattern confined to the shared content wrapper. Header/footer remain plain, and game surfaces stay opaque for readability. Its original SVG lives in src/lib/assets/console-pattern.svg and is inlined into CSS; do not add animation or external pattern requests.
- Midnight never destroys an active board. Offer the newly available daily instead.
- Invalid links must show an error rather than silently select another puzzle.
- Storage/clipboard denial cannot block play: show a truthful warning or a manual-copy option.
- Never claim that game performance measures intelligence or clinical cognition.

## Verification and delivery
Run check, tests, and static build after changes. Launch the production preview and exercise the actual game in a browser: legal and rejected input, win/loss, duplicate feedback where relevant, refresh/resume, shared link, mobile layout, and unavailable storage. Inspect network resources: catalog must not fetch game/dictionary chunks. Tests should cover rules, seed vectors, validity, state transitions, and Chicago boundaries. Keep dataset licenses intact. Use Git history for change tracking; a separate changelog is not required.

Restart an already running Vite production preview after rebuilding: its static-file cache can otherwise serve the previous build.
