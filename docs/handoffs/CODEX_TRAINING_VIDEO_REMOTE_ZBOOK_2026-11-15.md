# Codex 引継ぎ: AI VIDEO STUDIO / 4端末・遠隔・大容量・無料優先の訓練動画編集

記録日: 2026-11-15 JST
対象: haji84/AI-VIDEO-STUDIO（Public）
引継ぎ分類: 開発指示 + 既知の実機障害の記録。**実装完了・Codex実行開始の証拠ではない**。
確認した main HEAD: e1bf222dfe0043e307e3fc3c122e2fe52423dac8（2026-10-29 のコミット）。
既存の製品GOAL: GOAL.md。トラッカー: Issue #10。最終状態: IN_PROGRESS / Product DoD NOT MET。

## 0. Codex が作業開始時に必ずすること
1. GitHub の最新 main/HEAD、AGENTS.md、GOAL.md、PROJECT_STATE.md、ROADMAP.md、docs/work/AUTONOMOUS_EXECUTION.md、docs/work/WORK_CHECKPOINT.md、docs/specs/PRODUCT_SPEC_v0.3.1.md と AUDIO_SPEC_v0.3.1.md を読み、現在のコードとCIを再取得する。上記のHEADは引継ぎ時点の情報であり、将来の最新HEADを保証しない。
2. Issue #10 と open PR #26〜#35 の内容・ベース・CIを照合。PR #27〜#35 は HUB NATURAL 系の積み重ねた Draft PR。無関係なPRを上書き・統合しない。既存の packages/project、apps/local-editor、engine、prototypes/audio の実装と実証を失わない。
3. この引継ぎが追加するのはユーザーが明示した「無料優先の任意の遠隔PC編集経路」。製品全体の local/offline-first、端末内編集、iOS/Android/Windows/macOS のGOALは縮小・置換しない。
4. GORIQ のリポジトリ・Windows Hyper-V・VM・認証・ランナーには触れない。ZBookは空き容量が少ないため、素材や完成MP4の置き場所にしない。十分な空き容量のある所有者承認の外部SSD等を優先し、保存先を明示する。
5. 公開リポジトリに実訓練映像、個人情報、元動画のハッシュ、スクリーンショット、実ファイル名、ローカルのユーザー名入り絶対パス、アクセスコード、Cookie、Tailscaleの秘密情報、Google認証情報を入れない。

## 1. 本人が今回確定させた追加要件
- 素材は複数の動画で合計「数十GB」。1時間前後の実技訓練映像を含む。Googleフォトのほか別の保存先にもある。
- iPhone、Android、MacBook、ZBookから利用。スマホでは別Wi-Fi・4G/5Gから動画の読み込み、全自動編集の指示、進捗確認、完成MP4の取得をしたい。
- 追加の月額サービス費用0円を最優先。選択された方式は A: 編集を行うMacBookまたはZBookは起動していてよい。自動実行は無料ローカルFFmpeg等で、外部クラウド編集を必須にしない。
- Tailscale Serveによるtailnet内の認証付き遠隔接続を候補とし、公開Funnelやルーターのポート開放は禁止。既存Tailscale設定を破壊しない。遠隔接続が実機で機能したという証拠はまだない。
- ユーザー操作は極力「素材選択→送信→編集→MP4取得」。何度もPowerShellやZIP差分パッチを実行させない。再送信なしの再試行、エラーの自動診断、復旧が必要。
- ユーザーの当初の大きな製品GOALには、スマホ自体での端末内編集・PC OFFの編集も残っている。今回の無料遠隔PCモードはその代替ではない。
- 実技の意味や正誤を単一画像・動き量から断定しない。教材に必要な動作、音声、順序を保守的に保持。自動カット候補と実際の完成出力を区別し、誤削除を避ける。

