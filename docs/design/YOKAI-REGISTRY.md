# 妖怪の登録表（#307 設計メモ）

ルール #304「1 つのデータは 1 か所・足し忘れは型とテストで落とす」を妖怪で実現する。アイテムの登録表（`docs/design/ITEM-REGISTRY.md`、`src/content/items/`）と同じ考え方。改善フェーズのあとに国の妖怪 36 体を足すので、**妖怪 1 種を足すのに触るファイルを 3〜4 にする**のが目的。

## 今の問題（2026-10-25 の調べ、種類は 4: karakasa・chochin・nurikabe・rokurokubi）

- 1 種の値が 10 か所以上に分かれる: `YOKAI_NAME`・`BASIS`・`MOTION`（→`YOKAI_STATS`）・`KIND_AI`・`SENSE.kinds`・`YOKAI_DROPS`・`YOKAI_VARIANT_COLORS`・`HEADS`（二つ名の印）・国の重み `BASE`／`emphasis()`・実績の種類ごとの一覧・メダルの絵の switch。
- 同じ 4 つの名前を手で並べた型・配列が 3 つ（`YokaiKind`・`YokaiKindId`・`YOKAI_ORDER`）と、抽選の順 `YOKAI_DRAW_ORDER`。
- **黙って落ちる所**（新しい種類を足し忘れても型もテストも落ちない）:
  - 国の重み `BASE`・`COUNTRY_TABLE` が Partial → 全部の国で重み 0、`YOKAI_DRAW_ORDER` に書き忘れ → 一度も出ない。
  - `HEADS` が `Record<string,…>` → 二つ名の印が出ない。`variantColor(kind: string)` → 色が変わらない。
  - メダルの絵の switch に default なし → 白い絵。実績の種類ごとの一覧が手書き → 実績が無い。
  - `yokaiWeights` が `Record<string,…>`。
- `ATTACK_DAMAGE` は遊びでは読まれていない（強さは `yokaiStrength()`）。

## 形

```
src/content/yokai/
  ids.ts         葉。YOKAI_IDS = ['karakasa', 'chochin', 'nurikabe', 'rokurokubi'] as const（import なし）
  types.ts       YokaiDef（下）
  karakasa.ts …  1 種 1 ファイル（36 体を足しても 1 ファイルが大きくならず、並行で足してもぶつからない）
  registry.ts    YOKAI_DEFS: Record<YokaiKind, YokaiDef>（全件強制）と見せ方の関数
```

- `contracts.ts` の `YokaiKind` は `ids.ts` から作る（名前は変えない）。`YokaiKindId`（variants.ts）・`YOKAI_ORDER`・`YokaiId`（yokai/index.ts）は `YokaiKind` の別名にする。
- 並びは今のまま残す: `YOKAI_DRAW_ORDER`（抽選の順。乱数の結果が変わるので変えない）と `YOKAI_ORDER` は `satisfies readonly YokaiKind[]`＋「全種類が 1 回ずつ入っている」テスト。
- **1 種のファイルは純粋なデータだけ**（Three.js のモデルや AI のコードは import しない）。形を作る class（`yokai/models/<kind>.ts`）と特別な動き（`chaseTick` などの switch）はコードのまま。switch は全部 `never` で全種類を強制（#305 で済み）。

### YokaiDef（共通の項目＋部品）

```ts
interface YokaiDef {
  name: string;                     // YOKAI_NAME（ひらがな）
  basis: { target; attack; xp; projectile?; frontOnly? };  // BASIS
  motion: { hitSeconds; attackSeconds; reach; speed; cooldownSeconds; avoidsWater? };  // MOTION
  ai: { stepUp; radius; height; eyeHeight; turnDegPerSec; marksHeight; flies? };      // KIND_AI
  sense: { sight; giveUp; shinobi };                       // SENSE.kinds
  drops: readonly DropRow[];                               // YOKAI_DROPS
  colors: VariantColors;                                   // YOKAI_VARIANT_COLORS
  head: HeadSpec;                                          // 二つ名の印 HEADS
  country: { base: number };                               // 国の重みの土台 BASE（強める国は countryTable の emphasis のまま）
  achievement: { name: string };                           // 種類ごとの実績の名前
}
```

- 型の名前・項目名は今のコードに合わせてよい。**値は今の表からそのまま写す**。戦闘の数は単位つきの日本語コメントで（ボス・魔法の Tuning ファイルはそのまま）。
- 今の表・関数（`YOKAI_NAME`・`YOKAI_STATS`・`yokaiStrength`・`KIND_AI`・`SENSE`・`YOKAI_DROPS`・`YOKAI_VARIANT_COLORS`・`HEADS`・`BASE`・実績の一覧・`ATTACK_DAMAGE`）は名前も使い方も変えず、中身を登録表から作る。`SENSE` は main.ts が開発用にその場で書きかえる入れ物なので、登録表から**複製**して作る。
- `yokaiWeights`（設定フック）の型を `Partial<Record<YokaiKind, number | null>>` にする（値と動きはそのまま）。

## 黙って落ちる所をふさぐ（同じ PR か 2 本目）

- `BASE` は登録表の `country.base` から作るので全種類そろう。`COUNTRY_TABLE` の行は Partial のまま（国ごとに出ない妖怪がいてよい）だが、「どの妖怪もどこかの国で重み > 0」のテストを足す。
- `HEADS`・`YOKAI_VARIANT_COLORS`・実績の一覧は登録表から作る → 書き忘れは型エラー。
- `variantColor`・`baseColorOf`・`brightness` の引数を `YokaiKind` に。メダルの絵の switch に `never` の default。
- 遊びが変わる所（ボスのダメージを `'karakasa'` 扱い、がしゃどくろの当たりを `'nurikabe'` 扱い、火の玉の持ち主が `'chochin'` 固定）は**今回は直さない**。issue にして別に（遊びの変化になりうるので yuzu に見せてから）。

## 妖怪を 1 種足すときに触るファイル（合格の物さし）

1. `content/yokai/ids.ts`（id を 1 回）
2. `content/yokai/<kind>.ts`（値）
3. `yokai/models/<kind>.ts`（形）と、`createYokai`・`YokaiManager` の switch（`never` で書き忘れが型エラー）
4. メダルの絵（switch が型エラーで知らせる）

仮の妖怪を手元で足してみて、型エラーに従うだけで全部の表がうまること（コミットしない）。

## 合格の条件

- 写し JSON（`src/content/__snapshots__/` の全部）が 1 文字も変わらない。既存テストの期待を変えない。`check:fast` 緑。
- `check:ratchet` の数が増えない（`idCase` など。読む側を直して減った分は下げる。`scripts/content-ids.mjs` が妖怪の id を見失わないこと）。
- 抽選の順・乱数の結果が変わらない（`YOKAI_DRAW_ORDER` と抽選のテスト）。
- 1 ファイル 800 行まで。差分およそ 800 行まで（こえたら「登録表へ」と「黙って落ちる所」の 2 本に分ける）。
