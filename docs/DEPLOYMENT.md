# Static deployment

Awushi's DevOps World is live at [awushi-devops-world.vercel.app](https://awushi-devops-world.vercel.app), deployed to Vercel project `awushi-devops-world` in scope `bereketaberas-projects`. The browser runs the game, deterministic infrastructure model, adventure notebook, replay and synthesized audio. Visitors need no account, API key, application server, database service or live infrastructure connection; Vercel delivers the static files.

The [2026-11-06 Phase 4 deployment report](../assets/vercel-deployment.json) records unauthenticated HTTP access and 18 public files whose SHA-256 hashes matched the verified local build, including all 14 GLB models. Production serves source commit `d8c4f3f`. The live Chrome smoke check loaded WebGL, used Watch Flow and Guide Me, completed the readiness variation of Recover a Failed Pod after an ineffective restart and correct repair, verified cleared completion guidance, and retained completion after reload. No page/console errors were recorded; a missing model returned 404. The actual hosted screenshots were inspected. This public check supplements the [Phase 4 browser matrix and visual review](PHASE4-VALIDATION.md). The [prior Phase 3 deployment report](../assets/vercel-phase3-deployment.json) remains historical evidence.

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

Initial npm/browser installation needs network access. The installed tools, generated assets and runtime are local. On a new Linux machine, Playwright may also require its documented operating-system browser dependencies. Chrome desktop and mobile emulation run the full browser suite; Firefox and WebKit run adventures, compatibility, resilience, cinematics, guidance, operational attention and replay isolation. Read the actual test output and current validation report instead of treating a configured browser project as evidence of a passing run.

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

