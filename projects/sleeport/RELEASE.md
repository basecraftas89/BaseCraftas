# Sleeport 採用サイトの更新手順

採用ソース：/Users/kantoshi/01_Sleeport/src/homepage-v2/content-source と build.mjs、improvements.mjs。
原本：/Users/kantoshi/01_Sleeport/assets/homepage-v2。

1. Sleeport側で build.mjs、check.mjs、check-hero-motion.mjs を実行する。
2. prepare-release.py で採用ページと参照素材のみを書き出す。親サイト・MEGURIの現行配信をbaselineと照合する（古いbaselineで上書きしない）。
3. このディレクトリに新しい公開ファイルを同期し、削除対象ページの参照がないことを確認する。
4. scripts/build-projects-release.py は data-hero-video の動画も含める。PROJECTS_RELEASE_OUTPUT で空の出力先を指定できる。
5. apps/projects-sites/wrangler.toml の全ルートを保って配信する。配信後に公開URL・素材・モバイル表示を独立確認する。

2026-10-08: 21ページ、3教材、運営Base Craftas／神藤 俊希、4採用ヒーローの微動動画。税・キャンセル等は正式見積りで確認。旧短編3ページは公開対象から削除。長編3本の本文は保持。
