# Adding a game

## 1. Define the mechanic and deterministic inputs
Choose a stable lowercase route ID. Start with HTML/CSS/SVG; introduce a canvas engine only when it earns its weight. Decide what makes a puzzle valid, how play ends, and what must be saved to resume it.

Use a pure generate(seed) function in src/lib/games/<id>/engine.ts. A generator can have game-specific configuration, but every generation-affecting value must be included in its identity/share link. All current games use standard configuration. Fivefold and Kings support generator v1; Catdog supports v1 and v2 through generate(seed, version). Pass identity.generatorVersion when generating Catdog boards. Extend validation before exposing another configuration or version, and never silently reuse an incompatible puzzle's save key.

Daily seed encoding is JSON.stringify(['daily', gameId, chicagoDate, 'standard', generatorVersion]), using the game's supported version from dailyIdentity. Use seedIdentity for arbitrary-seed mode, which passes the exact URL-decoded string, including an empty string, without trimming, case folding, or Unicode normalization. These namespaces need not produce distinct boards; seeds can collide in any finite puzzle space.

Use an explicitly defined integer hash/seeded PRNG. Freeze its algorithm, seed encoding, data ordering, and content dependencies. Add a few fixed seed vectors to catch accidental mapping changes. If a generator needs search, use deterministic traversal and work bounds, not timeouts that choose different boards on different devices. Prefer constructing legal puzzles. A Web Worker is warranted when measured generation blocks interaction; import it only from the active game's module and terminate it on disposal.

Measure structural variety, not just the number of seeds: compare king/solution arrangements and region geometry after normalizing color labels, rotations, and reflections. Label shuffles alone do not create new geometry, and fixed color-to-row/column assignments can reveal answers. A constructed legal solution proves solvability, not uniqueness or difficulty; judge completion against the rules rather than only that stored solution. Time generation separately from expensive validation/canonicalization, and report device/runtime, sample size, and tail latency before adding a worker.

For copyrighted data, record the exact source/revision and preserve its required license notice. Never fetch a dictionary or puzzle feed at runtime. Dictionaries belong inside the lazy game dependency graph.

## 2. Build the component
Create src/lib/games/<id>/<Game>.svelte. Receive identity: PuzzleIdentity. Keep generated data, input, scoring, and completion state local to this component. The route keys it by puzzleKey(identity), so changing puzzle identity resets the component and its listeners safely.

Use Svelte 5 runes and onMount for browser APIs. Do not generate a date-dependent board during prerender. Restore state before enabling input, validate every loaded record, and do not save empty initial state over an existing save before restoring it. Reject moves after completion and corrupted or incompatible states. Keep keyboard/pointer behavior equivalent and do not hijack input fields or native navigation controls. Remove all listeners, intervals, audio, canvases, and workers on unmount.

Small JSON saves use loadSave and saveSave with puzzleKey(identity). Store a separate save-format version, the minimal resumable state, and no redundant derived board unless necessary. These localStorage APIs are synchronous: keep writes small and outside animation loops; debounce high-frequency input. Storage failure must leave a playable in-memory session and display a warning.

Validate saves against the game's resumable states, not only JSON shape. Kings deliberately permits conflicting placements and more than ten crowns: restore distinct in-bounds cells and recompute conflict feedback, rather than discarding a player's mistakes. Only a solved board may have an unrecorded completion time; validate that state against the generated regions as well as row, column, and non-touching rules. Reject corrupted or incompatible records with a truthful warning and fresh-board recovery. Generator and save-format versions are independent; an unpublished generator rename must not accidentally make incompatible old positions valid again.

Include clear instructions, accessible state descriptions, non-color-only feedback, visible focus, reduced motion, mobile-friendly controls, and an unambiguous result. Use puzzleUrl(identity, location.origin) for pinned share links. Clipboard failure needs a manual-copy alternative.

Match the shared single-card layout used by Fivefold and Kings: do not add a second outline around the overall playing area. Keep board grids and region boundaries that communicate game rules.

Pocket Games is mobile-web-first. Start the layout at 320–430px wide, including short portrait viewports, then enhance it for desktop. Primary navigation and actions need 44px-high touch targets; dense game keyboards need clear key separation and readable labels. Text inputs and copy textareas use at least 16px type to avoid iOS focus zoom. Do not require hover or landscape, block browser zoom, or hide controls beneath fixed overlays. Keep the board and controls together where practical and allow vertical scrolling on very short screens.

