# 公開サイトの安全性・ポリシー監査（2026年9月22日）

対象：Base Craftas全体、ToToNoE+、管理・会員機能の公開境界。公開HTML 45ページのローカルリンク・静的資産、主要公開URLへの低頻度匿名GET、ソース・既存テスト、Cloudflareの本番ビルド設定、一次資料を確認した。実顧客データの抽出、フォーム送信、決済、負荷試験は実施していない。完全な侵入試験や法的適合性の保証ではない。

## 確認された問題と対処

| 優先度 | 問題・根拠 | 対処 |
| --- | --- | --- |
| 高 | 本番のAPIソースURLが匿名GETで200。TAYORI・IROHA会員ページのHTMLも200・public cacheで配信されていた | 正規Workerで再配信。内部ソースは404、匿名会員HTMLは302ログイン転送に変更 |
| 高 | Workers Buildsのmainトリガーが `npx wrangler deploy` のみ。設定パスがなく、手動反映後のGit連携ビルドが別構成を配信 | 本番トリガーを `npx wrangler deploy --config apps/site-worker/wrangler.toml` に変更して読み戻し確認。READMEにも記録 |
| 高 | 静的Workerの会員判定が拡張子なしindex・エンコード等を網羅せず、認証成功後のHTMLにno-store指定なし | パス正規化、表記違いの認可、会員応答のprivate/no-store、認証障害時503を追加。回帰テスト2件追加 |
| 中 | Worker生成404・302等には `_headers` の安全ヘッダーが適用されない | Worker自身でnosniff、frame拒否、HSTS、referrer、CSP等を付与。リリース識別ヘッダーも追加 |
| 中 | 正式ドメイン以外のworkers.dev・preview公開経路 | 静的Worker設定で `workers_dev=false`・`preview_urls=false` を明示 |
| 中 | Base Craftasの免責が通常過失を含めた全部免責とも読める | 法令に従った責任・解除・返金の扱いへ修正。適法な引用等の権利も明記 |
| 中 | キャンセル料50%/100%と実費の関係、無料相談、既存契約への改定適用が不明確 | 無料相談、平均的損害を超えない上限、二重請求回避、主催者都合の未提供分、既存契約の条件保護を補足 |
| 中 | Base Craftas特商法ページの事業者が屋号のみ、公開メールなし | 既に確認済みの神藤俊希・公開メールを明記。法令上の返金権利を補足 |
| 中 | プライバシー記載に認証メール配信元Resend、外部送信内容、本人請求の手続きが不足 | Base Craftas／ToToNoE+双方を更新。所在地の請求窓口、代理請求、第三者提供記録、保存・配信停止、GA4オプトアウト、Cookieの説明を追加 |
| 中 | 問い合わせがサービス相談フォーム中心。会員ログイン送信前にprivacy導線なし | メールでの一般問い合わせ・請求・解約導線、機微情報入力注意、ログイン画面のprivacyリンクを追加 |

## 検証結果

- npm audit：既知脆弱性0（依存175、2026-09-22時点）。秘密鍵等の代表的パターンを追跡ファイルで点検。検出候補1件はPEM解析用の文字列で、鍵本体ではなかった。網羅的な秘密情報検知を保証するものではない。
- npm test：93件成功。既存のXSSサニタイズ、画像形式・サイズ、未公開画像、管理権限、Origin制限、会員権限、Stripe署名・重複処理の回帰テストを含む。
- 匿名実アクセス：管理画面はCloudflare Accessへ302、会員profile/materials APIは401/no-store。内部ソースは修正後404、エンコードを含む会員ページは302/private,no-store。
- 公開ビルド45 HTMLのリンク走査：未配置ファイル参照3件はIROHA準備中LPへのリンクで、既存の明示的302転送対象。その他のローカル資産・リンク欠落は検出なし。ビルド内にSQL/TOML/Markdown/API src/testはなし。
- `scripts/check-public-security.mjs`：21 URLのステータス、認証先、ヘッダーを確認する読み取り専用コマンド。Git連携の本番ビルド完了後にも実行する。
- 手動本番反映 `b6cd17a2-30e2-4ce1-b15a-f3e86e021f50` 後に21/21成功。変更した公開9ページはローカルdistとSHA-256一致。workers.devは404。匿名ブラウザでポリシーの更新本文と390px幅の表示を確認。

## 残る運用確認・販売開始前の条件

1. **所在地・電話番号の開示実務**：非掲載の場合でも請求に遅滞なく回答できる住所・電話番号と担当者が必要。非公開情報を推測して掲載していない。個人情報の本人請求にも運用が必要。
2. **販売条件の確定**：TAYORI/IROHAは受付準備中、API設定はStripeテスト・Checkout無効。課金開始前に税込総額、初期費用、更新周期、解約期限・操作、利用終了日、返金方法・時期、最終確認画面の表示、利用規約と同意記録を実決済条件に揃える。2営業日前など未定義のキャンセル時期や営業日の定義も契約書で確定する。
3. **海外処理・外部送信**：Google、Cloudflare、Resend、Stripe等の契約主体・処理国・DPA・再委託・同意の根拠は管理契約で確認が必要。サービス名の追記だけで外国第三者提供への対応完了とは扱わない。電気通信事業法の外部送信規律の適用、海外利用者向け同意管理は対象事業・利用者に応じて確認する。
4. **録画・資料・保存実務**：参加者への録画告知、一般公開時の範囲と同意、個別Google Driveファイルの共有権限、Googleフォームの所有者・回答者への説明、保存期限、削除・開示手順、バックアップ復元は管理側で要確認。カメラOFFでも表示名やチャットが記録される場合がある。
5. **ソース公開の過去影響**：今回APIは匿名401を維持し、顧客データ流出は確認していない。ただし過去のアクセス履歴・公開期間・旧デプロイ全体は未調査。ソース公開を単に「被害なし」とは判定しない。秘密情報流出が判明した場合は該当資格情報の失効・再発行と法令上の対応を検討する。
6. **追加の防御強化**：公開ページのCSPは最低限の制約。インラインJSと複数外部サービスがあるため、厳格なscript-src導入は依存先整理と段階検証が必要。管理者MFA・Accessポリシー全体、ログ保存・通知、WAF、復元試験、認証済みの実ユーザー導線は今回完全確認していない。

## 参照した一次資料

- 消費者庁・通信販売：https://www.no-trouble.caa.go.jp/what/mailorder/
- 消費者庁・広告Q&A（住所・電話番号省略の条件）：https://www.no-trouble.caa.go.jp/qa/advertising.html
- 消費者庁・消費者契約法：https://www.caa.go.jp/policies/policy/consumer_system/consumer_contract_act/
- 消費者庁・第9条（平均的損害）：https://www.caa.go.jp/policies/policy/consumer_system/consumer_contract_act/annotations/assets/consumer_system_cms203_230915_16.pdf
- 個人情報保護委員会・通則：https://www.ppc.go.jp/personalinfo/legal/guidelines_tsusoku/
- 個人情報保護委員会・外国第三者提供：https://www.ppc.go.jp/personalinfo/legal/guidelines_offshore/
- Cloudflare・静的アセットのヘッダー：https://developers.cloudflare.com/workers/static-assets/headers/
- Cloudflare・Workers best practices：https://developers.cloudflare.com/workers/best-practices/workers-best-practices/
- Google・オプトアウト：https://support.google.com/analytics/answer/181881?hl=ja
- Resend・privacy：https://resend.com/legal/privacy-policy
