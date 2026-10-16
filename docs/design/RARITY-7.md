# RARITY-7: アイテムのめずらしさ（レア度）を 7 段階にする（仕様書）

- issue: #80（土台）。これを使う: #69（レアな武器は 3 段攻撃）・#70（レジェンダリー武器はチャージアタック）
- タスク票: `docs/tickets/RARITY-7.md`（PO の決めはここが正）
- 見た目の 3 案: `/mnt/project-files/rarity-7/`（アート。オーナーが選ぶ）
- 指摘台帳: `docs/loop-ledger/RARITY-7.md`

## 1. ねらい（りっくんがどう楽しむか）

- 手に入れた物の「すごさ」が、**字が読めなくても** ふちの色・宝石の形・星の数で分かる。星が多いほど・宝石がりっぱなほど めずらしい。
- 今は 4 段（星 1〜4）。上に 3 段（星 5〜7）を足して、あとで「すごい武器」（#69・#70）を見つけたときに「ほし 7 つ！」とわくわくできる土台を作る。
- この issue では **強さは変えない**（強さを変えるのは #69・#70）。5〜7 段目のアイテムは今は 0 こ〜少し（§5 の当てはめ表）。

## 2. 遊び方（プレイヤーから見た動き）

- 遊び方は今と同じ。めずらしさが見える所は次の 8 つで、どこも同じ表から色・形・星・ことばを出す。
  1. ホットバーのマス（ふちの色・右上の宝石の印）
  2. もちもの・たんすのマス（ふちの色・宝石の印）
  3. つくる画面のタイル（ふちの色・宝石の印）
  4. つくる画面のせつめい（ふち・名前の色・星・ことば）
  5. ツールチップ（ふち・名前の色・星）
  6. おいわい（はじめて作ったときの横断幕のまるい台の色・名前のうしろの星、つくったときの わっか）
  7. 落ちた袋の光の柱（色・キラキラ）
  8. ひろったとき・つくったときの音（めずらしさで音の数が変わる。今と同じしくみ）
- めずらしさで「失敗」は起きない（失敗の返し方はない）。

## 3. 画面・見た目

### 3.1 7 段の表（しくみ）

| index | 内部 id | 星 | ほったときの最大数 dropMax | 色 | 宝石の形 | 画面のことば |
|---|---|---|---|---|---|---|
| 0 | `common` | 1 | 4 | 白 `#ffffff` | まる `circle` | ノーマル |
| 1 | `uncommon` | 2 | 3 | みどり `#8fe08f` | ひしがた `diamond` | レア |
| 2 | `rare` | 3 | 2 | あお `#7fb8ff` | 六角 `hexagon` | スーパーレア |
| 3 | `superRare` | 4 | 1 | むらさき `#c79bff` | 星 `star` | ハイパーレア |
| 4 | `epic` | 5 | 1 | きん `#ffd23f` | みかづき `moon` | ウルトラレア |
| 5 | `mythic` | 6 | 1 | しゅ `#ff7a3d` | ほのお `flame` | ミラクル |
| 6 | `legendary` | 7 | 1 | にじ（止まり `#fff3a0`） | かんむり `crown` | レジェンダリー |

- 内部 id・index・星・dropMax は **ここで決め**（変えない）。今の 4 つの id と意味・dropMax は今のまま（セーブ・テスト・設定 `rarity`/`dropMax` をこわさない）。
- 星の数 = index + 1。
- 色・宝石の形・ことばは、アートの 3 案からオーナーが選んだら、この表の「未定」を埋める（変更履歴に書く）。**今の 4 段の色・形・ことばは変えない前提**。ただしアートの案で 0〜3 段も変わることがある（そのときは §7 のテストの直しも行う）。
- ことばは **ひらがな・カタカナ・のばし棒・空白だけ**（漢字は使わない）。ことばは字だけで画面に出す（`craftPanel.detail.ts:154` の `textContent`）ので、ruby が入らないため。

### 3.2 アートにわたす「何が分かればよいか」（細かいきまりは `docs/art/DESIGN.md`）

- 7 つの色は **ぜんぶちがう**。暗い下地（マス・ツールチップ）の上で見分けられる。
- 宝石の印は 16×16 ドット、**7 つの形がぜんぶちがう**（色が分からなくても形で分かる）。上の段ほど「りっぱ・きらきら」に見える順番。ふち 1 ドットは今と同じ。
- ことばは 7 つぜんぶちがい、上の段ほど すごく聞こえる順番。ひらがな・カタカナだけ（漢字は使わない。§3.1）、**空白をのぞいて 9 文字まで**（§3.4 の計算の前提）。
- 光の柱の 5〜7 段目: 色は表の色。にじ色に流すか（今の 4 段目と同じ）、段の色のままにするかは案で決める。**仮**は「段の色のまま・ゆれと星形のつぶは 4 段目と同じ」。
- こわすぎない・点滅しない（fun.md §6）。

