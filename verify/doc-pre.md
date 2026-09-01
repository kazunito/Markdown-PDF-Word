---
title: 再現用ドキュメント
subtitle: 長いコードブロックの改ページ確認
author: 検証
date: 2026-08-08
docno: DOC-TEST-0001
classification: 社外秘
---

# 4. 前の章

本文。ここは埋め草です。

# 5. ビルド定義(buildspec.yml)

## 5.1 置き場所

アプリリポジトリ(お客さま CodeCommit)の直下に `buildspec.yml` を置く。アプリと同じ プルリクエストで変更でき、版管理が一体になるため。

```yaml
version: 0.2

env:
  variables:
    AWS_DEFAULT_REGION: ap-northeast-1
    IMAGE_REPO_NAME: sample-app
  parameter-store:
    DOCKER_USER: /build/docker/user
    DOCKER_PASS: /build/docker/pass

phases:
  install:
    runtime-versions:
      python: 3.12
      nodejs: 20
    commands:
      - echo "install phase started on $(date)"
      - pip install --upgrade pip
      - pip install -r requirements.txt
      - npm ci --no-audit --no-fund
  pre_build:
    commands:
      - echo "pre_build phase started on $(date)"
      - aws --version
      - aws ecr get-login-password --region $AWS_DEFAULT_REGION | docker login --username AWS --password-stdin $ACCOUNT.dkr.ecr.$AWS_DEFAULT_REGION.amazonaws.com
      - COMMIT_HASH=$(echo $CODEBUILD_RESOLVED_SOURCE_VERSION | cut -c 1-7)
      - IMAGE_TAG=${COMMIT_HASH:=latest}
      - echo "IMAGE_TAG=$IMAGE_TAG"
  build:
    commands:
      - echo "build phase started on $(date)"
      - python -m pytest -q --junitxml=reports/pytest.xml
      - npm run lint
      - npm run build
      - docker build -t $IMAGE_REPO_NAME:$IMAGE_TAG .
      - docker tag $IMAGE_REPO_NAME:$IMAGE_TAG $ACCOUNT.dkr.ecr.$AWS_DEFAULT_REGION.amazonaws.com/$IMAGE_REPO_NAME:$IMAGE_TAG
  post_build:
    commands:
      - echo "post_build phase started on $(date)"
      - docker push $ACCOUNT.dkr.ecr.$AWS_DEFAULT_REGION.amazonaws.com/$IMAGE_REPO_NAME:$IMAGE_TAG
      - printf '[{"name":"app","imageUri":"%s"}]' $ACCOUNT.dkr.ecr.$AWS_DEFAULT_REGION.amazonaws.com/$IMAGE_REPO_NAME:$IMAGE_TAG > imagedefinitions.json
      - aws s3 cp imagedefinitions.json s3://$ARTIFACT_BUCKET/$IMAGE_TAG/

reports:
  pytest:
    files:
      - reports/pytest.xml
    file-format: JUNITXML

artifacts:
  files:
    - imagedefinitions.json
    - appspec.yml
    - taskdef.json
  discard-paths: no

cache:
  paths:
    - /root/.cache/pip/**/*
    - node_modules/**/*
```

## 5.2 テンプレート

上記をそのまま使う。

## 5.3 長い引用

> 引用行 01 これはページをまたぐ長さの引用です。分割されずに次ページへ送られると前ページが大きく空きます。
> 引用行 02 これはページをまたぐ長さの引用です。分割されずに次ページへ送られると前ページが大きく空きます。
> 引用行 03 これはページをまたぐ長さの引用です。分割されずに次ページへ送られると前ページが大きく空きます。
> 引用行 04 これはページをまたぐ長さの引用です。分割されずに次ページへ送られると前ページが大きく空きます。
> 引用行 05 これはページをまたぐ長さの引用です。分割されずに次ページへ送られると前ページが大きく空きます。
> 引用行 06 これはページをまたぐ長さの引用です。分割されずに次ページへ送られると前ページが大きく空きます。
> 引用行 07 これはページをまたぐ長さの引用です。分割されずに次ページへ送られると前ページが大きく空きます。
> 引用行 08 これはページをまたぐ長さの引用です。分割されずに次ページへ送られると前ページが大きく空きます。
> 引用行 09 これはページをまたぐ長さの引用です。分割されずに次ページへ送られると前ページが大きく空きます。
> 引用行 10 これはページをまたぐ長さの引用です。分割されずに次ページへ送られると前ページが大きく空きます。
> 引用行 11 これはページをまたぐ長さの引用です。分割されずに次ページへ送られると前ページが大きく空きます。
> 引用行 12 これはページをまたぐ長さの引用です。分割されずに次ページへ送られると前ページが大きく空きます。
> 引用行 13 これはページをまたぐ長さの引用です。分割されずに次ページへ送られると前ページが大きく空きます。
> 引用行 14 これはページをまたぐ長さの引用です。分割されずに次ページへ送られると前ページが大きく空きます。
> 引用行 15 これはページをまたぐ長さの引用です。分割されずに次ページへ送られると前ページが大きく空きます。
> 引用行 16 これはページをまたぐ長さの引用です。分割されずに次ページへ送られると前ページが大きく空きます。
> 引用行 17 これはページをまたぐ長さの引用です。分割されずに次ページへ送られると前ページが大きく空きます。
> 引用行 18 これはページをまたぐ長さの引用です。分割されずに次ページへ送られると前ページが大きく空きます。
> 引用行 19 これはページをまたぐ長さの引用です。分割されずに次ページへ送られると前ページが大きく空きます。
> 引用行 20 これはページをまたぐ長さの引用です。分割されずに次ページへ送られると前ページが大きく空きます。

