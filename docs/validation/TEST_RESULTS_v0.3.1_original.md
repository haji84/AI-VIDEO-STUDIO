# AI VIDEO STUDIO v0.3.1 試験結果

試験日：2026-10-21

| 検証対象 | 結果 | 証拠/制約 |
|---|---|---|
| Python構文 | PASS | `python -m py_compile audio_prototype/mix_audio.py` |
| FFmpeg BGM/SE/ナレーションのMP4ミックス | PASS | `python -m unittest test_mix -v` (人工動画・人工音声) |
| 音声のない動画へのSE付加 | PASS | 生成した無音動画 + 550Hz SEでMP4生成・全編デコード |
| 指定秒数のSE配置 | PASS | FFmpeg出力の880Hz帯域レベルで検出 |
| 指定秒数のナレーション配置 | PASS | FFmpeg出力の660Hz帯域レベルで検出 |
| 指定時間帯のBGMダッキング | PASS | 440Hz帯域レベルの減衰を確認。ただし境界は急変する試作 |
| 完成MP4全編デコード | PASS | FFmpeg `-xerror -f null` を実行 |
| 元動画非破壊 | PASS | 試作は元ファイル上書きを拒否 |
| ブラウザ操作と設定JSON | PASS | Linux Chromium 390px画面・1.5秒再生・JS例外なし |
| iPhone Safari実機BGM/SEプレビュー | **未実施** | HTML/JSを現端末で開いた結果はない |
| iPhoneネイティブMP4書き出し | **未実装・未実施** | AVAudioEngine/AVFoundationとの統合が必要 |
| Androidネイティブ音声編集 | **未実装・未実施** | Media3との統合が必要 |
| 無料音源ライブラリ・AI音楽選曲 | **未実装** | 権利台帳・実音源・AI判断の実装が必要 |
| 「プレビュー＝完成MP4」の端末内精度 | **未実証** | 別エンジン間の一致試験が未実施 |
| 自然な日本語AIナレーション | **未実証** | OS TTS・ローカルモデルの実機聴感未検証 |

結論：**BGM/SE音声合成の参考エンジンとブラウザ試聴UIの一部を動作確認。製品の音声編集機能やスマホ実機対応が完成したわけではない。**

## 追加Web音声検証

Linux Chromium (390px)で実MP4・WAV(BGM・SE)をブラウザのファイル入力から読み込み、音声グラフ起動後1.4秒時点で動画/BGMが再生中であること、SEが発火したこと、JavaScript例外ゼロを確認。iPhone実機ではない。

Web Audio `GainNode` で音量を調整するため、iOS SafariがHTMLMediaElement.volumeを無視する問題に依存しない設計。ただし実機での再現性は未確認。