### 3.3 音（くわしくは `docs/audio/SOUND.md`）

- ひろう（くり返す行動）: 5〜7 段目は今の 4 段目と同じ音（`dropSuperRare`）。音の数・音量を 4 段目より大きくしない（fun.md §1）。
- つくる: チャイムは今と同じく段の数で上がり、5〜7 段目は 4 段目と同じチャイム（`chime4`）。わっかは今と同じく 3 段目（index 2）以上で出る。
- 5〜7 段目に専用の音を足すかはサウンドの別 issue（ここでは決めない）。

### 3.4 画面の配置（いちばん多いとき = 星 7 つ・いちばん長い名前・いちばん長いことば）

大きさは `tokens.css` の値から計算（★ は 1 字 = 1em としてかぞえる）。

| 画面 | 1024×700 | 1280×800 | 1440×900 | きまり |
|---|---|---|---|---|
| つくる画面のせつめい: 中の幅 | 272 − 2×13.6 − 2×3 = 238.8px | 320 − 32 − 6 = 282px | 360 − 36 − 6 = 318px | — |
| 　星 7 つ（fs-body） | 7×17 = 119px（入る） | 7×20 = 140px（入る） | 7×22.5 = 157.5px（入る） | 星 7 つは 1 行 |
| 　星 7 つ ＋ すきま ＋ ことば 9 字 | 119+6.8+153 = 278.8px（入らない） | 140+8+180 = 328px（入らない） | 157.5+9+202.5 = 369px（入らない） | **1 行に入らないときは、ことばを星の下の行に送る**。星もことばも途中で切らない・はみ出さない |
| 　（今の 4 段: 星 4 ＋ とても めずらしい 8.5 字） | 68+6.8+144.5 = 219.3px（入る） | — | — | 今の 4 段は今の 1 行のままでよい |
| ツールチップ: 星の行（fs-small） | 7×16 = 112px。いちばん小さい中の幅 144 − 27.2 − 6 = 110.8px → カードが約 1px 広がる（max-width 内） | 7×16 = 112px ≤ 142px | 7×18 = 126px ≤ 160.5px | 星 7 つは 1 行（折り返さない）。カードは中身に合わせて広がってよい |
| おいわいの横断幕: 字の幅 | 576 − 54.4 − 89.6 − 20.4 = 411.6px | 720 − 64 − 112 − 24 = 520px | 810 − 72 − 126 − 27 = 585px | — |
| 　星 7 つ（fs-display） | 7×40.8 = 285.6px（入る） | 7×48 = 336px（入る） | 7×54 = 378px（入る） | 名前 1 行・星 1 行に分ければ入る |
| 　いちばん長い名前「きらめく カタナ」8.5 字 | 346.8px（入る） | 408px（入る） | 459px（入る） | 名前と星は 2 行。**今の 4 段でも長い名前は 2 行**（例: きらめく カタナ ★★★★ = 408+24+192 = 624px > 520px）なので、行の数は増えない |
| ホットバー・もちもの・たんす・つくるタイル | ふちの色と 16×16 の宝石だけ。字はない | 同じ | 同じ | 大きさ・置き方は変えない |

- 星 7 つの列は、どの画面でも ★ と ★ の間で折り返さない。
- 持ち物いっぱい・たんすいっぱい（7 段のアイテムがまざる）でも、マスの大きさ・ならびは変わらない（宝石の大きさが同じなので）。

## 4. ルール・数値・つなぎ目の約束

### 4.1 定義は 1 か所

- 7 段の表（§3.1 の 1 行 = 1 段）を **1 つだけ** 持つ。場所の案: `src/drops/rarity.ts`（ほかのファイルから import のぐるぐるが出るなら、小さな別ファイルに置いて `rarity.ts` から出してもよい。**定義が 1 つ** なら場所は開発が決める）。
- ほかの所はみな、この表から読む: index・星・ことば・色（光の柱・ツールチップ・ふち）・宝石の形・dropMax の既定値・CSS 変数名 `--rk-rarity-<index>`。
- CSS（`tokens.css`）は TS から作れないので手で書く。`--rk-rarity-0〜6` の 7 つを書き、**値が表と同じことをユニットテストで確かめる**（今の `colorMath.test.ts` の「palette.ts と tokens.css が同じ」を 7 つに広げる。`palette.ts` の値は表から作る）。
- アイテムごとの段階（当てはめ）は今と同じ所: ブロックは ほる設定 `DIG_DEFAULTS.rarity`、それ以外は `rarity.ts` の表。

### 4.2 型と関数（つなぎ目）

