### 本文・箇条書きの長いURL

4. **権限の文字数の上限**
   - 題名: IAM object quotas
   - https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_iam-quotas.html
5. **データベースの操作記録の仕組みの導入手順**
   - 題名: Setting up the pgaudit extension
   - https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Appendix.PostgreSQL.CommonDBATasks.pgaudit.basic-setup.html
6. **同 設定値の一覧**
   - 題名: pgaudit extension reference
   - https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Appendix.PostgreSQL.CommonDBATasks.pgaudit.reference.html

本文: https://example.com/abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789

> 引用: https://example.com/abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789

識別子: `abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789`

## 表の列幅と改ページ

### 5.4.3 案A で注意すること

| # | 注意点 |
|---|---|
| 1 | **プールの本数 × 支店数**が、データベースの接続数の上限と監視のしきい値に収まるか確認する |
| 2 | 使われない支店のプールを閉じる設定（上の `minimumIdle` と `idleTimeout`）を必ず入れる |
| 3 | パスワード更新時にプールを作り直す処理（上の `invalidate`）を自分で書く |
| 4 | `branchId` を利用者の入力からそのまま組み立てない。ログイン情報から引いた値だけ使う |

### 比較表

| 項目 | 案A | 案B |
|---|---|---|
| 接続 | 必要に応じて作成 | あらかじめ作成 |
| 管理 | 支店ごとに管理 | 全体をまとめて管理 |

### 長い識別子

| # | 値 |
|---|---|
| 1 | `abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789` |
| 2 | https://example.com/abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 |
