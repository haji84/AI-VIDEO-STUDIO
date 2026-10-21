# 端末内AI解析 技術成立性と実機試験の判定

評価日：2026-10-21

| 機能 | 公開技術/APIによる技術成立性 | iPhone端末での実測 | Android端末での実測 | 現在の判断 |
|---|---|---|---|---|
| メタデータ／音声／解像度取得 | OS標準APIあり | 未実施 | 未実施 | 優先採用 |
| 明暗・黒画面・場面変化の数値検出 | 画像フレーム解析可能 | 未実施 | 未実施 | 優先採用 |
| 音声波形の相関によるカメラ同期 | 数値解析で実装可能 | 未実施 | 未実施 | 要精度試験 |
| 音声の文字起こし | whisper.cpp + OS Speech | 未実施 | 未実施 | 有力、モデル速度未確認 |
| 人物検出・姿勢解析・追跡 | Apple Vision / MediaPipe | 未実施 | 未実施 | 有力、精度未確認 |
| 重要動作の意味解釈 | 専用モデル／訓練データに依存 | 未実施 | 未実施 | 高難度、正確さ未保証 |
| テロップのアニメーション | Core Animation/動画合成、Media3 overlays | 未実施 | 未実施 | 優先採用 |
| 映像の色調・ズーム・ぼかし・画面分割 | ネイティブメディアAPI／GPU | 未実施 | 未実施 | 優先採用 |
| 日本語標準TTS／音声ファイル化 | AVSpeechSynthesizer / Android TTS | 未実施 | 未実施 | 優先採用、声の品質差あり |
| 自然な日本語ニューラルTTS | Kokoroなどのローカルモデル候補 | 未実施 | 未実施 | 端末移植・精度評価が必要 |
| 完成動画の全編技術QA | フレーム・音声・字幕情報の計算 | 未実施 | 未実施 | 優先採用 |
| AIによる専門的な説明の正しさ | 追加資料・人による照合が必要 | 未実施 | 未実施 | AI単独のPASS禁止 |

## 確認できた一次資料
- Apple Vision: 文字・人物・姿勢・画像品質の解析 https://developer.apple.com/documentation/vision
- Google MediaPipe Pose: iOSの動画モード／位置情報 https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker/ios
- whisper.cpp: iOS/Android/Windows対応、iPhone 13オフライン実例 https://github.com/ggml-org/whisper.cpp
- Apple speech recognizer: ローカル認識はsupportsOnDeviceRecognitionで判定 https://developer.apple.com/documentation/speech/sfspeechrecognizer/supportsondevicerecognition
- Apple TTS: write to audio buffer https://developer.apple.com/documentation/avfaudio/avspeechsynthesizer/write(_:tobuffercallback:)
- Android media effects https://developer.android.com/media/implement/editing-app
- CapCut TTS: クラウド依存 https://www.capcut.com/help/text-to-speech-feature

## 誤解しやすい境界
- ローカルのPC上で合成動画テストにPASSしたことは、iPhoneの実機でAI・MP4書き出しがPASSした意味ではない。
- 本付属HTMLは**ブラウザレベル**で動画デコード、フレーム抽出と簡易スコア、声の候補等を確認する。iPhoneネイティブのVision/Core ML/VideoToolboxを直接検証するアプリではない。
- AIによる映像の意味解釈、人物の正確な役割、技術的評価、AI音声の自然さをブラウザ機能の有無から断定しない。
- `speechSynthesis`の声が表示されてもオフライン音声という証明にはならない。機内モード＋完全なネット遮断で生成試験を行う。

## 実機で測る指標
- 対象機種、OSバージョン、空き容量、元動画コーデック/FPS/解像度/容量
- 読込成功、10秒プレビュー、1分プレビュー、3台を使ったプロキシ再生
- 文字起こし正確さ（人間が正解を確認した日本語テスト）、時間、メモリ/温度
- マルチカメラ同期の誤差（基準音・共通動作による検証、±秒）
- テロッププリセット5種類の描画・書き出しとプレビュー一致
- 動画エフェクト5種類の描画・書き出しとプレビュー一致
- OS標準TTSの日本語文章保存、発音、オフライン可否、生成秒数
- 10分動画出力にかかる実時間、ディスク不足時中断と復旧

## 端末試験順
1. 実機ブラウザ事前確認：`DEVICE_CHECK.html` のブラウザAPIと短尺動画デコードのみ。利用者自身が実行。
2. iOSネイティブ試作（SwiftUI）：Vision, Speech, AVSpeechSynthesizer, AVFoundationの実ファイル処理。PC/Mac上のXcodeビルドなど初期開発作業は必要になり得るが、完成したアプリの利用時にZBookは不要。
3. Androidネイティブ試作（Compose）：Media3, MediaPipe, 音声ライブラリ、同じテスト素材。
4. ユーザーの11GB映像で最終性能確認。大容量ファイルの転送と端末容量は独立の前提。

**最終判定：実装可能な技術要素は多い。ただし端末内AI編集の品質・全編自動処理の実用性・本番の性能は未実証。**
