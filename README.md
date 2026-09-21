# Base Craftas Website

Base Craftas official static website.

## Cloudflare Workers production deployment

- Build command: `npm run build` (install locked dependencies with `npm ci` in a fresh checkout)
- Deploy command: `npx wrangler deploy --config apps/site-worker/wrangler.toml`
- Public assets directory: `dist`; authorization Worker: `apps/site-worker/worker.js`
- Git-connected production build root: `/`; branch: `main`.
- Always specify the config path, including in Workers Builds. An unconfigured root deployment can publish internal source and bypass the authorization Worker. The production trigger was corrected on 2026-09-22.
- Verify `x-basecraftas-release`, anonymous member redirects and internal-source 404s after the Git-triggered build finishes, not just after a manual deployment.

## Public URL

- Production domain: `https://basecraftas.com`

## Structure

- `index.html`: Home
- `about.html`: About
- `profile.html`: Representative profile
- `contact.html`: Contact
- `services/`: Service pages
- `projects/`: Representative projects published under basecraftas.com
- `projects/weekend-ai/`: 週末のAI整え習慣
- `apps/`: Future demos, tools, and web apps when needed
- `css/`, `js/`, `images/`: Static assets

## URL Structure

- Main site: `https://basecraftas.com/`
- Services: `https://basecraftas.com/services/`
- Projects index: `https://basecraftas.com/projects/`
- 週末のAI整え習慣: `https://basecraftas.com/projects/weekend-ai/`

Keep Base Craftas services in `services/`. Put representative-led projects in
`projects/<slug>/`, and put interactive tools or demos in `apps/<slug>/` when
they are not primary service pages.

## Security release

Do not deploy the repository root. `npm run build` creates `dist` from public files only.
Internal API sources, SQL, settings, tests, and reports must never be deployed as static assets.
Run `npm test` and see `docs/SECURITY_RELEASE_2026-09-11.md` before releasing the security changes.
The production build trigger was read back and verified on 2026-09-22. See `docs/SITE_AUDIT_2026-09-22.md` for findings and remaining operational checks.

## サービス名の参照

TAYORI｜たより、IROHA｜いろはを正式名称とする。名称・提供内容・包含関係は [サービス共通定義](projects/totonoe/SERVICE_NAMING.md) を参照する。

## GitHub管理とローカル資料

サイトのソース・掲載アセットに加え、API、SQL移行、テスト、ビルド設定、共通定義・仕様書をGitHubで管理する。
制作原本、生成プロンプト、バックアップ、過去の検討・監査記録は `00_GitHubに入れない_ローカル専用/` に保管し、Gitから除外する。
`node_modules/`、`dist/`、`.wrangler/` と秘密情報ファイルは、ツールが参照する元の場所でGitから除外する。
GitHubへの登録と本番公開は別工程。APIやSQLを静的配信せず、公開用ビルドには `dist/` を使用する。
