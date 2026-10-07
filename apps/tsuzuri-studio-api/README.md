# TSUZURI Studio API

Cloudflare Access で保護した TSUZURI Studio から、D1 に記事、メンバー、リビジョン、公開履歴を保存するための Worker です。

## 作成済みの Cloudflare リソース

- Access application: `TSUZURI Studio`
- Protected path: `basecraftas.com/apps/totonoe-studio/*`
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

`workers.dev` は無効化しています。編集APIの正規経路 `basecraftas.com/api/totonoe-studio/*` もCloudflare Accessの保護対象に含めてください。旧 `/api/tsuzuri-studio/*` と `/api/column-studio/*` は互換経路として残します。公開画像の `basecraftas.com/column-media/*` は認証不要の配信経路です。

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

管理者はダッシュボードからD1のメンバーを登録し、編集者・閲覧者を設定できます。管理者は `toshiki.kanto.workspace@gmail.com`、`kansai89414@gmail.com`、`base.craftas478@gmail.com` の3アカウントに固定し、変更・停止できません。

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

セミナーはスタジオで「セミナー」を選び、開催日、開始・終了時刻、無料／有料、一般参加費（有料時）、運営／外部講師、講師名、一般向けURLを入力します。会員向け申込URLは別欄で任意設定です。これらは `seminar_details` として記事・編集履歴・公開JSONに保存され、一般向け一覧とTAYORI会員タブへ反映されます。一般向け有料URLは会員向け申込リンクに流用しません。既存DBには `migrations/20260927_seminar_details.sql` を一度だけ適用してください。料金免除や申込・決済の自動連携はありません。

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
- 期限切れ削除: 毎週土曜日09:00（日本時間）のCron Triggerで、移動から30日を過ぎた記事・編集履歴・公開履歴・R2画像を完全削除します。処理は1回50記事までです。

APIは `POST /api/articles/:id/lifecycle` で、`action` に `unpublish` / `trash` / `restore`、`expected_revision` に現在のリビジョンを送ります。完全削除は実装していません。

既存D1には `migrations/20260908_article_lifecycle.sql` を一度だけ適用してください。期限切れ削除は土曜処理にまとめ、Cron Triggerは `wrangler.toml` の `0 0 * * SAT`（UTC。日本時間の土曜日09:00）を使用します。

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
- 対象ファイル: 動画のみ（音声ファイルは同期しません）
- 自動確認: 毎週土曜日 09:00（日本時間。CronはUTCの `0 0 * * SAT`）
- 旧ダッシュボードの手動確認・取り込みUIは撤去済みです。以下のAPI・定期処理は既存運用のため保持しています。
- 反映方法: 新着を候補として保存し、「下書きに取り込む」で記事化します。Main Actorなどを確認してから公開します。
- 必須Secret: `GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL` と `GOOGLE_DRIVE_SERVICE_ACCOUNT_PRIVATE_KEY`
- Google CloudでDrive APIを有効化し、対象フォルダをサービスアカウントのメールへ「閲覧者」で共有します。
- 公開済み記事と同じ `source_id` のDriveファイルは重複作成しません。

## 2026-09-11 セキュリティ改修

`migrations/20260911_security.sql` が必須です。画像配信は公開スナップショット方式へ変更しました。
アップロードには保存済みarticle_idが必要です。管理画面は認証付き `/api/totonoe-studio/media/<key>` でプレビューし、
`/column-media/<key>` は公開操作で確定した画像だけを返します。既存画像の移行が必要です。
詳しい反映順序と未実施項目は `../../docs/SECURITY_RELEASE_2026-09-11.md` を参照してください。

## TAYORI・IROHA会員画面

IROHA加入成功時は、同一会員のTAYORI単体契約をStripeで即時解約し、以後の重複月額請求を防ぎます。`migrations/20260929_subscription_replacements.sql` が必要です。解約処理はD1に保持し、Webhook再送と定期実行で再試行します。IROHA会員はTAYORIを追加申込できず、IROHA解約で旧TAYORI契約が復活することもありません。Stripeの制限付きキーにはSubscriptionsの読み書きが必要です。2026-09-29にコード・D1を反映済み、2026-09-30には承認を受けキーのSubscriptions書き込み権限を追加し、保存後の再表示で確認しました。実際の本番Checkout完了・自動解約は未検証で、IROHA販売は停止中です。同じメールアドレスの会員アカウントで申し込む必要があります。

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
10. `migrations/20260920_billing_dashboard.sql`
11. `migrations/20260921_character_studio_articles.sql`（既存のキャラクター記事4本をStudioへ登録）
12. `migrations/20260922_fixed_admin_accounts.sql`（指定2アカウントを管理者へ固定し、旧管理者を編集者へ変更）
13. `migrations/20260923_three_fixed_admin_accounts.sql`（指定3アカウントを管理者へ固定し、`base.craftas478@gmail.com` を管理者へ変更）
14. `migrations/20260923_three_fixed_admin_accounts_cleanup.sql`（メールアドレスの大文字・小文字違いで生じた重複を既存メンバーへ統合）
15. `migrations/20260923_analytics_initiatives.sql`（アクセス解析の施策、担当者、振り返りを保存）
16. `migrations/20260927_customer_password_auth.sql`（会員パスワード認証のハッシュ保存、ロック管理）

