# 公開画像・アセット確認 2026-10-04

対象は採用済み公開サイトの全ラスター画像78枚とSVG7枚です。原本は既存プロジェクトおよび公開スナップショットに保持し、公開には参照される画像のみを含めます。画像一覧を目視確認し、圧縮前後の代表3枚を等倍の部分画像で比較、変換後78枚の一覧も確認しました。全画像と派生画像のデコード確認済みです。

|対象|枚数|標準画像の変更前|変更後|削減|
|---|---:|---:|---:|---:|
|meguri|20|4.17 MiB|2.80 MiB|32.8%|
|sleeport|58|17.33 MiB|7.19 MiB|58.5%|

上記は各画像の標準サイズ1点ずつの合計で、1ページの通信量ではありません。480/800px派生画像は別途あり、ブラウザが画面幅・表示幅・画素密度に合わせて1点を選びます。派生画像を含む公開パッケージ全体は21.10MiB、270ファイルです（共通親ページの依存アセットを含む）。

WebP品質86で写真・イラストを圧縮し、アクションや手順の画像は最大640px、一般画像は最大1280pxとしました。大型ヒーローとフッターの元解像度は維持。小さいLINEスタンプPNGの文字と透過を保持。既に効率の良い画像は再圧縮せず採用しました。画像の寸法と非同期デコードを指定、既存の遅延読み込みを保持し、遅延画像は実際の表示幅を使うsizes=autoを指定しました。画面外の読み込み最小化や形式をさらに追い込む余地はあり、全てが数学的に最小という意味ではありません。

SVGは7枚、各252〜2101bytesで変更不要。MEGURI CSS約24.4KiB/JS約3.9KiB、Sleeport CSS約70.7KiB/JS約7.6KiB。日本語フォントは8,905,128bytesのTTFから3,090,492bytesのWOFF2に圧縮し、全15,450字形と文字マッピングの一致を確認しました。部分文字化は行っていないため、フォントはなお約2.95MiBあります。将来、文字追加時の欠落を避ける仕組みと合わせて分割配信を検討できます。ライセンスは保持。

49ページ、2,594内部参照（srcsetとOG画像含む）の検証成功。390pxで両ホームに横はみ出し・表示画像の欠落なし、480pxの候補が選択されることと日本語フォント読込を確認。非公開管理画面やソースを配信しない構成を保持。有料画像変換APIは使わず、ローカルで生成した静的画像を既存の無料静的配信で公開します。

## 全画像一覧