```ts
// src/contracts.ts
export type Rarity = 'common' | 'uncommon' | 'rare' | 'superRare' | 'epic' | 'mythic' | 'legendary';
export type RarityIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6;   // 今の Rarity4（theme/parts.ts）・rarityIndex の 0|1|2|3 をこれに置きかえる

// 7 段の表（1 か所）
export interface RarityTier {
  id: Rarity;
  index: RarityIndex;
  stars: number;          // index + 1
  color: number;          // 0xrrggbb（光の柱・ツールチップ・ふち。--rk-rarity-<index> と同じ値）
  cssVar: string;         // '--rk-rarity-<index>'
  gem: GemShape;          // 宝石の形の名前（7 つ。名前はアート案で決める）
  word: string;           // 画面のことば
  dropMax: number;        // ほったときの最大数の既定値（設定 dropMax の初期値）
}
export const RARITY_TIERS: readonly RarityTier[];        // 7 行、index の順
export const RARITY_ORDER: readonly Rarity[];            // 今の名前を残す（= RARITY_TIERS の id の順）
export const RARITY_COLOR: Readonly<Record<Rarity, number>>; // 今の名前を残す（表から作る）
export function rarityTier(r: Rarity): RarityTier;
export function rarityIndex(r: Rarity): RarityIndex;     // itemCategory.ts から移す（itemCategory.ts は出し直してもよい）
export function isRarity(x: unknown): x is Rarity;       // セーブ読み込み・設定の確かめに使う
export function itemRarity(item: ItemId): Rarity;        // 今のまま。中身は §4.3 の設定 itemRarity を読む
export function resetItemRarity(): void;                 // 設定 itemRarity を初期値にもどす（テスト用。§4.3）
export function rarityAtLeast(item: ItemId, tier: Rarity): boolean; // #69・#70 用: rarityIndex(itemRarity(item)) >= rarityIndex(tier)
```

- 今ある `topRarity`・`isKnownItemRarity`・`rarityCss`・`starText` は名前と形を変えない（中身が表を読む）。
- `GemShape` の 0〜3 の名前（circle・diamond・hexagon・star）は、アートの案で形が変わらなければそのまま。

### 4.3 設定（テストと調整の口）

今の口を確かめた結果:
- `settings.set('rarity', {…})` は **ブロックだけ**（ほる設定 `DigConfig.rarity`）で、ほったときの数（`DigSystem` の dropMax）にしか効かない。ホットバー・ツールチップなどは `DIG_DEFAULTS.rarity`（変わらない既定値）を読むので、見た目は変わらない。
- 値の文字はなんでも入ってしまう（`'banana'` も入る）。
- ブロックでないアイテム（かたな など）の段階を変える口は **ない**。

足す・直す口:

| 設定の名前 | 中身 | 効く所 |
|---|---|---|
| `itemRarity`（新） | 全アイテム（`ITEM_TYPES` の 55 こ）→ `Rarity`。初期値 = §5 の当てはめ表 | `itemRarity()` を読む所すべて（§2 の 8 つ・`rarityAtLeast`）。そのあとに画面に出した物から効く（もう出ているマスを ぬり直さなくてよい） |
| `rarity`（今のまま） | ブロック → `Rarity`。ほったときの数だけに効く | `DigSystem` の dropMax。意味は変えない |
| `dropMax`（今のまま、キーが 7 つに） | `Rarity` → 数。初期値は表の dropMax | `DigSystem`。一部のキーだけの set も今どおりできる |

- `rarity`・`itemRarity` に 7 つの id 以外の文字を入れると Error（今は入る → 直す）。知らないアイテム・ブロックのキーは今どおり Error。
- 2 つの初期値は、アイテムでもあるブロック 14 こ（grass・dirt・stone・sand・log・leaves・coal_ore・iron_ore・furnace・kawara・brick・torch・tansu・sprinkler）で同じ値。
- 設定はセーブしない（今の設定と同じ）。
- **`itemRarity` の置き場所と読み方**: ほる設定（`createDigConfig()` ごとの入れ物）には入れない。`rarity.ts`（表と同じファイル）に、ゲームに 1 つだけの「今の当てはめ」の入れ物を置き、`itemRarity()` はいつもそれを読む。`main.ts` はその入れ物を設定の入れ物の 1 つとして `createSettingsHook` にわたす（今の `digSettingsView` と同じつなぎ方）。こうすると `itemRarity()` を呼ぶ所（画面・袋・#69・#70）は引数を変えずに上書きが効く。
- **元にもどす**: `rarity.ts` に `resetItemRarity()`（初期値 = §5 の表にもどす）を置く。ユニットテストで `itemRarity` を変えたら、`afterEach` で必ず呼ぶ。E2E はページを開き直すと初期値にもどる（`?nosave=1` で開く今の手順のまま）。