課金画面がテストデータを表示している場合だけ、「テスト表示をリセット」を利用できます。`POST /api/admin/billing-test-data/reset` は管理者限定かつ `STRIPE_MODE=test` 限定です。テスト契約、テスト売上、契約状態履歴、Checkout試行、テスト契約由来の会員権限をD1の一括処理で削除します。本番データ、顧客アカウント、ウェイトリスト、コンテンツ、Stripe Webhookの受信監査履歴は保持します。

## Stripe連携（第2段階：メール認証とCheckout作成）

料金表、顧客用メール認証、Checkout Session作成、Checkout試行履歴、Webhookの重複防止テーブル、Stripe署名検証をローカル実装しています。
Stripe DashboardにはTAYORI、IROHAに対応する商品とPriceがあります。ローカル定義はTAYORI月額980円、IROHA月額2,980円・入会金と再入会金なしの職種共通プランです。IROHAの新規Checkoutは停止中です。

料金はブラウザから送られた金額を使用せず、`src/billing.js` のサーバー定義とD1の会員履歴から決定します。資格確認は行いません。
StripeのシークレットキーとWebhook署名シークレットは、リポジトリや `wrangler.toml` に書かず、次段階でWorker Secretsへ登録します。

- Secret: `CUSTOMER_AUTH_SECRET`（32文字以上のランダム値）
- Secret: `RESEND_API_KEY`（送信専用権限）
- Secret: `STRIPE_SECRET_KEY`
- Secret: `STRIPE_WEBHOOK_SECRET`
- 非秘密設定: `STRIPE_MODE=test`
- 非秘密設定: `RESEND_FROM_EMAIL`（Resendで検証済みの送信元）
- 登録済みの非秘密設定: `STRIPE_PRICE_ENTRY_GENERAL_FIRST`、`STRIPE_PRICE_ENTRY_THERAPIST_FIRST`、`STRIPE_PRICE_ENTRY_GENERAL_REJOIN`、`STRIPE_PRICE_ENTRY_THERAPIST_REJOIN`

IROHAの新規契約は月額プランだけを受け付ける設計で、職種共通で月額2,980円（税込）です。入会金・再入会金はありません。初回コードはサーバー側で確認し、申込時点から3暦月の試用終了日時を設定します。旧入会金向けのStripe割引はCheckoutへ送信しません。TAYORI購入歴はこの初回判定に含めません。クーポンなしの初回は30日無料、再入会は無料期間なしです。IROHA購入は停止中のため、本番Checkoutでの通し検証は未実施です。資格確認は行いません。法人プランは準備中とし、メールウェイトリストのみ受け付けます。新規見積・Checkoutは月額のみです。過去の年額契約に対するWebhook処理は保持します。

顧客認証はスタッフ用Cloudflare Accessと分離しています。通常ログインはメールアドレス＋12文字以上のパスワードです。パスワードはCloudflare Workers WebCryptoの上限に合わせてPBKDF2-SHA-256を100,000回適用し、平文を保存しません。失敗回数による一時ロックと30日セッションを使用します。activeなadmin/editorは、Access保護下の `/apps/totonoe-studio/tayori-password.html` で初回パスワードを設定できます。この操作は署名検証済みAccess JWTとD1のメンバー権限を必須とし、TAYORIの認証コードは使いません。その他の会員の再設定は従来の6桁コード（10分有効・最大5回）を使います。D1にはコードとCookieの原文ではなく、`CUSTOMER_AUTH_SECRET`を使った用途別HMACだけを保存します。既存D1には `migrations/20260917_stripe_trial_campaign.sql` の後に `migrations/20260918_customer_email_auth.sql` と `migrations/20260927_customer_password_auth.sql` を一度だけ適用してください。

静的サイトWorkerが会員APIへアクセス権限を確認する際は、`MEMBER_API` Service Bindingで`column-studio-api` Workerを直接呼び出します。同一ホスト名への通常の`fetch`では本番のWorkerルートを通らないため、認証済みでもTAYORIのページでログイン画面へ戻されます。

