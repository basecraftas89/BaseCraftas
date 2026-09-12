# TSUZURI Studio API

Cloudflare Access で保護した TSUZURI Studio から、D1 に記事、メンバー、リビジョン、公開履歴を保存するための Worker です。

## 作成済みの Cloudflare リソース

- Access application: `TSUZURI Studio`
- Protected path: `basecraftas.com/apps/tsuzuri-studio/*`
- D1 database: `column-studio-db`
- D1 database id: `67c5a478-7a5d-48af-9e81-c34da1362263`
- R2 bucket: `column-studio-media`

## D1 スキーマ反映

```bash
npx wrangler d1 execute column-studio-db --remote --file apps/tsuzuri-studio-api/schema.sql
```

## ローカル開発

```bash
npx wrangler dev apps/tsuzuri-studio-api/src/worker.js --config apps/tsuzuri-studio-api/wrangler.toml
```

本番では `Cf-Access-Jwt-Assertion` の署名・発行元・Audience・有効期限を検証し、JWT内のメールアドレスを使います。メールヘッダーだけでは認証しません。

Worker の環境変数に次を設定してください。

- `TEAM_DOMAIN`: `https://<team-name>.cloudflareaccess.com`
- `POLICY_AUD`: TSUZURI Studioを保護するAccess ApplicationのAudienceタグ

`workers.dev` は無効化しています。編集APIの `basecraftas.com/api/tsuzuri-studio/*` もCloudflare Accessの保護対象に含めてください。公開画像の `basecraftas.com/column-media/*` は認証不要の配信経路です。

ローカル確認時だけ、`ALLOW_DEV_AUTH=true` を設定すると Access の代わりに `x-column-studio-dev-email` ヘッダーでユーザーを渡せます。本番の `wrangler.toml` では `ALLOW_DEV_AUTH=false` にしています。

## 画像アップロード

`POST /api/assets` に `multipart/form-data` で `file` を送ると、画像を R2 に保存して公開URLを返します。

- R2 binding: `MEDIA`
- 1枚あたりの上限: 2MB
- 許可形式: JPEG / PNG / WebP / GIF（SVG拒否）
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
- つづり｜TSUZURI: `projects/totonoe/tsuzuri/<slug>.html`
- 動画などの既存種別: `projects/totonoe/contents/<slug>.html`

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

ダッシュボードは「すべて・つづり｜TSUZURI・動画」を表示します。Podcastとアーカイブはスタジオ外で管理し、既存データ/APIは互換性のため保持しています。

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
- 旧ダッシュボードの手動確認・取り込みUIは撤去済みです。以下のAPI・定期処理は既存運用のため保持しています。
- 反映方法: 新着を候補として保存し、「下書きに取り込む」で記事化します。Main Actorなどを確認してから公開します。
- 必須Secret: `GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL` と `GOOGLE_DRIVE_SERVICE_ACCOUNT_PRIVATE_KEY`
- Google CloudでDrive APIを有効化し、対象フォルダをサービスアカウントのメールへ「閲覧者」で共有します。
- 公開済み記事と同じ `source_id` のDriveファイルは重複作成しません。

## 2026-09-11 セキュリティ改修

`migrations/20260911_security.sql` が必須です。画像配信は公開スナップショット方式へ変更しました。
アップロードには保存済みarticle_idが必要です。管理画面は認証付き `/api/tsuzuri-studio/media/<key>` でプレビューし、
`/column-media/<key>` は公開操作で確定した画像だけを返します。既存画像の移行が必要です。
詳しい反映順序と未実施項目は `../../docs/SECURITY_RELEASE_2026-09-11.md` を参照してください。

## TAYORI・IROHA会員画面

- `weekly_access`: TAYORI単体会員。TAYORIとマイページを利用でき、IROHAはロック表示になります。
- `curriculum_all_access`: IROHA会員。IROHAに加えてTAYORIも利用できます。
- マイページの職種、勤務環境、役職、生成AI利用状況、関心テーマは `customer_profiles` に保存します。

