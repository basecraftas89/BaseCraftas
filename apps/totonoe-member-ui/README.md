# ToToNoE+ member UI assets

TAYORI/IROHAの会員画面・共通図解画像だけをmanifest.jsonに列挙して配信する。外部URL・routesなし。公開入口は既存のbasecraftas/basecraftas-tayoriで、会員ページは既存認証に成功した200 HTML応答のみ差し替える。API、課金、会員権限はこのWorkerに置かない。

`MEMBER_UI_ASSETS`サービス接続を両サイトWorkerで維持する。配信ヘルパーはapps/site-worker/member-ui-release.js。更新時は最初にこのアセットWorkerを配信し、その後にサイト側のマニフェストと接続を反映する。通常のサイト一括配信前には、他の本番オーバーレイとの整合も確認する。

2026-10-03の限定配信と現行コードの復元用バックアップはwork/.codex-scratch/14900c8a26ea4c30bab2153c3fb441bd。保護対象。
