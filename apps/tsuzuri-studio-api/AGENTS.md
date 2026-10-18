
## Production continuity (2026-10-18)
- Wrangler production entry is published-runtime/worker.js, reconciled with the currently deployed API. Keep every imported module, fetch and scheduled handlers, member/billing guards, KPT and GSC scheduling.
- src/access-reports.js is the editable weekly report module. src/worker.js remains useful for source tests but differs from the current deployed composite; do not replace production with an unreconciled older source build.
- For an API change, snapshot current production code/settings, bundle only the scoped module, compose it with the latest production entry, check for concurrent deployments, and persist the complete entry plus referenced modules. Run node scripts/studio-api-release-guard.mjs and scoped tests before release. Verify registered fetch/scheduled handlers and existing Cron after release.
- Editor administrative access is GET-only for the member list and billing aggregate. Waiting-member identities and all administrative writes remain admin-only.
