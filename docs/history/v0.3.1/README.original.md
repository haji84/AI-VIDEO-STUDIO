# AI VIDEO STUDIO v0.3.1（SE・BGM追加）

前版v0.3の端末内AI・AI音声・映像/文字エフェクト設計に、**BGMとSEの簡単操作、独立トラック、ダッキング、音源ライセンス**を統合した追加版。

## 試作済み（限られた条件）

- Python + FFmpeg の `audio_prototype/mix_audio.py` によるローカルMP4音声混合。
- 人工MP4、人工BGM、人工SE、人工ナレーションを使った再生可能なMP4書き出し、全編デコード、指定秒数の効果音/ナレーション、BGM減衰の信号試験。
- `audio_prototype/AUDIO_PREVIEW.html`: 元動画+BGM+SEを端末上で試聴するWeb Audio試作。音量スライダー、タイミング指定、手動ダッキング区間、設定保存ができる。**アプリ内ライブラリ/AI配置/完成MP4書き出しは未実装。**
- Chromium 390px画面でHTML・WebAudio動作・設定JSONダウンロードを検証（iPhoneでは未実施）。

## 次に検証すべきこと

1. iPhoneで `docs/IPHONE_AUDIO_ACCEPTANCE.md` フェーズAの試聴（テスト用に自己所有の短いファイルを使う）。
2. iOS/Androidネイティブ音声ミキサーとAVFoundation/Media3の音声混合MP4出力を開発。
3. BGM/SEプリセットライブラリと初心者向け操作画面、試聴した音と完成動画の一致を検証。
4. AIが音源候補を提案し、説明音声を妨げない自動配置/音量調整を実装。
5. 既存v0.2.1で動いたクラウド試作を破壊せず、端末内エンジンの選択肢として独立発展させる。

## 試作のテスト

```bash
cd audio_prototype
python -m unittest test_mix -v
```

FFmpeg、ffprobe、Pythonが必要。生成した人工音源を使う。試作は動画の内容解析、AI音楽生成、商用音源ライブラリではない。

## 製品境界

GORIQと独立。クラウド送信、R2登録、サブスク、一般公開、課金は今回一切実施していない。旧版v0.3設計とv0.2.1を保持する。
