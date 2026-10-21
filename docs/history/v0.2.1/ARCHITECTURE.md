# AI VIDEO STUDIO v0.2.1 アーキテクチャ（非公開クラウド・将来SaaS）

## 製品境界

- AI VIDEO STUDIOとGORIQは別の製品・別のコードベース・別の完成判定にする。
- 将来GORIQの自律開発機能と接続する場合は開発タスク・Issue連携などAPI経由に限定する。動画・課金情報をGORIQに常時送らない。
- 開発者用のOwnerプレビューと将来のサブスク会員データは、同じ認証前提にしない。v0.2はデモ用単一Ownerのみ。

## コンポーネント

```text
iPhone / Android / PC Safari/Chrome
  └─ Private mobile web interface (HTML/JS)
         └─ Cloudflare Workers API [Owner認証]
                 ├─ D1: projects/assets/uploads/parts/jobs/usage/entitlements
                 └─ Private R2: uploads 8 MiB multipart (data never in D1)
                          └─ [future explicitly authorized dispatch]
                                  └─ isolated on-demand FFmpeg worker (portable Linux container)
                                          ├─ stage source from R2
                                          ├─ sync/plan/render with reused v0.1 engine
                                          ├─ whole-output technical QA
                                          └─ return MP4 + report to R2/D1
```

## 動画データと復旧

- 通常のプレビューはアカウント全体で32 MiB・1ファイル32 MiBに制限。未承認の11GB素材を拒否する。別途容量/費用を承認し二段階フラグを設定した場合に限り、1ファイル最大8 GiB・全体最大24 GiB、最大100本という設計上限へ拡大可能。請求額の絶対保証ではない。
- R2 multipartは8 MiB等長パート＋最終パート。アップロード状況はD1に保存する。
- 同じファイルを再選択した時、ファイル名・サイズ・最初と最後の各256KiBから算出したサンプル指紋の一致を確認し、サーバー保存済みPart番号から再送箇所を決める。全ファイル完全SHA照合は未実装。各PartにはSHA-256照合を必須化。
- R2未完了アップロードは既定の自動Abort期限がある。期限超過時は最初から作成し直す。
- 生成時は原素材を上書きしない。出力とQAを別オブジェクトにする。
- 作品保存はmetadataとtimeline、および編集ジョブ受付時点の固定manifestをD1、元ファイル・完成ファイルはR2。AI編集判断は追跡可能なジョブ証拠として追加する。

## タイムライン仕様

- sourceIdは独立のasset ID。
- startは、**撮影時刻同期後の共通タイムライン秒数**。元ファイルの局所秒数ではない。
- 再生速度、レイアウト、2画面の相手カメラ、字幕、編集時間を保持。
- 音声同期は推定値。未検証の同期を専門的正確性のPASS扱いしない。
- 複数ソースが未同期の場合、デフォルトのRenderジョブは停止する。

## 非本番クラウド処理の起動契約

1. 編集ジョブはD1に`waiting_for_processor`で記録。これだけでは処理は開始しない。
2. Cloud Run Jobs等へのDispatcher実装・権限・処理費用の承認が必要。
3. 別のWORKER_TOKENで内部API `GET manifest`を取得し、独立したR2認証で素材を読み込む。
4. `PROCESSOR_ENABLED=1` **かつ** `CLOUD_PROCESSING_APPROVED=1` でなければclaimできない。
5. 技術的QA、完成MP4を保存し、内部APIへ成功/失敗を通知する。意味的QAは別工程。
6. 未完了ジョブの重複予約を拒否するが、lease/heartbeat/idempotency/recoveryの強い保証は今後追加し、実クラウドE2Eで確認してから初めてONにする。

## 将来のSaaS仕様（後日、今は保留）

- Stripe Billing、ユーザー登録、ログイン方法、価格プラン、クレジット消費、請求書、解約、利用規約、税処理、無料トライアル、サブスク更新。
- 認証を複数テナントに拡張する時は、全D1/R2キー・ジョブ・料金にユーザー分離を強制し、秘密鍵/権限/課金ロジックの独立監査を必須とする。
- 価格は素材総時間、解析モデル、GPU時間、転送量、保存期間の実測で決定。月980円などは未確定の案。

## 非機能要件

- サーバーがZBook上で起動していることを要求しない。
- 転送中iPhoneのSafariが中断する場合を考慮し再送を用意。ただしOSレベルの完全バックグラウンド転送は未保証。
- Storage/DB/computeを分離し、処理エンジンの停止でもプロジェクト/元動画を維持。
- Cloudflare Account・R2・D1・Cloud Runの実クラウド動作と費用は実測前はINCONCLUSIVE。

## v0.2.1 非公開MP4再生

Owner認証で `GET /api/jobs/{jobId}/playback` を呼ぶと、HMAC署名と1時間期限付きの再生URLを返す。署名リンクには機密情報を含まないが、共有されれば期限内に再生可能なベアラーURLになる。対象は `completed_technical` の非公開R2オブジェクトのみ。R2へのRangeリクエストをストリーミング転送する設計。実R2/iPhone再生は未検証。Workerの`PLAYBACK_KEY`はsecretとして配備し、ソースとログに含めない。
