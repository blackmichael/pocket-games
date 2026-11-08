# Pocket Games

A mobile-web-first, static, local-first daily puzzle site. **Fivefold** is a five-letter word deduction game with six guesses. **Kings** is a 10×10 logic puzzle: place ten crowns, one in each row, column, and colored region, without letting them touch—even diagonally. The games are not affiliated with Wordle, The New York Times, or LinkedIn.

Phone layouts and touch interaction are the primary design target; desktop keyboard play remains supported. The Pocket Games rename preserves existing puzzle URLs, seed mappings, and local browser save keys.

## Run

Requires npm and Node 22.17+ on the 22.x line, Node 24.x, or Node 26+. The supported range follows the locked build/test toolchain; Node 23 and 25 are not supported.

```sh
npm ci
npm run dev
```

For VPN development, Vite allows `testlab.walleye-koi.ts.net` in both dev and preview modes. Run `npm run preview -- --port 3333 --strictPort` to access the built site at `http://testlab.walleye-koi.ts.net:3333/`. Both commands bind to all interfaces; other hostnames remain subject to Vite's host checks. Browser saves are origin-specific, so changing between localhost and the VPN hostname uses separate local progress.

## Verify and build

```sh
npm run check
npm test
npm run build
npm run preview
```

After rebuilding, stop and restart any running production preview, including the VPN preview on port 3333. A preview left running across builds can serve pages whose hashed JavaScript files return 404. Reload browser tabs opened against an earlier build as well.

Unexpected page errors offer a full-page reload of the same puzzle URL or a return to the catalog. Neither action clears saved progress; reloading also replaces an older client-side module graph.

The build directory contains the complete static site. Deploy it to Cloudflare Pages or another static host with npm run build as the build command and build as the output directory. No Functions, runtime server, secrets, database, or daily cron are required. Prerendered directory-style routes use trailing slashes. Serve hashed assets with long-lived immutable caching and HTML with revalidation so new releases can be discovered.

Dependency audit note (2026-11-08): the build toolchain includes deepmerge 4.3.1, affected by the low-severity [GHSA-gcqx-w48m-w2h4](https://github.com/advisories/GHSA-gcqx-w48m-w2h4). No patched release is available. Its current use merges trusted Svelte/Vite configuration, not player input, and it is not part of the static browser application. Recheck when updating dependencies; do not apply the audit's suggested downgrade to obsolete SvelteKit versions.

## Container deployment

The production hostname is https://games.michaelblack.xyz. Dockerfile builds with Node, runs the checks/tests, and copies only the generated static site into non-root Nginx listening on port 8080. No Node process, backend, or puzzle generation runs in the production container. Base images are digest-pinned; the build stage uses the builder's native architecture because its static output is architecture-independent.

```sh
docker build -t pocket-games .
docker run --rm -p 8080:8080 pocket-games
```

nginx.conf serves prerendered directory routes without an SPA fallback: unknown paths and missing assets return 404. HTML is revalidated, hashed assets have immutable caching, and text assets are gzip-compressed.

.github/workflows/push-and-deploy.yaml follows the existing Spareme deployment flow. A push to main (or a manual run on main) builds and publishes linux/amd64 and linux/arm64 images to ghcr.io/blackmichael/pocket-games with latest, main, and sha-<full-commit> tags, then sends deploy-homepi to blackmichael/homepi. Actions are commit-pinned. The workflow uses GITHUB_TOKEN for GHCR and requires the HOMEPI_DISPATCH_TOKEN Actions secret with repository-dispatch access to homepi (Contents: write for a fine-grained token).

Before the first deployment, configure the receiving infrastructure in blackmichael/homepi:

- Add a pocket-games-web service using ghcr.io/blackmichael/pocket-games:latest on its existing proxy_external network. Route Host(`games.michaelblack.xyz`) to container port 8080, not the Spareme container's port 80.
- Add pocket-games-web|blackmichael/pocket-games to .github/deploy-targets.txt; the receiver rejects unregistered source repositories.
- Configure DNS/TLS for games.michaelblack.xyz in the existing proxy setup, and allow the deployment host to pull the GHCR package (public visibility or authenticated pulls).

Those infrastructure changes are separate from this repository. No VITE_SITE_URL build argument is needed: puzzle links use the browser's actual origin, and TLS terminates at the existing proxy.

## Puzzle behavior

- Today's puzzle uses the browser clock and the America/Chicago calendar date, including daylight saving time.
- Daily puzzles generate only when opened; no generated daily records or archive pages are stored on a server.
- /games/fivefold/ opens today's word puzzle; /games/kings/ opens today's crown-placement puzzle.
- Both games have a New seed button in the header. Its modal offers a repeatable custom seed, a pinned daily date, a random puzzle, or today's puzzle. Closing without selecting leaves the active board unchanged.
- Kings uses generator v1 for all daily dates and custom seeds. Seeded legal king arrangements, irregular connected region growth, and shuffled region colors replace the old 20-board template generator. Earlier unpublished board data is intentionally reset instead of migrated, so old positions are not restored onto different boards.
- Kings initially shows a fixed decorative grid unrelated to the selected puzzle beneath a translucent white veil; the Start/Resume button stays fully opaque above it. The real board is not rendered until Start puzzle or Resume puzzle is pressed, which also starts the timer; waiting at the gate does not count. Saved elapsed time resumes, completion freezes it, and clearing the board does not reset it. Time with the page closed is not counted.
- Rejected Kings placements show an × and outline conflicting kings without changing the board. A solved board shows a timed result and a brief crown/confetti celebration; reduced-motion users receive the static result without the burst.
- Solved Kings boards offer Share result, including after refresh. It copies the recorded completion time and a link pinned to the exact date or seed and generator version, without revealing king positions. A successful copy shows a four-second toast without changing the result panel layout or leaving the Share button focused. If no completion time is recorded, the shared result says so. If clipboard access is unavailable, selectable result text allows manual copying.
- A new daily never replaces an active board. Use the offered link or the New seed modal to change puzzles.
- Local browser storage holds progress and the last played link. Clearing storage or switching browsers/devices loses local progress. If storage is unavailable, play continues with a warning.
- There are no accounts, server statistics, score verification, or AT Protocol integration. Client-side puzzle data is inspectable by design. Previously unvisited games are not guaranteed to work offline; there is no service worker.

## Architecture and game development

SvelteKit 3, Svelte 5, TypeScript, Vite, and adapter-static. The catalog imports only metadata; Fivefold and Kings are dynamically imported only on their game pages. Pure rules/generation are independent of UI and browser storage. There are no runtime third-party font requests, external game engines, or puzzle feeds.

The wordmark uses self-hosted Lilita One (Latin, regular 400) from @fontsource/lilita-one. Its WOFF2 file is preloaded with font-display: swap; body text and game controls retain system fonts. The original copyright notice and SIL Open Font License are published at /lilita-one-license.txt and linked from the footer.

Read [AGENTS.md](AGENTS.md) for repository instructions and [docs/ADDING_GAMES.md](docs/ADDING_GAMES.md) for the game contract and checklist. Fivefold data provenance and redistribution notices live next to its dictionary.