`vercel.json` selects the Vite framework, `npm run build` and `dist/`, and sets GLB content type and revalidation headers. The generated `.vercel/` directory contains local project linkage/settings and build output and is ignored by Git. Do not commit it. The app requires no application environment secrets. Source is hosted privately at [BereketAbera/awushi-cloudgarden](https://github.com/BereketAbera/awushi-cloudgarden), with the local folder named `awushi-cloudgarden`. Automatic Git deployment is not configured; committing or pushing changes alone does not publish a new Vercel release. The existing Vercel project name and live URL remain `awushi-devops-world`.

After deployment, verify the stable production URL against the exact local `dist/` build:

```sh
node scripts/verify-deployment.mjs
```

The script makes unauthenticated requests, compares SHA-256 hashes for HTML, JavaScript, CSS and all 14 GLBs, checks missing-model 404 behavior, then runs a real Chrome journey through Watch Flow, Guide Me, an ineffective correction, verified recovery and reload persistence. It refreshes `assets/vercel-deployment.json` and the hosted Phase 4 screenshots. Review the images as well as the assertions. An optional HTTPS origin argument verifies a different deployment; browser saves belong to that origin.

## Static host contract

Publish the complete contents of `dist/` through a static HTTP(S) server. Keep `index.html`, Vite's generated JavaScript/CSS and every copied `assets/*.glb` together. Only `dist/` belongs in the served release; the editable Blender scenes, reference, tests and development tools stay in the source checkout. Use HTTPS for a public host.

The current app expects an origin-root URL such as `https://example.test/`. GLB references in `Scene.tsx`, `SimulationEffects.tsx` and `world-layout.json` begin with `/assets/`, and `vite.config.ts` uses Vite's default base. A subdirectory URL such as `/awushi/` is not supported merely by changing Vite's `base`: update all runtime asset paths consistently and verify every model before using that layout. The interface uses in-page state rather than URL routes, so no application API or route server is needed.

Serve JavaScript, CSS, HTML and GLB bytes with appropriate content types; `model/gltf-binary` is the GLB media type. Keep asset requests on the same origin. A generic HTML fallback must not turn a missing `.glb` or JavaScript request into a successful HTML response. Missing assets should return a real error so the visible retry state can explain the problem.

Vite fingerprints bundled JavaScript/CSS, while files copied from `public/assets/` retain stable names. Long immutable caching is appropriate for fingerprinted bundles, but HTML and stable-name GLBs must revalidate or receive an explicit release cache policy. Publish the release atomically so new HTML cannot point at missing bundles, and retain prior hashed bundles while cached pages may still reference them. Replacing a GLB alone under an aggressively cached name can leave visitors viewing an earlier model.

## Container image (devops.bereket.dev)

The same `dist/` is also packaged as a static image for `https://devops.bereket.dev`, where an internal nginx container serves it behind Traefik and Traefik terminates TLS. The `Dockerfile` runs `npm ci` and `npm run build` on the builder's own platform, writes a `gzip -9` copy beside every JavaScript, CSS, HTML, SVG, JSON and GLB file, and copies the result onto `nginxinc/nginx-unprivileged` without any `RUN` step, so one Dockerfile produces `linux/amd64` and `linux/arm64` without emulation. Both base images are pinned by digest. `.dockerignore` keeps the source art in `assets/`, the documentation, tests, test output, `node_modules/`, `dist/` and `.vercel/` out of the build context, while `public/assets/` with the GLBs goes in.

Build, run and check it with Docker alone; the host needs no Node:

```sh
docker build -t awushi-web:local .
docker run --rm --read-only --tmpfs /tmp -p 127.0.0.1:8080:8080 awushi-web:local
scripts/smoke-image.sh awushi-web:local
```

Open `http://127.0.0.1:8080/` while the second command runs. The container runs as uid 101, listens on 8080 and needs only a writable `/tmp`, so a read-only root filesystem works. `/healthz` answers `ok` for probes and writes no access log. `scripts/smoke-image.sh` starts its own read-only container on a random loopback port. It checks status codes, `Content-Type`, `Cache-Control`, gzip, the security headers and a versionless `Server` header, and compares every served model with the bytes in `public/assets/`, so run it from the commit the image was built from. It removes its container whatever the result.

`deploy/nginx/default.conf` meets the static host contract this way:

| Contract | Image |
| --- | --- |
| Complete `dist/` at an origin root | nginx serves `dist/` at `/`, and the site is `https://devops.bereket.dev/`. The image copies `dist/` into `/srv/www`, which holds nothing else, so the base image's own pages in `/usr/share/nginx/html`, such as `50x.html`, are not served |
| No HTML fallback | Every location ends in `try_files $uri =404`. A missing `.glb`, bundle or other path is a 404, and so is a directory |
| Content types | nginx's `mime.types`, plus `model/gltf-binary` for `.glb` |
| Cache policy | Hashed bundles such as `/assets/index-bmle6U-W.js` are `public, max-age=31536000, immutable` when they are there, sent whole, as a range or as a 304. A 404 for a bundle is `no-cache`, so a CDN in front cannot keep an old pod's 404 for a new release's bundle. GLBs are `public, max-age=0, must-revalidate`. `index.html`, `/assets/branding/*` and everything else are `no-cache` |
| Same origin over HTTPS | Every file comes from this server, and Traefik provides HTTPS |
| Transfer size | `gzip_static` sends the prebuilt `.gz` files, so the 14 GLBs move as 3.8 MB instead of 12.5 MB and the bundles as 0.5 MB instead of 1.7 MB |

`deploy/nginx/security-headers.conf` adds `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: SAMEORIGIN`, a `Permissions-Policy` that turns off camera, microphone, geolocation and payment, and a `Content-Security-Policy` of `frame-ancestors`, `base-uri`, `object-src` and `form-action` only. Scripts, styles, images and connections stay unrestricted, so WebGL, the inline `data:` favicon, `blob:` textures from the GLBs, the save download and same-origin model requests keep working. Fullscreen stays allowed for this origin. Another origin cannot frame the game.

Each image holds exactly one release and does not keep the previous release's hashed bundles. While two releases serve side by side during a rollout, a page whose `index.html` came from one can request its bundles from the other and receive 404s until it reloads. Atomic publication is therefore the deployment's job: never let one page reach two releases, for example by running one replica that is replaced with the `Recreate` strategy, or by sticky sessions. `devops.bereket.dev` is a new origin, so notebooks saved on the Vercel URL do not appear there; see [browser-local state](#browser-local-state).

`.github/workflows/ci.yml` runs lint, type checks, unit, pipeline and runtime tests, GLB validation and the build for every pull request and every push to `main`. The Playwright suite has only run on a Mac with a GPU, so its job in `ci.yml` runs only when started by hand from the Actions tab. `.github/workflows/images.yml` builds the `linux/amd64` image for a pull request and smoke-tests it without pushing. On a push to `main` it pushes `linux/amd64` and `linux/arm64` to `ghcr.io/bereketabera/awushi-cloudgarden/web`, tagged with the first 12 characters of the commit SHA. It then pulls the `linux/amd64` image back by digest, smoke-tests it, and scans it with trivy, failing on any CRITICAL vulnerability that has a fix. Only after that does it write the index and `linux/amd64` digests to the job summary and the `image-digests` artifact, so a digest without that record has not passed. Deploy by digest, not by tag. The package is created private, like the repository, so the cluster needs a pull credential unless the owner makes it public.

Deployment configuration, including the Kubernetes objects, the Traefik route and its TLS, and the digest that runs, lives in the Wayline platform repository. Nothing in this repository deploys. The Vercel deployment described above stays in place until the owner retires it.

On 2026-11-07 the image was built and smoke-tested on an arm64 Mac, both natively and as a `linux/amd64` build run under emulation. Neither workflow has run on GitHub yet.

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
