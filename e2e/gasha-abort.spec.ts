import { test, expect } from '@playwright/test';
import { openGasha, setupBoss, bare, CLEAN, type Leftovers } from './helpers/gasha';

/**
 * #293 攻撃の 途中で「休む（tired）／怒りが とける（angry(false)）／despawn()／hide(true)」しても、
 * 攻撃の 状態（当たり・エフェクト・雲・電気・光線・ひるみ・ゆれ）が 残らず、そのあと ダメージも 受けない。
 * 噴火の 燃えかす（すでに 地面に 落ちた もの）は 5 分 のこる 決まりなので、despawn・hide 以外では 数えない。
 * 時間では 待たない。コマで 進める。
 */
test.describe.configure({ timeout: 300_000 });

/** 攻撃ごとの「途中」のコマ（それぞれ 当たりや 雲が 出ている ころ） */
const MID: [string, number][] = [['slam2', 330], ['sweep', 170], ['beam', 380], ['eruption', 300], ['thunder', 420]];
type Kind = 'tired' | 'calm' | 'despawn' | 'hide';
/** 休む・despawn・hide（少女への 切りかえ）と、怒りが とける（calmSec = 5 分 殴られないと 攻撃の 途中でも 起きる）は 分けて 報告する */
const GROUPS: [string, Kind[]][] = [['休む(tired)・despawn・hide', ['tired', 'despawn', 'hide']], ['怒りが とける(angry(false))', ['calm']]];

interface Result { kind: Kind; before: Leftovers; after: Leftovers; damage: number; modeAfter: string; embersAfter: number }

for (const [group, KINDS] of GROUPS) for (const [name, mid] of MID) {
  test(`${name} の 途中で ${group} → 攻撃の 状態が 残らない・ダメージ 0`, async ({ page }) => {
    const errs = await openGasha(page);
    const results: Result[] = [];
    for (const kind of KINDS) {
      await setupBoss(page);
      const r = await page.evaluate(async ({ name, mid, kind }) => {
        const gt = (window as any).__gt, g = gt.big(), h = gt.h;
        // 当たりやすい 場所（体の 前 30 ブロック）に 立つ
        const stand = (up = 0) => { gt.put(64.5, 34.5, up); gt.heal(); };
        g.attack(name);
        gt.run(mid, () => stand());
        const before = gt.leftovers();
        if (kind === 'tired') g.tired(600);
        else if (kind === 'calm') g.angry(false);
        else if (kind === 'despawn') h.gasha.despawn();
        else g.hide(true);
        gt.taken.length = 0; h.combat.events();
        gt.run(12, () => stand());
        const after = gt.leftovers();
        const embersAfter = (() => { try { return g.attackInfo().eruption.embers as number; } catch { return -1; } })();
        // そのあと 長く 立ち続けても ダメージを 受けない
        gt.run(420, () => stand());
        const damage = gt.takenTotal();
        let modeAfter = '';
        try { modeAfter = g.attackInfo().mode; } catch { /* despawn 後 */ }
        return { kind, before, after, damage, modeAfter, embersAfter };
      }, { name, mid, kind });
      results.push(r as Result);
    }
    for (const r of results) {
      const tag = `${name} / ${r.kind}`;
      // 途中だった ことの 確認（何かが 出ていた）
      expect.soft(r.before.mode, `${tag}: 途中で 攻撃中`).toBe('attack');
      const keepEmbers = r.kind !== 'despawn' && r.kind !== 'hide';
      const left = { ...bare(r.after) };
      if (keepEmbers) left.eruptionEmbers = 0;
      expect.soft(left, `${tag}: 攻撃の 状態が 残らない`).toEqual(CLEAN);
      expect.soft(r.damage, `${tag}: そのあと ダメージ 0`).toBe(0);
    }
    expect(errs).toEqual([]);
  });
}
