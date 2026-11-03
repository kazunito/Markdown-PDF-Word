---
title: 画像の埋め込み確認
subtitle: v0.3.7
author: 検証
date: 2026-11-02
docno: VERIFY-IMG-001
classification: 社外秘
---

# 1. 画像の確認

## 1.1 横長の PNG (本文幅に縮小)

![横長](images/wide.png)

## 1.2 縦長の PNG (図の高さの上限に縮小)

![縦長](images/tall.png)

## 1.3 小さい PNG (拡大しない)

![小さい](images/small.png)

## 1.4 日本語と空白を含むパス

![日本語パス](images/日本語フォルダ/図%201.png)

## 1.5 JPEG

![写真](images/photo.jpg)

## 1.6 表の中の画像

| 項目 | 画像 |
|---|---|
| 小さい | ![表内](images/small.png) |

## 1.7 文中の画像

前の文 ![文中](images/small.png) 後の文。

## 1.8 存在しない画像 (説明文を文字で残し、通知する)

![存在しない画像](images/missing.png)
