# AI VIDEO STUDIO v0.2.1

スマホ・PC対応AI動画編集アプリの **非公開クラウド化を進めるための開発用コード**。GORIQとは別製品。販売・一般公開・決済はまだ対象外。

**現在はクラウド未配備。Cloudflare R2の有効化が必要で、Cloud Runなどのクラウド動画処理実行基盤も未接続。**

## この更新で追加したもの

- 既存v0.2のAPI、レスポンシブUI、FFmpegポータブルエンジンを継承。
- 標準は全体で32MiBの非公開試験用容量上限。実11GBの素材アップロードは承認前に拒否。
- 最初/最後のサンプルによる動画指紋と、チャンクSHA-256検証による誤アップロード防止。
- 編集予約時のソースとタイムラインのスナップショット保存。
- 処理待ちの二重ジョブ予約の禁止。
- 完成ファイルのOwner認証付き・1時間限定署名URLによるプレビュー（実R2未検証）。
- ソース/GUI/単体テストと、模擬R2/D1と本物のFFmpegを組み合わせたE2E試験。

## ファイル

- `cloud/public/index.html`：初心者向けWeb UI。
- `cloud/src/worker.mjs`：認証付きCloudflare API、ジョブ管理、容量/アップロード安全ゲート。
- `cloud/src/playback.mjs`：短期署名URLで非公開完成MP4をストリーム配信。
- `cloud/migrations/0001_init.sql`：未配備D1初期スキーマ（v0.2.1に合わせて更新）。
- `engine/run_manifest.py`：FFmpegの実行と技術的検査。訓練内容の専門的評価は含まれない。
- `cloud/processor/r2_run.py`：別途認証・費用承認が必要なR2/ジョブ接続候補。
- `docs/CLOUDFLARE_PREFLIGHT_2026-10-20.md`：Cloudflare実アカウント調査、止まっている理由と次工程。

## 自動テスト

```sh
cd cloud
node --test tests/*.test.mjs
cd ..
python -m unittest engine.test_manifest cloud.processor.test_r2_run -v
```

FFmpeg/ffprobeとPythonが必要です。未接続の外部サービスへ課金・アップロードはしません。

## クラウド公開の条件

1. オーナーがR2を有効化（支払方法・課金要件が出たら承認まで保留）。
2. D1/非公開R2/Ownerトークン/PLAYBACK_KEYを安全に作成・設定。開発用トークンは絶対に使用しない。
3. Workers上で模擬ではない小容量MP4アップロードと再生を確認する。
4. クラウドFFmpeg実行基盤は別途費用・権限承認の後に有効化する。
5. コスト上限・ジョブ重複処理・失敗時復帰・Private URLを実際の環境で検証する。

`LARGE_UPLOAD_APPROVED=1` と `STORAGE_COST_APPROVED=1` を両方設定し、容量環境変数を明示したときだけ32MiBを超えるアップロードが可能。ただしこれらの設定自体は請求上限を保証しません。

**このパッケージだけではiPhoneからクラウド上で動画編集はまだできません。**
