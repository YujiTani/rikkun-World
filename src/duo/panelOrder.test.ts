import { describe, expect, it } from 'vitest';
import { PanelOrder } from './panelOrder';

/**
 * COOP-1 4c（docs/design/COOP-1.md §3.3「同じ ステップは 1P が 先」・§8 の 4c の 宿題 3・AC93・AC94）の 先行テスト（赤）。
 * たんす・かまどの 中身に かける 操作の 順番だけを 見る（中身の 変わり方は src/storage/tansuView.test.ts・src/craft/furnaceWorld.test.ts）。
 *
 * ---- 実装への 約束（新しい ファイル src/duo/panelOrder.ts。DOM を 使わない）----
 *   class PanelOrder
 *     submit(who: 1 | 2, op: () => void): void   … その ステップに やる 操作を 預かる（すぐには やらない）
 *     flush(): number                              … 1 ステップに 1 回。預かった 操作を「1P の 物ぜんぶ → 2P の 物ぜんぶ」の 順に やって 空に する。
 *                                                    同じ 人の 物は 預けた 順。やった 数を 返す。操作の 中で submit した 物は 次の flush で やる（その flush では やらない）。
 *   配線: 1P・2P の パネルの 操作（パッド・キー・ボタン。ステップの 中で 起きる 物）は PanelOrder に 預け、毎ステップ 1 回 flush する。
 *         1P の マウス（ステップの あいだに 来る DOM イベント）は ステップの はじめより 前に 起きるので すぐ やってよい（どちらでも 1P が 先に なる）。
 *         ここを 通さない 道を 作らない（試作は 2P の 入力の 方が 先に 走る ことが あった）。
 */

describe('PanelOrder: 同じ ステップは 1P が 先（たんすも かまども）', () => {
  it('2P が 先に 預けても、1P の 操作が 先に 走る', () => {
    const order = new PanelOrder();
    const ran: string[] = [];
    order.submit(2, () => ran.push('2P-a'));
    order.submit(1, () => ran.push('1P-a'));
    order.submit(2, () => ran.push('2P-b'));
    order.submit(1, () => ran.push('1P-b'));
    expect(ran).toEqual([]); // flush まで やらない
    expect(order.flush()).toBe(4);
    expect(ran).toEqual(['1P-a', '1P-b', '2P-a', '2P-b']); // 同じ 人の 中は 預けた 順
  });

  it('flush で 空に なる（2 回 目は 0 こ。同じ 操作を くりかえさない）', () => {
    const order = new PanelOrder();
    let n = 0;
    order.submit(1, () => n++);
    expect(order.flush()).toBe(1);
    expect(order.flush()).toBe(0);
    expect(n).toBe(1);
  });

  it('2P だけ・1P だけでも やる', () => {
    const order = new PanelOrder();
    const ran: number[] = [];
    order.submit(2, () => ran.push(2));
    order.flush();
    order.submit(1, () => ran.push(1));
    order.flush();
    expect(ran).toEqual([2, 1]);
  });

  it('操作の 中で 預けた 物は 次の flush まで やらない（同じ ステップで 終わらなく ならない）', () => {
    const order = new PanelOrder();
    const ran: string[] = [];
    order.submit(1, () => {
      ran.push('1P');
      order.submit(1, () => ran.push('1P-later'));
    });
    order.submit(2, () => ran.push('2P'));
    expect(order.flush()).toBe(2);
    expect(ran).toEqual(['1P', '2P']);
    expect(order.flush()).toBe(1);
    expect(ran).toEqual(['1P', '2P', '1P-later']);
  });
});