会員向けCheckout APIは `/api/totonoe-member/api/customer/billing/checkout` です。料金・初回／再入会・会員区分はWorkerがD1と環境変数から確定し、ブラウザから金額やStripe Price IDは受け取りません。誤課金を防ぐため、Stripeテスト環境でのE2E確認が終わるまでは `STRIPE_CHECKOUT_ENABLED = "false"` のままにします。

TAYORIの優先質問は日曜から土曜までを1週として、1会員につき1枠です。`submitted` の間は上書きでき、運営側が `in_review` にすると固定されます。回答動画フォルダは `DRIVE_WEEKLY_RESPONSE_FOLDER_ID` で指定し、毎時00分に動画メタデータを確認します。週末資料は毎週土曜日09:00に同期します。フォルダはリンク公開せず、Google Drive用サービスアカウントへだけ「閲覧者」で共有してください。

運営用の質問管理表 `ToToNoE+ TAYORI｜優先質問管理` はTAYORI資料フォルダに作成済みです。管理表では、類似質問グループ、対応状況、回答動画タイトル・URL、運営メモまで追跡できます。質問データの正本はD1です。会員の送信後にA〜R列を管理表へ転記し、失敗時はD1へエラーを残して毎時00分に再試行します。S〜W列は運営専用で、WorkerはA〜R列の更新時に上書きしません。運営列は毎時00分、または管理画面の手動同期でD1へ取り込みます。

管理表の列順は `weekly-question-sheet-schema.json` を正とします。フォーム回答列は `situation → goal → use_by → attempts → blocker → question → answer_format → privacy_confirmed → video_consent` の順で、運営用の列はその後ろへ配置します。

回答動画は `/api/weekly/answer-videos/:id/stream` でTAYORI会員権限を確認し、DriveファイルIDをブラウザへ出さず、Rangeリクエスト対応でストリーミングします。本番ではサービスアカウントのOAuthスコープに `drive.readonly` と `spreadsheets` を使用し、回答動画フォルダはそのサービスアカウントだけへ「閲覧者」で共有してください。管理表だけは「編集者」で共有し、Driveフォルダ全体への編集権限は付けません。回答動画URLは、指定済み回答動画フォルダ直下またはその直下のカテゴリフォルダにある同期済み動画か確認してからD1へ保存します。

### TAYORIのDrive配置と回答動画の運用

2026年9月30日にカテゴリ用の子フォルダを追加しました。既存の動画・管理表は移動していません。カテゴリ同期と公開承認条件はAPI Worker版 `5aa0eac9-ef74-402c-84f1-f68dadb0f178` に本番反映済みです。新フォルダの動画は次回毎時同期または運営の手動同期で登録されます。

```text
ToToNoE+ / 02_TAYORI｜たより  ← DRIVE_WEEKLY_RESPONSE_FOLDER_ID
├─ 00_制作中・非配信（ID 1C3RRBm90uW9mD-z292Kv2rrCohg0p7gY。同期対象外）
├─ 01_AI活用
├─ 02_情報管理
├─ 03_資料づくり
├─ 04_その他
├─ ToToNoE+ TAYORI｜優先質問管理（Google Sheets。ID固定で参照）
└─ ToToNoE+ Studioについて.mp4（既存の直下動画。分類先は未確定）

スライド / PDF                  ← DRIVE_WEEKLY_FOLDER_ID（週次資料。別系統）
```

フォルダIDは順に `1CInE4Vc-FavVSGWLUFmBN3RDpkooD6FK`、`10joBk0YUjGMT17aLofnStPXcyt7ACSS_`、`1VAbPJeahycA_mDE943CWm8sGAadKcYjF`、`1XfSEk3kA9jdtADn3vng9LutPI2FG5VJQ`。新しいフォルダはいずれも配信用サービスアカウントが閲覧者であることを確認済みです。質問管理表1件と既存MP4約53.6 MBは直下に残してあります。カテゴリフォルダは接続中の運営アカウントが所有し、親フォルダの所有者とは異なります。
Drive上では親のToToNoE+とTAYORIフォルダ、既存2ファイルに同じ運営編集者12名と動画配信用サービスアカウントの閲覧権限が見えます。「リンクを知っている全員」の権限は確認されませんでした。12名は全員運営担当であるとユーザーが確認済みです。会員メールと契約権限はDrive共有先へ登録せず、TAYORIのD1・会員認証・Stripe側で管理します。2026年9月30日に質問管理表だけサービスアカウントを編集者へ変更し、Driveメタデータで再確認しました。親フォルダと動画では閲覧者のままです。質問0件のため、実際のSheets自動転記は未検証です。

