# WEAPON-9: 虹（にじ）— WEAPON-7 の PR3（強さ 4〜10・ためわざ シャイニング・にじ色の 斬撃）

| 項目 | 内容 |
|---|---|
| issue | #70（WEAPON-7 の さいごの 1 本。この PR で Closes #70） |
| ブランチ | `claude/weapon-9-niji`（main から） |
| 状態 | 開発中（PR-2 虹。テスト準備 合格ずみ） |
| 周回数（全ループ合計） | 0 / 10 |

## 目的（オーナーの言葉そのまま、2026-10-21 yuzu）
「もう一本まだ実装してないレジェンダリーの刀の虹ってのがあるんだけど、これの開発を別セッションですすめたい」

## もう 決まっていること（オーナー決定）
`docs/decisions/2026-10-18-legendary-weapons.md`
- 10 行目: **虹（にじ）**: 落ちるたびに 強さが 4〜10 で ランダム。ためわざは **シャイニング** — 両手を 上げて ゆっくり 空中に うかび、まわりに ドームの オーラ（半径 7 マス）。ふれると 大ダメージ。エフェクトは **にじ色の 斬撃**。
- 22 行目（見た目）: おもちゃの 光る 刀。まっすぐな 刃が 中から にじ色（緑・青・赤むらさき）に 光る（見本 `weapon7/ref/niji.png`。他人の 絵なので リポジトリに 入れない）。
- 28 行目（名前）: 漢字に ルビ **［虹｜にじ］**。「にじの けん」は 使わない。id は `niji`。
- シャイニングの 見本（shining.jpg・dome.png）: まん中が 白く 強く 光る 大きな 球・ドーム。ふちは 光る リング、まわりに にじ色の 光の 帯が うずを まいて 飛ぶ。中に 光の かけら・つぶが 舞う。
- 47 行目（体の 動き）: 男の子の Meshy GLB の **WallFlip の 後半** を シャイニングの 体の 動きに 使う 案。3 連続攻撃用（コンボ用）・なぎなたを 振りまわす skill2 も ある。**PR3 に 取りかかる とき GLB の 置き場所と 中身は オーナーに 聞く**。
- 68 行目: レジェンダリーも 3 段攻撃 → `bladeCombo.items` に **虹も 入れる**。
- 仕様 2.2 の 数（オーナー確認① すみ）: 強さ 4〜10 は 同じ 重さ・うかぶ 2 マス・4 秒・ダメージ 強さ × 2.5・同じ 妖怪に 1 秒に 1 回・中は 安全・おわったら 10 秒 休み・たいきゅう 10000。ヌシの 表は ランダム。

## 仕様
- 本体は `docs/design/WEAPON-7.md` §5（虹）・§11 PR3 の AC28〜AC34・§12。**新しく 仕様は 作らず、WEAPON-7 仕様の 版 2.3 で 次を 足す**（designer → design-reviewer）:
  1. 体の 動きを 「上段の かまえの 使い回し」から **GLB の WallFlip 後半**（オーナーの 答え しだい）へ。女の子キャラの とき どうするか。
  2. 3 段攻撃に 虹（68 行目。雷神剣と 同じ: つなぎの 窓で 次の 段、窓の 外は ための 先行入力）。
  3. 絵は **新しい 作り方**（`docs/art/PIPELINE.md`・DESIGN.md 17・18 章、決定 `2026-10-21-thunder-b-billboard.md`）: 「常に カメラに 正面・一番 決まる 絵が 出る・ペラペラに 見せない」。ドームの まく・リングは 3D、帯・かけらは ビルボードの ドット絵 など。エフェクト 1 つの 上限（描画回数 4・三角形 150）を ドームでは どう 数えるか。
  4. 性能: シャイニングも **最初の 1 回で 材質の 作りなおしが 起きない**（`docs/tickets/PERF-thunder-warmup.md` と 同じ 先に あたためる 作り）。一人称で 画面が 白く ならない。
  5. ための 光・音は WEAPON-8 で 作り直した 共通の もの（`src/legend/chargeLight.ts` など）を 使う（WEAPON-8 の マージ後）。

## 進め方（CLAUDE.md「1 つの issue の進め方」）
1. デザイン: designer（版 2.3）→ design-reviewer → オーナー確認①（足した 所だけ）。
2. アート: 刀の アイコン・手に 持つ 絵・にじの 斬撃・ドーム（帯・かけら）。art-director → pixel-artist → art-reviewer → オーナー。**方向の 3 案 → yuzu が 選ぶ**（決定 `2026-10-21-niji-three-options.md`）。PixelLab は lite だけ（呼ぶ 前後の 残りを `art/WEAPON-9/pixellab/` に 記録。上限 3 回）。体の 動き（GLB → スプライト）は GLB しだい。
3. サウンド: `shiningStart`・`shiningHit`・`shiningEnd`・`shiningReady`（sound-director → sfx-designer → audio-reviewer → オーナー試聴）。
4. ゲームに 入れた 試作の スクショで オーナーの OK（テストの 準備の 前）。
5. tester が AC28〜AC34 ＋ 版 2.3 の 基準の E2E（赤）→ code-reviewer。ブランチの 最初の コミット。
6. developer → code-reviewer ＋ 検証（UI 検査・ui-reviewer・tester）。
7. 性能の 前後（描画回数・三角形・処理時間。シャイニング中・最初の 1 回）。
8. PR は オーナーが「作って いい」と 言ってから。見た目が 変わるので マージは オーナー。

