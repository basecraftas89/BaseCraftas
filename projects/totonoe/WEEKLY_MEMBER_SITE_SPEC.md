# ToToNoE+ TAYORI 会員サイト設計 v0.1

## 目的

TAYORIの販売LPと利用画面を分離し、有効なTAYORI会員が「今週の内容」「全バックナンバー」「解説動画」「Q&A・テーマリクエスト」を一か所から利用できるようにする。

## 確認済みの配布元

- Google Driveフォルダ名: `PDF`
- Folder ID: `18Ahx_o5GwHH_BjyLK1e4NItNBKoWc8uy`
- 2026-09-11確認時点: PDF 15件
- 各PDFはDrive上でダウンロード可能
- ルートフォルダに「リンクを知っている全員・閲覧者」が設定されているため、現状のURL直リンクは会員限定配信にならない

## TAYORIで提供する内容

1. 読む: 毎週の重要AIトピックを実務に引き寄せた整理メモ・PDF
2. 観る: TAYORIテーマの短い解説動画
3. 問いかける: 次週に扱ってほしいテーマのリクエスト
4. 深める: 会員限定Q&Aと回答履歴
5. 持ち帰る: 対象PDFのブラウザ閲覧・ダウンロード

Podcastや朝活アーカイブは補助導線として扱い、TAYORIの中核特典とは分ける。

## 閲覧条件

- `weekly_access` が active であること
- 入会時期に関係なく、現役会員には全バックナンバーを表示する
- 解約予約後も支払済み期間中は利用可能とする
- 利用期限終了後は会員ページと資料一覧APIを利用できない
- Driveの公開URLを知っている人の直接閲覧までは制限対象にしない
- 管理者は公開日を修正できる

Driveの `createdTime` は資料公開日として採用しない。既存ファイルでは資料名の日付とDrive作成日が一致しない例があるため、初回同期時に `first_seen_at` を保存し、`published_at` は既存分を管理者確認、新規分を初回検出日時で仮設定する。

## 配信方式

既存の公開Driveフォルダをそのまま利用する。Cloudflare Workerが会員認証と契約状態を確認してから、資料一覧と対象ファイルへの導線を返す。

- 閲覧・ダウンロード: `GET /api/weekly/materials/:id/open?mode=view|download`
- 一覧: `GET /api/weekly/materials`
- 管理者同期: `POST /api/weekly/materials/sync`

これにより、退会者が会員ページから毎週の新着を継続的に追う状態を防ぐ。資料自体の完全な機密化を目的とはしない。

## 同期

- 初期: 1時間ごとの自動確認 + 管理画面の「今すぐ同期」
- 新規Drive file IDは `weekly_materials` に一度だけ登録
- 同じDrive file IDは重複登録しない
- Driveから消えた場合は即削除せず `missing` にして管理者確認
- 新規資料は `draft` で検出し、命名規則を満たす場合だけ自動公開する方式から開始

推奨ファイル名: `2026-09-12_TAYORI_第16回_テーマ名.pdf`

## データ

### weekly_materials

- id
- drive_file_id
- title
- file_name
- mime_type
- size_bytes
- first_seen_at
- published_at
- status (`draft`, `published`, `missing`, `archived`)
- view_count
- download_count

### weekly_member_access

- customer_id
- weekly_access_started_at
- current_status
- subscription_id
- ended_at

### weekly_material_events

- customer_id
- material_id
- event_type (`view`, `download`)
- occurred_at

## 会員向けUI

### 1. ホーム

- 今週のTAYORI
- 最新PDFの表紙・タイトル・公開日
- 「ブラウザで読む」「ダウンロード」の2ボタン
- 今週の3ポイント
- 短い解説動画
- 次週テーマをリクエスト

### 2. 資料ライブラリ

- 全バックナンバーを新しい順に一覧表示
- 年月・テーマで絞り込み
- PDF、容量、公開日を表示
- 閲覧とダウンロードを明確に分ける

### 3. Q&A

- 質問投稿
- 回答済み・受付中
- 他会員の質問を個人情報なしで閲覧

### 4. マイページ

- TAYORI契約状態
- 閲覧開始日
- 次回更新日
- ダウンロード履歴
- 解約・IROHAへのアップグレード

## UI方針

既存のIROHAダッシュボードと同じ左ナビ・配色・カード構造を使う。TAYORIでは学習計画を主役にせず、「今週届いたもの」を最上部に置く。モバイルでは最新号、閲覧、ダウンロードを最初の画面内に収める。

## 実装前の必須対応

1. TAYORI用サービスアカウントから公開フォルダを取得できることを確認
2. 顧客ログインとStripe Webhookを本番接続
3. D1へTAYORI資料・閲覧権限・履歴テーブルを追加
4. WorkerのDrive同期を有効化
5. 未ログイン・利用期限終了後に資料一覧へ入れないことを結合テスト
