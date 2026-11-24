# ZBook / 外付け SSD の実機検証 — 2026-11-25 JST

状態: **TESTED_SYNTHETIC**。物理 ZBook 上で実行したが、素材はすべて生成した合成映像。
実素材、数十 GB、スマホ別回線、製品全体の完成を証明するものではない。

- 対象: Issue #37、実装 Draft PR #51。
- 実装コミット: `4253284038f2e49aeb4c8061b8459f97fe610235`。
- 検証対象 tree: `bb78c83bc5c45b1b725b6576c6b3df7a9b546fea`。
- main: `e1bf222dfe0043e307e3fc3c122e2fe52423dac8`。main への統合は行っていない。
- [匿名化した検証値](ZBOOK_EXTERNAL_SSD_2026-11-25.json)。動画、元のログ、画面、認証情報は公開しない。

## 実行環境と保存先

HP ZBook Fury 15.6 inch G8 Mobile Workstation PC、Windows 11 Pro
10.0.26200 / x64。Node 24.19.0、Python 3.11.9、Gyan FFmpeg / ffprobe
9.0.2、Chrome 158.0.8127.37、Playwright 1.64.1、Pillow 13.0.0。
字幕には導入済みの Meiryo を使用した。音声試験用の NumPy 2.3.5 は
リポジトリ専用の Python 環境に導入した。

所有者は内蔵ディスクへの動画保存を避け、外付け SSD の使用を指示した。
接続済みの D: は USB 接続の BUFFALO SSD-PUTU3C / exFAT と確認した。
普段用の編集データは `D:\AI_VIDEO_STUDIO_DATA\editor`、試験の素材・作業領域・
証拠は同じ SSD の `validation` 配下に置いた。既存の SSD 内データは削除していない。

デスクトップに `AI VIDEO STUDIO - 外付けSSD` のショートカットを作成した。
既存の `start-windows.cmd` に上記の保存先を渡し、既定ブラウザを開く。
`http://127.0.0.1:8765/` の起動と専用プロジェクトの保存を確認した。
FFmpeg を含まない PATH でも、導入済みの FFmpeg / ffprobe 9.0.2 を検出・実行できた。

## 実機で再現した不具合と修正

1. Node の hard link が exFAT で `EISDIR` となり、取り込みが失敗した。
   既存の排他的コピー経路で扱い、内容の照合と衝突時の保管を維持した。
2. 完成 MP4 の確定が Python `os.link` の `WinError 1` で失敗した。
   Windows は同じ保存先ディレクトリ内の、既存名を置換しない rename を使う。
   POSIX の hard link 経路は維持した。既存ファイル・ディレクトリと元の候補を保護する試験を追加した。
3. `asset_<id>.mp4.tmp` からの rename で、exFAT のファイル番号が変わった。
   内容が同一でも復元が `SOURCE_CHANGED` になっていた。サイズとデバイスを確認し、
   番号や更新時刻が変わる場合は保存後の安定した SHA-256 を再取得して照合する。
   内容を変えたコピーは拒否し、現在の編集とレジストリを変更しない。
4. 同じ長さで書き換え、更新時刻を戻すと、出力のキャッシュが改変を見逃した。
   Windows は出力と検査記録をアクセス時に再照合する。Linux / macOS の既存経路は維持する。
   大きな出力の Range 再生では再読み取りの負荷が増えるため、性能測定は別途必要。

各不具合は修正前の失敗を確認した。保存先の再フォーマット、セキュリティ設定変更、
権限追加、実素材の読み取り、外部への素材送信は行っていない。

## 実際の Chrome と MP4

| 経路 | 観測結果 | 完成 MP4 の SHA-256 |
| --- | --- | --- |
| 合成 2 本の取り込み失敗 → 再起動 → 再送なしの復旧 → 数値下書きの確認・適用 → 日本語字幕と元音声 | H.264 / AAC、960×540、96 フレーム、4.021322 秒、424,136 bytes。初回と再起動後の終端までの再生、全編 decode、独立読戻しが一致 | `e630e112d3477b73d3dd2b851010f9ce73553a1fd1371040f85d87398101a514` |
| Google 側を模擬した Picker とダウンロード済み動画の追加 → 自動下書き → 確認・適用 | H.264 / AAC、96 フレーム、471,893 bytes。字幕、元音声、全編再生・decode、再起動後 SHA 一致。実アカウント接続は未検証 | `198219d4e7328ec9aa8d00763d175b9f3e2d9f3793841252c222cf974668f02e` |
| 別の保存先へ編集 JSON を開き、映像・履歴内 BGM を復元 | 3 素材 ID / 2 物理ファイル。明示的に「開く」まで現在の編集を保護。音量・履歴・再起動、実再生の進行、全編 decode、原本と最初の保存先の保全を確認 | `3fd316eb99d3c129761c0195aca41f6c139957a558bb972a09544b3c82f15c4d` |

汎用の試験スクリプトには物理端末や ZIP 入手状態について固定の `NOT_RUN` / `UNAVAILABLE`
欄が残る。その欄を実機証拠として使用せず、今回の OS・機種・USB 保存先の観測を分けて記録した。

## 回帰試験と制限

Python は `engine.test_media_tools`、`engine.test_saved_first_cut`、
`engine.test_saved_sync`、`engine.test_output_install` の **28 件成功**。
取り込み・起動の対象試験は **10 件成功、Windows 対象外の 1 件 skip**。
復元の対象 unit / HTTP 試験は **22 件成功**。この対象実行では、リンク作成を前提にする
1 件を除外した。出力改変の回帰試験も成功した。

`node --test --test-concurrency=1 apps/local-editor/*.test.mjs` は省略せず実行した。
**119 件中 102 成功、11 skip、6 失敗、終了コード 1**。全件成功とは扱わない。
残る 6 件はすべて、exFAT にシンボリックリンクの試験用ファイルを作ろうとして
`EISDIR` で失敗した。検査を通すためのセキュリティ条件の緩和は行っていない。

- `output-history-latest.test.mjs`: latest-job reader rejects oversized and linked records before interpreting them
- `output-history-server.test.mjs`: a workspace reached through a parent alias can render and reopen both verified outputs
- `output-history.test.mjs`: malformed, oversized, duplicate and unsafe journals never admit entries
- `output-history.test.mjs`: symbolic links in output or report paths are rejected even if target bytes match
- `server.test.mjs`: private editing state cannot be written into the public source checkout
- `source-relink.test.mjs`: changed, missing or linked registered media is not treated as verified

これらのリンク試験は対応する保存装置 / CI で別に確認する必要がある。
Windows の出力確定・改変検出の回帰は既存の手動 CI に追加した。
このチェックポイント時点の新コミットの hosted CI は **NOT_RUN**。
独立した静的レビューでは、今回の保存・復元・照合の変更に未解決の指摘はなかった。

## 配布 ZIP と残る受入

元の `training_video_studio_v22_4devices.zip` と `training_video_studio_v221_fix_ZBook.zip`
を発見し、引継ぎにある SHA-256 と一致した。既存 GitHub 実装を ZIP で上書きせず、
旧アプリの再実行も行っていない。元の例外の正確な呼出し箇所と旧配布版の修復受入は未確認。

Google フォトの直接連携には、専用 Desktop OAuth 設定と所有者の許可が引き続き必要。
ダウンロード済み動画の追加は使える。別回線の iPhone / Android、分割・中断再開送信、
外付け SSD の取り外し・電源断、大容量 MP4 の読み取り性能、1 時間・数十 GB の実素材、
意味理解 / ASR / TTS、製品全体の DoD は未完了。
