# 仕様書の目次（機能ごとの「今の 1 本」）

- **きまり（#312）**: 同じ機能の仕様は、この表の「今の 1 本」を直して版を上げる。版ごと・直しごとに新しいファイルを作らない。古い版と終わった計画は `docs/archive/`（目次 `docs/archive/README.md`）。
- 前の機能の決まりを、あとの仕様書が変えた所には、前の仕様書のその行に「→ 〇〇 §x で変わった」の注記がある。「あとで変えた本」の列も見る。
- 見た目の決まりは `docs/art/DESIGN.md`（章の目次）、音は `docs/audio/`、オーナーの決定は `docs/decisions/`（決定と仕様がちがえば決定が正）。

| 機能 | 今の 1 本 | 土台（先に読む） | あとで変えた本 |
|---|---|---|---|
| 世界（小さな島） | `M1-01-world.md` | — | `M5-world.md`・`VOX-I.md` |
| 移動と視点 | `M1-02-movement.md` | M1-01 | — |
| ほる・おく・持ち物 | `M2-dig-inventory.md` | M1 | — |
| 戦う（昼と夜・妖怪・体力） | `M3-combat.md` | M2 | `BALANCE.md` |
| 妖怪 4 体の形と動き | `M3-yokai-candidates.md`（設計書。数は M3-combat が正） | — | `M3-combat.md` |
| 作る（クラフト・道具・武器・防具） | `M4-craft.md` | M2 | `CRAFT-2.md`・`WEAPON-2.md` |
| 広い世界 | `M5-world.md` | M1-01 | `VOX-I.md` |
| 作る画面と実績 | `M6-ui-achievements.md` | M4 | — |
| 9×9×9 の世界のつくり（光・メッシュ・見えない所） | `VOX-plan.md`（§7 保存・§9 の作業は古い。注記あり） | — | `VOX-I.md` |
| 地形の国（12 の国） | `VOX-I.md` | VOX-plan・M5 | `COUNTRY-1.md` |
| 国の土台（国の表・国の妖怪・国の実績） | `COUNTRY-1.md` | VOX-I・M6 | — |
| 草・花 | `FLORA-75.md` | VOX-I・M7-farm | — |
| 影 | `SHADOW.md` | — | — |
| 強さのしくみ（場所・色ちがい・二つ名） | `BALANCE.md` | M3・M4・WEAPON-2 | — |
| めずらしさ 7 段 | `RARITY-7.md` | — | — |
| **アイテムの登録表（しくみ）** | `ITEM-REGISTRY.md` | — | — |
| どこでも作れる・ログ・半透明 UI | `CRAFT-2.md` | M4・M6・M7・WEAPON-2 | — |
| 畑 1: はたけの基本 | `M7-farm.md` | オーナーの元資料 `M7/`（果物・料理など、これからの案もここ） | `M7-2-farm.md`・`BUCKET-1.md` |
| 畑 2: じょうろ・スプリンクラー・なでる | `M7-2-farm.md` | M7-farm | `BUCKET-1.md` |
| 畑 3: バケツ | `BUCKET-1.md` | M7-2 | — |
| 畜産 1: にわとりとなかよく | `LIVE-1.md` | — | `LIVE-2.md`（版 4）・`LIVE-4.md` |
| 畜産 2: こたつ・ひよこ・とりごや（直し LIVE-2.1 を版 4 に入れた） | `LIVE-2.md` | LIVE-1 | `LIVE-3.md`・`LIVE-4.md` |
| 畜産 3: お肉をやいて食べる | `LIVE-3.md` | LIVE-2 | — |
| 畜産 4: マッチョといっしょに戦う | `LIVE-4.md` | LIVE-1〜3 | — |
| 金の装備・なつき度・はらぱんみみず | `GOLD-1.md` | — | `ITEM-REGISTRY.md`（値の置き場所） |
| こんごう（ダイヤ）の装備 ★6 | `KONGO-1.md` | GOLD-1・MINE-1・RARITY-7 | `ITEM-REGISTRY.md`（値の置き場所） |
| 忍者の防具 | `NINJA-1.md` | — | — |
| 侍の防具 | `SAMURAI-1.md` | NINJA-1 | — |
| 弓矢と刀の作り直し | `WEAPON-2.md` | M4 | `WEAPON-3.md`・`WEAPON-4.md` |
| 攻撃をキャラの向きへ | `WEAPON-3.md` | WEAPON-2・CHAR-1・CHAR-2 | — |
| 刀の 3 つのわざ | `WEAPON-4.md` | WEAPON-2・3・CHAR-2・CHAR-4 | — |
| パリィ | `WEAPON-5.md` | WEAPON-2〜4・CHAR-2 | — |
| きらめくカタナの 3 段攻撃 | `WEAPON-6.md` | WEAPON-2〜5・CHAR-2・CHAR-4・RARITY-7 | — |
| レジェンダリー武器・ヌシのドロップ | `WEAPON-7.md` | WEAPON-2〜6・RARITY-7 | `WEAPON-8.md`（風神剣）・`ART-PIPE-1.md`（雷の見た目） |
| 風神剣のアップデート | `WEAPON-8.md` | WEAPON-7 | — |
| 雷神剣の雷 B・アイコン | `ART-PIPE-1.md` | WEAPON-7 | — |
| キャラの 8 方向ドット絵 | `CHAR-1-v2-sprite.md` | — | `CHAR-5.md` |
| 弓と刀の動きの絵 | `CHAR-2.md` | CHAR-1・WEAPON-2 | — |
| 刃の軌跡と色 | `CHAR-4.md` | CHAR-2 | — |
| 男の子のキャラ（キャラのしくみ） | `CHAR-5.md` | CHAR-1・2・4・START-1・WEAPON-5 | — |
| スタートメニュー | `START-1.md` | — | — |
| ルールブック（3D の本） | `BOOK-1.md` | — | — |
| 建築士さんの ハウジング（家・くら・せっけいず） | `HOUSE-1.md` | COUNTRY-1・BOOK-1・LIVE-2 | — |
| 炭鉱（地下の 3 つの 層・鉱石・新しい 鉱物・坑道・ほらあなの 種類・地下の 妖怪） | `MINE-1.md` | M5-world・VOX-I・GOLD-1・RARITY-7 | — |

新しい機能の仕様書を足したら、この表に 1 行足す。テンプレートは `_template.md`。
