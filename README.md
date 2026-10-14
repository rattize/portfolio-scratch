# ポートフォリオサイト

HTML・CSS・JavaScriptで構成した静的サイトです。

## 構成

- `index.html`：ホーム
- `about.html`：紹介
- `contact.html`：連絡
- `works/index.html`：作品
- `assets/css/site.css`：共通スタイル
- `assets/js/`：作品ページと3D表示の処理
- `content/articles/`：記事のMarkdownと一覧データ `catalog.json`
- `scripts/render-articles.mjs`：記事HTMLの生成処理
- `articles/`：生成された記事一覧・記事ページ
- `test/`：記事生成と3D表示のテスト

## ローカルで表示する

このディレクトリで次のコマンドを実行します。

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

ブラウザで <http://localhost:8000/> を開きます。
サーバーを停止するときは、実行したターミナルで `Ctrl+C` を押します。
生成済みのHTMLを表示するだけなら、Node.jsの準備は不要です。

## 編集・整形する

整形や記事生成にはNode.jsとnpmを使います。最初に依存パッケージをインストールします。

```sh
npm ci
```

編集後は、次のコマンドでHTML・CSS・JavaScriptなどをまとめて整形できます。

```sh
npm run format
```

整形ルールは `.prettierrc.json` にあります。インデントはスペース2個です。
`.editorconfig` に対応したエディターにも、インデントと改行の設定が適用されます。

## 記事を生成する

`content/articles/<slug>.md` に本文を書き、`catalog.json` に
`slug`・`title`・`date`（`YYYY-MM-DD`）・`summary` を持つレコードを追加します。

```sh
npm run build
```

`articles/` のHTMLは自動生成されるため、本文は `content/articles/`、
共通のHTML構造は `scripts/render-articles.mjs` を編集してください。
生成時にもPrettierが動き、読みやすいHTMLを出力します。

## 確認する

```sh
npm run format:check
npm test
```