### 4.4 テスト用の窓口 `window.__rikkun.rarity`（新）

| 関数 | かえすもの |
|---|---|
| `tiers()` | 7 行の配列 `{ index, id, stars, word, color: '#rrggbb', cssVar, gem, dropMax }`。dropMax は **今の設定** の値 |
| `of(item)` | `{ id, index, stars, word, color: '#rrggbb', gem }`（設定 `itemRarity` を反映） |
| `atLeast(item, id)` | `rarityAtLeast` の結果（boolean） |

今ある窓口はそのまま使う: `inventory.tooltip()`（rarity・stars）、`craft.info(item)`（rarity・stars・rarityWord）、`combat.bags()`（袋の rarity）、`settings.get/set`。

### 4.5 そのほかの数

| 項目 | 値 |
|---|---|
| 段の数 | 7（index 0〜6） |
| 星 | index + 1（1〜7） |
| dropMax 既定 | 4・3・2・1・1・1・1 |
| 光の柱のキラキラ（5〜7 段目） | つぶの数・はば・こさは 4 段目と同じ（4 段目より多くしない）。ゆれは 1 秒に 1 回（3 回/秒 未満のまま） |
| 着地の ぱっと光る（5〜7 段目） | つぶの数・広がりは 4 段目と同じ（14 こ・0.85） |
| ひろう音 | index 3 以上 = `dropSuperRare` |
| つくるチャイム | `chime{min(4, index+1)}`（今の式のまま） |
| おいわいの わっか | index 2 以上（今のまま） |
| めずらしさと強さ | 関係なし（段を変えても、たたく・ほる・まもる つよさ・たいきゅう は変わらない） |

### 4.6 #69・#70 との約束（ここでは決めない）

- いちばん上 `legendary`（index 6・星 7）が、#70 の「レジェンダリー」。#70 は `rarityAtLeast(item, 'legendary')` で聞く。
- #69 の「レアな武器」が何段目以上か（`epic` 以上か `superRare` 以上か など）は **#69 で決める**。#69 は `rarityAtLeast(item, <#69 で決めた段>)` で聞く。
- この issue では、段階で動き・強さを変える所を作らない。

## 5. 今あるアイテムの当てはめ（全 55 こ）

PO の基本の方針（案 A）: 今の 4 段の割りあては変えず、5〜7 段目は今は 0 こ。

| 段 | 案 A（PO の基本） | こ数 |
|---|---|---|
| 0 common | grass・dirt・stone・sand・leaves・paper・string・cloth・torch・wood_pickaxe・stone_pickaxe・wood_axe・stone_axe・bokuto・ya・waraji・seed_onion・seed_tomato・seed_pumpkin・seed_eggplant・onion・tomato・pumpkin・eggplant・kuwa・watering_can | 26 |
| 1 uncommon | log・coal_ore・yokai_orb・oil・clay・furnace・kawara・brick・tansu・yumi・lantern・kite・futon・haniwa・long_watering_can・sprinkler | 16 |
| 2 rare | iron_ore・iron_pickaxe・iron_axe・iron_ingot・katana・naginata・kabuto・yoroi・kote・suneate | 10 |
| 3 superRare | crystal・crystal_katana・omamori | 3 |
| 4 epic | なし | 0 |
| 5 mythic | なし | 0 |
| 6 legendary | なし | 0 |
| 合計 | | 55 |

（数え直し: ブロック 8 ＋ アイテムだけ 7 ＋ M4 のブロック 5 ＋ M4 の道具など 23 ＋ M7 9 ＋ M7-2 3 = 55。段ごと 26+16+10+3 = 55）

**案 B（オーナーに選んでもらう）: きらめく カタナ（crystal_katana）だけ 5 段目 `epic` に上げる**

| 段 | 案 A からの変わり | こ数 |
|---|---|---|
| 3 superRare | crystal・omamori | 2 |
| 4 epic | crystal_katana | 1 |

理由:
- きらめく カタナ は、すいしょう 2・てつの かたまり 3・き 1 で作る「いちばん つよい かたな」で、材料の すいしょう（4 段目）より上にあると、作った物が「材料よりすごい」と分かる。
- 5 段目の色・宝石がゲームの中に 1 つだけ見えるので、りっくんが新しい段を目で知れる（7 段にした意味が見える）。
- おまもり は上げない: 材料が すいしょう 1 こで、ききめがまだ「もうすぐ」なので。
- 気をつけること: #69 で「レアな武器 = epic 以上」と決めると、きらめく カタナ が 3 段攻撃になる（#69 で合わせて決める）。強さはこの issue では変わらない。

どちらにするかは オーナー確認①で選ぶ（選ぶまでは案 A で作る）。

## 6. 例外のとき

