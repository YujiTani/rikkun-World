# コードのきまり（#304 の まとめ）

アイテム・妖怪を 100 時間ぶん 足しても くずれないための きまり。段階 1〜4 で 形を そろえ、段階 5 で 機械の 見はりに した。

## きまり
1. **1 つのデータは 1 か所**。同じ 数・名前を 2 か所に 書かない。
2. **アイテム・妖怪は シリーズごとの 定義ファイルに 1 レコード**。登録表（`src/content/**`）は 並べるだけ。足し方は `src/content/CLAUDE.md`。
3. **足し忘れは 型か テストで 落とす**。id ごとの 表は `satisfies Record<…>` で 全件、`switch` は 最後に `never`、だまって 受ける `default` は 作らない。
4. **数は 1 か所の 表に、単位つきの 日本語コメント**（秒・マス・ダメージ…）。
5. **ファイルは 500 行が 目安、800 行は 超えない**。class を 分けるときは 係ごと。部品に `this` 全体を 渡さない（要る物だけの 小さな interface）。毎フレーム 動く所で 新しい物（クロージャ・配列）を 作らない。import の輪を ふやさない。本番から `src/proto/` を import しない。
くわしい 分け方は `docs/design/STAGE4-SPLIT.md`。

## 機械の 見はり
| きまり | 道具 | 破ると |
|---|---|---|
| 800 行を こえる .ts（テスト除く） | eslint `max-lines`（空行・コメントも 数える）＋ ratchet「0 固定」 | 必ず 落ちる |
| 本番 → `src/proto/` の import | eslint `no-restricted-imports` ＋ ratchet「0 固定」 | 必ず 落ちる |
| id の `===` / `case` 直書き、switch の取りこぼし、循環、使われない export、eslint-disable | `npm run check:ratchet`（`ratchet.json` の 上限） | ふえたら 落ちる（へらす方向だけ。`--update` で 上限を 下げる） |

## いつ 回すか
- 書いている間 … `npm run check:fast`（型＋ユニット）。
- 区切りで、`src/` を 変えた PR は コミット前に `npm run check:ratchet`（約 25 秒）と `npx eslint src`（`max-lines`・`no-restricted-imports` の エラーが 0 であること。id 直書き等は ratchet が 数える）。
- CI は `check:fast` の あとに `check:ratchet` を 回す。