動画名に会員名・患者名・勤務先名などの特定情報を含めないでください。カテゴリ同期は親直下の子フォルダを1階層だけ調べ、`00_制作中・非配信` をIDと名前で除外します。その他の子フォルダも同期候補ですが、4分類以外の名前は会員画面で「その他」にまとめます。フォルダ名が分類の正本です。直下の既存動画は移行まで「その他」として読みます。質問の正本はD1で、管理表は運営作業用です。次の公開手順は本番Worker版 `5aa0eac9-ef74-402c-84f1-f68dadb0f178` で使用できます。D1の分類用3列も本番に適用済みです。

1. 制作中は `00_制作中・非配信`、公開候補になったら主分類のカテゴリフォルダへMP4を移す。Driveの共有は限定のまま維持する。毎時同期またはStudioの「今すぐ同期」で動画を登録する。この段階では会員画面に出ない。
2. 質問管理表で本人の動画利用同意を確認し、運営列の「類似質問グループ」に `公開：匿名化した質問テーマ`、回答動画URLにカテゴリフォルダ内の同期済み動画URL、運営ステータスに `回答動画公開済み` を設定する。個人名・患者名・勤務先名・質問原文は公開テーマに入れない。
3. 「今すぐ同期」を実行するか次の毎時同期を待つ。会員画面の一覧と再生の両方でTAYORI権限、同意、公開ステータス、匿名テーマ、動画URLを確認する。公開を止めるときは運営ステータスを `回答準備中` に戻して同期する。回答動画URLや `公開：` の指定を外しても非公開になる。

DriveファイルIDと直接URLは会員向けAPIから返さず、動画データは会員認証つきWorker経由で配信する。同期済みでも承認条件を満たさない動画は一覧・再生とも404/非表示となる。画面の架空サンプル3件はDriveにもD1にも保存しません。カテゴリフォルダ内の実動画は、フォルダ名から主分類を確定します。会員向け一覧の反映は毎時同期まで最大約1時間遅れる場合があります。再生時はDrive上の保存先を確認するため、制作中へ戻した動画の再生は次の同期前でも拒否します。

質問管理表の自動転記を有効にする場合は、同じサービスアカウントへ対象スプレッドシートだけを「編集者」で共有し、OAuthスコープへ `spreadsheets` を追加します。Driveフォルダ全体への編集権限は付けません。

静的画面のロックは会員向けの案内表示です。教材ファイル自体を有料会員だけに限定する本番運用では、教材URLを静的JSへ直接置かず、`curriculum_all_access` を検証するWorker API経由で返してください。
# TAYORI Stripeテスト決済

TAYORI個人プランは `weekly_monthly`（月額980円）です。すべての新規申込みに14日間の無料トライアルを付与します。ウェイトリストと申込みに人数上限は設けません。
申込時に決済情報を登録し、無料期間内に解約しなければ期間終了後に月額課金が始まります。Checkoutには `payment_method_collection=always` を指定します。
現在の採用方針は公開LPからの直接申込です。メール本人確認後、ウェイトリスト登録や管理者の個別案内なしでTAYORI Checkoutを開始します。`TAYORI_DIRECT_ENROLLMENT_ENABLED=false` が初期状態で、本番Stripe設定と申込・Webhook・解約の実地検証が済むまで申込受付を開けません。旧個別案内用のコードと `tayori_waitlist_invitations` は停止したまま残しており、本番DBへの移行は不要です。

本番公開前は、次の順番を崩さないでください。

1. Stripeをテストモードにして、Webhookエンドポイントを `https://basecraftas.com/api/totonoe-member/api/stripe/webhook` で作成する。
2. 受信イベントを `checkout.session.completed`、`checkout.session.expired`、`customer.subscription.created`、`customer.subscription.updated`、`customer.subscription.deleted`、`invoice.paid`、`invoice.payment_failed`、`charge.refunded` に限定する。
3. Workerシークレット `STRIPE_SECRET_KEY` と `STRIPE_WEBHOOK_SECRET` を設定する。値はGit・HTML・READMEへ保存しない。
4. `STRIPE_MODE=test` と `STRIPE_CHECKOUT_ENABLED=false` のままWorkerと静的サイトを反映する。
5. Stripeのテストカードで、申込み・権限付与・重複通知・支払失敗・解約を確認する。
6. 本番課金は別工程で、ライブPrice・ライブ秘密鍵・Webhook・Customer Portal・申込画面の条件表示と実決済の確認を完了する。検証後に `STRIPE_MODE=live`、`STRIPE_LIVE_READY=true`、`STRIPE_CHECKOUT_ENABLED=true`、最後に `TAYORI_DIRECT_ENROLLMENT_ENABLED=true` を揃える。それまで公開設定は `test` / `false` を維持する。

