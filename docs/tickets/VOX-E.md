# VOX-E: hybrid メッシュをセクションごとに本番化（ゲームが 9×9×9 の見た目になる）

| 項目 | 内容 |
|---|---|
| マイルストーン | 9×9×9 本番（親 #28） |
| issue | #95 |
| 状態 | テストを書く |
| 周回数（全ループ合計） | 0 / 10 |

## 目的
試作（`voxel-proto.html`、`src/proto/voxel/`）の hybrid の描き方を、ゲーム本体（`WorldRenderer`）に入れる。**ゲームの世界が B ごつごつ（9×9×9）の見た目になる**。メッシュはセクション（16³）ごと。`docs/design/VOX-plan.md` §5・§6、`docs/art/DESIGN.md`（B ごつごつ・小ブロック地形 §5.4）。

## きまり
- 近さの段: 小ブロック（greedyShape＋3D テクスチャの模様）を r 以内、**r=32 が既定**（F3 の設定で 16/24 に下げられる）。r より外〜48 は 1 マスの箱＋9×9 の模様、その外〜描画距離は今の LOD（列ごと 1 枚）。r の出入りは ±2 ずらす。
- メッシュはセクションごとに不透明・水の 2 つ。全部空気・`isSectionHidden`（VOX-A）・光が未計算（`isColumnLit`、VOX-C）のセクションは作らない。
- ブロックを 1 つ変えたら、そのセクション（境目ならとなり）だけ作り直す。1 コマ 8ms までの予算、プレイヤーが変えた所 → 近い所の順。小ブロックが間に合わない所は先に箱で出し、できたら差しかえる。
- 描く輪の外に出たメッシュは `dispose`。
- 光は今のまま（小ブロックの面は所属ブロックの光 1 つ、なめらかにしない）。昼夜のシェーダーは今のまま。
- 小ブロック地形 `S(mx,mz)`（`src/proto/voxel/terrain/microSurface.ts`）も入れる（見た目だけ。ほる・当たりは 1 ブロック）。高さは今の 48 のまま（352 は VOX-B）。
- ねらったブロックのわくは今のまま 1 ブロックの箱（オーナー決定）。マス目は足さない。

## 受け入れ基準
| # | 基準 | 確かめ方 |
|---|---|---|
| 1 | スタートで、近くは小ブロックの形（草のふさ・けずった岩）、遠くは箱・LOD | E2E（`__rikkun` で段ごとのセクション数）＋スクショ |
| 2 | 全部空気・見えない・光が未計算のセクションはメッシュがない | E2E（`world.sectionStats()`） |
| 3 | 1 ブロックほると、作り直すのはそのセクション（＋境目のとなり）だけ。穴の中の面がそのコマか数コマで見える | E2E |
| 4 | 小ブロックのセクション作り直し 1 つの中央値 15ms 以下、1 コマの作り直し合計 8ms 以下 | perf（クラウド） |
| 5 | 三角形 r=32 で 120 万以下・描画回数 スタート 300 / 上空 700 以下 | perf |
| 6 | 歩いて遠くなったメッシュは捨てる（`geometryBytes` が上限で止まる） | E2E |
| 7 | 今の遊び（歩く・ほる・おく・畑・妖怪・保存）がこわれない | 全 E2E（CI） |
| 8 | オーナーが Mac で見た目と fps を確かめる | オーナー確認 |

## テストが使う hook
`e2e/voxE-mesh.spec.ts`（基準 1・2・3・6）が使う。`window.__rikkun.world.*` に開発が足す（`src/world/hook.ts`）。セクション座標 `(sx, sy, sz) = (floor(x/16), floor(y/16), floor(z/16))`。

```ts
sectionInfo(sx, sy, sz): {
  tier: 'micro' | 'box' | 'lod' | 'none'; // いま描いている段。lod = 箱の外（列ごと 1 枚の LOD だけ）
  reason: 'empty' | 'hidden' | 'unlit' | null; // none のときだけ理由
  meshes: number;    // 持っている three のメッシュ数（不透明・水で 0〜2）。none / lod は 0
  triangles: number; // そのセクションのメッシュの三角形の合計
  dist: number;      // プレイヤーから、そのセクションの水平のいちばん近い所までの距離
}
sectionStats(): {
  microR: number; // いまの小ブロックの半径（既定 32）
  total: number;  // 読みこんだセクションの数
  micro: number; box: number; lod: number; none: number; // 合計 === total
  noneBy: { empty: number; hidden: number; unlit: number }; // 合計 === none
  microMaxDist: number; boxMinDist: number; boxMaxDist: number; // 段ごとの dist の幅（0 個なら 0）
}
meshStats(): {
  geometryBytes: number; geometryBytesLimit: number; // 上限をこえたら遠い順に dispose
  meshCount: number; disposedTotal: number;          // dispose したジオメトリの累計
  pending: number; // メッシュ作り直しの順番待ちの数（0 で落ちついた）。光の順番待ちは `world.lightPending()`。テストは両方 0 まで進める（最大 3000 コマ、超えたら失敗）
}
rebuildLog(clear?: boolean): { x: number; y: number; z: number; kind: 'micro' | 'box' | 'water'; frame: number }[];
// セクションのメッシュを作り直した記録（古い順、最初の全部の分もふくむ、光だけの作り直しもふくむ）。clear === true は返してから空にする
```

