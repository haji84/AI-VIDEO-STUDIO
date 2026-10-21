# Cloudflare 非公開クラウド化：接続調査と実機前提条件

確認日：2026-10-20（接続先はユーザーがChatGPTに接続したCloudflareアカウント）。

## 実アカウントの読み取り結果

- Cloudflare接続：成功。
- 既存Worker：2件（`ai`、`goriq-verification-gate`）。今回どちらも変更していない。
- D1 DB：0件。今回新規作成していない。
- R2：list bucketの呼び出しがHTTP 403、エラー `10042: Please enable R2 through the Cloudflare Dashboard`。R2未有効化で現時点で素材のクラウド保存不可。
- Workers subdomainは確認できた。ただしプレビューWorkerは作成・配信していない。
- Cloudflare契約/請求の参照：接続トークンにBilling Read権限がなくHTTP 403。現行プランと課金設定は未確認。
- Cloud Run / GPU処理環境：未接続。実クラウド上のFFmpeg処理は未実施。

## 今回実施しなかった操作

R2有効化、課金手続き、D1/Workerの新規作成・公開、秘密鍵登録、Cloud Run Jobの作成・実行、一般公開、Stripe接続、GORIQ既存資産変更、実動画11GBのアップロード。

理由：R2の初期有効化が必要であり、請求プランを読み取れず、利用者は追加料金が発生し得る変更の事前承認を要求しているため。

## v0.2.1に追加した開発成果

- 標準では1つのOwnerアカウントにつき全プロジェクト合計32MiBまでのハード上限。動画1本の上限も32MiB。初回は人工小動画の試験専用。
- 別途承認して明示的に設定する`LARGE_UPLOAD_APPROVED=1`と`STORAGE_COST_APPROVED=1`の**両方**、および`MAX_PREVIEW_STORAGE_BYTES`があって初めて拡大する。上限は24GiB（ファイル単体は8GiB）。これはCloudflare請求金額の絶対上限ではない。
- ブラウザは最初と最後のサンプル（各最大256KiB）からSHA-256指紋を生成して、同名・同容量でも違う動画を誤って再開しにくくする。
- 8MiBチャンクごとのSHA-256照合を必須化。
- 編集予約時に入力ファイル・タイムラインを固定し、後からのプロジェクト変更がそのジョブに混ざらないようにした。
- 未完了ジョブがあると重複ジョブを拒否。
- 完成動画の配信に、Owner認証の後に発行する1時間限定のHMAC署名URLを追加。`Range`アクセスは模擬R2でテスト。再生URLを知った第三者も期限内はアクセスできるため、取扱注意。再生鍵は本番ではsecretで管理。
- 処理ジョブの起動は従来どおり`PROCESSOR_ENABLED=1`と`CLOUD_PROCESSING_APPROVED=1`が両方必要。現在は未有効化。

## 検証結果

- Node API単体/結合テスト：21 PASS / 0 FAIL。
- Python FFmpeg/manifest/入出力安全性テスト：7 PASS / 0 FAIL。
- AI動画編集の模擬クラウドパイプライン：R2/D1モックへ実MP4を保存し、凍結manifest→Python FFmpeg→完成MP4の全編デコード→状態更新を検証した（Nodeテストに含む）。
- 実Cloudflare R2：NOT RUN。実Cloudflare D1：NOT RUN。実Cloud Run：NOT RUN。実11GB動画：NOT RUN。iPhone実機：NOT RUN。

## ユーザーに必要な最小操作

Cloudflareダッシュボードの「R2 Object Storage」に進み、有効化案内を確認する。支払い方法の登録や有料プランへの変更が求められたら、そこで操作を止めて画面を共有すること。秘密鍵・クレジットカード番号をChatGPTへ貼らない。

R2を有効化できたら、次にアカウントの非公開バケット、D1、Owner認証シークレットの準備と、32MiB以下の人工動画で実クラウド転送を試す。実11GBのアップロードは費用/保存期限/権限設定/削除確認後の別承認とする。

クラウドFFmpeg処理はR2の有効化だけでは動かず、別のジョブ実行環境とその権限・費用の確認が必要。

## 公式参考資料

- Cloudflare R2 pricing: https://developers.cloudflare.com/r2/pricing/
- Workers request limits: https://developers.cloudflare.com/workers/platform/limits/
- R2 multipart: https://developers.cloudflare.com/r2/objects/upload-objects/
- R2 Workers API: https://developers.cloudflare.com/r2/api/workers/workers-api-reference/
- D1 pricing: https://developers.cloudflare.com/d1/platform/pricing/
