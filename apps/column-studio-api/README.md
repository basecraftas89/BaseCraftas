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

本番では `Cf-Access-Jwt-Assertion` の署名・発行元・Audience・有効期限を検証し、JWT内のメールアドレスを使います。メールヘッダーだけでは認証しません。

Worker の環境変数に次を設定してください。

- `TEAM_DOMAIN`: `https://<team-name>.cloudflareaccess.com`
- `POLICY_AUD`: Column Studioを保護するAccess ApplicationのAudienceタグ

`workers.dev` は無効化しています。編集APIの `basecraftas.com/api/column-studio/*` もCloudflare Accessの保護対象に含めてください。公開画像の `basecraftas.com/column-media/*` は認証不要の配信経路です。

ローカル確認時だけ、`ALLOW_DEV_AUTH=true` を設定すると Access の代わりに `x-column-studio-dev-email` ヘッダーでユーザーを渡せます。本番の `wrangler.toml` では `ALLOW_DEV_AUTH=false` にしています。

## 画像アップロード

`POST /api/assets` に `multipart/form-data` で `file` を送ると、画像を R2 に保存して公開URLを返します。

- R2 binding: `MEDIA`
- 1枚あたりの上限: 2MB
- 許可形式: JPEG / PNG / WebP / GIF / SVG
- 保存先キー: `contents/YYYY/MM/<uuid>-<filename>`

公開記事で表示する画像は `GET /media/<r2_key>` から配信します。

本番の `basecraftas.com` では、公開記事から画像を表示できるように `GET /column-media/<r2_key>` でも配信します。編集APIは Access 配下のまま、画像表示だけを公開ページ向けに分けています。

## メンバー・権限

管理者はダッシュボードからD1のメンバーを登録し、管理者・編集者・閲覧者を設定できます。最後の有効な管理者は変更・停止できません。

この登録はCloudflare Accessの許可ポリシー自体を変更せず、招待メールも送信しません。新しいメンバーはAccess側でも同じメールアドレスを許可してください。

## 公開処理

`POST /api/articles/:id/publish` を実行すると、管理者権限を確認したうえで GitHub の ToToNoE+ 配下に以下を commit します。

- `projects/totonoe/data/contents/<slug>.json`
- `projects/totonoe/data/contents/index.json`
- `projects/totonoe/contents/index.html`
- `projects/totonoe/contents/<slug>.html`

公開JSONには `content_type`、`topic_tags`、`main_actor`、`speakers`、`media_url` を含めます。既存のタグ値は `tags` としても残し、保存ごとの履歴は `article_versions.tags` に記録します。

`POST /api/link-preview` にURLを送ると、note / stand.fm / YouTube / Google Drive を判定し、タイトル・概要・OGP画像・公開日・反映先の候補を返します。外部URLのHTML取得はこれらの対応ドメインに限定し、読み込み量に上限を設けています。

`media_url` に外部URLを入れた場合は公開時にも再取得します。noteリンクで `og:image` が取得できた場合は、手動アイキャッチ未設定のサムネイルとして `hero_url` に反映します。Podcast・動画・アーカイブは `data/contents/index.json` からToToNoE+の対応タブに自動反映します。

4ファイルのGitHub更新は1つのcommitとして反映し、競合した場合は1回だけ最新状態を取得し直します。

必要な設定:

- `GITHUB_REPOSITORY`: `basecraftas89/BaseCraftas`
- `GITHUB_BRANCH`: `main`
- `GITHUB_TOKEN`: Cloudflare Worker secret に保存する GitHub token

`GITHUB_TOKEN` はリポジトリやフロントエンドには置かないでください。Cloudflare Worker の secret としてのみ登録します。

## 非公開・ゴミ箱・復元

管理者はコンテンツ一覧から次の操作を行えます。

- 非公開: 公開中の記事をGitHubの一覧JSONと個別HTML/JSONから取り除き、D1では `archived` として保持します。
- ゴミ箱: 必要なら同じ公開ファイル削除を行い、D1の `deleted_at` を記録します。移動直後から30日間は記事本文、編集履歴、R2画像を保持します。
- 復元: 30日以内のゴミ箱記事を `draft` に戻します。自動公開はせず、確認後に公開ボタンを押します。
- 期限切れ削除: 毎日03:15（日本時間）のCron Triggerで、移動から30日を過ぎた記事・編集履歴・公開履歴・R2画像を完全削除します。処理は1回50記事までです。

APIは `POST /api/articles/:id/lifecycle` で、`action` に `unpublish` / `trash` / `restore`、`expected_revision` に現在のリビジョンを送ります。完全削除は実装していません。

既存D1には `migrations/20260908_article_lifecycle.sql` を一度だけ適用してください。Cron Triggerは `wrangler.toml` の `15 18 * * *`（UTC）を使用します。

ダッシュボードの左側メニューは「すべて・コラム・Podcast・動画・アーカイブ」に分けています。Podcastなどの一覧から新規作成すると、その種別が最初から選択されます。

## 本番反映前の確認

1. `TEAM_DOMAIN` と `POLICY_AUD` をWorkerに設定する。
2. Access Applicationでダッシュボードと編集APIの両方を保護する。
3. `migrations/20260908_editor_revisions.sql` をD1に一度だけ適用する。
4. Workerと静的ダッシュボードを同じ版として反映する。
5. 管理者・編集者・閲覧者の別アカウントで保存、競合、履歴、公開を確認する。

GitHub App の秘密鍵やトークンは、リポジトリやフロントエンドに置かず、Cloudflare Worker の secret として登録してください。

## Google Drive アーカイブ確認

- 対象フォルダ: `12YHtKFODi75v_W08xFACzm97DjFIUCjg`
- 自動確認: 毎週土曜日 09:00（日本時間。CronはUTCの `0 0 * * 6`）
- 手動確認: アーカイブ画面の「今すぐ確認」
- 反映方法: 新着を候補として保存し、「下書きに取り込む」で記事化します。Main Actorなどを確認してから公開します。
- 必須Secret: `GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL` と `GOOGLE_DRIVE_SERVICE_ACCOUNT_PRIVATE_KEY`
- Google CloudでDrive APIを有効化し、対象フォルダをサービスアカウントのメールへ「閲覧者」で共有します。
- 公開済み記事と同じ `source_id` のDriveファイルは重複作成しません。