- 古いセーブ: 落ちた袋の rarity が 4 つの id（`superRare` など）なら、そのまま読む。7 つの id ならそのまま。それ以外の文字はアイテムの今の段階に直す（今と同じ考え）。
- 表にないアイテム（これから足す物）: 今どおり `common`。アイテムを足すときは段階を必ず書く（今の決まりのまま。ユニットテストで全アイテムを確かめる）。
- 設定 `dropMax` で 7 つ以外のキー → Error（今どおり）。4 つだけ set しても 5〜7 段目は今の値のまま（今のテストの `dropMax` を 4 つだけ 1 にする手順は、5〜7 段目が既定 1 なので結果が変わらない）。
- 「動きの強さ」0: 光の柱のゆれ・わっかは今と同じ扱い（段が上がっても強くしない）。

## 7. 受け入れ基準

確かめる層: 【ユニット】【E2E】【UI 検査】【オーナー確認】。E2E は新しい `e2e/rarity7.spec.ts` に 2 本（つなぎ 1 本・通し 1 本）。テストの期待は数を決め打ちせず、表（`RARITY_TIERS` / `__rikkun.rarity.tiers()`）に聞く。§3.1 で「ここで決め」とした id・星・dropMax だけは数で書いてよい。

| # | 基準 | 層 |
|---|---|---|
| AC1 | 表は 7 行で、index 0〜6 の順に id が common・uncommon・rare・superRare・epic・mythic・legendary、stars が 1〜7（= index+1）、dropMax が 4・3・2・1・1・1・1。`RARITY_ORDER` は表の id の順と同じ | 【ユニット】 |
| AC2 | 7 つの color がぜんぶちがう。`palette.ts` の `--rk-rarity-0〜6` と表の color が同じで、`tokens.css` にも同じ値で 7 つある（`colorMath.test.ts` を広げる）。`RARITY_COLOR[id]` は表の color と同じ | 【ユニット】 |
| AC3 | 宝石の印 7 つ: どれも 16×16、ぬりのドットが 40 こより多い、ふちのドットが切れない（端の列は とうめい か ふちの色）、7 つの形の模様がぜんぶちがう。`gemShape(i)` は表の gem と同じ。7 以上・負の数は 0〜6 におさめる | 【ユニット】 |
| AC4 | ことば 7 つ: ぜんぶちがい、空でなく、ひらがな・カタカナ・のばし棒・空白だけ（漢字なし。§3.1）、空白をのぞき 9 文字以下 | 【ユニット】 |
| AC5 | どの段 id でも、ツールチップ（`buildTooltip`）の stars・`rarityCss` の色、せつめい（`createItemInfo().info`）の stars・rarityWord、`rarityIndex` が表の値と同じ（`rarityOf` に 7 つの id を順に返す仮の関数をわたして確かめる） | 【ユニット】 |
| AC6 | `rarityAtLeast(item, tier)` は、全 55 アイテム × 7 段で `rarityIndex(itemRarity(item)) >= rarityIndex(tier)` と同じ。`rarityAtLeast(x, 'common')` はいつも true | 【ユニット】 |
| AC7 | 当てはめ: 全 55 アイテムの段が 7 つの id のどれかで、§5 の選ばれた案の表と同じ（案 A なら epic・mythic・legendary が 0 こ）。今の 4 段の割りあて（今の `rarity.test.ts`・`craft.test.ts`・`itemArtM72.test.ts` の期待）は、案 B の crystal_katana をのぞき変わらない | 【ユニット】 |
| AC8 | アイテムでもあるブロック 14 こで、設定 `itemRarity` の初期値と ほる設定 `rarity` の初期値が同じ | 【ユニット】 |
| AC9 | 設定: `set('itemRarity', {katana:'legendary'})` のあと `itemRarity('katana')` が `'legendary'`。`set('rarity', {dirt:'banana'})`・`set('itemRarity', {katana:'banana'})`・`set('itemRarity', {nanika:'rare'})` は Error で、値は変わらない。`resetItemRarity()` のあと `itemRarity('katana')` は初期値（案 A: `'rare'`）にもどる | 【ユニット】 |
| AC10 | ほる: ほる設定 `rarity` で dirt を epic・mythic・legendary にすると、それぞれ 20 回ほって 毎回 1 こ（= 設定 `dropMax` のその段の値）。`dropMax` を `{legendary: 3}` にすると 1〜3 こ | 【ユニット】 |
| AC11 | セーブ: 袋の rarity が `'superRare'`・`'legendary'` のセーブを読むと そのままの値。`'banana'` ならアイテムの今の段階 | 【ユニット】 |
| AC12 | 光の柱・音: 7 段ぜんぶに キラキラの値と着地の光の値がある。5〜7 段目の `sparkleCount` と着地のつぶの数は 4 段目以下、ゆれは 3 回/秒 未満。袋が着地したときの音の名前は index 3 以上で `dropSuperRare`。つくったときのチャイムは index 3 以上で `chime4` | 【ユニット】 |
| AC13 | 強さは変わらない: crystal_katana・katana・iron_pickaxe・kabuto を `itemRarity` で legendary にしても、`craft.info` の stats（たたく・ほる・まもる つよさ・たいきゅう）は変える前と同じ | 【ユニット】 |
| AC14 | E2E（つなぎ）: `__rikkun.rarity.tiers()` が 7 行で AC1 と同じ id・stars・dropMax をかえす。7 つの段それぞれについて、`settings.set('itemRarity', {katana: id})` → かたな を ホットバーに入れると、そのマスの `data-rarity` = その段の index、宝石の `data-gem` = gem、ふちの計算された色 = color。同じ段で、ツールチップ（`inventory.hover` → `inventory.tooltip()`）の rarity・stars、`craft.info('katana')` の stars・rarityWord、つくる画面のせつめいの星の字（★ が stars こ）・ことばの字、たんすのマス（たんす画面の かたな が入ったマス）の `data-rarity` = index と、そのマスのふちの計算された色（`getComputedStyle(…).borderColor`）= color が表と同じ | 【E2E】 |
| AC15 | E2E（通し）: 初期のままでは `rarity.atLeast('katana', 'epic')` が案のとおり（案 A: false）、`rarity.of('katana').index` が 2。`itemRarity` で katana を legendary にすると `atLeast('katana','legendary')` が true。そのかたなを手に持って `drop` の入力で落とし、できた袋（`combat.bags()` の いちばん新しいもの）の rarity が `'legendary'`。はじめて作ったときの横断幕で（`itemRarity` で wood_pickaxe を legendary にして はじめて作る）名前のうしろの ★ が 7 こ | 【E2E】 |
| AC16 | 画面の配置: 7 段目（★7・いちばん長いことば）の物を出した ツールチップ・つくる画面のせつめい・おいわいの横断幕・ホットバー が、3 つの大きさ（1024×700・1280×800・1440×900）で はみ出し・切れ・重なり なし。★ の列が途中で折り返さない。ことばが 1 行に入らないときは星の下の行に出る | 【UI 検査】（`e2e/ui-gate.spec.ts` に「7 段目」の画面を 1 行足す） |
| AC17 | 今の 4 段の見た目は、アートの案で変えると決めた所のほかは、前のスクショと同じ（ホットバー・もちもの・つくる画面） | 【UI 検査】→ `ui-reviewer` |
| AC18 | 7 段の色・宝石の形・ことばが、アートの 3 案からオーナーが選んだものになっている。りっくんが字を読まずに、宝石の形と星で「どっちがめずらしい」を言える | 【オーナー確認】 |
| AC19 | 5〜7 段目の光の柱・ひろう音が、4 段目より うるさく・まぶしく ならない（くり返しは控えめ） | 【オーナー確認】 |

