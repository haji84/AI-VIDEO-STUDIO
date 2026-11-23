# MacBook の Google フォト取り込み検証

2026-11-24 JST。実装 `678485710ed22574b41144fb82668d1afa87bbfe` を MacBook で検証した。
通常起動の編集画面に「Google フォトから追加」を表示した。この Mac では直接取込用の OAuth 設定ファイルが未登録。
ダウンロードした動画は設定なしで同じ画面から追加できる。
[使用・設定手順](../../apps/local-editor/README.md#google-フォトから動画を追加) ·
[Draft PR #51](https://github.com/haji84/AI-VIDEO-STUDIO/pull/51)

## 合成試験で確かめたこと

- macOS 26.6.2 arm64、Chrome 157.0.8103.79、Node 24.21.0、Python 3.14.7、FFmpeg／ffprobe 8.0.3。Google の通信と認可応答は試験用に置き換え、編集画面、ファイル保存、解析、書き出し、再生は実行した。
- 初回設定なしの画面から「ダウンロードした動画を追加」へ進み、合成ファイルを通常の素材として追加した。Google 側を模擬した直接経路でも同じ入力の SHA-256 を確認した。
- 動画選択の完了前は取得せず、完了後に選んだ動画を作業フォルダへ保存した。選択に含まれる写真は追加されなかった。候補の再生・確認と適用、日本語字幕付き H.264/AAC の書き出し、全編デコード、Chrome の終端までの再生を確認した。OAuth 設定を持たないプロセスで再起動し、同じ MP4 を再生・取得できた。
- HTTP の新規5試験で、設定なし、OAuth の state と PKCE、ページ分割された選択、Google の認可情報なしでの CDN リダイレクト、失効後の再接続、取得のキャンセルと途中ファイルの掃除、予期しない取得先の拒否を確認した。既存 Node 回帰は192成功、Mac で Linux 専用の10件をスキップ。既存の合成2本の再送なし復旧も成功した。

| 確認項目 | 実測 |
| --- | --- |
| 合成入力の SHA-256 | `59e24233453842d5ada93488d3b7cc60c2fa10b319e77ab8bb9d78ef032745ef` |
| 完成 MP4 の SHA-256 | `cae5e5e697866aa11fdf9336adecd6603c5f66d2f487b29542c1072ad2093718` |
| 完成 MP4 | 471,683 バイト、960×540、4.02002 秒、96 フレーム |
| 再起動後の再生・取得 | 終端まで再生、完成 MP4 の SHA-256 が一致 |

リポジトリ直下でセットアップ済みの Node、Python、FFmpeg／ffprobe と Chrome を使う。

```sh
export AIVS_PYTHON="$PWD/.venv/bin/python"
export AIVS_FFMPEG_DIR="$HOME/Library/Application Support/AI VIDEO STUDIO/ffmpeg/bin"
export PATH="$AIVS_FFMPEG_DIR:$PATH"
export AIVS_BROWSER_EXECUTABLE='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
node --test apps/local-editor/google-photos-server.test.mjs
node apps/local-editor/browser-google-photos-acceptance.mjs
```

実際の Google アカウントでの許可、選択、ダウンロードは未検証。実接続には AI VIDEO STUDIO 用の
Google Photos Picker API とデスクトップ OAuth 設定が必要。
[Google の設定手順](https://developers.google.com/photos/overview/configure-your-app) ·
[ダウンロード仕様](https://developers.google.com/photos/picker/guides/media-items)
