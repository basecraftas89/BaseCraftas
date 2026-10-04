# Base Craftas public projects release

Public URLs: `/projects/meguri/`, `/projects/sleeport/`, `/projects/`.
The home page and project index list ToToNoE+, Sleeport and MEGURI.

This dedicated deployment protects the independently deployed ToToNoE+ authentication and member services. Do not deploy the old GitHub main over the current production site. This release is maintained on `release/meguri-sleeport-20261004`; reconcile other production changes before merging to main because main has an automatic production build.

## Rebuild and release

The checked-in `projects/meguri` and `projects/sleeport` are public snapshots. Local source material and generated image originals remain in their original project folders.

- MEGURI editing source: `/Users/kantoshi/01_Base Craftas/05_MEGURI/src/meguri-site`.
- Sleeport source: `/Users/kantoshi/01_Sleeport/src/homepage-v2`.
- MEGURI articles are edited locally and then exported/deployed; no online admin is published.
- Sample stores/articles remain marked as examples; event availability and draft pricing remain as shown in the adopted sites.

```sh
python3 scripts/build-projects-release.py
python3 scripts/check-projects-release.py
wrangler deploy --config apps/projects-sites/wrangler.toml
```

Exporting fresh upstream snapshots requires Python with Pillow:

```sh
python3 scripts/export-project-sites.py --meguri '/Users/kantoshi/01_Base Craftas/05_MEGURI' --sleeport /Users/kantoshi/01_Sleeport
```

Do not export admin, draft JSON, QA, source code, image originals or private records.

## Free-only operating rule

The user requires stopping before an operation can incur charges. Keep Workers Free; never enable paid processing without new user authorization. This deployment has no Worker script, R2, D1, KV, cron, AI or external paid service. Browsing uses unlimited free static-asset delivery. No SSR or runtime processing is introduced.

The build checks the free upload limits: fewer than 20,000 files and each file smaller than 25 MiB. If these limits fail, stop; do not upgrade. Deployment is manual and local, so it does not consume Workers Builds minutes or GitHub Actions. Existing R2 usage is outside this new deployment and its budget alerts do not enforce a spending cap. Do not claim this deployment adds an account-wide R2 automatic stop.

Only the exact home/index/project routes in wrangler.toml are changed. Existing ToToNoE+ services and access routes remain under their existing Workers.

## Verified production release: 2026-10-04

Cloudflare version: `2a2fe4df-5f12-433a-bf60-090814578b9e`. Local release: 49 pages, 1,821 internal references checked, zero private files. Adopted Sleeport source checks: 24 pages, 1,037 links, 215 resources, all six full stories preserved. Live desktop and 390px mobile checks passed. Private editor/source URLs returned 404; anonymous TAYORI and IROHA pages retained login redirects.

## Image optimization: 2026-10-04

See `outputs/project-image-audit-20261004.md` and its JSON inventory for all 78 rasters. Public derivatives use WebP plus responsive widths. Full Japanese font coverage is preserved in WOFF2. Original snapshots remain in Git but unreferenced originals are excluded from deployment. The assets directory is `dist-projects-optimized`.

After exporting fresh snapshots, run `python3 scripts/optimize-project-images.py` (Pillow) and `python3 scripts/compress-project-font.py` (fonttools[woff]); keep the CSS font URL set to WOFF2. Build into a fresh output directory to avoid stale files from earlier exports, then run the reference checker. Do not blindly deploy an old build directory.

Optimized production version: `096712d0-c8fb-4771-8a54-a0fa09ffb60a`. All 259 routed public paths verified HTTP 200; private URLs 404. CSS cache key is bumped so existing visitors load the WOFF2 declaration.

## Project listing logos: 2026-10-04

The Sleeport and MEGURI cards use standalone SVG logos containing three official-character references and deterministic text. Sleeport uses the same Georgia bold / -0.02em typography as its header. Rebuild with `python3 scripts/build-project-logos.py`; the approved WebP frames are retained beside the SVG files. Generated full-resolution originals are preserved under the canonical `assets/project-logos` folder and in Codex generated_images. Prompt and reference notes are in `outputs/project-logos-20261004.json`. The new logos add about 264KiB to the full release, use no remote fonts or paid image transformations, and are served by the existing static worker.
