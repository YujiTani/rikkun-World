import { describe, expect, it } from 'vitest';
import { ChunkedVoxelWorld } from './VoxelWorld';
import { populateWorld } from './gen/populate';

/**
 * 「見えない」印の広げ方: ふさがったブロックだけでなく、空にとどいていない（囲まれた）地下の空気だけの所も「見えない」。
 * 生成のときの洞くつ（読みこみで入ってくる）と、プレイヤーがほった穴（setBlock / fill）はちがう:
 * ほった穴は、いつも「空にとどいている」ことにする（見える側にまちがえる）。
 */

type Cavity = (lx: number, lz: number) => boolean;

/** 3×3 列。y 0〜39 は石、その上は空気。cavity(列, ローカル箱) の空気は「読みこみ」で入る（ほった穴ではない） */
function build(cavity: (cx: number, cz: number, tmp: ChunkedVoxelWorld) => void, y = 64): ChunkedVoxelWorld {
  const w = new ChunkedVoxelWorld({ x: 0, z: 0, y });
  for (let cz = 0; cz < 3; cz++) {
    for (let cx = 0; cx < 3; cx++) {
      const tmp = new ChunkedVoxelWorld({ x: 16, z: 16, y });
      tmp.fill(0, 0, 0, 15, 39, 15, 'stone');
      cavity(cx, cz, tmp);
      w.loadColumn({ cx, cz, sections: tmp.column(0, 0)!.sections.slice() });
    }
  }
  return w;
}

const none: Cavity = () => false;
void none;

describe('囲まれた空気は「見えない」', () => {
  it('1 つのセクションの中の囲まれた空洞', () => {
    const w = build((cx, cz, t) => {
      if (cx === 1 && cz === 1) t.fill(4, 20, 4, 10, 26, 10, 'air');
    });
    expect(w.isSectionHidden(1, 1, 1)).toBe(true);
    expect(w.isSectionHidden(1, 0, 1)).toBe(true);
    expect(w.isSectionHidden(1, 2, 1)).toBe(false); // 上は空にふれる
  });

  it('セクションをまたぐ囲まれたトンネル', () => {
    const w = build((cx, cz, t) => {
      if (cx === 1 && cz === 1) t.fill(4, 14, 6, 10, 17, 6, 'air');
    });
    expect(w.isSectionHidden(1, 0, 1)).toBe(true);
    expect(w.isSectionHidden(1, 1, 1)).toBe(true);
  });

  it('地上につながったトンネルは「見えない」ではない', () => {
    const w = build((cx, cz, t) => {
      if (cx === 1 && cz === 1) {
        t.fill(4, 14, 6, 10, 17, 6, 'air');
        t.fill(10, 17, 6, 10, 50, 6, 'air'); // たて穴
      }
    });
    expect(w.isSectionHidden(1, 0, 1)).toBe(false);
    expect(w.isSectionHidden(1, 1, 1)).toBe(false);
  });

  it('読みこんでいない列にふれる空洞は「見えない」ではない', () => {
    const w = build((cx, cz, t) => {
      if (cx === 0 && cz === 1) t.fill(0, 20, 6, 4, 22, 8, 'air'); // x = 0 は 列の外にふれる
    });
    expect(w.isSectionHidden(0, 1, 1)).toBe(false);
  });

  it('囲まれた空洞に ほって入ると、空洞のセクションが 見えるようになり、作り直しに入る', () => {
    const w = build((cx, cz, t) => {
      if (cx === 1 && cz === 1) t.fill(4, 14, 6, 10, 17, 6, 'air'); // sy 0 と 1 にまたがる
    });
    for (let sy = 0; sy < 4; sy++) w.isSectionHidden(1, sy, 1);
    expect(w.isSectionHidden(1, 1, 1)).toBe(true);
    w.takeDirtySections();
    w.setBlock(16 + 11, 14, 16 + 6, 'air'); // 空洞のとなりの石をほる（sy 0）
    expect(w.isSectionHidden(1, 0, 1)).toBe(false);
    expect(w.isSectionHidden(1, 1, 1)).toBe(false); // つながった上のセクションも
    const dirty = w.takeDirtySections().map((s) => `${s.cx},${s.sy},${s.cz}`);
    expect(dirty).toContain('1,0,1');
    expect(dirty).toContain('1,1,1');
  });

  it('ほった穴は いつも「見える」側（囲まれていても）', () => {
    const w = build(() => {});
    w.setBlock(24, 20, 24, 'air'); // 先にほる → そのあと はじめて印を計算
    expect(w.isSectionHidden(1, 1, 1)).toBe(false);
    const w2 = build(() => {});
    w2.isSectionHidden(1, 1, 1);
    w2.setBlock(24, 20, 24, 'air');
    expect(w2.isSectionHidden(1, 1, 1)).toBe(false);
    w2.setBlock(24, 20, 24, 'stone'); // 埋めなおせば ふさがる
    expect(w2.isSectionHidden(1, 1, 1)).toBe(true);
  });

  it('fill(air) でほった所も「見える」側', () => {
    const w = build(() => {});
    w.isSectionHidden(1, 1, 1);
    w.fill(20, 20, 20, 26, 26, 26, 'air');
    expect(w.isSectionHidden(1, 1, 1)).toBe(false);
  });

  it('空洞の中を石でうめても 空洞はもう 空にふれたことのあるまま（ちぢまない）', () => {
    const w = build((cx, cz, t) => {
      if (cx === 1 && cz === 1) t.fill(4, 20, 4, 10, 26, 10, 'air');
    });
    w.isSectionHidden(1, 1, 1);
    w.setBlock(16 + 11, 22, 16 + 6, 'air');
    expect(w.isSectionHidden(1, 1, 1)).toBe(false);
    w.setBlock(16 + 11, 22, 16 + 6, 'stone');
    expect(w.isSectionHidden(1, 1, 1)).toBe(false);
  });
});

describe('世界のふちの地下', () => {
  it('edgeClosedBelow より下は、読みこんでいない列にふれていても「見えない」', () => {
    const w = build(() => {});
    expect(w.isSectionHidden(0, 1, 1)).toBe(false); // もともと: ふちの列
    w.edgeClosedBelow = 32;
    const w2 = build((cx, cz, t) => {
      if (cx === 0 && cz === 1) t.fill(0, 20, 6, 4, 22, 8, 'air'); // x = 0 は 列の外にふれる
    });
    w2.edgeClosedBelow = 32;
    expect(w2.isSectionHidden(0, 1, 1)).toBe(true); // y 16〜31 < 32
    expect(w2.isSectionHidden(0, 2, 1)).toBe(false); // y 32〜47 はふさがれていない
  });
});

describe('実際の世界（seed 20261012）', () => {
  it('囲まれた地下のセクションが ふえて「見えない」になり、計算は 600ms 以内（さいしょの計算。JIT 前）', () => {
    const w = new ChunkedVoxelWorld({ x: 0, z: 0 });
    populateWorld(w, 20261012);
    const t0 = performance.now();
    let hidden = 0;
    let nonEmpty = 0;
    for (const { cx, cz } of w.loadedColumns()) {
      for (let sy = 0; sy < 22; sy++) {
        const s = w.section(cx, sy, cz);
        if (!s || (s.kind === 'uniform' && s.block === 0)) continue;
        nonEmpty++;
        if (w.isSectionHidden(cx, sy, cz)) hidden++;
      }
    }
    const ms = performance.now() - t0;
    expect(nonEmpty).toBeGreaterThan(300);
    expect(hidden / nonEmpty).toBeGreaterThan(0.4);
    expect(ms).toBeLessThan(600);
  });
});
