# Issue #37 — MacBook でのメディア検出・取り込み復旧・MP4 出力

2026-11-23 JST。Apple Silicon の MacBook Pro で、ローカルエディタに合成素材を
取り込む Gate A の一部を検証した。判定は **TESTED_SYNTHETIC（Mac 実機）**。

## 引継ぎと差分

[Issue #37](https://github.com/haji84/AI-VIDEO-STUDIO/issues/37)、
[Draft PR #36](https://github.com/haji84/AI-VIDEO-STUDIO/pull/36) の
[引継ぎ全文](https://github.com/haji84/AI-VIDEO-STUDIO/blob/1e659b0de9ea5582330acaaaa62b65eeb049faf4/docs/handoffs/CODEX_TRAINING_VIDEO_REMOTE_ZBOOK_2026-11-15.md)、
最新 `main` の [GOAL](../../GOAL.md)、[AGENTS](../../AGENTS.md)、
状態・ロードマップ・作業チェックポイント、製品・音声仕様と既存 CI を照合した。
`main` は `e1bf222dfe0043e307e3fc3c122e2fe52423dac8`。作業は
`fix/zbook-media-preflight-20261115` の `7aff6b3bd0043c6873ee4c6328da61d45c3112ad`
から再開した。既存の [2026-11-15 Linux 検証](ZBOOK_MEDIA_GATE_A_2026-11-15.md) と
メディアツール・JSON 検査・送信済み素材の再試行の実装を引き継いだ。
実機検証の対象コードは [de9d303](https://github.com/haji84/AI-VIDEO-STUDIO/commit/de9d303f13500cd4be390748ea8fd57020c236e6)。
実装と検証記録を [Draft PR #51](https://github.com/haji84/AI-VIDEO-STUDIO/pull/51) で
Issue #37 に紐づけた。

Mac の一時保存先は `/var` 経由で開かれ、実パスは `/private/var` 配下にある。
従来はレンダリングが完了しても、完成記録の保存時にパス検査で
`OUTPUT_PATH_UNSAFE` になった。最新 `main` と作業ブランチの両方で再現した。
起動時の実パスを保存先として統一した。別名と実パスは同じロックを使用し、
リポジトリ内の保存先と、出力・検査ファイル配下の不正なリンクは既存の検査で拒否する。
別名経由で2回書き出し、終了・再起動後に両方の MP4 と検査記録を取得する回帰試験を加えた。

macOS の実パスや Homebrew Node の共有ライブラリを考慮してテスト用のパスと実行方法を
調整した。保存済みカットの短尺確認は Linux 専用のまま、macOS の API では
`PREVIEW_PLATFORM_UNVERIFIED` を返すことを確認した。

最新 `main` のオフラインとブラウザの両ジョブは成功。PR #36 の作業ブランチは
引継ぎ文書のみでチェック実行なし。音付きプレビュー Draft #26 の手動 CI 成功は
過去の `7c972ad` で、現在の `465a111` では CodeRabbit がスキップされた。
Git の事前照合では、現在の #26 とこの修正ブランチは
`apps/local-editor/index.html` および状態文書の変更が競合する。
HUB NATURAL の積み重ねた Draft は独立した検証系統で、最新 #50 の合成 Linux/Windows
ジョブは成功。 [main CI](https://github.com/haji84/AI-VIDEO-STUDIO/actions/runs/40811805222)、
[PR #26 の旧 CI](https://github.com/haji84/AI-VIDEO-STUDIO/actions/runs/41386923713)、
[HUB NATURAL #50](https://github.com/haji84/AI-VIDEO-STUDIO/pull/50)

## 実行環境とメディア検出

macOS 26.6.2（25G83）、Apple M1 Pro（arm64）、Node v24.21.0、Python 3.14.7、
Chrome 157.0.8103.79、Playwright 1.64.1、Pillow 13.0.0、fonttools 4.61.1、
NumPy 2.3.5。日本語字幕には端末のヒラギノ角ゴシック W4 を使用した。

- シェルの PATH で Homebrew の FFmpeg と ffprobe 8.0 を検出し、検出された両方を実行した。
  PATH から両方を外すと `FFMPEG_TOOLCHAIN_UNAVAILABLE`、同じ PATH で
  `AIVS_FFMPEG_DIR` を設定すると同じ組を検出した。導入済み PATH 上で不完全な
  明示設定を渡すと `FFMPEG_TOOLCHAIN_INCOMPLETE` で停止した。
- 実際の HTTP 取り込みで FFmpeg のない起動 PATH と明示設定を使い、字幕付き MP4 の工程でも
  解析・描画・検査を通した。空・`None`・不正な JSON は個別のエラーになる。
  `None` は注入試験で、HTTP の不正 JSON は成功終了する実プロセスの応答を使った。
  取り込みで拒否した完全受信素材は SHA-256 が一致する状態で保留された。
- FFmpeg 8.0 は第2チャンネルの true peak を見落とすことがある。検査用素材では 8.0 の
  全体測定が −20.0 dBTP、右チャンネルを単独で測ると +1.6 dBTP だった。FFmpeg の
  8.0.1 系列に修正が入っている。タグ `n8.0.3` の
  `8ae0b34901ba60a802f183ee75a250a9fc3e09a5` をローカルでビルドして明示選択し、
  同じ素材で +1.6 dBTP を確認した。
  [FFmpeg の修正コミット](https://github.com/FFmpeg/FFmpeg/commit/5630394ebf2956a3f8e1eac00912467a582ac94d)

## MacBook の検証結果

| Chrome の操作 | MP4 のサイズ | 出力 SHA-256 |
| --- | ---: | --- |
| 通常の取り込み、下書き、保存 JSON 再読込、編集、再生と全編デコード | 113,202 bytes | `faf4074c4c46f1b063d23cbb186fb6330fe67b2ad6f48be214007047516cd31f` |
| 別保存先への再リンク、履歴復元、再生と全編デコード | 41,927 bytes | `d7e76ec023be7cc0fc53ce48bf1651560e0233338ccaaa4ada73ef7a4e193049` |
| 検査失敗から2本を再送せずに復旧、自動編集の下書き、再生、再起動後の再取得 | 423,828 bytes | `7d695213dd8e99dc333011b4f1ad8cefde445fb8e6abe90136672b4b3364da76` |

復旧試験ではアップロード2回、保留素材の再試行2回。元の合成素材は処理前後、保存した
プロジェクト JSON は再起動前後で SHA-256 が一致した。同期位置を確認し、動き・明暗・音量の
下書きをプレビューして適用した。
映像は選択されたカメラ、音声は440 Hz の元トラックを保持した。日本語字幕9文字の
フォント収録と画像合成を確認した。

出力は H.264/AAC、960×540、4.02002秒、96フレーム。Chrome は初回も再起動後も
終端まで再生した。独立した FFmpeg プロセスで映像・音声を全編デコードし、ダウンロード、
検査 JSON、別セッションで再取得した MP4 の SHA-256 が一致した。既存の Homebrew
8.0 でもこの復旧経路を完走し、同じ尺・コーデック・再生結果を得た。テスト素材・出力・
検査・保存 JSON のハッシュは [機械可読記録](MACOS_MEDIA_GATE_A_2026-11-23.json) に保存した。
映像はローカルに保存した。

FFmpeg 8.0.3 の回帰試験は Node 187件と Python 66件、音声3件が成功。Node の
Linux 専用ワーカー10件と、Python の DejaVu Sans 固定の字幕テストクラス1件を Mac では
スキップした。日本語字幕の実描画は端末フォントを使う Chrome 経路と Python の
プレビュー描画試験で確認した。Windows 検出用のパスフィクスチャは Mac 上の模擬試験。
独立レビューでも修正前の `OUTPUT_PATH_UNSAFE` と修正後の成功を再現した。

同じコードコミット `de9d303` の GitHub Actions は attempt 1 で3ジョブ成功。
Ubuntu のオフライン回帰、Linux Chrome の4経路、Windows ランナーの WinGet パス
フィクスチャをそれぞれ確認した。Windows ランナーの結果はツール検出用で、ZBook は
実機確認待ち。 [作業ブランチ CI](https://github.com/haji84/AI-VIDEO-STUDIO/actions/runs/45177252481)

## 検証コマンド

リポジトリのルートから、ローカルの Python 仮想環境と Chrome を指定する。
この Mac では、FFmpeg 8.0.3 を `--enable-gpl --enable-libx264 --enable-zlib
--disable-doc --disable-ffplay --disable-autodetect --disable-network` で
ビルドした。字幕の PNG 合成には zlib を有効にした FFmpeg が必要だった。

```sh
python3 -m venv .venv
.venv/bin/python -m pip install Pillow==13.0.0 fonttools==4.61.1 numpy==2.3.5
export AIVS_PYTHON="$PWD/.venv/bin/python"
export AIVS_FFMPEG_DIR="/path/to/ffmpeg-8.0.3/bin"
export PATH="$PWD/.venv/bin:$AIVS_FFMPEG_DIR:$PATH"
export AIVS_BROWSER_EXECUTABLE="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
export AIVS_CAPTION_FONT="/System/Library/Fonts/ヒラギノ角ゴシック W4.ttc"
npm install --no-save --package-lock=false --ignore-scripts playwright@1.64.1
python -m engine.media_tools --resolve
node --test --test-concurrency=1 cloud/tests/*.test.mjs packages/edit-planner/*.test.mjs packages/project/*.test.mjs apps/local-editor/*.test.mjs prototypes/device-lab/*.test.mjs
python -m unittest engine.test_media_tools engine.test_manifest engine.test_caption_raster cloud.processor.test_r2_run engine.test_local_signals engine.test_autoplan_pipeline engine.test_project_pipeline engine.test_saved_project_audio engine.test_output_qa engine.test_saved_sync engine.test_saved_first_cut engine.test_preview_saved_clip -v
(cd prototypes/audio && python -m unittest test_mix -v)
node apps/local-editor/browser-acceptance.mjs
node apps/local-editor/browser-relink-acceptance.mjs
node apps/local-editor/browser-import-recovery-acceptance.mjs
```

## ZBook と遠隔利用で残る検証

- ZBook 実機と配布版 v2.x の起動・検査・書き出し。配布 ZIP 本体と例外のスタック位置は
  未入手。元の JSON 例外の入力経路と ffprobe 未検出の根本原因は未確定。
  Windows の PowerShell と GUI 側の起動環境、WinGet の FFmpeg/ffprobe 9.0.2、
  Smart App Control が有効な環境、所有者承認済み外部ドライブでの
  送信済み素材の SHA 照合・再送なし処理・MP4 全編再生を個別に確認する。
- 既報の Tailscale `Running` / `selfOnline=true` は ZBook 所有者の接続準備の記録。
  私設経路の疎通、iPhone・Android の別回線送信と取得は未検証。
- 分割転送の中断再開、無人バッチ、Google フォト直接取込、日本語 ASR・TTS、
  実技の意味理解と重要動作の保持、1時間・数十 GB の実素材、4端末の製品受入は未完了。
  今回使った自動編集は数値シグナルから候補を生成し、確認・適用と書き出しを操作する。
