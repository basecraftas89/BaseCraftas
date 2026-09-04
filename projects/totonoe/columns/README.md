# ToToNoE+ コラム追加メモ

新しいコラムを追加するときは、次の2か所を更新します。

1. `columns/` に記事HTMLを追加する
2. `../contents.js` の `COLUMNS` 配列に1件追記する

`date` は `YYYY-MM-DD` 形式にすると、新しい順／古い順の並び替えに反映されます。

```js
{
  title: '記事タイトル',
  desc: '一覧カードに表示する短い説明文。',
  tags: ['AI活用', '業務整理'],
  date: '2026-09-04',
  url: 'columns/article-slug.html',
  thumb: 'AI'
}
```