## 5.4 長い表

| 項目 | 設定値 | 説明 |
|---|---|---|
| 項目 01 | value-01 | 説明文 01。ページ境界をまたぐ長さの表を作るための行です。 |
| 項目 02 | value-02 | 説明文 02。ページ境界をまたぐ長さの表を作るための行です。 |
| 項目 03 | value-03 | 説明文 03。ページ境界をまたぐ長さの表を作るための行です。 |
| 項目 04 | value-04 | 説明文 04。ページ境界をまたぐ長さの表を作るための行です。 |
| 項目 05 | value-05 | 説明文 05。ページ境界をまたぐ長さの表を作るための行です。 |
| 項目 06 | value-06 | 説明文 06。ページ境界をまたぐ長さの表を作るための行です。 |
| 項目 07 | value-07 | 説明文 07。ページ境界をまたぐ長さの表を作るための行です。 |
| 項目 08 | value-08 | 説明文 08。ページ境界をまたぐ長さの表を作るための行です。 |
| 項目 09 | value-09 | 説明文 09。ページ境界をまたぐ長さの表を作るための行です。 |
| 項目 10 | value-10 | 説明文 10。ページ境界をまたぐ長さの表を作るための行です。 |
| 項目 11 | value-11 | 説明文 11。ページ境界をまたぐ長さの表を作るための行です。 |
| 項目 12 | value-12 | 説明文 12。ページ境界をまたぐ長さの表を作るための行です。 |
| 項目 13 | value-13 | 説明文 13。ページ境界をまたぐ長さの表を作るための行です。 |
| 項目 14 | value-14 | 説明文 14。ページ境界をまたぐ長さの表を作るための行です。 |
| 項目 15 | value-15 | 説明文 15。ページ境界をまたぐ長さの表を作るための行です。 |
| 項目 16 | value-16 | 説明文 16。ページ境界をまたぐ長さの表を作るための行です。 |
| 項目 17 | value-17 | 説明文 17。ページ境界をまたぐ長さの表を作るための行です。 |
| 項目 18 | value-18 | 説明文 18。ページ境界をまたぐ長さの表を作るための行です。 |
| 項目 19 | value-19 | 説明文 19。ページ境界をまたぐ長さの表を作るための行です。 |
| 項目 20 | value-20 | 説明文 20。ページ境界をまたぐ長さの表を作るための行です。 |
| 項目 21 | value-21 | 説明文 21。ページ境界をまたぐ長さの表を作るための行です。 |
| 項目 22 | value-22 | 説明文 22。ページ境界をまたぐ長さの表を作るための行です。 |
| 項目 23 | value-23 | 説明文 23。ページ境界をまたぐ長さの表を作るための行です。 |
| 項目 24 | value-24 | 説明文 24。ページ境界をまたぐ長さの表を作るための行です。 |
| 項目 25 | value-25 | 説明文 25。ページ境界をまたぐ長さの表を作るための行です。 |
| 項目 26 | value-26 | 説明文 26。ページ境界をまたぐ長さの表を作るための行です。 |
| 項目 27 | value-27 | 説明文 27。ページ境界をまたぐ長さの表を作るための行です。 |
| 項目 28 | value-28 | 説明文 28。ページ境界をまたぐ長さの表を作るための行です。 |
| 項目 29 | value-29 | 説明文 29。ページ境界をまたぐ長さの表を作るための行です。 |
| 項目 30 | value-30 | 説明文 30。ページ境界をまたぐ長さの表を作るための行です。 |
| 項目 31 | value-31 | 説明文 31。ページ境界をまたぐ長さの表を作るための行です。 |
| 項目 32 | value-32 | 説明文 32。ページ境界をまたぐ長さの表を作るための行です。 |
| 項目 33 | value-33 | 説明文 33。ページ境界をまたぐ長さの表を作るための行です。 |
| 項目 34 | value-34 | 説明文 34。ページ境界をまたぐ長さの表を作るための行です。 |
| 項目 35 | value-35 | 説明文 35。ページ境界をまたぐ長さの表を作るための行です。 |
| 項目 36 | value-36 | 説明文 36。ページ境界をまたぐ長さの表を作るための行です。 |
| 項目 37 | value-37 | 説明文 37。ページ境界をまたぐ長さの表を作るための行です。 |
| 項目 38 | value-38 | 説明文 38。ページ境界をまたぐ長さの表を作るための行です。 |
| 項目 39 | value-39 | 説明文 39。ページ境界をまたぐ長さの表を作るための行です。 |
| 項目 40 | value-40 | 説明文 40。ページ境界をまたぐ長さの表を作るための行です。 |

以上。