（AC は 19 こ: ユニット 13・E2E 2・UI 検査 2・オーナー確認 2）

- **当てはめ案が決まるまで**（オーナー確認①の前にテストを書くとき）は、AC7・AC9・AC15 の期待を **案 A** で書く。案 B に決まったら、AC7（crystal_katana が epic・superRare 2 こ）・AC15（katana は変わらないので直しなし。crystal_katana を使う所があれば直す）と `src/craft/craft.test.ts:61` を直し、台帳に書く。

## 8. 変える所（`grep -rn "Rarity\|rarityIndex\|RARITY_\|rk-rarity\|superRare" src e2e` の全部と、関係する所）

### 8.1 ゲームのコード

| ファイル:行 | 今 | 変えること |
|---|---|---|
| `src/contracts.ts:356` | `Rarity` 4 つ | 7 つに。`RarityIndex`（0〜6）を足す |
| `src/drops/rarity.ts:9-81` | 当てはめ表・`RARITY_ORDER`・`RARITY_COLOR`（4） | 7 段の表 `RARITY_TIERS` を置く（§4.2）。`RARITY_ORDER`/`RARITY_COLOR` は表から作る。`rarityTier`・`rarityIndex`・`isRarity`・`rarityAtLeast` を足す。`itemRarity` は設定 `itemRarity` を読む |
| `src/drops/index.ts:2` | 3 つを出す | 足した名前も出す |
| `src/drops/DropField.ts:5,161,224,432` | `RARITY_ORDER.includes` で確かめる | 7 つで確かめる（`isRarity`）。ほかは変えない |
| `src/dig/config.ts:16-18,101-136` | `rarity`・`dropMax`（4 キー） | 型は 7 段。`dropMax` 既定は表から作る（7 キー） |
| `src/dig/DigSystem.ts:472` | `dropMax[rarity]` | 変えない（7 キーで動くことを AC10 で確かめる） |
| `src/game/settings.ts:49-50` | 文字ならなんでも入る | `rarity`・`itemRarity` は 7 つの id だけ（AC9） |
| `src/main.ts:161` | ほる設定の名前 | `itemRarity` の設定を足す（名前が重ならないこと） |
| `src/main.ts:815-816,919` | `RARITY_INDEX`（4）・`rarity4` | `rarityIndex(itemRarity(item))` に置きかえ、表をここに持たない |
| `src/debug/testHook.ts:57,97` | — | `rarity` の窓口（§4.4）を足す |
| `src/ui/itemCategory.ts:69-72` | `rarityIndex` 0〜3 | 表から読む（`rarity.ts` に移す。ここは出し直しでもよい） |
| `src/ui/gemArt.ts:9-23,79-106` | 形 4・`FILL` 4 色・0〜3 におさめる | 形 7（アート案）・色は表から・0〜6 におさめる |
| `src/ui/tooltipModel.ts:3,33-38` | `STARS`（4）・`rarityCss` | 星・色を表から読む |
| `src/ui/tooltip.ts:115-121` | `rarityCss` で色 | 変えない（表から来る） |
| `src/ui/tooltip.css:11,41-45` | ふち 0 の色・星の行 | 星の行は折り返さない（§3.4） |
| `src/craft/info/build.ts:100-101,231-232` | `STARS`・`RARITY_INDEX`（4） | 表から読む |
| `src/craft/info/table.ts:193`・`index.ts:2` | `RARITY_WORD`（4） | 表のことばを使う（`RARITY_WORD` を消すか、表から作る） |
| `src/ui/craftPanel.detail.ts:5,43,150,153-154` | `RARITY_INDEX`（4）・`Rarity4` | `rarityIndex`・`RarityIndex` |
| `src/ui/craftPanel.ts:19-21,274-281` | `rarityIndex`・`gemUrl` | 型が 0〜6 になるだけ |
| `src/ui/craftPanel.css:96-106,303,318,321-327` | `data-rarity` 0〜3 のふち | 0〜6 のふち（書き方は開発が決める）。`.cp-rarity` は 1 行に入らないとき ことばを次の行へ（§3.4） |
| `src/ui/hotbar.ts:4-7,58-63` | `rarityIndex`・`gemUrl` | 型が 0〜6 になるだけ |
| `src/ui/hotbar.css:96-106,173` | `data-rarity` 0〜3 | 0〜6 |
| `src/ui/storageScreen.ts:1,6,119` | `RARITY_ORDER.indexOf … as Rarity4`。マスに `data-rarity` が付かない（`parts.ts` の `setRarity` だけ） | `rarityIndex`・`RarityIndex`。たんすのマスにも、ホットバーと同じく `data-rarity`（index）を付ける（AC14 で読む） |
| `src/ui/theme/parts.ts:7,28-36,78,104,253-255` | `Rarity4` | `RarityIndex` |
| `src/ui/theme/palette.ts:40-43` | `--rk-rarity-0〜3` | 0〜6（表から作る） |
| `src/ui/theme/tokens.css:37-40,62` | `--rk-rarity-0〜3` | 0〜6（手で書く。値は AC2 で確かめる） |
| `src/ui/theme/components.css:122-123,377` | `var(--rk-rarity)` | 変えない |
| `src/ui/theme/partsPage.ts:63-65` | 見本のマス 1〜3 | 7 段の見本を並べる（アートの確認用） |
| `src/ui/celebrate/index.ts:4,39,123,135,137,245-246` | `Rarity4`・`stars: r + 1` | `RarityIndex`・星は表から |
| `src/ui/celebrate/views.ts:1,62,155,165,167` | `Rarity4` | `RarityIndex`。名前と星が切れない（§3.4） |
| `src/ui/celebrate/celebrate.css:31,69,103` | `var(--rk-rarity…)` | 変えない |
| `src/fx/dropSparkle.ts:21-26,39,41` | `SPARKLE`・着地の光（4） | 7 段（5〜7 段目は §4.5） |
| `src/fx/bagVisuals.ts:4,73-76,105-107,120-121,250-251` | 柱・わっかの材質 4・にじは superRare | 7 段。5〜7 段目の柱の色は §3.2（仮: 段の色） |
| `src/fx/combatFx.ts:51` | 音の名前を 4 つで分ける | index 3 以上は `dropSuperRare` |
| `src/ui/inventoryScreen.ts:1,20`・`pickupLog.ts:1,11`・`craftUi.ts:1,77,125`・`craftModel.ts:199-201` | `Rarity` 型を使うだけ | 変えない（型が広がるだけ） |
| `src/ui/log/categoryIcons.ts:23` | じっせきの印 `#c79bff`（= `--rk-rarity-3`） | 4 段目（index 3）の色をアート案で変えるときだけ、同じ色に合わせる（`craft2-extra` が `--rk-rarity-3` と比べている） |
| `src/ui/itemArtBal.ts:80`・`itemArtM4.ts:524`・`palette.ts:63` | 同じ色の数字（二つ名・絵・にじ） | めずらしさとは別の意味の色なので **変えない** |

