# Awushi profile and reusable images

These images are local Blender renders of `assets/source/awushi.blend`, the same authored character scene used to export the game's `public/assets/awushi.glb`. They preserve the existing geometry, cyan jelly materials, amber eyes, crown, smile and proportions. No image-generation service, downloaded artwork or new character design is involved. The original visual reference remains unchanged at `assets/reference/awushi.png`.

## Choose an image

| File | Use |
| --- | --- |
| `assets/branding/awushi-profile-master.png` | 2048 × 2048 source render for profile pictures and larger layouts |
| `public/assets/branding/awushi-profile-1024.png` | High-resolution square avatar for social profiles and presentations |
| `public/assets/branding/awushi-profile-512.png` | Standard profile and interface use |
| `public/assets/branding/awushi-profile-256.png` | Small profile and interface use |
| `public/assets/branding/awushi-profile-128.png` | Compact avatars and account menus |
| `public/assets/branding/awushi-profile-64.png` | Small avatar badges |
| `assets/branding/awushi-transparent-master.png` | 2048 × 2048 full-body source render with an alpha channel |
| `public/assets/branding/awushi-transparent-1024.png` | Full-body cutout for slides, documents and other backgrounds |
| `public/assets/branding/awushi-transparent-512.png` | Medium full-body cutout |
| `public/assets/branding/awushi-transparent-256.png` | Small full-body cutout |
| `public/assets/branding/awushi-transparent-128.png` | Compact character illustrations |
| `public/assets/branding/awushi-transparent-64.png` | Small character badges |
| `assets/branding/manifest.json` | Render settings, source provenance and output metadata |

The profile composition is a slight-angle, chest-up portrait with space around the crown for circular avatar crops. Use a centered circular crop; check the silhouette at the final display size before adding a border. The transparent version includes the whole character and is useful when an existing layout supplies its own background. Preserve its PNG alpha channel when exporting or placing it in another tool.

The files under `public/` are ready to consume from a local build at `/assets/branding/<filename>`. Adding them to the repository does not change any existing game interface or publish a new deployment. The higher-resolution masters stay outside `public/` so they are not copied into the website build.

## Reduce file size without reducing dimensions

Compressed JPEG and WebP copies keep the same pixel dimensions as their PNG source. The original PNGs and masters remain unchanged. Choose JPEG for profile uploads that expect a conventional photo format; choose WebP for web use and transparent character artwork. JPEG cannot preserve transparency, so only the opaque profile picture has JPEG copies.

| File pattern | Available square sizes | Use |
| --- | --- | --- |
| `assets/branding/awushi-profile-<size>.jpg` | 2048, 1024, 512, 256, 128, 64 | Smaller profile uploads |
| `assets/branding/awushi-profile-<size>.webp` | 2048, 1024, 512, 256, 128, 64 | Compressed web avatars |
| `assets/branding/awushi-transparent-<size>.webp` | 2048, 1024, 512, 256, 128, 64 | Compressed full-body artwork with alpha |
| `assets/branding/compression-report.json` | — | Dimensions, source hashes and measured file sizes |

All 18 compressed files are kept in `assets/branding/` alongside the PNG masters for easy browsing and reuse. Exact copies are also written to `public/assets/branding/` for the website build. Each compression-report entry records the browsing copy as `branding_path` and the public copy as `path`.

Generate these copies locally from the existing PNGs:

```sh
npm run assets:compress
```

This command uses locally installed `cwebp` and `ffmpeg`; it does not render the 3D scene or contact a service. Install those command-line tools separately if they are unavailable. Set `CWEBP_BIN` or `FFMPEG_BIN` to executable paths when they are not on `PATH`:

```sh
CWEBP_BIN=/path/to/cwebp FFMPEG_BIN=/path/to/ffmpeg npm run assets:compress
```

`scripts/compress-branding.mjs` encodes WebP at quality 85 with method 6 and alpha quality 100, and profile JPEG at FFmpeg quality scale 3. Color compression is lossy; retain the PNG master for later editing and inspect the compressed result at its intended display size. Actual file sizes and savings are recorded in the compression report rather than guaranteed by the quality setting. Rerun compression after regenerating the PNGs to refresh the copies.