## 2. 既存GitHubと今回の配布ZIPは別系統
- mainにはローカル編集、非破壊project schema、4バス音声合成、検査付きMP4などの合成素材による検証済み要素がある。既存GOALの完了ではない。
- 2026-11の対話内で別配布した Python Webアプリ「training_video_studio_v22」と差分パッチは、確認時点のmainやPR #26〜#35に統合されていない。
- CodexはこのZIPを本番正本とみなさず、「未レビューの実装候補」として扱い、機能単位で既存製品へ取り込むか置き換えるかをテストで判断する。単純に main をZIPで上書きしない。
- このGitHub引継ぎには後述のZIP/修正ツールの**ファイル名とSHA-256のみ**を記録する。ZIP本文や動画素材はこのPR/Issueに含まれていない。入手不能なら「ソース未入手」と明記して再現テストから作業し、存在しないコードを確認済み扱いにしない。

### 配布物の確認済み照合情報（SHA-256）
- training_video_studio_v22_4devices.zip : 70432406fc393dac93208acca45804ac0c8559bb9f142f17162f360f2dac5f22
- training_video_studio_v221_fix_ZBook.zip : 1b4df4a5042506f1e3e773a9f3d11298a7d486664a75735444d961fb814c4380
- training_video_studio_v221_easy_fix_ZBook.zip : 5d37577294f2c7965d324a9d6634b36fb1ff9d224c58801aab35e877eee937cb
- video_studio_one_click_fix.py : 2c5066f88daea2a99e8d9b1d9c4a58928c4f1026ef0bb872750d26b31a6436a1
- video_studio_ffprobe_auto_repair.py : 6ef5adb72f83b3fdec991e7e6ead1d67ebe31a72228d0b336668b36d00832e6c