### 8.2 資料

| ファイル | 変えること |
|---|---|
| `docs/art/DESIGN.md:202,213` | 7 段の色・宝石（アートが案の決定後に書く） |
| `docs/audio/SOUND.md:114` | 5〜7 段目のひろう音は 4 段目と同じ、と書く（サウンド） |

## 9. こわれる既存テストと直し方

| テスト | こわれる理由 | 直し方 |
|---|---|---|
| `src/drops/rarity.test.ts:18` | 色の数を 4 と決め打ち | `RARITY_TIERS.length`（7）と比べる |
| `src/ui/craftM4.test.ts:213` | `rarityCss` を `'#c79bff'` と決め打ち（4 段目の色をアート案で変えたとき） | `rarityTier('superRare').color` から作った色と比べる |
| `src/craft/info/info.test.ts:111` | ことば `'めずらしい'` を決め打ち（3 段目のことばを案で変えたとき） | `rarityTier('rare').word` と比べる |
| `src/ui/craftModelM6.test.ts:62` | ことば `'めずらしい'` を決め打ち（3 段目のことばを案で変えたとき。`info.test.ts:111` と同じ） | `rarityTier('rare').word` と比べる |
| `src/craft/craft.test.ts:61` | 案 B のときだけ（crystal_katana が epic に） | 期待を `'epic'` に（案 B を選んだときだけ） |
| `src/ui/itemCategory.test.ts:6,40-61` | こわれないが 4 つしか見ていない。`rarityIndex` を移すと import がこわれる | 0〜6 の 7 つを見る（AC3）。import を直す |
| `src/ui/theme/colorMath.test.ts:56-65` | こわれない（palette と tokens を両方足せば通る） | そのまま。AC2 で 7 つを見る |
| `e2e/craft2-extra.spec.ts:245` | 4 段目の色をアート案で変えたときだけ、じっせきの印の色とずれる | `categoryIcons.ts` の色を合わせる（§8.1）。テストは変えない |
| `e2e/m2.spec.ts:33,664,687-693,1029,1146`・`e2e/sound1.spec.ts:232`・`e2e/bal-d.spec.ts:33` | こわれない（`dropMax` を 4 キーだけ set してよい。5〜7 段目は既定 1） | そのまま |
| `e2e/m3.spec.ts:933` | ログに出すだけ | そのまま |
| `src/fx/dropSparkle.test.ts`・`src/fx/combatFx.test.ts`・`src/dig/DigSystem.test.ts:557`・`src/drops/DropField.test.ts:110`・`src/ui/itemArtM72.test.ts:23,45` | こわれない（値は変わらない。型が広がるだけ） | そのまま |
| `e2e/ui-gate.spec.ts` | こわれない | 「7 段目」の画面を SCREENS に 1 行足す（AC16） |

