# ToToNoE+ public page release

Routesのない公開素材専用Worker。`manifest.json`の公開ページと、その参照素材だけを配信する。法人研修、教材見本、プロダクト草案、会員HTML、API、認証コードの更新は含めない。

`public-ui-release.js`がbasecraftas / basecraftas-tayoriから`PUBLIC_UI_ASSETS`へ転送する。会員ページ・API・法人研修は既存の配信と認証をそのまま通す。最新の本番モジュールを取得・バックアップしてから公開差分を加え、既存バイナリ・Service Binding・秘密値・ASSETSを保持する。一括でローカルWorkerを上書きすると本番だけの修正を失うため、通常のdeploy前に現行本番との差分を確認する。

2026-10-04: ヘッダーのミッション文を削除。トップ、セミナー、公開IROHA案内・ウェイトリスト、週末案内、サービス、FAQ、チーム、キャラクター、TAYORI申込を限定更新。ログインJavaScriptと課金・権限・会員本体は現在の本番を維持する。
