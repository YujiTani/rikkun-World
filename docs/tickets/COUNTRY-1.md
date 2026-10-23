# COUNTRY-1: 国の土台（#291）

| 項目 | 内容 |
|---|---|
| issue | #291 |
| 順番 | 国のボリュームの 1 番目。このあと #187 国だけの物（しるし）→ 国ごとの妖怪 36 体 → #195 建物＋宝箱 |
| 状態 | 仕様 2 版 → design-reviewer 2 回目 → オーナー確認①（§10 の 1 つ） |
| 周回数（全ループ合計） | 1 / 10 |

## 関連
- 仕様書: `docs/design/COUNTRY-1.md`（2 版）
- 決定: `docs/decisions/2026-10-23-adventure-core-four-bosses.md`（気ままな冒険＋4 大妖怪）。名前のふだは 作らない（2026-10-23 yuzu。仕様の頭）
- もとの仕様: `docs/design/VOX-I.md` §2、`docs/design/M6-ui-achievements.md` §2.6・§4.2 J、`docs/design/BALANCE.md`（変えない）
- 今の国の整理: `docs/design/COUNTRY-inventory.md`
- 指摘台帳: `docs/loop-ledger/COUNTRY-1.md`

## やること
0. 国の表を 1 か所に（12 国の 名前・ルビ・よみ・しるしの持ち主の 4 大・妖怪の重み）。
1. 妖怪の種類を 場所の国の行で えらぶ（場所 → 国 → 種類。強さは変えない）。
2. 「国に入った」の判定（180 コマ・地下は数えない）と 見つけた国の並び。スタートの はらっぱ は はじめから（しずかに）。
3. ばしょ の実績を 12 国に（`visit.country.*` ×12・`visit.countries`。うみ・てっぺん は のこす。古い 8 つは `legacy`・取った物だけ「むかしの ばしょ」）。

## やらないこと
名前のふだ（オーナー決定で なし）、しるし・見どころ（#187）、国の妖怪 36 体、宝箱（#195）、4 大妖怪・すみか・コンパス、がしゃどくろ。

## 作る係
- アート・サウンド: なし（新しい絵・音・画面なし。知らせは 今の実績のしくみ）。
- 開発: 表・妖怪のえらび方・判定と並び・実績 は 担当を分けられる（つなぎ目は 仕様 §3.3・§8 の名前）。

## 受け入れ基準と層
仕様 §9 の AC1〜AC21。ユニット 18 本（AC1〜8・11〜19）、E2E 1 spec（AC9・AC10）、UI 検査（AC20）、オーナー確認（AC21）。

## テスト準備で 見ること（tester。こわれうる 既存テスト）
- **妖怪の 乱数の順が かわる**（§3.3）: 自動で出す テスト `e2e/m3.spec.ts`・`e2e/m5.spec.ts`・`e2e/voxD-stream.spec.ts` と、`src/yokai/` の 出かたの ユニット。期待は 数を かえず「国の行で えらぶ」形に 直す（強さの期待は そのまま）。
- **スタートで `visit.country.harappa.1` が しずかに 1 つ取れる**: 実績の数を 数える テスト（`src/achievements/achievements.test.ts`・`e2e/achNext.spec.ts`・`e2e/live3-meat.spec.ts` の 取った数 など）。`achievements.reset()` を 使う テストは 影響なし。
- **国へ テレポートすると 実績・音・おめでとう画面が 出る**: `e2e/helpers/biome.ts`・`e2e/helpers/flora.ts` を使う spec（`voxI1-biome`・`flora75`・live1〜3 の 動物の spec・`sound1`）と `e2e/ui-gate.spec.ts`。おめでとう画面で 止まると こまる所は `biome.quiet(true)` を 共通の準備に入れる。
- 古い `visit.*`（regions）の 判定を 見ている テスト: 7 つ と `visit.all` は 取れなくなる。
- 関係する E2E: 新しい spec ＋ 上の spec ＋ smoke。
