# チームSNSからの流入計測（無料枠・運用準備）

## 対象と境界

- 現行チームページでXリンクを公開している7名全員をX計測の対象にする。投稿目的・投稿文・実際の掲載は各担当者と決める。10名全員をSNSやGA4の管理者に招待する必要はない。
- 各SNSアカウントとのAPI接続は不要。投稿・プロフィールに専用URLを貼る方式。既存のチームページにあるSNSリンクを逆向きの流入計測と混同しない。
- Xなどプラットフォーム内の表示数・いいね・リンククリック数は、本人が見られるインサイトを別途手記録する。GA4が測るのはサイト到着以後で、SNS側の表示数は取得しない。
- 公開前のコードやダッシュボードを「計測済み」としない。GA4管理者設定と実流入の確認が済むまでは準備段階。

### X対象者（2026-10-02の公開チームページとローカルHTMLを照合）

| 担当者 | Xアカウント |
| --- | --- |
| 神藤 俊希 | [@kanto_aipt_base](https://x.com/kanto_aipt_base) |
| 梶原 祐輔 | [@nexus_pt_kp](https://x.com/nexus_pt_kp) |
| 木村 倖晴 | [@DxKimura](https://x.com/DxKimura) |
| 伊東 雅也 | [@masaya_ito_pt](https://x.com/masaya_ito_pt) |
| 綱島 脩 | [@tebapapapt](https://x.com/tebapapapt) |
| 小島 健 | [@kojimanabot](https://x.com/kojimanabot) |
| 貝ヶ石 祥吾 | [@kaishoupt](https://x.com/kaishoupt) |

現在の推奨は**1人1本の固定リンクをプロフィール・紹介投稿で共用**する方式。専用Worker `basecraftas-totonoe-links` に `/go/kanto` など7名分の短縮パスを実装し、`utm_content=member-id` のToToNoE+トップへ302転送する。本番反映の確認結果はチーム共有用の [TEAM_X_OPERATIONS_GUIDE.md](./TEAM_X_OPERATIONS_GUIDE.md) に記録する。`node scripts/totonoe-campaign-link.mjs --list-x` で各転送先の完全なUTM付きURLを一覧出力できる。各Xプロフィールや投稿への設置済みを意味しない。

## 投稿別リンクを例外的に使う場合（通常運用では不要）

以下は投稿を厳密に分けたい特別な施策用。通常運用では投稿ごとにリンクを作らず、上記の固定リンクと投稿URL・日時の記録を使う。その場合、投稿別の訪問数を確定できないことを明示する。

1. 担当者、SNS、投稿/プロフィールの別、投稿ID、目標（TAYORI案内・ウェイトリスト・セミナー案内など）を施策台帳に記録。投稿IDは個人情報を含まない一意の短い英数字にする。
2. `node scripts/totonoe-campaign-link.mjs --member=kojima-ken --source=x --placement=post --post=20261002-tayori --destination=tayori` のようにURLを発行し、実際の投稿やプロフィールに貼る。`--destination` は `home`、`tayori`、`seminar` の公開済み導線だけ。
3. 投稿後に公開投稿URL、投稿日、内容の要点を施策台帳へ追記。プロフィール固定リンクと投稿リンクは別IDで発行する。URL短縮・アプリ内ブラウザの動作は実機で確認する。
4. GA4で「セッションの手動参照元」「セッションの手動メディア」「セッションの手動キャンペーン名」「セッションの手動広告コンテンツ」を表示。`utm_content` には担当者・配置・投稿IDが入る。ランディングページ、表示回数、`tayori_cta_click`、`seminar_cta_click`、`tayori_waitlist_signup`、`tayori_checkout_start` を比較する。
5. 週次に投稿別のサイト到着セッション、CTA到達、ウェイトリスト登録の件数と率を比較。分母が少ないときは率だけで順位付けしない。直帰・再訪・別端末・Cookie拒否・広告ブロック等により個人単位の完全な経路復元はできない。

## ダッシュボードと判定

既存のToToNoE+ StudioのCloudflare流入画面は媒体・入口・日別の概況に使う。Cloudflare Web Analyticsの流入元（リファラー）だけでは `utm_content` や投稿別CTA完了を表示できない。投稿・担当別の数字は既存GA4プロパティで見る。専用Studio画面への自動集約には別途GA4 API権限または集計連携が必要で、今は未実装。

現在の必須KPIは「Xの固定リンク経由のサイト到着セッション合計」と「メンバー別の到着セッション」。投稿別の訪問数は固定リンクでは測れず、投稿URL・日時と数字の変化を突き合わせる定性的な振り返りにとどめる。TAYORI/セミナーCTAクリックとTAYORIウェイトリスト登録成功は、計測が公開・検証された後の拡張候補。補助KPIはSNS側のインプレッション・リンククリック（本人の任意共有）、GA4上のエンゲージメントなど。`tayori_checkout_start` はStripe画面への移動開始であり、購入完了ではない。セミナーの外部申込完了も本サイトからは判定できない。IROHAは未公開のため対象に含めない。

GA4の編集権限があれば `tayori_waitlist_signup` をキーイベントに設定し、必要なら `cta_target`、`cta_destination`、`cta_area` をイベントスコープのカスタムディメンションに登録する。投稿別集計には標準の「セッションの手動広告コンテンツ」を使用できる。データ保持期間とCookie同意・プライバシー文面はGA4の実設定を確認する。メールアドレスやフォーム値をURL/GA4へ送らない。
