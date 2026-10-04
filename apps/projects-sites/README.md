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

Preserve the parent-site return link on Sleeport after exporting. Do not export admin, draft JSON, QA, source code, image originals or private records.

## Free-only operating rule

The user requires stopping before an operation can incur charges. Keep Workers Free; never enable paid processing without new user authorization. This deployment has no Worker script, R2, D1, KV, cron, AI or external paid service. Browsing uses unlimited free static-asset delivery. No SSR or runtime processing is introduced.

The build checks the free upload limits: fewer than 20,000 files and each file smaller than 25 MiB. If these limits fail, stop; do not upgrade. Deployment is manual and local, so it does not consume Workers Builds minutes or GitHub Actions. Existing R2 usage is outside this new deployment and its budget alerts do not enforce a spending cap. Do not claim this deployment adds an account-wide R2 automatic stop.

Only the exact home/index/project routes in wrangler.toml are changed. Existing ToToNoE+ services and access routes remain under their existing Workers.
