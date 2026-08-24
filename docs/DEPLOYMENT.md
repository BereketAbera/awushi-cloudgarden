# Static deployment

Awushi's DevOps World is live at [awushi-devops-world.vercel.app](https://awushi-devops-world.vercel.app), deployed to Vercel project `awushi-devops-world` in scope `bereketaberas-projects`. The browser runs the game, deterministic infrastructure model, adventure notebook, replay and synthesized audio. Visitors need no account, API key, application server, database service or live infrastructure connection; Vercel delivers the static files.

The [2026-11-06 deployment report](../assets/vercel-deployment.json) records unauthenticated HTTP access and 18 public files whose SHA-256 hashes matched the local production build, including all 14 GLB models. The live Chrome smoke check loaded the WebGL scene, completed the readiness variation of Recover a Failed Pod after a rejected restart and correct repair, and retained completion after reload. It recorded no page/console errors; a missing asset returned 404. This hosted smoke check supplements the broader [Phase 3 verification](PHASE3-VALIDATION.md), rather than repeating its entire browser matrix.

## Build and review locally

Use Node 24 and npm. The checked-in `package.json` pins `engines.node` to `24.x`. Blender is only needed when changing the procedural assets; committed GLBs are sufficient to build the game.

```sh
npm ci
npm run build
npm run preview
```

Open the loopback URL printed by Vite. The development server uses port 5173; the preview server normally uses 4173. The automated browser harness owns port 5176 and starts its own production preview, so leave that port free during verification. `vite preview` is a local review server, not the public production server.

Before preparing a release, install Google Chrome and the additional Playwright browser binaries, then run the repository checks:

```sh
npx playwright install firefox webkit
npm run verify
```

Initial npm/browser installation needs network access. The installed tools, generated assets and runtime are local. On a new Linux machine, Playwright may also require its documented operating-system browser dependencies. Chrome desktop and mobile emulation run the full browser suite; Firefox and WebKit run adventures, compatibility and resilience. Read the actual test output and current validation report instead of treating a configured browser project as evidence of a passing run.

## Repeat a Vercel release

Run from the repository root with the Vercel CLI installed and authenticated to an account with access to `bereketaberas-projects`. In a fresh checkout, link the existing project once:

```sh
vercel link --yes --project awushi-devops-world --scope bereketaberas-projects
```

After reviewing changes and running the checks above, refresh production settings, create the local production build and publish that prebuilt output:

```sh
vercel pull --yes --environment=production --scope bereketaberas-projects
vercel build --prod
vercel deploy --prebuilt --prod --yes --scope bereketaberas-projects
```

`vercel.json` selects the Vite framework, `npm run build` and `dist/`, and sets GLB content type and revalidation headers. The generated `.vercel/` directory contains local project linkage/settings and build output and is ignored by Git. Do not commit it. The app requires no application environment secrets. There is currently no Git remote or automatic Git deployment configured; committing changes alone does not publish a new release.

After deployment, verify the stable production URL, its actual model responses and a saved adventure through the public interface. Refresh the deployment report with the new release's hashes and observations rather than treating the initial report as proof for later builds.

## Static host contract

Publish the complete contents of `dist/` through a static HTTP(S) server. Keep `index.html`, Vite's generated JavaScript/CSS and every copied `assets/*.glb` together. Only `dist/` belongs in the served release; the editable Blender scenes, reference, tests and development tools stay in the source checkout. Use HTTPS for a public host.

The current app expects an origin-root URL such as `https://example.test/`. GLB references in `Scene.tsx`, `SimulationEffects.tsx` and `world-layout.json` begin with `/assets/`, and `vite.config.ts` uses Vite's default base. A subdirectory URL such as `/awushi/` is not supported merely by changing Vite's `base`: update all runtime asset paths consistently and verify every model before using that layout. The interface uses in-page state rather than URL routes, so no application API or route server is needed.

Serve JavaScript, CSS, HTML and GLB bytes with appropriate content types; `model/gltf-binary` is the GLB media type. Keep asset requests on the same origin. A generic HTML fallback must not turn a missing `.glb` or JavaScript request into a successful HTML response. Missing assets should return a real error so the visible retry state can explain the problem.

Vite fingerprints bundled JavaScript/CSS, while files copied from `public/assets/` retain stable names. Long immutable caching is appropriate for fingerprinted bundles, but HTML and stable-name GLBs must revalidate or receive an explicit release cache policy. Publish the release atomically so new HTML cannot point at missing bundles, and retain prior hashed bundles while cached pages may still reference them. Replacing a GLB alone under an aggressively cached name can leave visitors viewing an earlier model.

## Browser-local state

Adventure notebooks use validated versioned localStorage journals. They retain one unfinished attempt per lesson and the best completed recording per lesson, with the currently selected attempt kept separately. Exploration, camera, quality, lighting, reduced motion and audio preferences have their own validated storage. No credentials or real infrastructure data are stored.

Saves belong to a browser profile and origin: changing host, protocol or port creates a different storage area. Incognito sessions, cleared site data, browser eviction or a different device can remove or hide that notebook. There is no account synchronization or automatic cross-origin migration. Recovery notices expose notebook download and explicit reset/retry; there is currently no user-facing import workflow. Do not describe the downloaded recovery JSON as an automatically restorable cloud backup.

In particular, the localhost notebook does not transfer to `https://awushi-devops-world.vercel.app`. Use the stable production URL to keep playing in the same origin across releases; a Vercel deployment-specific URL has a separate notebook.

An incompatible or corrupt notebook is retained rather than overwritten. Storage/quota errors are visible, and current in-memory progress remains exportable. Reload restores an unfinished lesson paused, with no elapsed offline time added. A static release that changes recorded command semantics must update the save version and provide a verified migration or an unsupported-version recovery notice. See [persistence](PERSISTENCE.md) before changing these contracts.

## Release review

1. Load the production preview with an empty browser profile and verify the welcome screen, all district models, character studio and architecture graph.
2. Complete a lesson through its visible inspections and corrections. Reload a paused attempt and resume it; replay a completed journey, change speed and confirm the original result remains intact.
3. Check narrow layouts and keyboard focus, camera switching, navigation markers and reduced motion. Enable sound through Settings and verify mute/volume without autoplay on first visit.
4. Inspect failed asset loading and WebGL recovery. The interface must retain access to saved progress and explain retry/reload; restoring the renderer must not silently resume a paused lesson.
5. Confirm the network panel contains only same-origin runtime assets. Official technology references are outbound links opened deliberately by the visitor; they are not runtime service dependencies.

The app has no service worker or offline installation cache. A locally served checkout can run without an internet connection after dependencies are installed; a publicly hosted copy still needs its static files delivered and cannot promise offline reload. WebGL and usable graphics support are needed for the 3D scene. Low quality limits pixel ratio and removes shadows for lighter devices; the visible frame statistics are local observations, not a universal performance guarantee. Desktop WebKit and phone emulation do not replace testing on physical Safari/iOS hardware.

Historical rendering and performance evidence is retained in [character validation](VALIDATION.md), [Phase 1 verification](PHASE1-VALIDATION.md) and [Phase 2 verification](PHASE2-VALIDATION.md). Use a new phase report for fresh browser results and measurements rather than rewriting those historical records.
