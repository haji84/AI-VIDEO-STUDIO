# Windows での Google フォト取り込みと下書きの検証

2026-11-24 JST。作業ブランチ `fix/zbook-media-preflight-20261115` の
`fd52522abea17595d3273245fa3ef7b26405cce2` を Windows Server 2025 x64
で検証した。`start-windows.cmd` で編集アプリを起動できるようにし、
Google フォトで動画を選び終えると、起動中のアプリが取り込みと下書き作成を始める。
[起動と設定](../../apps/local-editor/README.md#windows--zbook) ·
[Draft PR #51](https://github.com/haji84/AI-VIDEO-STUDIO/pull/51)

## Windows の検証結果

GitHub Actions の `win25-vs2026` イメージ `20261116.315.1` で、Node 24.22.1、
Python 3.11.9、Chrome 157.0.8103.79 を使用した。WinGet と同じ配布物を SHA-256 で照合し、
制限した PATH で FFmpeg と ffprobe 9.0.2 を検出・実行した。日本語を含む検査エラー JSON と
解析を含む Python 24件、既存の HTTP 5件、新しい Google フォト HTTP 11件、起動とブラウザの
3件が成功した。既存の POSIX 用終了処理の1件は Windows でスキップした。
[Windows ジョブ](https://github.com/haji84/AI-VIDEO-STUDIO/actions/runs/45359657354/job/138326165761)

- `start-windows.cmd` から起動し、日本語と空白を含む `%USERPROFILE%` の既定保存先にアプリの
  マーカーができた。`%LOCALAPPDATA%` に置いた試験用の OAuth JSON を読み込み、取り込みの
  設定が読み込まれた状態を HTTP で確認した。既定ブラウザにクエリ付きのローカル URL を渡す
  PowerShell の処理が正常終了した。
- Chrome で、ダウンロード済みの合成動画と不正ファイルを一緒に追加した。取り込めた動画から
  下書きができ、不正ファイルは検査待ちに残った。
- Google 側を模擬した選択では、編集ページから離れた状態で「完了」を再現した。完了前の動画取得は
  0回で、完了後に選んだ合成動画が保存され、下書きができた。既存編集の入力中の字幕は保持され、
  検査待ちになった動画の再試行欄はページの再読み込みなしで表示された。
- 下書きを確認・適用し、日本語字幕と音声付きの MP4 を出力した。最初と再起動後の両方で Chrome が
  終端まで再生し、全編デコードと再取得した MP4 の SHA-256 照合も通過した。
- 別の合成試験で、2本の送信済み素材を再送せずに復旧し、確認した下書きから書き出し、
  再生と再起動後の SHA-256 照合まで通過した。

| 確認項目 | Google フォト合成試験の実測 |
| --- | --- |
| 入力 SHA-256 | `ed03fd958cbde8a6963914aacc35fb2a7bfd12c1e4aa09ecb55fcdaafb6bdb07` |
| 出力 SHA-256 | `b96ab6b6d1ec9aa0192e860fed9081d2894a1250a1fcfc5f70c3ea5d653850ad` |
| 完成 MP4 | H.264/AAC、960×540、4.021322 秒、96フレーム、460,434 バイト |
| 再起動後の再生・取得 | 終端まで再生、出力 SHA-256 一致 |

初回は Windows の起動と URL の受け渡しまで成功し、テスト終了時の子プロセス処理が
タイムアウトした。起動した CMD の子プロセスと入出力の後片付けを修正して再実行し、
Windows ジョブが完走した。同じコードで MacBook の Chrome 158.0.8127.38 でも Google フォトの
合成経路、全編デコードと再起動後の再生・出力照合を再確認した。
[初回 Windows ログ](https://github.com/haji84/AI-VIDEO-STUDIO/actions/runs/45358820461/job/138323357501) ·
[MacBook の検証](MACOS_GOOGLE_PHOTOS_2026-11-24.md)

## ZBook 実機で残る確認

今回のチャットの実行先は MacBook。ZBook での `start-windows.cmd` の起動と既定ブラウザでの表示、
実際に導入済みの FFmpeg／ffprobe の検出、承認済み外部 SSD での取り込みから MP4 再生までが
確認待ち。iPhone の Codex で接続先に ZBook を選ぶと、ZBook 上でこの作業を続けられる。
配布版 v2.x の ZIP と元の例外箇所については、先行する Gate A の記録を参照。
[Codex リモート接続](https://learn.chatgpt.com/docs/remote-connections) ·
[Gate A の検証](WINDOWS_MEDIA_GATE_A_2026-11-24.md#zbook-の実機確認)

実際の Google アカウントでの許可・選択・ダウンロードには、Photos Picker API とデスクトップ
OAuth の設定が必要。設定前は、Google フォトからダウンロードした動画を同じ編集画面で使える。
[Google フォトの設定手順](../../apps/local-editor/README.md#google-フォトから動画を追加)