- 段の境目は ±2 のずらしを見こむ（小ブロックは dist ≤ 34、箱は 30 ≤ dist ≤ 50）。
- 「全部空気」のセクションは必ず `none/empty`、中まで固くて 6 方向も固いセクションは `none/hidden`（高さ 48 でも、`fill` で y 0〜47 をうめれば中の段 `sy=1` が「見えない」になる）。
- 小ブロックが間に合わず先に箱で出す場合、`tier` は「いま見えている段」。`rebuildLog` に同じセクションが 2 回出てもよい（テストは「ちがうセクションの数」を数える）。
- **空の面なしのセクション**: 全部空気でも「見えない」でもないが、見える面が 0 のセクションは `tier: 'none', reason: 'empty'`（メッシュを作らない）。
- **ほったセクションの光を先に**: プレイヤーが変えたセクションは、光の計算を他より先にする（`light` の順番待ちの先頭）。これで「3 コマ以内にメッシュができる」が成り立つ。3 コマのまま。
- **閉じた穴**: セクションの中ほどで、上下左右が固い所を 1 つほると、作り直すのはそのセクション 1 つだけ（`rebuildLog` のちがうセクションの数 `=== 1`。kind のちがいは同じセクション）。
- 追加の hook 名・形を変えるときは、このチケットとテストを一緒に直す。

## こわれる見込みのテスト
世界が 9×9×9 の見た目になる（三角形・描画回数・作り直しの単位が変わる）ので、実装後に次を見直す。**今は直していない**（開発が実装と一緒に、基準 4・5 の値に合わせて直す）。
| テスト | 理由 | 直し方の案 |
|---|---|---|
| `e2e/m1.spec.ts` AC17/18（110〜111 行）`drawCalls ≤ 100`・`triangles ≤ 300_000` | セクションごと・小ブロックで増える | 基準 5 の値（三角形 120 万、描画回数 スタート 300）に上げる |
| `e2e/m1.spec.ts` AC19（`rebuildStats().count ≥ 20`・`lastMs`）、`e2e/m2.spec.ts` AC24a（`rebuildStats().lastMs`） | 作り直しの単位がチャンクからセクションに変わる | `rebuildStats` の意味（セクション 1 つ分）を決めて、記録のみ／基準 4 の値に |
| `e2e/m1.spec.ts` AC15（`triangles` が変わる） | 動くはずだが、ほった所が箱／小ブロックの差しかえ待ちだと次のコマに変わらない恐れ | `step` の回数を 3 に |
| `e2e/m72.spec.ts` AC24（`on.dc - off.dc ≤ 3`・`on.tri ≤ 600000`） | 世界の三角形が増えて 600000 をこえる | 差分で見る（`on.tri - off.tri`）か 基準 5 の値に |
| `e2e/m5.spec.ts` AC15（`render.chunks().drawn` が 88 以内のチャンク数と同じ） | 描く輪の考え方が変わる（48＋LOD 96） | `render.chunks()` の意味を残すか、このテストを `sectionStats` の段の幅に置きかえる |
| 見た目のスクショだけ撮る spec（`m1` AC21/22、`m3` の空・妖怪・ドロップ、`m5` AC22、`m2` AC23、`m72` の畑 など。画像の比較はしていない） | 落ちないが、保存した画像が古くなる | `docs/test-reports/assets` を撮りなおして、art-reviewer が B ごつごつどおりか見る |
| `e2e/smoke.spec.ts`（`drawCalls > 0`・`triangles > 0`） | 影響なし（念のため） | — |

## 進め方（`docs/rules.md` 「テストは実装より先」）
1. `tester`: 上の 1〜3・6 の E2E を先に書き、こわれる既存テスト（見た目のスクショなど）を直す → 1 回回して赤を確かめる。
2. `code-reviewer`: テストが基準どおりか見る。
3. `developer`: ユニットを先に（赤 → 緑）、実装して E2E を緑に。
4. コードレビュー・UI 検査（`ui-reviewer`）・アート（`art-reviewer`、B ごつごつどおりか）・perf → オーナー確認。

## 経過（PO が追記）
| 日付 | ループ | 結果 | メモ |
|---|---|---|---|
| 2026-10-16 | — | 開始 | VOX-C（#117）マージ後 |
