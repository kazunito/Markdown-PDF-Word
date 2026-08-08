# Markdown Formal PDF / Word

[English](README.md) · **日本語**

正式文書向けに Markdown を PDF と Word (.docx) へ変換する VSCode 拡張です。
**Markdown ファイル自体は一切変更しません。**

## できること

| 機能 | PDF | Word |
|---|---|---|
| Markdown を変更しない | ○ | ○ |
| 表紙を独立 1 ページ (front matter から生成) | ○ | ○ |
| 文書管理番号を表紙に配置 | ○ | ○ |
| 機密区分の赤いスタンプ (社外秘 等) | ○ (傾き付き) | ○ (傾き付き。PDF と同じ画像を貼る) |
| 目次を生成 (ページ番号・点線リーダー付き) | ○ | ○ (Word がフィールドを更新) |
| 表紙・目次はページ番号なし、本文を 1 ページ目とする | ○ | ○ |
| 章頭で改ページ | ○ | ○ |
| ページ枠 (表紙・目次・本文で個別に指定) | ○ | ○ |
| フォント・見出し装飾の指定 | ○ | ○ |
| 表や長い行をページ幅に収める | ○ | ○ |
| 長い表をページ境界で分割 (見出しだけのページを作らない) | ○ | ○ |
| 分割された表の見出し行を続きのページにも表示 | — | ○ |
| PDF のしおり (アウトライン) | ○ | — |
| 編集制限 (権限パスワード) | ○ | — |
| 電子署名 (改ざん検知) | ○ | — |
| SHA-256 ハッシュの出力 | ○ | ○ |

Word 出力は**編集用ドラフト**の位置づけです。正本は PDF を使ってください。

## 必要なもの

- VSCode 1.85 以降
- **Google Chrome または Microsoft Edge** (PDF 化のレンダリングに使用)
  - 標準的なインストール先を自動検出します
  - 見つからない場合は `markdownFormal.browser.executablePath` にパスを指定してください
  - Chromium の追加ダウンロードは行いません

Windows / macOS / Linux で動作します (すべて純 JavaScript のため OS 別ビルドは不要)。

## 使い方

1. Markdown ファイルを開く
2. コマンドパレット (`Ctrl/Cmd + Shift + P`) から実行する
   - `Markdown Formal: PDF に変換`
   - `Markdown Formal: Word (docx) に変換`
   - `Markdown Formal: PDF と Word の両方に変換`

### Markdown の書き方

表紙は front matter から作られます。本文に表紙用の見出しを書く必要はありません。

```markdown
---
title: システム運用手順書
subtitle: 第 1.0 版
author: インフラ運用チーム
date: 2026-08-08
docno: DOC-INF-2026-0142
classification: 社外秘
---

# 第1章 はじめに

本文...
```

| front matter | 表紙での位置 |
|---|---|
| `docno` | 左上 (文書管理番号) |
| `classification` | 右上 (赤いスタンプ) |
| `title` / `subtitle` | 中央 |
| `author` / `date` | 中央下 |

## 主な設定

| 設定 | 既定値 | 説明 |
|---|---|---|
| `markdownFormal.page.format` | `A4` | 用紙サイズ |
| `markdownFormal.page.orientation` | `portrait` | 用紙の向き (文書全体) |
| `markdownFormal.frame.cover` | `false` | 表紙にページ枠を描く |
| `markdownFormal.frame.toc` | `true` | 目次にページ枠を描く |
| `markdownFormal.frame.body` | `true` | 本文にページ枠を描く |
| `markdownFormal.heading.style` | `band` | 見出しの装飾 (`plain` / `band` / `underline`) |
| `markdownFormal.heading.pageBreakLevel` | `1` | この階層までの見出しの前で改ページ |
| `markdownFormal.toc.depth` | `3` | 目次に載せる階層 |
| `markdownFormal.protection.mode` | `restrict` | 保護方式 (`none` / `restrict` / `sign`) |
| `markdownFormal.hash.emit` | `true` | `.sha256` を併せて出力する |

設定はすべて設定画面から変更します。コマンドパレットで
`Markdown Formal: 設定を開く` を実行すると、この拡張の設定だけに絞り込んだ状態で開きます。

フォントは 3 OS で使えるようフォールバックを並べて指定してください
(既定値はヒラギノ → 游 → Noto の順)。

## 表示言語

画面表示は VSCode の表示言語に従います。既定は英語で、日本語に対応しています。
それ以外の言語では英語で表示されます。切り替えはコマンドパレットの
`表示言語を構成する` から行います。

次の 2 つは画面ではなく**出力される文書に載る**文字列のため、表示言語では切り替わりません。
日本語の文書を作る場合は設定を変更してください。

| 設定 | 既定値 | 日本語の文書にする場合 |
|---|---|---|
| `markdownFormal.toc.title` | `Contents` | `目次` |
| `markdownFormal.signing.reason` | `Approved as an official document` | `正式文書として承認` |

## 保護についての注意

**この拡張が提供する保護には限界があります。正式文書として扱う前に必ずお読みください。**

- **編集制限 (`restrict`)** は PDF 仕様上ビューア任せの「助言」であり、強制力はありません。
  権限を無視する閲覧ソフトが実在するため、**改ざん防止にはなりません**。
- **電子署名 (`sign`)** は「防止」ではなく「**検知**」です。署名後も編集自体は可能で、
  編集されると署名が無効になることで改ざんを判別します。
- **両者は併用できません。** 暗号化がファイル全体を書き直すため署名範囲が壊れます。
  設定は排他です。
- 署名の検知は**閲覧環境に依存します**。Chrome は PDF の署名を検証できません。
  Adobe Acrobat Reader の利用を推奨します。

閲覧環境を指定できない場合は、**SHA-256 のハッシュを文書管理台帳に記録し、
受入時に照合する**運用を推奨します。この方法だけはビューアに依存しません。

```bash
# 受入時の照合 (OK と出れば改ざんなし)
shasum -a 256 -c 手順書.pdf.sha256
```

詳しくは [docs/運用手順.md](docs/運用手順.md) を参照してください。

## 秘密情報の扱い

- オーナーパスワードと証明書パスフレーズは **VSCode の SecretStorage にのみ保存**します。
  `settings.json` には書きません。
  - `Markdown Formal: オーナーパスワードを保存 (SecretStorage)`
  - `Markdown Formal: 証明書パスフレーズを保存 (SecretStorage)`
- 署名用証明書 (`.p12` / `.pfx`) は**リポジトリ外**に置き、絶対パスを設定で指定してください。
  本リポジトリの `.gitignore` は証明書・鍵・パスワード類を除外しています。

## ライセンス

MIT