### Interaction lifecycle lessons
- Keep a start gate local to the board and render a seed-independent decorative preview until Start/Resume. A translucent layer over the actual regions still leaks the puzzle. This is a UX gate, not a security boundary.
- Define timer policy explicitly. For Kings-style gated puzzles, persist accumulated active duration, start only on Start/Resume, freeze on completion, and exclude gate waiting and closed-page time. Use monotonic timing during a session rather than wall-clock deltas across reloads.
- Native showModal() focuses a control even without autofocus, and closing restores the opener. Implement the required focus policy explicitly; do not hide keyboard focus outlines as a workaround. The shared New seed dialog leaves no control focused on open/close while preserving intentional Tab navigation and native Escape.
- With no modal control focused, key events can target the page body and bypass the dialog's own handlers. Isolate those events from game-level keyboard listeners without blocking text fields or browser default actions.
- Successful copying uses a brief, non-blocking live-region toast rather than inserting content that shifts controls. Reset its lifetime on repeated success and clean it up on unmount. Keep copy failures and selectable manual-copy text persistent; feedback must not steal focus.

## 3. Add the lazy route and catalog entry
Create src/routes/games/<id>/+page.svelte. Follow the Fivefold route's lifecycle without importing its engine. Dynamically import only your component in the browser. Resolve query parameters with resolvePuzzle(gameId, url), using the platform's Chicago calendar date. Do not invoke generate() in a route load function or preload hook.

Use #lib/platform/PuzzlePicker.svelte in the route header, passing gameId and the current identity (or null while resolving). Its New seed dialog owns custom-seed, date, random, and today navigation; do not duplicate per-game picker forms. Keep game components and engines out of this shared component.

Keep a selected board's identity fixed across midnight. Recheck the Chicago date on focus, visibility return, and a coarse interval; offer the new daily rather than replacing an active game. No daily rebuild or scheduling is needed.

Retain published generator versions to reproduce historical daily puzzles, shared links, and saved progress. Catdog defaults to v2 for custom seeds and daily dates from 2026-11-09 in America/Chicago; earlier daily dates default to v1. Explicit `v=1` and `v=2` links select either Catdog version at any date or seed, and daily seed strings encode the exact requested version. Both versions have unique completions; v2 ensures no relation endpoint is a shaded given by propagating equivalent fixed pets before minimizing givens again. Catdog's implementation, component, route, and preview asset use `catdog`; `/games/catdog/` is canonical, while the old `/games/sunmoon/` shell redirects with the complete query and fragment. Its historical `sunmoon` puzzle identity, storage namespace, numeric pet mapping, and save-format version 1 remain unchanged. puzzleKey includes the generator version to separate old and new saves. Fivefold and Kings remain on generator v1. Kings' first-release generator and independent save-format version do not support earlier unpublished boards.

Add the route to vite.config.ts prerender entries and add a metadata-only entry in src/lib/catalog.ts. Read that entry's description for the game screen subheader so it stays in sync with the catalog card. Shared catalog code must never import your component, rules, data, worker, or engine, even through a barrel export. Keep preload options disabled unless a measured change justifies intent-based loading. Keep catalog entries compact; never embed live game instances.

Each catalog entry includes preview.src and preview.alt. Use a local 256×256 WebP under static/previews/ with a concise description of the visible board. Capture a fixed seeded sample, not a daily puzzle or the player's progress; the catalog must load only the image, never render a live game to make its thumbnail. Current captures use Fivefold seed catalog-preview with guesses CRANE, SHOUT, BLIMP; Kings seed fixed-seed with crowns at zero-based cells 6, 14, 22, 35, 49; and Catdog generator v2, seed catalog-preview, with correct entries at zero-based cells 0–12. Frame the complete board on white with a 10px inset.

Keep preview thumbnails at the right edge of catalog cards on phone and desktop layouts, vertically centered across the full card rather than just the copy row. Group category and duration together below the copy. Use compact 16px card padding and an 8px gap above the metadata without shrinking the title's 44px tap target. Reserve at least two lines for each description and keep catalog rows equal-height; unusually long descriptions must expand the cards together rather than be clipped.

