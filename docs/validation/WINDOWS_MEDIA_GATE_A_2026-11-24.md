# Issue #37 — Windows ランナーでの WinGet 検出・MP4 復旧検証

2026-11-24 JST。[Draft PR #51](https://github.com/haji84/AI-VIDEO-STUDIO/pull/51)
の実装ブランチで、前回の [MacBook 合成検証](MACOS_MEDIA_GATE_A_2026-11-23.md)
から Windows の Gate A を進めた。最新の main は
`e1bf222dfe0043e307e3fc3c122e2fe52423dac8`、再開時の作業ブランチは
`a515727df05f424f755bce70ef80324f49ad0fba`。

コードとワークフローの `d763e9e1507ae2b42fd9bc8245a34f06599b9183` で、
Windows の実ブラウザ、Linux の実ブラウザ4経路、Linux のオフライン回帰試験が成功した。
実行環境、入力と出力のハッシュ、ジョブ ID は [JSON 記録](WINDOWS_MEDIA_GATE_A_2026-11-24.json)
に保存した。[最終 GitHub Actions 実行](https://github.com/haji84/AI-VIDEO-STUDIO/actions/runs/45213580681)

## 日本語のツール検出エラー

Python の標準エラー出力を CP932 に設定し、不完全なツール設定を実際の子プロセスに
渡した。修正前は UTF-8 で読む Node に日本語の置換文字が渡り、Python の JSON
読取りでもデコードエラーになった。CLI はエラー JSON の非 ASCII 文字をエスケープ
して出力する。受け取った画面には元の日本語とエラーコードが表示される。
Mac の CP932 再現試験で修正前後を確認し、メディア境界13件・HTTP8件と
Chrome のアップロード復旧試験が成功した。

この文字化けの再現で確認したのは GitHub のローカルエディタの経路。
ZBook の別配布版 v2.x で報告された JSON 例外の発生箇所は確認待ち。

最初の Windows ジョブは PowerShell から見える複数の Python をまとめて扱い、
解析前に停止した。CI が選んだ Python 3.11.9 の絶対パスを使用するように修正した。
次の実行では FFmpeg／ffprobe 9.0.2 の検出、Python 13件、HTTP 5件、
Chrome で再送なしの取り込みまで成功し、編集候補の表示待ちでタイムアウトした。
[初回](https://github.com/haji84/AI-VIDEO-STUDIO/actions/runs/45208983041) ·
[Python 指定修正後](https://github.com/haji84/AI-VIDEO-STUDIO/actions/runs/45209467169)

日本語と空白を含む保存先で、Node の UTF-8 JSON を Python が非 UTF-8 の既定値で
開くと解析が止まることを、Mac 上の実メディアと US-ASCII ロケールで再現した。
自動編集候補と同期候補の両方で、Python が UTF-8 を明示するように修正した。
各 CLI の回帰試験を追加し、同じ保存先条件とロケールで Mac Chrome が
出力・再生・再起動後の読戻しまで完走した。対象コードは `0bcdeead7bfa084431b971a9f4bdb9f814ca93d7`。

## Windows で再現する対象

既存の手動 CI で Windows Server 2025 のランナーを使用する。Gyan.FFmpeg 9.0.2
x64 フルビルドの ZIP は WinGet マニフェスト掲載の URL と SHA-256 で照合し、
ランナーの一時領域に展開する。通常の PATH を使わず、WinGet と同じ
Packages 配置から両方の実行ファイルを選択し、バージョンを実際に実行して照合する。
Chrome 試験の保存先には空白と日本語を含む一時ディレクトリを使用する。
[WinGet の 9.0.2 マニフェスト](https://github.com/microsoft/winget-pkgs/blob/master/manifests/g/Gyan/FFmpeg/9.0.2/Gyan.FFmpeg.installer.yaml) ·
[Windows ランナーの構成](https://github.com/actions/runner-images/blob/main/images/windows/Windows2025-Readme.md)

## Windows の受入結果

Windows Server 2025 x64 の `win25-vs2026` イメージ `20261116.315.1` で
Python 3.11.9、Node 24.22.1、Chrome 157.0.8103.79 と同じ WinGet 配布物の
FFmpeg／ffprobe 9.0.2 を使用した。制限した PATH で両実行ファイルを検出し、
Python 24件、HTTP 5件、Chrome の復旧経路が成功。HTTP のテストでは
POSIX の起動用スクリプトを使う終了処理の1件を Windows でスキップした。

合成2本を送信し、検査失敗から再起動した。素材ごとに再試行し、再送なしで取り込んだ。
自動編集候補を確認・適用し、日本語字幕と元音声を含む H.264/AAC を出力した。
960×540、4.021322秒、96フレーム、414,010バイト。Chrome で初回と再起動後に
終端まで再生し、別プロセスの全編デコードと出力 SHA-256 照合を通過した。
最終の Windows ジョブで出力した MP4 の SHA-256 は
`68c8afddf8766bfb169e177c2f083dae0fdc95ef2b78a97f69779f14d1277e7b`。
[Windows ジョブ](https://github.com/haji84/AI-VIDEO-STUDIO/actions/runs/45213580681/job/137828581896)

## Linux の回帰と再実行

Windows が初めて完走した実行では、Linux の C ロケールを強制した同期テストで日本語のファイルパスを
表現できず失敗した。テストだけを調整し、Windows と macOS では非 UTF-8 を
再現し、Linux では UTF-8 のファイルシステムを使う条件にした。
[初回成功の Windows ジョブ](https://github.com/haji84/AI-VIDEO-STUDIO/actions/runs/45210720565/job/137818470872) ·
[Linux 側の失敗記録](https://github.com/haji84/AI-VIDEO-STUDIO/actions/runs/45210720565/job/137818470232)

Linux フィクスチャの修正を含む `65809724f65058862394d4caffccaf1b886cba3a` でも
Windows の復旧経路と Linux のオフライン試験は成功した。
[Linux フィクスチャ修正後の Windows ジョブ](https://github.com/haji84/AI-VIDEO-STUDIO/actions/runs/45211275966/job/137820454487)

Linux Chrome ジョブは Ubuntu の日本語フォントを取得する段階でタイムアウトした。
両方のブラウザジョブで同じ Noto Sans CJK JP の版と SHA-256 を指定し、Linux の
ブラウザジョブではこの1ファイルを一時フォルダに取得するようにした。変更後は
Linux で通常編集、素材再リンク、保存カットの視覚プレビュー、再送なしの復旧が成功した。
Mac でも同じフォントで通常編集、素材再リンク、再送なしの復旧と全編再生を再検証した。
[Ubuntu の取得タイムアウト](https://github.com/haji84/AI-VIDEO-STUDIO/actions/runs/45210720565/job/137818470951) ·
[使用した Noto Sans CJK JP](https://github.com/notofonts/noto-cjk/blob/523d033d6cb47f4a80c58a35753646f5c3608a78/Sans/OTF/Japanese/NotoSansCJKjp-Regular.otf) ·
[Linux ブラウザジョブ](https://github.com/haji84/AI-VIDEO-STUDIO/actions/runs/45213580681/job/137828581851)

## ZBook の実機確認

2026-11-24 JST に Mac 側の Tailscale が稼働していることを確認した。ZBook と識別できる
接続先と実機を操作できる接続経路は確認待ち。ハンドオフにある配布 ZIP と
例外のスタック位置も未入手。

次の実機確認では、配布版をハンドオフ記載の SHA-256 で照合し、その起動方法ごとの
FFmpeg／ffprobe 9.0.2 の選択と異常 JSON を確認する。GitHub 版の合成受入は、
所有者が承認した外部ドライブ上の検証専用フォルダを PowerShell の
`TEMP` と `TMP` に指定し、下記の同じ Chrome テストを実行できる。
別配布版に既に届いた素材を再試行するには、その版の保存形式と検査記録の照合が先に必要。
[配布版の照合情報](https://github.com/haji84/AI-VIDEO-STUDIO/blob/1e659b0de9ea5582330acaaaa62b65eeb049faf4/docs/handoffs/CODEX_TRAINING_VIDEO_REMOTE_ZBOOK_2026-11-15.md)

```powershell
# Draft PR #51 の作業ブランチを開き、AIVS_PYTHON に Python の絶対パスを指定する。
# AIVS_BROWSER_EXECUTABLE にはインストール済み Chrome の絶対パスを指定する。
# AIVS_CAPTION_FONT には利用できる日本語フォントを指定する。
# 必要に応じて AIVS_FFMPEG_DIR に確認済みの既存 bin フォルダを指定する。
$env:TEMP = '<承認済み外部ドライブ上の検証専用フォルダ>'
$env:TMP = $env:TEMP
npm install --no-save --package-lock=false --ignore-scripts playwright@1.64.1
& $env:AIVS_PYTHON -m pip install -r requirements-media.txt numpy
node apps/local-editor/browser-import-recovery-acceptance.mjs
```

報告には合成テストの結果 JSON、バージョン、段階名を使用する。個人名や機器の経路を
含む実素材や実機ログは所有者側で保管する。
検証用 MP4 を実機に残す場合は、テストの実行前にリポジトリ外の承認済みフォルダを
`AIVS_EVIDENCE_DIR` に指定できる。
