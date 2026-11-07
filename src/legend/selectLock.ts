/**
 * COOP-1 4d-2（docs/design/COOP-1.md 1.13 §3.6 (b)「もちもの画面」・AC105）: シャイニング中は 手の 物を かえさせない。
 * 今まで src/game/step.ts に 直接 書いて あった `nijiLockSel` を 1 つの 部品に した もの。1P も 2P も これを 使う（式の コピーなし）。
 * 2P の ときは 2P の ホットバー操作の「あとで」1 ステップに 1 回 呼ぶ（先に 呼ぶと その ステップの かえが 1 ステップ だけ 通る）。テストは legendLock.test.ts。
 */
export interface SelectLock {
  /** locked が false→true に なった ステップの えらびを おぼえ、true の あいだ 毎ステップ えらびが ちがえば もどす。false の ときは inv に さわらない */
  step(locked: boolean, inv: { selected(): number; select(i: number): void }): void;
}

export function createSelectLock(): SelectLock {
  let held = -1;
  return {
    step(locked, inv) {
      if (!locked) {
        held = -1;
        return;
      }
      if (held < 0) held = inv.selected();
      else if (inv.selected() !== held) inv.select(held);
    },
  };
}
