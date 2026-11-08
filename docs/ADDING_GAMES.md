# Adding a game

## 1. Define the mechanic and deterministic inputs
Choose a stable lowercase route ID. Start with HTML/CSS/SVG; introduce a canvas engine only when it earns its weight. Decide what makes a puzzle valid, how play ends, and what must be saved to resume it.

Use a pure generate(seed) function in src/lib/games/<id>/engine.ts. A generator can have game-specific configuration, but every generation-affecting value must be included in its identity/share link. Current platform links support v1 and standard configuration only: extend these contracts and validation before exposing another configuration or version. Do not add an option that silently reuses another puzzle's save key.

Daily v1 seed encoding is JSON.stringify(['daily', gameId, chicagoDate, 'standard', 1]). Arbitrary-seed mode passes the exact URL-decoded string, including an empty string, without trimming, case folding, or Unicode normalization. These namespaces need not produce distinct boards; seeds can collide in any finite puzzle space.

Use an explicitly defined integer hash/seeded PRNG. Freeze its algorithm, seed encoding, data ordering, and content dependencies. Add a few fixed seed vectors to catch accidental mapping changes. If a generator needs search, use deterministic traversal and work bounds, not timeouts that choose different boards on different devices. Prefer constructing legal puzzles. A Web Worker is warranted when measured generation blocks interaction; import it only from the active game's module and terminate it on disposal.

For copyrighted data, record the exact source/revision and preserve its required license notice. Never fetch a dictionary or puzzle feed at runtime. Dictionaries belong inside the lazy game dependency graph.

## 2. Build the component
Create src/lib/games/<id>/<Game>.svelte. Receive identity: PuzzleIdentity. Keep generated data, input, scoring, and completion state local to this component. The route keys it by puzzleKey(identity), so changing puzzle identity resets the component and its listeners safely.

Use Svelte 5 runes and onMount for browser APIs. Do not generate a date-dependent board during prerender. Restore state before enabling input, validate every loaded record, and do not save empty initial state over an existing save before restoring it. Reject moves after completion and corrupted or incompatible states. Keep keyboard/pointer behavior equivalent and do not hijack input fields or native navigation controls. Remove all listeners, intervals, audio, canvases, and workers on unmount.

Small JSON saves use loadSave and saveSave with puzzleKey(identity). Store a separate save-format version, the minimal resumable state, and no redundant derived board unless necessary. These localStorage APIs are synchronous: keep writes small and outside animation loops; debounce high-frequency input. Storage failure must leave a playable in-memory session and display a warning.

Include clear instructions, accessible state descriptions, non-color-only feedback, visible focus, reduced motion, mobile-friendly controls, and an unambiguous result. Use puzzleUrl(identity, location.origin) for pinned share links. Clipboard failure needs a manual-copy alternative.

Pocket Games is mobile-web-first. Start the layout at 320–430px wide, including short portrait viewports, then enhance it for desktop. Primary navigation and actions need 44px-high touch targets; dense game keyboards need clear key separation and readable labels. Text inputs and copy textareas use at least 16px type to avoid iOS focus zoom. Do not require hover or landscape, block browser zoom, or hide controls beneath fixed overlays. Keep the board and controls together where practical and allow vertical scrolling on very short screens.

## 3. Add the lazy route and catalog entry
Create src/routes/games/<id>/+page.svelte. Follow the Fivefold route's lifecycle without importing its engine. Dynamically import only your component in the browser. Resolve query parameters with resolvePuzzle(gameId, url), using the platform's Chicago calendar date. Do not invoke generate() in a route load function or preload hook.

Keep a selected board's identity fixed across midnight. Recheck the Chicago date on focus, visibility return, and a coarse interval; offer the new daily rather than replacing an active game. No daily rebuild or scheduling is needed.

The platform currently supports generator version 1. Before introducing v2, extend PuzzleIdentity and route validation, add a per-game effective-date version schedule, dispatch the correct generator, and retain old behavior needed by published links/saves. Do not rewrite a historical daily's version because today's code changed.

Add the route to vite.config.ts prerender entries and add a metadata-only entry in src/lib/catalog.ts. Shared catalog code must never import your component, rules, data, worker, or engine, even through a barrel export. Keep preload options disabled unless a measured change justifies intent-based loading. Keep catalog entries compact; never embed live game instances.

Catalog card backgrounds automatically cycle through the gameCardColors array in src/routes/+page.svelte by catalog order. Do not import game code for styling or add dummy games to fill out the palette. Keep card text and focus outlines dark enough for every background.

The home page last-played link currently recognizes Fivefold. Extend that allowlist to registered catalog routes when adding a game; never trust an arbitrary stored URL or cross-origin navigation.

## 4. Verify the contract
- Unit-check legal/illegal moves, boundaries, completion, corrupted saves, generator invariants, and fixed seed vectors.
- Sample many seeds for validity; compare output across supported browsers/worker contexts if applicable. Quantify generation cost on a lower-powered device before claiming it is fast.
- Run npm run check, npm test, npm run build.
- Serve build with npm run preview. Open the catalog first and inspect fetched resources: no game or dictionary chunks. Open your game and confirm unrelated games stay unloaded.
- Actually play with keyboard and touch/click. Exercise rejected moves, win/loss, refresh with a partial draft, route changes, pinned sharing, unavailable storage/clipboard, and a narrow viewport.
- Inspect 320px, 375px, and 390px phone layouts, a short portrait viewport, and landscape. Check touch targets, text entry, browser zoom support, scroll reachability, and no horizontal overflow. Desktop interaction is additional coverage, not a substitute for phone verification.
- Exercise the Chicago midnight boundary and both DST transitions. No 24-hour date arithmetic or UTC-day shortcuts.
- Update README, any changed authoring guidance, and dictionary attribution. Use Git history for change tracking; no separate changelog is required. Do not add placeholders or nonfunctional catalog games.
