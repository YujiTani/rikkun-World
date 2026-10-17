# FIX-yokai-block-dig: 妖怪のうしろのブロックが掘れてしまう（issue #34）

- 仕様: `docs/design/M3-combat.md` 70 行目・AC18（妖怪がじゃまをして、うしろのブロックはほれない）。
- WEAPON-3（`docs/design/WEAPON-3.md` §4.4）の左クリックの表では (3)「＋マークの先がブロック → ほる」が (4) 空ぶりより先なので、
  ＋マークの線でブロックより手前にいる、とどかない妖怪（パンチ 3.5 より遠い）を通りぬけて、うしろがほれていた。
- 直し方（yuzu に決定カードで確認中。推奨で進める）: §4.4 の (3) を「＋マークの線で ブロックより手前に妖怪がいない とき」だけにする。
  いれば (4) 空ぶり（刀はわざの空ぶり、ほかは腕をふる）。照準の下の案内・`attack.preview()` も同じ表なので合う。

## しらべてわかったこと（2026-10-17）
- 前の E2E の AC18(b) は置き方がまちがい（目から dirt の面 3.5 が妖怪の当たり 3.6 より手前で、ほれるのが正しかった）。差 0.1 なので結果がぶれる元だった。
- 妖怪の体がブロックに重なると、ai:false でも毎ステップ押し上げられて線から外れる。重ならない置き方にする（ちょうちん）。
- ＋マークの線は肩の点 S から出る。置き場所は `camera.get().shoulder` と `__aim.solve` で決める（rule #130）。

## テスト
- E2E `e2e/m3.spec.ts` AC18(b): 前提（線の上で妖怪がブロックより手前・ブロックは ほる線の中・パンチはとどかない）をゲームに聞いて確かめ、`attack.preview().use` = whiff、60 ステップほった量 0・dirt が残る・punchHit なし・妖怪は動かない。
- ユニット `src/combat/attackFacing.test.ts`: aim に `yokaiBeforeBlock: true` → whiff・rule 4。

## 実装
- `AttackInput.aim.yokaiBeforeBlock?: boolean` を足し、(3) の条件に `!yokaiBeforeBlock`。
- `DigSystem.buildDecision` で ＋マークの線（S から d、ブロックの距離まで）に妖怪が当たるかを `yokai().raycast` で見る。