Webhookは生のリクエスト本文、`Stripe-Signature`、5分以内の時刻差、設定と一致するテスト／ライブモードを検証します。イベントIDはD1の `stripe_webhook_events` に最小限だけ保存し、同じ通知で契約や権限を二重作成しません。処理失敗として記録された通知はStripe再送時に再処理します。

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
# TAYORI回答動画の質問テーマ表示

会員ページの「みんなの質問・回答動画」では、優先質問管理表で動画URLと紐づいた質問のうち、利用同意済み・回答済みで「類似質問グループ」が `公開：匿名化済みの質問テーマ` と明記されたものだけを表示する。例：`公開：議事録を安全に要約するには？`。元の質問本文、会員情報、運営メモ、Drive IDは会員APIへ出さない。公開前に運営がテーマの個人・法人特定情報を除去する。公開指定がなければ会員画面では「公開準備中」と表示する。
# IROHA受講メモの保存と転記（2026-10-03）

新規マイグレーション `migrations/20261002_iroha_lesson_notes.sql` と `src/curriculum-notes.js` を追加。会員認証・IROHA権利判定後の `GET/POST /api/curriculum/notes`、`GET /api/curriculum/notes/:lessonId` が本人のデータのみを扱う。保存時に会員IDをクライアントから受け取らず、版番号とmutationIdで競合・再送を管理する。

管理シート設定は `IROHA_NOTES_SPREADSHEET_ID` と `IROHA_NOTES_SHEET_NAME`。既存のGoogleサービスアカウントSecretを利用する。専用シートへの編集権限は付与済みで、動画フォルダの権限は変更しない。更新ごとにD1へ履歴を保存し、固定行へのRAW書き込みで転記する。未転記履歴は既存の定期処理で25件ずつ再送する。シートの記録ID・見出しが変わった場合は転記を停止してデータを保持する。行数と日時表示・フィルタ範囲は必要に応じて拡張する。

2026-10-03に本番D1へ適用し、取得した本番Workerを基準にメモ機能だけを限定公開。画面も必要なIROHAファイルだけを更新し、公開済みASSETSを保持、MEMBER_APIを追加した。既存の課金関連バインディング・秘密鍵・IROHA_ENROLLMENT_ENABLED=falseを維持。未認証401と会員画面のログイン転送を確認。同日に運営アカウントの接続確認用メモを本番画面で保存し、管理シート「受講メモ履歴」の2行目への実転記、本人の学習履歴と受講画面での復元を確認済み。記録IDは `ea927051-8b9b-4c3e-83fb-9176235dc1a9`、教材は運営専用 `claude-basic-layout-preview`。

## IROHAの視聴と次の動画への開放

`migrations/20261003_iroha_playback.sql` と `src/curriculum-playback.js` を追加し、本番へ反映。教材の配信台帳は `iroha_delivery_lessons`、本人の視聴・完了は `iroha_lesson_progress`、6時間の視聴セッションは `iroha_playback_sessions` へ保持。配信台帳の承認対象だけを返し、サービス停止中は運営専用。自動Drive教材同期や管理画面の公開はしていない。

- `GET /api/curriculum/catalog`：本人の教材・視聴位置・完了
- `GET /api/curriculum/media/:lessonId`：前のレッスン完了、Driveの現在の親フォルダ・動画時間を確認したRange配信
- `POST /api/curriculum/lessons/:lessonId/playback`：本人の再開位置でセッション開始
- `POST /api/curriculum/playback/:sessionId`：順序番号とサーバー経過時間で連続した視聴を確認。同じ更新の再送は重複させない
- `POST /api/curriculum/lessons/:lessonId/complete`：動画終了記録と保存済みアウトプットを確認した完了
- `POST /api/curriculum/preview/claude`：サービス開始前の運営だけが、指定済みの1動画を動作確認用に登録。一般教材・バッジとしては扱わない

動画はメモリへ一括保存せずストリーミングする。受講画面では15秒ごと、再生・一時停止・終了時に記録し、メモは独立して保存する。視聴判定は通常操作のスキップ防止であり、実際の注意・理解の保証ではない。本番コードの限定反映に使用した元Worker・設定・各バージョン記録は `04_ToToNoE+/work/.codex-scratch/35c7914fd69d46758007273c8e233ca4` に復元用として保持している。一括削除しない。
