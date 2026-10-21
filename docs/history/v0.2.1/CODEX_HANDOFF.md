# Codex / 将来GORIQへの v0.2 実装引継ぎ

このプロジェクトはGORIQと別製品。独立リポジトリを推奨。旧GORIQリポジトリや稼働サービスを変更しない。

## 目標
個人専用のiPhone/Android/PC対応AI VIDEO STUDIOを、クラウドで元動画保存・実編集できるようにする。ユーザー登録・サブスク課金・一般公開は後日とし、今回はプロトタイプの完成と実機E2Eを優先。

## 正本
README.md, STATUS.md, docs/ARCHITECTURE.md, docs/IMPLEMENTATION_PLAN.md, docs/COST_GATES.md

## ソース構造
cloud/src/* Cloudflare Workers/D1/R2 API
cloud/public/index.html mobile-first UI
cloud/migrations/* data schema
engine/core_v01.py re-used v0.1 FFmpeg library
engine/run_manifest.py portable media processor
cloud/processor/r2_run.py dormant R2/processor integration
Dockerfile.processor optional Cloud Run container (not deployed)

## 現在の検証
Node API: 13 PASS (mock D1/R2), Python FFmpeg/R2 contract: 7 PASS (synthetic media only).
Cloudflare実機/GoPro・X3実動画/iPhoneブラウザE2E/AI意味解析は未検証。

## 次の必須作業

- まず現行仕様と差分を確認し、検証済みコードを壊さず再利用する。
- 新規クラウド資格情報、課金契約、デプロイなどはOwner承認前に実施しない。
- プレビューUIに実際のタイムライン再生、範囲指定、スワイプ/ドラッグ操作を追加する。
- クラウドジョブのワークフロー接続・idempotency/lease・メータリングを完成してから実行ONにする。
- AIの映像理解は別モデルで実測し、未確認の訓練動作や評価を創作しない。
- Cloud Run等が不要な場合は別のオンデマンドCPU方式を評価する。GPUは費用対効果で採用判断。
- 動画1本/2本/3本以上・360度・再編集・出力・全編技術QA・意味的QAをそれぞれ検証する。
- 2026年10月20日の短期開発でも、未検証をCOMPLETE扱いしない。