## PNG copies with compression disabled

The existing standard PNGs already preserve their pixels losslessly. The following copies disable PNG compression, making the files larger without increasing image quality. They are generated from the original PNG inputs recorded in `manifest.json`, never from the lossy JPEG or WebP copies, and retain the same pixels, dimensions and alpha channel.

| File pattern | Available square sizes |
| --- | --- |
| `assets/branding/awushi-profile-<size>-uncompressed.png` | 2048, 1024, 512, 256, 128, 64 |
| `assets/branding/awushi-transparent-<size>-uncompressed.png` | 2048, 1024, 512, 256, 128, 64 |

Generate all 12 copies locally with:

```sh
npm run assets:uncompressed
```

`scripts/uncompressed-branding.mjs` uses local FFmpeg with PNG `compression_level=0`. Set `FFMPEG_BIN=/path/to/ffmpeg` if needed. It keeps existing images, writes metadata to `assets/branding/uncompressed-report.json`, and stores these larger files only in `assets/branding/`; they are not mirrored into the website's `public/` directory.

## Render locally

Use the project's installed Node.js and Blender versions. The committed source scene is sufficient; rendering these images does not require rebuilding the character or the environment.

```sh
npm run assets:branding
```

To regenerate only the smaller PNGs from the existing masters, skip rendering:

```sh
npm run assets:branding -- --resize-only
```

This fast mode checks the recorded hashes, resizes each export directly from its original master, and updates export metadata while preserving the original source and render provenance. The master PNGs remain unchanged. Both image styles are exported at 1024, 512, 256, 128 and 64 pixels; transparent exports retain their alpha channel.

The default production render uses 2048-pixel masters and 128 Cycles samples. For a quick framing review, render 512-pixel, 24-sample drafts into the ignored `.cache/branding/` directory. Draft mode does not update the committed masters or public exports:

```sh
npm run assets:branding -- --draft
```

Override resolution and sample count when needed, or inspect the command help:

```sh
npm run assets:branding -- --resolution 2048 --samples 256
npm run assets:branding -- --help
```

Production master resolution must be between 1024 and 4096 pixels; draft resolution accepts 256–4096. Sample count accepts 1–1024. Larger masters and more samples cost rendering time; public export sizes remain 1024/512/256/128/64 pixels for both profiles and transparent cutouts.

`scripts/render-branding.mjs` discovers Blender using the existing local discovery rules and invokes `scripts/blender/render_branding.py` in headless mode. Set `BLENDER_BIN` to an executable path if Blender is installed elsewhere:

```sh
BLENDER_BIN=/path/to/blender npm run assets:branding
```

The renderer loads the existing character scene, uses its neutral face and the open-eyed `Idle` pose at frame 0, and sets portrait or full-body framing. Existing character materials, studio lights and color management are preserved. It writes the masters, smaller exports and manifest without saving over the `.blend`, changing the GLB, or modifying the original reference. SHA-256 checks before and after rendering verify that the source `.blend` and game GLB remain unchanged.

## Customize and review

Camera framing, backdrop, lighting and output settings belong in `scripts/blender/render_branding.py`. Keep the character's geometry and materials authoritative in the character generator; branding renders should not introduce a second, divergent model. After an intentional character change, regenerate and validate that character first, then rerun the branding renderer.

Inspect both the full-size master and a small avatar preview. Check that the eyes and smile remain readable, the complete crown fits the intended crop, and transparent edges work on both light and dark backgrounds. The full-body cutout should include the feet and all visible crown tips.

These are Cycles studio renders. The game's real-time renderer uses the exported glTF materials and different lighting, so reflections, transparency, absorption and highlights can differ while the underlying character remains the same. The render manifest records the source and settings for repeatable local generation; pixel-identical results across Blender versions or rendering devices are not promised.

Before committing updated scripts or images, run the repository's required checks:

```sh
npm run test:pipeline
npm run assets:validate
npm run build
```

Keep the render scripts, masters, exports and manifest together in version control. Runtime browser checks are needed if the images are later integrated into a game interface.