## ぶつかりそうな 所（WEAPON-8 = `claude/weapon-8-fujin`、#239）
WEAPON-8 が 大きく さわっている: `src/legend/LegendSystem.ts`（ための 光・ためわざ）・`src/legend/WaveSystem.ts`・`src/fx/thunderFx.ts`・`src/fx/legendSounds.ts`・`src/fx/sfxCatalog.ts`・`src/main.ts`・HUD（`src/ui/buffIcons*`）・`src/legend/chargeLight.ts`・`handPos.ts`（新しい）。
虹も `LegendSystem.ts`（`shining`）・`legendSounds.ts`・`sfxCatalog.ts`・`main.ts`・`contracts.ts` を さわる。
→ **PO の おすすめ: WEAPON-8 を 先に マージ → この ブランチに main を 取りこんでから 実装**（デザイン・アート・音は その前に 進めて よい）。マージの 順は オーナーに 聞く。

## 関連
- 仕様: `docs/design/WEAPON-7.md`（§5・AC28〜AC34）、`docs/design/ART-PIPE-1.md`、`docs/art/DESIGN.md` 17・18 章、`docs/art/PIPELINE.md`、`docs/art/MOTION.md`、`docs/design/BALANCE.md`
- 前の 2 本: `docs/tickets/WEAPON-7.md`、`docs/tickets/ART-PIPE-1.md`、`docs/tickets/PERF-thunder-warmup.md`、`docs/tickets/WEAPON-8.md`（別ブランチ）
- 指摘台帳: `docs/loop-ledger/WEAPON-9.md`

## オーナーへの 質問（2026-10-21）
1. 男の子 GLB（WallFlip・コンボ・skill2）の 置き場所と 中身。このセッションからは 共有フォルダ（`/mnt/project-files/`）が 見えない。
2. 見本の 絵（niji.png・shining.jpg・dome.png）を チャットに もらえるか。
3. マージの 順（WEAPON-8 の あと が おすすめ）。

## 経過（PO が追記）
| 日付 | ループ | 結果 | メモ |
|---|---|---|---|
| 2026-10-21 | 準備 | タスク票を 作った | 仕様は WEAPON-7 §5 が ある（確認① すみ）。足す 所を 版 2.3 で |
| 2026-10-21 | 素材 | yuzu が 男の子 GLB（`Meshy_AI_Silver_Maple_Shrine_A_All_Animations_1.glb`、26.5MB、17 モーション。Wall_Flip 2.0 秒・Triple_Combo_Attack・Weapon_Combo_1・Skill_02 など）を チャットで くれた。リポジトリに 入れない（PO の 作業フォルダ）。「この GLB は 手足が 短いので、実際には 直している」→ CHAR-5 の 撮り方（頭 −20 度・腕 1.6 倍、`render_boy.py`）と 同じ 直しを して 撮る | |
| 2026-10-21 | デザイン | 仕様 2.3（§5.4〜5.9・AC34〜AC47）→ design-reviewer 合格（重大 0・軽微 7） | |
| 2026-10-21 | 質問 | yuzu: GLB と 見本の 絵は チャットに 送る。マージは **WEAPON-8 の あと**。絵の 3 案は「3案なしになったっけ？」→ 「3案から選びたい」（決定 `2026-10-21-niji-three-options.md`） | 実装は WEAPON-8 マージ後に main を 取りこんでから |
| 2026-10-21 | アート | 3 案を yuzu に 送った。yuzu「Aの案で中はもっとひからせて」（A と 読んで 確かめ中）「斬撃は○案がいい」（どの 案か 確かめ中）。アイコンは 3 案とも NG →「虹は刀なので、刀の波紋（刃文）を虹色に」。柄は 三日月宗近 太刀の 見た目（金茶の 糸巻き・赤い ひし形・金の 金具・木瓜四方透かし鍔。見本は 他人の 絵 → リポジトリに 入れない） | 刃の そり は 確かめ中 |
| 2026-10-21 | サウンド | yuzu が 虹の 斬撃音の 見本を くれた（`sen_ka_katana_kirikizamu02.mp3`、6.0 秒・モノラル。「虹の斬撃音はこんなかんじかな」）。出どころ・ライセンスは 確かめ中 → それまでは 見本として 聞くだけ。弾を かき消す 音（決定 追加）も サウンドで 作る | |
| 2026-10-21 | 試作 | ゲーム内の 試作（`claude/weapon-9-proto`、マージしない）→ yuzu の 直し（決定 `2026-10-21-niji-proto-feedback.md`）: ドーム こまかく（150 の 例外）・もっと 引いて よい・斬撃 A OK・ため中は 中心へ 集まる 光／完了で 右手・ユニーク武器 ぜんぶ 手持ちの 絵・斬撃と 真空波は カメラの 向きで 絵を 変える。雷神剣・風神剣の 分も この issue で | 仕様 2.5 へ |

