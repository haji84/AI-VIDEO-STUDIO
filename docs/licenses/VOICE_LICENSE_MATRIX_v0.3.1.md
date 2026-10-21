# AI音声候補と権利確認

| 候補 | 動作・品質 | 利用許諾の注意 | v0.3での扱い |
|---|---|---|---|
| iOS AVSpeechSynthesizer | iPhoneのシステム音声、バッファ出力可能。自然さ・オフライン可否は声で異なる可能性。 | OS提供機能として利用。声の再配布や録音利用条件は配布前に確認。 | 最優先試作 |
| Android TextToSpeech | 端末のTTSエンジンで対応声を列挙・音声化。 | 端末TTSエンジンの権利・ネット要否を確認。 | 最優先試作 |
| Kokoro-82M | ローカル推論のモデル。日本語候補あり。 | モデル重みApache-2.0として確認。ライブラリやテキスト正規化の依存ライセンスは別確認。iPhone/Androidでの実機性能は未検証。 | 高品質音声の比較候補 |
| VOICEVOX Nemo | 日本語音声、PC版が公開されている。 | 公式規約はクレジット表記必須、機械学習利用の禁止など。SaaS・モバイル配布の権利適合を個別に確認。 | PC向け任意候補 |
| CapCut音声の直接使用 | CapCutの声は独自サービスで利用可能。 | 同じ音声モデルや固有音色を他社アプリへ無断移植できる根拠は見つからない。 | 非採用（正式ライセンスを取得できる場合のみ再検討） |
| 自分の声クローン | 自分の音声を学習または参照して生成する候補。 | 本人の明示同意とデータ管理、用途制限、モデル安全性が必要。 | 後日 |

参照（2026-10-21）：
- https://developer.apple.com/documentation/avfaudio/avspeechsynthesizer/write(_:tobuffercallback:)
- https://developer.apple.com/jp/documentation/avfaudio/avspeechsynthesisvoice
- https://www.capcut.com/help/text-to-speech-feature
- https://www.capcut.com/tools/text-to-speech
- https://huggingface.co/hexgrad/Kokoro-82M
- https://voicevox.hiroshiba.jp/term/
- https://voicevox.hiroshiba.jp/nemo/term/