Catalog card backgrounds automatically cycle through the gameCardColors array in src/routes/+page.svelte by catalog order. Do not import game code for styling or add dummy games to fill out the palette. Keep card text and focus outlines dark enough for every background.

Wrap each catalog card in one native link named by its game heading and described by its summary. The preview, metadata, and card padding must all navigate to the same game. Use a visible full-card keyboard focus outline, keep one tab stop per card, and do not nest links or buttons inside it.

The home page validates last-played links against the metadata catalog. Preserve its same-origin, registered-route check when adding a game; never trust an arbitrary stored URL or cross-origin navigation.

## 4. Verify the contract
- Unit-check legal/illegal moves, boundaries, completion, corrupted saves, generator invariants, and fixed seed vectors.
- Sample many seeds for validity; compare output across supported browsers/worker contexts if applicable. Quantify generation cost on a lower-powered device before claiming it is fast.
- Run npm run check, npm test, npm run build.
- Verify the actual preview process, origin, and port the user is accessing, not only a newly started server on another port. After every rebuild, stop and restart that preview, then reload browser tabs opened against the previous build. A stale preview can serve HTML whose hashed JavaScript requests return 404.
- Open the catalog first and inspect fetched resources: no game or dictionary chunks. Exercise direct game URLs, catalog-to-game navigation, and navigation between games; confirm unrelated games stay unloaded. A successful direct load does not prove client-side navigation works.
- Exercise a failed route-module request: the shared error page must offer a full-page reload preserving the complete puzzle URL and saves, plus catalog navigation. Recovery controls do not establish or fix the underlying cause.
- Actually play with keyboard and touch/click. Exercise rejected moves, win/loss, refresh with a partial draft, route changes, pinned sharing, unavailable storage/clipboard, and a narrow viewport.
- Verify clipboard success with actual copy/paste as well as missing/rejected write APIs. Clipboard read permission can be denied while writes work; readText() failure alone does not establish a sharing failure. Check toast expiry, repeated-copy timing, and persistent error recovery.
- Exercise New seed: cancel preserves the active board; custom seeds (including empty and Unicode), pinned dates, random puzzles, and today's Chicago daily navigate correctly. Modal keys must not reach game handlers, including while no control is focused. Check Escape and intentional Tab navigation within the modal; opening and closing must leave no control focused. In browser automation, wait for both the closed state and the final focus state before sending follow-up keys.
- Inspect 320px, 375px, and 390px phone layouts, a short portrait viewport, and landscape. Check touch targets, text entry, browser zoom support, scroll reachability, and no horizontal overflow. Desktop interaction is additional coverage, not a substitute for phone verification.
- Exercise the Chicago midnight boundary and both DST transitions. No 24-hour date arithmetic or UTC-day shortcuts.
- Update README, any changed authoring guidance, and dictionary attribution. Use Git history for change tracking; no separate changelog is required. Do not add placeholders or nonfunctional catalog games.

### Debugging loading and navigation failures
- Start with the user's exact failing URL and navigation sequence. If multiple games fail, inspect shared client startup before changing an individual game's lifecycle or generator.
- Trace the served HTML to its startup script, route module, game component, and required styles. Inspect console exceptions and failed network requests. HTTP 200 for the document can still leave the prerendered loading shell visible when JavaScript fails.
- Reproduce a concrete failure before editing. Do not guess at `onMount`, effects, or navigation callbacks merely because loading stalls. A generic 500 is a symptom; a deliberately failed module request reproducing it does not prove that the user's original exception had the same cause.
- Keep verification levels distinct: check/tests/build, asset delivery, direct hydration, client-side navigation, and actual browser interaction each cover different failures. Passing an earlier level is not proof of a later one.
- Use available, authorized browser tooling; do not turn debugging into an unrequested browser installation. If browser execution is unavailable, a throwaway DOM/ESM diagnostic can exercise the served bootstrap, navigation, input, and failure recovery. Report that limitation explicitly: it does not verify browser compatibility or visual layout. Remove temporary diagnostics afterward.
- Distinguish diagnostic-harness failures from application failures: missing native DOM APIs or an incorrectly linked diagnostic ESM graph are not evidence of a production defect. Trace failures to the served application before changing its lifecycle or imports.