## 引きつぎ（2026-10-21 PO。止まっても ここから 動ける ように）
- 決まった こと: `docs/decisions/2026-10-21-niji-*.md`（3 案・見た目・音・カメラ・ダメージ・試作の 直し・すいこみ）。仕様 `docs/design/WEAPON-7.md` 版 2.6（合格）。
- PR の 分け方: **PR-2 = 虹（この ブランチ、先）**、PR-1 = 共通の 直し（ための 光 3 本・雷神剣と 風神剣の 手持ち・真空波の 向き。あとで 別ブランチ）。男の子の 手持ちは #242。
- 絵: ドーム・斬撃・アイコン OK（`docs/art/WEAPON-9/final.png`）。手持ち（女の子・刃を 長く した 版）も OK。
- 音: 斬撃 C3（見本 切りはり・配らない前提）、弾 消し・シャイニング 4 つ・domePull は B。すべて OK。
- テスト: `e2e/weapon9-niji.spec.ts`（赤→ 実装待ち）・ユニットの 期待直し。code-reviewer 合格。
- 次の 1 手: developer が PR-2 を 実装中（すいこみ AC53〜58 も）。終わったら code-reviewer ＋ 検証（UI 検査・tester）→ ゲーム内の スクショで オーナー確認（AC34・47・52・59）→ PR は オーナーが「作って いい」と 言ってから。
| 2026-10-21 | PR | yuzu「PR もあなたの判断で作って」→ PO が 検証 合格の あとに PR を 作って よい（マージは オーナー） | |

## 引きつぎ 2（2026-10-22 PO。週の 利用上限で 止まった。解除 2026-10-22 21:00 UTC）
**どこまで**: PR-2（虹）の 実装・ユニット・E2E（weapon9-niji 6 本 緑）・コードレビュー 2 人 合格（重大 0）・軽微 6 件の 直し（6b03284）まで。ブランチ `claude/weapon-9-niji` に push ずみ。PR は まだ（オーナー「PR も PO の 判断で 作って よい」。見た目が 変わるので マージは オーナー）。

**のこり（この 順）**
1. developer: (a) `legend.nijiFx().info()` に `draws` を 足す（AC42 が 描画回数を 見て いない）。(b) testHook に「カメラだけ 体の 向きから ずらす」口（例 `camera.yawOffset(deg)`）か 向きを 決めて 斬撃を 出す 口（side/flat を 撮り分ける ため。遊びは 変えない）。(c) **ドームの りんかくが まだ 多角形**（`docs/art/WEAPON-9/verify/dome-third-F100.png`）→ 三角形 220 以内で 経度を 多く・緯度を 少なく／シェーダーで ふちを 丸く。heldTools の mergedCache の 解放（軽微）も。
2. tester: `e2e/weapon9-verify-shots.spec.ts` は 重い（600 秒）ので CI が 回さない 所へ 移す（試作の `art/WEAPON-9/proto-shoot.spec.ts` と 同じ）。撮り直し: ドーム（なめらか）・**妖怪を 置いた すいこみ中**（今の 4 枚は 妖怪も ドームも 映って いない）・斬撃 side/flat・手持ち（刃が 見える コマ）。`npm run check:ui` を もう 1 回（congrats・craft-detail・rarity-7 の 落ちた 記録が 同じ 実行か 不明）。
3. code-reviewer（同じ 観点）で 1・2 を 見る → PO が draft PR（`Closes #70`。本文に AC ごとの 層・スクショ・性能の 前後・on-jin の 音は 配らない 前提）→ スクショを オーナーへ（SendUserFile）→ CI 緑 ＋ オーナー OK で ready。
4. あとで: PR-1（ための 光 3 本・雷神剣と 風神剣の 手持ち〈絵の 関数は `art/WEAPON-9/held/build.py` に ある〉・真空波の 向き）を 別ブランチで。男の子は #242。

**依頼文（1 の developer へ）**: 「issue #70 / docs/tickets/WEAPON-9.md の『引きつぎ 2』の のこり 1 を やって。仕様 docs/design/WEAPON-7.md 版 2.6。e2e/ は さわらない。npm run check:fast と e2e/weapon9-niji.spec.ts。コミットして push。返事は 短く（直した 所・ドームの スクショの パス）」
