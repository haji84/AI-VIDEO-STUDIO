# v0.2 Private API（開発者用）

全Owner APIで `Authorization: Bearer <random_owner_token>` が必要。内部サービスは別の `WORKER_TOKEN` が必要。現時点で一般ユーザー認証や料金請求は実装しない。

## Owner API

| Method | Path | 処理 |
| --- | --- | --- |
| GET | `/api/health` | 接続状況と開発中の状態を表示（秘密なし） |
| GET | `/api/me` | 開発者権限、静的上限、課金OFFを返す |
| GET | `/api/projects` | プロジェクト一覧 |
| POST | `/api/projects` | 新規プロジェクト作成 |
| GET | `/api/projects/:id` | プロジェクト・資産・編集タイムラインを取得 |
| PATCH | `/api/projects/:id` | `expectedRevision` を使った競合検出付き保存 |
| POST | `/api/projects/:id/uploads` | R2の新しいMultipart Uploadを開始 |
| PUT | `/api/uploads/:id/parts/:n` | 8MiBずつアップロード |
| GET | `/api/uploads/:id` | 再開のための完了済みPart一覧 |
| POST | `/api/uploads/:id/complete` | Part数・サイズ・R2 object sizeの確認後に登録 |
| POST | `/api/uploads/:id/abort` | 未完了の転送だけ中止 |
| POST | `/api/projects/:id/jobs` | 編集リクエストを`waiting_for_processor`で保存。処理は開始しない |
| GET | `/api/jobs/:id` | 処理待ち・完了の状態取得 |
| GET | `/api/usage` | 計測したアップロード量（請求金額ではない） |

## Worker専用API

| Method | Path | 処理 |
| --- | --- | --- |
| GET | `/api/internal/jobs/:id/manifest` | 非公開R2 Object key/同期前の編集仕様を取得 |
| POST | `/api/internal/jobs/:id/claim` | 2種類の実行許可がある場合だけ処理開始 |
| POST | `/api/internal/jobs/:id/report` | 完成物の存在を確認し、技術QAの結果だけ登録 |

**既知の未実装**：実映像プレビュー（Range再生を含む）、非公開動画ダウンロード、将来のマルチユーザー認証、実Cloud Run起動/lease/heartbeat、料金請求、AIによる内容理解。公開や本番運用をしてはいけない。