|画像|変更前 KiB|標準画像 KiB|公開時の判定|
|---|---:|---:|---|
|projects/meguri/brand/app-icon.webp|32.6|32.6|retained-small|
|projects/meguri/brand/characters/canonical/utsupon-basic-v1.webp|20.8|20.8|retained-small|
|projects/meguri/brand/characters/generated/mikke-icon.webp|81.4|32.8|optimized|
|projects/meguri/brand/characters/generated/shirube-icon-v2.webp|87.5|34.1|optimized|
|projects/meguri/media/action-notice.webp|215.5|86.3|optimized|
|projects/meguri/media/action-pickup-v2.webp|214.0|87.2|optimized|
|projects/meguri/media/action-walk.webp|266.5|106.6|optimized|
|projects/meguri/media/area-ikoka.webp|290.9|219.4|optimized|
|projects/meguri/media/area-kawagoe.webp|285.2|213.9|optimized|
|projects/meguri/media/characters-trio.webp|313.7|268.3|optimized|
|projects/meguri/media/footer-town.webp|215.5|215.5|retained-already-efficient|
|projects/meguri/media/hero-family.webp|212.0|212.0|retained-already-efficient|
|projects/meguri/media/photo-bakery.webp|211.8|157.0|optimized|
|projects/meguri/media/photo-bath.webp|433.6|306.3|optimized|
|projects/meguri/media/photo-cafe.webp|444.1|317.9|optimized|
|projects/meguri/media/photo-florist.webp|217.1|164.8|optimized|
|projects/meguri/media/photo-printing.webp|105.7|81.3|optimized|
|projects/meguri/media/photo-workshop.webp|167.7|126.1|optimized|
|projects/meguri/media/step-check.webp|217.3|91.2|optimized|
|projects/meguri/media/step-reflect.webp|239.0|96.2|optimized|
|projects/sleeport/assets/apple-touch-icon.png|55.9|55.9|retained-small|
|projects/sleeport/assets/dortal-portrait.jpg|242.7|66.2|optimized|
|projects/sleeport/assets/harbor-forest-eyemask.jpg|611.8|200.7|optimized|
|projects/sleeport/assets/line-sticker-autumn.png|21.0|21.0|retained-small|
|projects/sleeport/assets/line-sticker-daily.png|21.4|21.4|retained-small|
|projects/sleeport/assets/line-sticker-new-day.png|20.9|20.9|retained-small|
|projects/sleeport/assets/porto-portrait-compact-wings.jpg|234.9|57.7|optimized|
|projects/sleeport/assets/rest-e.jpg|436.4|167.4|optimized|
|projects/sleeport/assets/rest-r.jpg|409.2|149.6|optimized|
|projects/sleeport/assets/rest-s.jpg|405.7|153.4|optimized|
|projects/sleeport/assets/rest-t.jpg|487.5|198.0|optimized|
|projects/sleeport/assets/sleemo-portrait.jpg|1919.2|66.9|optimized|
|projects/sleeport/assets/stories/dortal-01.jpg|247.7|94.6|optimized|
|projects/sleeport/assets/stories/dortal-03.jpg|312.3|140.7|optimized|
|projects/sleeport/assets/stories/dortal-05.jpg|318.5|147.4|optimized|
|projects/sleeport/assets/stories/dortal-chapter-01-cloud-contact.jpg|363.7|165.3|optimized|
|projects/sleeport/assets/stories/dortal-chapter-03-20260930.jpg|268.4|102.1|optimized|
|projects/sleeport/assets/stories/dortal-chapter-04-20260930.jpg|278.7|110.9|optimized|
|projects/sleeport/assets/stories/dortal-chapter-05-underwater-home.jpg|280.1|110.7|optimized|
|projects/sleeport/assets/stories/dortal-chapter-06-20260930.jpg|220.5|76.5|optimized|
|projects/sleeport/assets/stories/dortal-chapter-08-family.jpg|311.2|138.1|optimized|
|projects/sleeport/assets/stories/dortal-chapter-10-sea-rescue-short-fin.jpg|447.2|223.8|optimized|
|projects/sleeport/assets/stories/dortal-chapter-11-cloud-contact.jpg|304.6|128.1|optimized|
|projects/sleeport/assets/stories/dortal-chapter-12-cloud-contact.jpg|282.9|111.7|optimized|
|projects/sleeport/assets/stories/dortal-chapter-13-cloud-contact.jpg|364.1|168.2|optimized|
|projects/sleeport/assets/stories/porto-01.jpg|309.9|136.8|optimized|
|projects/sleeport/assets/stories/porto-02.jpg|281.5|106.1|optimized|
|projects/sleeport/assets/stories/porto-04-distinct-flock.jpg|276.9|115.9|optimized|
|projects/sleeport/assets/stories/porto-05.jpg|320.4|144.2|optimized|
|projects/sleeport/assets/stories/porto-chapter-02-identity.jpg|339.9|152.7|optimized|
|projects/sleeport/assets/stories/porto-chapter-05-20260930.jpg|262.7|95.3|optimized|
|projects/sleeport/assets/stories/porto-chapter-06-identity.jpg|354.0|159.5|optimized|
|projects/sleeport/assets/stories/porto-chapter-07-identity.jpg|409.9|190.5|optimized|
|projects/sleeport/assets/stories/porto-chapter-09-identity.jpg|331.1|142.5|optimized|
|projects/sleeport/assets/stories/porto-chapter-10-20260930.jpg|346.4|154.0|optimized|
|projects/sleeport/assets/stories/porto-chapter-11-20260930.jpg|302.1|132.6|optimized|
|projects/sleeport/assets/stories/sleemo-01-distinct-muur.jpg|258.4|91.8|optimized|
|projects/sleeport/assets/stories/sleemo-02-dolphin-body.jpg|256.3|94.1|optimized|
|projects/sleeport/assets/stories/sleemo-03.jpg|222.5|76.9|optimized|
|projects/sleeport/assets/stories/sleemo-04.jpg|297.9|117.9|optimized|
|projects/sleeport/assets/stories/sleemo-05.jpg|295.7|119.4|optimized|
|projects/sleeport/assets/stories/sleemo-chapter-01-20260930.jpg|284.6|116.4|optimized|
|projects/sleeport/assets/stories/sleemo-chapter-03-20260930.jpg|210.1|72.0|optimized|
|projects/sleeport/assets/stories/sleemo-chapter-08-identity.jpg|337.1|148.4|optimized|
|projects/sleeport/assets/stories/sleemo-chapter-09-20260930.jpg|306.4|129.1|optimized|
|projects/sleeport/assets/stories/sleemo-chapter-10-20260930.jpg|271.9|103.5|optimized|
|projects/sleeport/assets/stories/sleemo-chapter-11-20260930.jpg|287.8|117.1|optimized|
|projects/sleeport/assets/v2/cloud-letters.webp|117.2|69.0|optimized|
|projects/sleeport/assets/v2/dortal-portrait.webp|159.0|134.7|optimized|
|projects/sleeport/assets/v2/forest-frame.webp|211.9|138.5|optimized|
|projects/sleeport/assets/v2/forest-story.webp|333.1|226.4|optimized|
|projects/sleeport/assets/v2/harbor-footer.webp|263.6|227.4|optimized|
|projects/sleeport/assets/v2/harbor-hero.webp|233.3|207.2|optimized|
|projects/sleeport/assets/v2/harbor-market.webp|353.4|231.6|optimized|
|projects/sleeport/assets/v2/lighthouse-learning.webp|235.3|156.8|optimized|
|projects/sleeport/assets/v2/porto-portrait.webp|243.0|218.6|optimized|
|projects/sleeport/assets/v2/sleemo-portrait.webp|135.1|116.1|optimized|
|projects/sleeport/assets/v2/wave-divider.webp|27.1|27.1|retained-already-efficient|


公開確認: Cloudflare `096712d0-c8fb-4771-8a54-a0fa09ffb60a`。公開259件のHTTP 200および非公開URL404を確認。CSSキャッシュキーをimages-20261004に更新。

整理: 今回の比較画像・圧縮検証候補・一時導入fonttools・ビルドの非保護ファイル909件を指紋付き計画で整理。原本、コード、公開出力は保持。cleanupスクリプトのassets保護規則により、専用scratch内の2回の中間ビルドのassetsを含む48,854,832bytesは保留。既存の旧distや別タスクのデータは変更していません。プレビューサーバー停止済み。