既存D1には次の順で一度だけ適用してください。

1. `migrations/20260911_curriculum_foundation.sql`
2. `migrations/20260912_weekly_member_portal.sql`
3. `migrations/20260913_customer_profiles.sql`
4. `migrations/20260914_weekly_priority_questions.sql`
5. `migrations/20260915_weekly_delivery.sql`
6. `migrations/20260916_stripe_foundation.sql`
7. `migrations/20260917_stripe_trial_campaign.sql`
8. `migrations/20260918_customer_email_auth.sql`
9. `migrations/20260919_weekly_question_sheet_sync.sql`

## Stripe連携（第2段階：メール認証とCheckout作成）

料金表、顧客用メール認証、Checkout Session作成、Checkout試行履歴、Webhookの重複防止テーブル、Stripe署名検証をローカル実装しています。
Stripe DashboardのサンドボックスにTAYORI、IROHAに対応する商品（外部保存名もTAYORI・IROHAへ変更済み）および入会・再登録費の商品とPriceを作成し、Price IDを非秘密設定へ登録しています。Webhookによる権限更新はローカル実装・自動テスト済みですが、本番課金はまだ有効化していません。

料金はブラウザから送られた金額を使用せず、`src/billing.js` のサーバー定義とD1の会員履歴・資格確認結果から決定します。
StripeのシークレットキーとWebhook署名シークレットは、リポジトリや `wrangler.toml` に書かず、次段階でWorker Secretsへ登録します。

- Secret: `CUSTOMER_AUTH_SECRET`（32文字以上のランダム値）
- Secret: `RESEND_API_KEY`（送信専用権限）
- Secret: `STRIPE_SECRET_KEY`
- Secret: `STRIPE_WEBHOOK_SECRET`
- 非秘密設定: `STRIPE_MODE=test`
- 非秘密設定: `RESEND_FROM_EMAIL`（Resendで検証済みの送信元）

初回入会ではIROHA料金を30日間無料にし、初回決済は入会費だけです。`trial_entry_5000` キャンペーンでは入会費5,000円だけを請求し、30日後から月額2,980円を開始します。再登録には無料期間を付けません。

顧客認証はスタッフ用Cloudflare Accessと分離しています。6桁コードは10分有効・最大5回、ログインセッションは30日です。D1にはコードとCookieの原文ではなく、`CUSTOMER_AUTH_SECRET`を使った用途別HMACだけを保存します。既存D1には `migrations/20260917_stripe_trial_campaign.sql` の後に `migrations/20260918_customer_email_auth.sql` を一度だけ適用してください。

会員向けCheckout APIは `/api/totonoe-member/api/customer/billing/checkout` です。料金・初回／再登録・キャンペーン・資格割引はWorkerがD1と環境変数から確定し、ブラウザから金額やStripe Price IDは受け取りません。誤課金を防ぐため、Stripeテスト環境でのE2E確認が終わるまでは `STRIPE_CHECKOUT_ENABLED = "false"` のままにします。

TAYORIの優先質問は日曜から土曜までを1週として、1会員につき1枠です。`submitted` の間は上書きでき、運営側が `in_review` にすると固定されます。回答動画フォルダは `DRIVE_WEEKLY_RESPONSE_FOLDER_ID` で指定し、1時間ごとに動画メタデータを確認します。フォルダはリンク公開せず、Google Drive用サービスアカウントへだけ「閲覧者」で共有してください。

運営用の質問管理表 `ToToNoE+ TAYORI｜優先質問管理` はTAYORI資料フォルダに作成済みです。管理表では、類似質問グループ、対応状況、回答動画タイトル・URL、運営メモまで追跡できます。質問データの正本はD1です。会員の送信後にA〜R列を管理表へ転記し、失敗時はD1へエラーを残して1時間ごとに再試行します。S〜W列は運営専用で、WorkerはA〜R列の更新時に上書きしません。運営列は1時間ごと、または管理画面の手動同期でD1へ取り込みます。

