import { describe, expect, it } from 'vitest';
import { clusterPlace } from './clusterPlace';
import { CLUSTER } from './tuning';

/** HOUSE-1E AC57・AC35c: そばの ボタンは 方眼の はこ（かべの 帯 こみ）から はみ出さず、見えて いる 家具に かさならない */

const B = 16;
const hit = (a: { l: number; t: number; r: number; b: number }, c: { l: number; t: number; r: number; b: number }): boolean => a.l < c.r && a.r > c.l && a.t < c.b && a.b > c.t;

describe('clusterPlace', () => {
  for (const cell of [48, 54, 61]) {
    for (const n of [5, 7, 9]) {
      it(`マス ${cell}px・${n}×${n}: 方眼の どの 場所の 家具(1×1〜3×3 の 四角、はみ出し こみ)でも はこから 出ず、家具に かさならない`, () => {
        const W = n * cell + 2 * B;
        const H = n * cell + 2 * B;
        let tried = 0;
        for (let fw = 1; fw <= 3; fw++) {
          for (let fd = 1; fd <= 3; fd++) {
            for (let x = -(fw - 1); x < n; x++) {
              for (let z = -(fd - 1); z < n; z++) {
                const furn = { l: Math.max(0, B + x * cell), t: Math.max(0, B + z * cell), r: Math.min(W, B + (x + fw) * cell), b: Math.min(H, B + (z + fd) * cell) };
                const p = clusterPlace({ w: W, h: H }, { l: B + x * cell, t: B + z * cell, r: B + (x + fw) * cell, b: B + (z + fd) * cell }, CLUSTER);
                const box = { l: p.left, t: p.top, r: p.left + CLUSTER.w, b: p.top + CLUSTER.h };
                const where = `${fw}×${fd} (${x}, ${z})`;
                expect(box.l >= 0 && box.t >= 0 && box.r <= W && box.b <= H, `${where} は はこの 中`).toBe(true);
                // 家具が はこの いちばん 下の 行まで ある 大きな 家具は 上にも 下にも 入らない ことが ある（5×5 の 3 マス）。ふつうの 大きさでは かさならない
                if (n >= 7 || fd < 3) expect(hit(box, furn), `${where} は 家具に かさならない`).toBe(false);
                tried++;
              }
            }
          }
        }
        expect(tried).toBeGreaterThan(0);
      });
    }
  }

  it('上に 入れば 上、入らなければ 下。しっぽは 家具の まん中', () => {
    const W = 9 * 54 + 32;
    const mid = clusterPlace({ w: W, h: W }, { l: B + 4 * 54, t: B + 4 * 54, r: B + 5 * 54, b: B + 5 * 54 }, CLUSTER);
    expect(mid.side).toBe('above');
    const top = clusterPlace({ w: W, h: W }, { l: B, t: B, r: B + 54, b: B + 54 }, CLUSTER);
    expect(top.side).toBe('below');
    expect(top.top).toBe(B + 54 + CLUSTER.gap);
    expect(top.left).toBe(0);
  });

  it('1E: 右下の すみの ふとん(1×2)が はみ出して 帯の 上まで ある とき、見えて いる 四角(はこで 切る)の 下には 入らず 上に 出る', () => {
    const cell = 54;
    const W = 5 * cell + 2 * B;
    const p = clusterPlace({ w: W, h: W }, { l: B + 4 * cell, t: B + 4 * cell, r: B + 5 * cell, b: B + 6 * cell }, CLUSTER);
    expect(p.side).toBe('above');
    expect(p.left + CLUSTER.w).toBeLessThanOrEqual(W);
  });
});