ZIP内で確認した主なファイル: app.py、engine.py、uploads.py、batch_jobs.py、smart_edit.py、local_vision.py、private_connect.py、web/index.html、web/app.js、web/style.css、tests/*.py。v2.2.1には上書き候補 app.py / engine.py / batch_jobs.py / local_vision.py / web/app.js / web/index.html と追加テストがある。v2.2.2の自動修復ツールは単独Pythonファイルとして配布され、ZBookでの適用成功は未確認。

## 3. ZBook の所有者申告による実測・障害履歴（必ず分けて記録）
- Windows ZBookにPython 3.11があり、FFmpeg 9.0.2は winget の Gyan.FFmpeg でインストール成功。ffmpeg と ffprobe がPowerShellの Get-Command で解決されたことを所有者が報告。
- 起動時に Windows Smart App Control が .bat の実行をブロック。PowerShellでアプリ実フォルダの app.py を直接実行した結果、ユーザーが「起動した」と報告し、127.0.0.1:8765 の画面を提示した。
- 初回のサンプル2本の送信後、編集が0%で失敗。UI表示: the JSON object must be str, bytes or bytearray, not NoneType。どの行の json.loads に None が入ったかはZBook診断ログを取得できていないため不明。
- v2.2.1の簡易更新後とみられるUIでは、サンプル 001_demo_with_audio.mp4 が送信後のPC側検証で失敗。UI表示は「ffprobe が見つかりません。FFmpegをインストールしてください。」。PowerShellとアプリ起動プロセスのPATH相違、起動経路による環境変数差などが候補であって、根本原因の**断定は不可**。
- 上記受入失敗後、別のFFprobe自動修復ツール(v2.2.2相当)を提示したが、所有者のZBookでの修復成功・再送信・完成MP4の証拠は**まだない**。
- これまでの短い合成素材テストや配布ZIP内のテスト結果を、ZBookでの本番の全自動編集、別回線スマホ接続、数十GB完走、実技内容理解の成功に加算しない。
- 保存済みアップロード/元動画は削除・強制上書きしない。再送できるものを無駄に送らせない。診断情報は秘密情報を除いたステータス/実行ファイル検出結果/例外型と行番号のみ取得する。

## 4. 全機能の引継ぎ状態（実装と設計を分離）
| 領域 | 設計正本 | 実装/本番判定 |
| --- | --- | --- |
| F1 1/N動画インポート、履歴/保存/再開、非破壊プロジェクト | GOAL / PRODUCT_SPEC / packages/project | mainに合成検証済みの一部。任意の数十GB実素材は未実証 |
| F2 複数カメラの同期/切替/信頼度 | GOAL / PRODUCT_SPEC | 本物の多視点での一巡未検証 |
| F3 動画/音声AI解析と構成提案 | GOAL / PRODUCT_SPEC | mainの数値的シグナルとv2.2候補のWhisper/無音・動き測定。実技の意味理解・専門的正誤は未完成 |
| F4 初心者向け手動タイムラインと日本語指示 | GOAL / PRODUCT_SPEC | mainのローカル編集スライスあり。4端末実機での一巡未完 |
| F5 字幕/ズーム/スロー/エフェクト | GOAL / PRODUCT_SPEC | 一部合成出力あり。字幕/効果の本番パリティ未証明 |
| F6 元音声/ナレーション/BGM/SE 4バス | AUDIO_SPEC / main | 合成テストで一部検証。4端末・実訓練素材では未証明 |
| F7 日本語音声認識・TTS保存 | GOAL / AUDIO_SPEC | 音声認識は候補にある。日本語TTSの実ファイル/完成MP4一巡未完 |
| F8 MP4出力、全編検査、失敗修正ループ | GOAL / main | 合成素材で一部成功。ZBook v2.2実機は編集/出力未成功 |
| F9 iPhone/Android/Windows/Mac | GOAL / PRODUCT_SPEC | ZBookの起動のみ所有者が確認。他端末E2E未検証 |
| R1 スマホから別回線で大容量分割送信と中断再開 | この引継ぎ + v2.2候補 | コード候補あり。別回線/数十GB実機は未検証。最新画面では送信後検査失敗 |
| R2 送信完了で自動編集、再試行、ダウンロード | この引継ぎ + v2.2候補 | バッチ機構候補あり。実機で完成MP4受領は未証明 |
| R3 Googleフォト/別保存先の素材 | ユーザーの追加要件 | Googleフォトからアプリへの直接自動取込は未接続。手動のファイル選択との区別が必要 |

## 5. Codexの具体的な次の実装（順序とPASS条件）
### Gate A: 既存資産の固定・障害を再現
- 本番 main の既存統合テストを実行。既存のローカル編集/音声/出力を保全し、ZIP候補を本体へ無条件に統合しない。
- 合成2本で「分割アップロード成功 → finalize → ffprobe検査 → バッチ開始 → 完成MP4保存 → 再生・ffprobe/全編decode → SHA/再起動後読戻し」を再現する。
- Windows上で app.py 起動元がPowerShell、ダブルクリック、別プロセスのいずれでも、同一のffmpeg/ffprobeバイナリが解決される試験を追加。PATH不備時はユーザーに再インストールを強いる前に実行ファイルの存在を安全に検出し、明瞭なエラーにする。Smart App Controlの無効化を要求しない。
- JSON None 例外は例外型、呼出し位置、入力経路を特定。空/不正 ffprobe JSON、プロセス起動失敗、転送完了・検証ステータス競合の異常をテストし、無限リトライを避ける。
- 合格条件: Windowsの実際の編集プロセスで2本送信からMP4を再生でき、元動画と過去のアップロードが保護されている。模擬Windows環境では TESTED_SYNTHETIC に留める。

### Gate B: 大容量・送信再開の実装強化
- 4MiB程度の分割送信、file ID、検証済みサイズ/ SHA、再接続・停止復帰・アップロード再送の重複防止、ファイル名衝突、途中破損、容量不足、同時送信と同一バッチの冪等性を試験。
- PCの小さい内蔵ディスクに素材や一時ファイルを自動保存しない。外部SSD等の空き容量/保存先とファイル容量を必ず検査。クラッシュ時の途中原本は保護、完了していない成果物を配布しない。
- 合格条件: 同じ素材を再送せずに転送・編集を復帰、保存後に独立読戻しでSHA一致、二重課題/バッチ起動なし。

### Gate C: 無料・安全な別Wi-Fiスマホ操作
- Tailscale Serve（Funnelではない）と端末認証を使い、既存ポート443/Serveの設定を勝手に上書きしない。本人の接続許可/プラン条件を確認。
- iPhone/Androidの別Wi-Fi/4G/5Gでログイン、分割送信、進捗、MP4のRange/中断再開ダウンロードをそれぞれ実機検証。
- localhost bind、認証Cookie/CSRF、ログ/アクセス制御、禁止パス/元動画の外部公開を検査。クラウド必須化、ポート開放、Funnel一般公開は不可。
- 合格条件: 両スマホが所有者の別回線でE2E成功。Wi-Fi内だけのテストは不可。

### Gate D: 重要動作を保持する自動AI編集
- ステップ記録と元動画/切り出し候補の時刻を保持し、日本語ASR、無音・静止/動き量、候補字幕、保守的カット/スロー/ズームなどを段階別に実装・測定。
- 数値変化を「実技の正解」「重要な動作の理解」と混同しない。判定に自信がない場面は保全。追加有料API不要。
- 保存済み元動画/字幕/音声は独立管理。実MP4を全編検証し、専門的な評価は本人確認が必要なものとして明示する。
- 合格条件: 元動画の重要な流れが失われず、編集計画/MP4/字幕時刻の整合とコーデック・音声が再現可能。単純な自動結合を「AI編集完成」にしない。

### Gate E: 1時間・数十GB本番
- まず許可済みの非機密の実素材を少量で受入。次に所有者のローカル/外付け媒体で複数ファイル合計数十GB、1時間級を処理。
- メモリ/ディスク/処理時間、PC再起動後の復帰、インターネット断、スマホでのMP4受領を測定し、匿名化した結果のみGitHub保存。
- MacBook、ZBook、iPhone、Androidは独立PASSで判定。権利/個人情報を含む動画は外部転送しない。

## 6. 改修運用と絶対禁止
- 変更は小さいブランチ/PR単位。テスト・実出力のSHA・CI・実機証拠を対応させ、mainを安全に更新。未統合Draftを増やす前に既存PRとの衝突を確認。
- 独立した外部レビューを常に必須条件にはしない。適切な回帰テストと実動作証拠は必須。
- 重大な構成変更、権限変更、Google OAuth、外部プライベート保存先、課金/クラウド、実訓練映像の移送、公開、既存本番への破壊的統合は本人承認までHOLD。
- CI緑、仕様書やPR登録、サンプル動画数秒の成功だけで本番完成と判定しない。
- 一度失敗した事象を別仮説なしに繰り返さない。復旧手順を利用者に何度もPowerShellで入力させる設計は避ける。
- テスト結果は TESTED_SYNTHETIC / VERIFIED_REAL_DEVICE / BLOCKED を区別し、Issueとdocs/work/WORK_CHECKPOINT.md、PROJECT_STATE.md、ROADMAP.mdへ保存する。
- この引継ぎをGitHubに保存しただけでCodexの実装ジョブが自動起動したとはみなさない。

## 7. すぐに再開するための短い指示
Codexは本Issue/本書、GOAL.md、AGENTS.mdを読み、まず **Windowsの編集開始前 JSON None と送信後 ffprobe 未検出** を、それぞれ再現できる失敗テストとして固定する。mainの既存機能を優先して、無変更の実装をZIPで上書きしない。修復後に合成2本で「アップロード→SHA確定→自動編集→実MP4→全編再生検証→再起動読戻し」を証明する。次にTailscaleの非公開遠隔接続とスマホ別回線の実機検証へ進む。記録・コード・テスト・未完了の理由をGitHubに継続保存する。完成の水増し禁止。