管理表の列順は `weekly-question-sheet-schema.json` を正とします。フォーム回答列は `situation → goal → use_by → attempts → blocker → question → answer_format → privacy_confirmed → video_consent` の順で、運営用の列はその後ろへ配置します。

回答動画は `/api/weekly/answer-videos/:id/stream` でTAYORI会員権限を確認し、DriveファイルIDをブラウザへ出さず、Rangeリクエスト対応でストリーミングします。本番ではサービスアカウントのOAuthスコープに `drive.readonly` と `spreadsheets` を使用し、回答動画フォルダはそのサービスアカウントだけへ「閲覧者」で共有してください。管理表だけは「編集者」で共有し、Driveフォルダ全体への編集権限は付けません。回答動画URLは、指定済み回答動画フォルダ直下の動画かつ同期済みであることを確認してからD1へ保存します。

質問管理表の自動転記を有効にする場合は、同じサービスアカウントへ対象スプレッドシートだけを「編集者」で共有し、OAuthスコープへ `spreadsheets` を追加します。Driveフォルダ全体への編集権限は付けません。

静的画面のロックは会員向けの案内表示です。教材ファイル自体を有料会員だけに限定する本番運用では、教材URLを静的JSへ直接置かず、`curriculum_all_access` を検証するWorker API経由で返してください。
# TAYORI Stripeテスト決済

TAYORI個人プランは `weekly_monthly`（月額980円・入会金なし）として、メール認証後にStripe Checkoutへ進みます。決済完了画面への遷移だけでは権限を付与せず、署名検証済みWebhookを受信してから `weekly_access` を有効化します。

本番公開前は、次の順番を崩さないでください。

1. Stripeをテストモードにして、Webhookエンドポイントを `https://basecraftas.com/api/totonoe-member/api/stripe/webhook` で作成する。
2. 受信イベントを `checkout.session.completed`、`checkout.session.expired`、`customer.subscription.created`、`customer.subscription.updated`、`customer.subscription.deleted`、`invoice.paid`、`invoice.payment_failed` に限定する。
3. Workerシークレット `STRIPE_SECRET_KEY` と `STRIPE_WEBHOOK_SECRET` を設定する。値はGit・HTML・READMEへ保存しない。
4. `STRIPE_MODE=test` と `STRIPE_CHECKOUT_ENABLED=false` のままWorkerと静的サイトを反映する。
5. Stripeのテストカードで、申込み・権限付与・重複通知・支払失敗・解約を確認する。
6. 確認後にだけ `STRIPE_CHECKOUT_ENABLED=true` へ変更する。本番キーへの切替は別工程とする。

Webhookは生のリクエスト本文、`Stripe-Signature`、5分以内の時刻差、テストイベントであることを検証します。イベントIDはD1の `stripe_webhook_events` に最小限だけ保存し、同じ通知で契約や権限を二重作成しません。処理失敗として記録された通知はStripe再送時に再処理します。

## Stripe Customer Portal

会員はマイページの「支払い・解約を管理」から、本人のStripe Customer IDに紐づく短時間有効のPortal Sessionを作成します。Portal URLを固定保存したり、別会員のCustomer IDをブラウザから指定したりはしません。

Stripe Dashboardのテスト環境でCustomer Portalを有効化し、次を設定してください。

- 支払い方法の更新: 有効
- 請求書履歴の表示・ダウンロード: 有効
- サブスクリプション解約: 有効
- 解約時期: 現在の請求期間の終了時
- 解約理由の収集: 有効
- プラン変更・数量変更: TAYORI個人プランでは無効
- デフォルトの戻り先: `https://basecraftas.com/projects/totonoe/curriculum/mypage.html`

Portal Session作成APIは `/api/totonoe-member/api/customer/billing/portal` です。メール認証済みCookie、D1のStripe Customer ID、Stripe契約履歴がすべて揃う場合だけ作成します。解約結果は `customer.subscription.updated` と `customer.subscription.deleted` のWebhookでD1へ反映します。
