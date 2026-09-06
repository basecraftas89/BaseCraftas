# Column Studio API

Cloudflare Access で保護した Column Studio から、D1 に記事、メンバー、リビジョン、公開履歴を保存するための Worker です。

## 作成済みの Cloudflare リソース

- Access application: `Column Studio`
- Protected path: `basecraftas.com/apps/column-studio/*`
- D1 database: `column-studio-db`
- D1 database id: `67c5a478-7a5d-48af-9e81-c34da1362263`
- R2 bucket: `column-studio-media`

## D1 スキーマ反映

```bash
npx wrangler d1 execute column-studio-db --remote --file apps/column-studio-api/schema.sql
```

## ローカル開発

```bash
npx wrangler dev apps/column-studio-api/src/worker.js --config apps/column-studio-api/wrangler.toml
```

本番では Cloudflare Access が付与する `cf-access-authenticated-user-email` を使います。

ローカル確認時だけ、`ALLOW_DEV_AUTH=true` を設定すると Access の代わりに `x-column-studio-dev-email` ヘッダーでユーザーを渡せます。本番の `wrangler.toml` では `ALLOW_DEV_AUTH=false` にしています。

## 画像アップロード

`POST /api/assets` に `multipart/form-data` で `file` を送ると、画像を R2 に保存して公開URLを返します。

- R2 binding: `MEDIA`
- 1枚あたりの上限: 2MB
- 許可形式: JPEG / PNG / WebP / GIF / SVG
- 保存先キー: `columns/YYYY/MM/<uuid>-<filename>`

公開記事で表示する画像は `GET /media/<r2_key>` から配信します。

## 次に必要なこと

1. R2 bucket `column-studio-media` を作成する。
2. 更新後の `schema.sql` を D1 に反映する。
3. 初期管理者を `members` に追加する。
4. Worker に `basecraftas.com/api/column-studio/*` のルートを割り当てる。
5. Column Studio のフロントエンドを localStorage から API 保存へ切り替える。
6. 公開ボタンから GitHub App で `content/columns/<slug>.json` を commit する処理を追加する。

GitHub App の秘密鍵やトークンは、リポジトリやフロントエンドに置かず、Cloudflare Worker の secret として登録してください。