## 10. オーナーに決めてもらうこと（オーナー確認①でまとめて）

1. 7 段の色・宝石の形・ことば（アートの 3 案 `/mnt/project-files/rarity-7/` から）。7 段目のことばは「レジェンダリー」でよいか。
2. 当てはめ: 案 A（5〜7 段目は 0 こ）か 案 B（きらめく カタナ だけ 5 段目）。
3. 5〜7 段目の光の柱: にじ色（今の 4 段目と同じ）か、段の色か（仮は段の色）。

## 11. 変更履歴

| 版 | 内容 |
|---|---|
| 1 | 初版（2026-10-16） |
| 2 | 台帳の軽微 5 件: G1 §4.2・§4.3・AC9 に 設定 `itemRarity` の置き場所（`rarity.ts` に 1 つ）・`itemRarity()` の読み方・`resetItemRarity()` で戻す方法を追加。G2 §3.1・§3.2 のことばを かな・カタカナだけにそろえた（AC4 と一致）。G3 §9 に `craftModelM6.test.ts:62` を追加。G4 AC14・§8.1 でたんすのマスに `data-rarity` を付けて読む形にした。G5 §7 に「案が決まるまでテストは案 A で書く」を追加 |
| 3 | オーナー決定（2026-10-16）: 色・宝石の形は案 A、ことばは案 C（ノーマル〜レジェンダリー）、当てはめは案 A（きらめく カタナは上げない）。§3.1 の「未定」を決まった値で埋めた（§3.4 の幅の計算は 旧ことばでの見積りで、新ことばは どれも それより短い） |
