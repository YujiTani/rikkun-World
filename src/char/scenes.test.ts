// CHAR-2 AC1〜AC11: 場面の えらび方と コマ（MotionMachine。絵の読みこみとは 関係ない純粋な決まり）
import { describe, expect, it } from 'vitest';
import { MotionMachine, type SpriteStepInput } from './motion';
import { techCell } from '../tools/blade/advance';
import { TECH_CURVES, TECH_PHASES } from './techCurves';
import type { BladeStance, BladeTech, BladePhase } from '../contracts';

type BladeIn = NonNullable<SpriteStepInput['blade']>;
type BowIn = NonNullable<SpriteStepInput['bow']>;

interface O {
  vx?: number;
  vz?: number;
  vy?: number;
  onGround?: boolean;
  inWater?: boolean;
  running?: boolean;
  facingDeg?: number;
  weapon?: SpriteStepInput['weapon'];
  stance?: BladeStance;
  tech?: BladeTech | null;
  phase?: BladePhase;
  frame?: number;
  lengths?: BladeIn['lengths'];
  bow?: Partial<BowIn> | null;
}
const inp = (o: O = {}): SpriteStepInput => {
  const weapon = o.weapon ?? 'none';
  return {
    position: { x: 0, y: 0, z: 0 },
    velocity: { x: o.vx ?? 0, y: o.vy ?? 0, z: o.vz ?? 0 },
    onGround: o.onGround ?? true,
    inWater: o.inWater ?? false,
    running: o.running ?? false,
    facingDeg: o.facingDeg ?? 0,
    weapon,
    blade:
      weapon === 'katana'
        ? { stance: o.stance ?? 'chudan', tech: o.tech ?? null, phase: o.phase ?? 'idle', frame: o.frame ?? 0, lengths: o.lengths ?? null }
        : null,
    bow: weapon === 'bow' ? { drawing: false, drawTicks: 0, shot: false, ...(o.bow ?? {}) } : null,
  };
};
const katana = (o: O = {}): SpriteStepInput => inp({ ...o, weapon: 'katana' });
const bowIn = (o: O = {}): SpriteStepInput => inp({ ...o, weapon: 'bow' });
const STANCE_MOTION = { chudan: 'katana_thrust', jodan: 'katana_kesa', gedan: 'katana_kiriage' } as const;
const WALK_MOTION = { chudan: 'katana_walk_chudan', jodan: 'katana_walk_jodan', gedan: 'katana_walk_gedan' } as const;

/** 60 ステップのあいだに コマの番号が かわった回数 */
function changes(m: MotionMachine, make: () => SpriteStepInput, n = 60): number {
  let c = 0;
  let prev = m.frame;
  for (let i = 0; i < n; i++) {
    m.step(make());
    if (m.frame !== prev) c++;
    prev = m.frame;
  }
  return c;
}

describe('AC1 刀を持って 立つ', () => {
  for (const st of ['chudan', 'jodan', 'gedan'] as const) {
    it(`${st}: kamae・${STANCE_MOTION[st]}・0 コマのまま。空中でも jump にならない`, () => {
      const m = new MotionMachine();
      for (let i = 0; i < 60; i++) {
        m.step(katana({ stance: st }));
        expect([m.scene, m.motion, m.frame]).toEqual(['kamae', STANCE_MOTION[st], 0]);
      }
      for (let i = 0; i < 30; i++) {
        m.step(katana({ stance: st, onGround: false, vy: i < 10 ? 8 : -5 }));
        expect([m.scene, m.motion, m.frame]).toEqual(['kamae', STANCE_MOTION[st], 0]);
      }
    });
  }
});

describe('AC2 かまえ歩き', () => {
  it('W (4.0) で 10 ステップ以内に kamaeWalk、60 ステップで 10 ±1 コマ', () => {
    for (const st of ['chudan', 'jodan', 'gedan'] as const) {
      const m = new MotionMachine();
      m.step(katana({ stance: st }));
      let first = -1;
      for (let i = 0; i < 10; i++) {
        m.step(katana({ stance: st, vx: 4 }));
        if (m.scene === 'kamaeWalk' && first < 0) first = i;
      }
      expect(first).toBeGreaterThanOrEqual(0);
      expect(m.motion).toBe(WALK_MOTION[st]);
      const m2 = new MotionMachine();
      m2.step(katana({ stance: st }));
      m2.step(katana({ stance: st, vx: 4 }));
      expect(m2.frame).toBe(0); // 立つ → 歩く は 0 から
      const c = changes(m2, () => katana({ stance: st, vx: 4 }));
      expect(Math.abs(c - 10)).toBeLessThanOrEqual(1);
    }
  });
  it('走る (5.6) で 12 ±1、みずの中 (2.0) で 5 ±1', () => {
    const m = new MotionMachine();
    expect(Math.abs(changes(m, () => katana({ vx: 5.6, running: true })) - 12)).toBeLessThanOrEqual(1);
    const w = new MotionMachine();
    expect(Math.abs(changes(w, () => katana({ vx: 2, inWater: true, onGround: false })) - 5)).toBeLessThanOrEqual(1);
    expect(w.scene).toBe('kamaeWalk');
  });
});

describe('AC3 歩きながら かまえ変え', () => {
  it('R の ステップで 新しいかまえの かまえ歩き・番号は 引きつぐ。立って R なら 0 コマめ', () => {
    const m = new MotionMachine();
    for (let i = 0; i < 20; i++) m.step(katana({ vx: 4 }));
    const f = m.frame;
    m.step(katana({ vx: 4, stance: 'jodan', phase: 'switch' }));
    expect(m.scene).toBe('kamaeWalk');
    expect(m.motion).toBe('katana_walk_jodan');
    expect(Math.abs(m.frame - f)).toBeLessThanOrEqual(1);
    const s = new MotionMachine();
    for (let i = 0; i < 5; i++) s.step(katana());
    s.step(katana({ stance: 'gedan', phase: 'switch' }));
    expect([s.scene, s.motion, s.frame]).toEqual(['kamae', 'katana_kiriage', 0]);
  });
});

// §4.2 の 表（f → コマ）
const RANGES: Record<BladeTech, [number, number, number][]> = {
  thrust: [[1, 2, 0], [3, 4, 1], [5, 5, 2], [6, 6, 3], [7, 9, 4], [10, 20, 5], [21, 24, 6], [25, 28, 7], [29, 32, 8], [33, 36, 9], [37, 41, 10]],
  kesa: [[1, 8, 0], [9, 15, 1], [16, 19, 2], [20, 23, 3], [24, 28, 4], [29, 30, 5], [31, 32, 6], [33, 34, 7], [35, 39, 8], [40, 67, 9], [68, 75, 10], [76, 83, 11], [84, 91, 12], [92, 99, 13], [100, 106, 14]],
  kiriage: [[1, 5, 0], [6, 10, 1], [11, 15, 2], [16, 20, 3], [21, 25, 4], [26, 30, 5], [31, 34, 6], [35, 38, 7], [39, 40, 8], [41, 41, 9], [42, 43, 10], [44, 51, 11], [52, 78, 12], [79, 84, 13], [85, 90, 14], [91, 96, 15], [97, 100, 16], [101, 104, 17]],
};
const LEN: Record<BladeTech, { startup: number; active: number; recovery: number }> = {
  thrust: { startup: 4, active: 2, recovery: 35 },
  kesa: { startup: 28, active: 6, recovery: 72 },
  kiriage: { startup: 38, active: 5, recovery: 61 },
};
const phaseOf = (t: BladeTech, f: number): BladePhase => (f <= LEN[t].startup ? 'startup' : f <= LEN[t].startup + LEN[t].active ? 'active' : 'recovery');
const TECH_MOTION = { thrust: 'katana_thrust', kesa: 'katana_kesa', kiriage: 'katana_kiriage' } as const;

describe('AC4 わざのコマ', () => {
  for (const t of ['thrust', 'kesa', 'kiriage'] as const) {
    it(`${t}: ぜんぶの f が 表と同じ。W・シフトを押していても tech。次のステップは kamae 0`, () => {
      const total = LEN[t].startup + LEN[t].active + LEN[t].recovery;
      const m = new MotionMachine();
      m.step(katana());
      for (let f = 1; f <= total; f++) {
        m.step(katana({ tech: t, phase: phaseOf(t, f), frame: f, vx: f % 2 ? 4 : 5.6, running: f % 3 === 0, lengths: LEN[t] }));
        const want = RANGES[t].find(([a, b]) => f >= a && f <= b)![2];
        expect([f, m.scene, m.motion, m.frame]).toEqual([f, 'tech', TECH_MOTION[t], want]);
      }
      m.step(katana());
      expect([m.scene, m.frame]).toEqual(['kamae', 0]);
    });
  }
  it('空中でも わざの絵が先 (K1)', () => {
    const m = new MotionMachine();
    m.step(katana({ tech: 'kesa', phase: 'startup', frame: 3, onGround: false, vy: -3, lengths: LEN.kesa }));
    expect([m.scene, m.motion]).toEqual(['tech', 'katana_kesa']);
  });
});

describe('AC5 設定の長さが ちがうとき', () => {
  it('切り上げ 2/1/3: 出だし 0〜7・当たり 8〜10・もどり 11〜17 で 前以上', () => {
    const lengths = { startup: 2, active: 1, recovery: 3 };
    const cells: number[] = [];
    for (let f = 1; f <= 6; f++) cells.push(techCell(TECH_CURVES.kiriage, TECH_PHASES.kiriage, lengths, f));
    expect(cells[0]).toBeGreaterThanOrEqual(0);
    expect(cells[1]).toBeLessThanOrEqual(7);
    expect(cells[2]).toBeGreaterThanOrEqual(8);
    expect(cells[2]).toBeLessThanOrEqual(10);
    for (const c of cells.slice(3)) {
      expect(c).toBeGreaterThanOrEqual(11);
      expect(c).toBeLessThanOrEqual(17);
    }
    for (let i = 1; i < cells.length; i++) expect(cells[i]!).toBeGreaterThanOrEqual(cells[i - 1]!);
    // MotionMachine も 同じ
    const m = new MotionMachine();
    for (let f = 1; f <= 6; f++) {
      m.step(katana({ tech: 'kiriage', phase: f <= 2 ? 'startup' : f === 3 ? 'active' : 'recovery', frame: f, lengths }));
      expect(m.frame).toBe(cells[f - 1]);
    }
  });
  it('長さが 絵と同じなら 表と同じ', () => {
    for (const t of ['thrust', 'kesa', 'kiriage'] as const) {
      for (const [a, b, k] of RANGES[t]) for (let f = a; f <= b; f++) expect(techCell(TECH_CURVES[t], TECH_PHASES[t], LEN[t], f)).toBe(k);
    }
  });
  it('おわりを こえたら さいごのコマ', () => {
    expect(techCell(TECH_CURVES.thrust, TECH_PHASES.thrust, LEN.thrust, 99)).toBe(10);
  });
});

describe('AC6 弓を持って 立つ・歩く', () => {
  it('bowHold・bow_shot・0。W (4.0) で bowHoldWalk、60 ステップで 10 ±1', () => {
    const m = new MotionMachine();
    for (let i = 0; i < 60; i++) {
      m.step(bowIn());
      expect([m.scene, m.motion, m.frame]).toEqual(['bowHold', 'bow_shot', 0]);
    }
    m.step(bowIn({ vx: 4 }));
    expect([m.scene, m.motion]).toEqual(['bowHoldWalk', 'bow_hold_walk']);
    const c = changes(m, () => bowIn({ vx: 4 }));
    expect(Math.abs(c - 10)).toBeLessThanOrEqual(1);
  });
  it('空中は bowHold の 0 コマめ', () => {
    const m = new MotionMachine();
    m.step(bowIn({ onGround: false, vy: 5 }));
    expect([m.scene, m.motion, m.frame]).toEqual(['bowHold', 'bow_shot', 0]);
  });
});

describe('AC7 弓を引く', () => {
  it('drawTicks → frame', () => {
    const want: Record<number, number> = { 1: 0, 5: 0, 6: 1, 11: 1, 12: 2, 24: 4, 30: 5, 35: 6, 39: 6, 40: 7, 80: 7 };
    for (const [t, f] of Object.entries(want)) {
      const m = new MotionMachine();
      m.step(bowIn({ bow: { drawing: true, drawTicks: Number(t) } }));
      expect([t, m.scene, m.motion, m.frame]).toEqual([t, 'bowDraw', 'bow_shot', f]);
    }
  });
});

/** うつ → a ステップ後の 場面 */
function shootThen(m: MotionMachine, drawSteps: number, extra = (): O => ({})): void {
  for (let i = 1; i <= drawSteps; i++) m.step(bowIn({ bow: { drawing: true, drawTicks: i }, ...extra() }));
  m.step(bowIn({ bow: { drawing: false, drawTicks: 0, shot: true }, ...extra() }));
}

describe('AC8 はなす', () => {
  it('a → frame 8・8・9・9・10・10・11・11、a = 22 で bowHold 0', () => {
    const m = new MotionMachine();
    shootThen(m, 45);
    const seen: Record<number, [string, number]> = {};
    for (let a = 0; a <= 22; a++) {
      if (a > 0) m.step(bowIn());
      seen[a] = [m.scene, m.frame];
    }
    for (const [a, f] of [[0, 8], [3, 8], [4, 9], [9, 9], [10, 10], [15, 10], [16, 11], [21, 11]] as const) expect(seen[a]).toEqual(['bowRelease', f]);
    expect(seen[22]).toEqual(['bowHold', 0]);
    expect(m.motion).toBe('bow_shot');
  });
  it('から引きは 次のステップで bowHold 0', () => {
    const m = new MotionMachine();
    for (let i = 1; i <= 5; i++) m.step(bowIn({ bow: { drawing: true, drawTicks: i } }));
    m.step(bowIn());
    expect([m.scene, m.frame]).toEqual(['bowHold', 0]);
  });
});

describe('AC9 連射', () => {
  it('a = 10 で 引きはじめ → bow_rapid の コマ', () => {
    const m = new MotionMachine();
    shootThen(m, 45);
    for (let i = 0; i < 9; i++) m.step(bowIn());
    const want: Record<number, number> = { 1: 0, 4: 1, 8: 2, 24: 3 + 3, 60: 6 };
    let t = 0;
    for (const [k, f] of Object.entries(want)) {
      t = Number(k);
      m.step(bowIn({ bow: { drawing: true, drawTicks: t } }));
      expect([m.scene, m.motion, m.frame]).toEqual(['bowDraw', 'bow_rapid', f]);
    }
    // はなす
    m.step(bowIn({ bow: { drawing: false, drawTicks: 0, shot: true } }));
    const seen: Record<number, [string, string, number]> = { 0: [m.scene, m.motion, m.frame] };
    for (let a = 1; a <= 15; a++) {
      m.step(bowIn());
      seen[a] = [m.scene, m.motion, m.frame];
    }
    for (const [a, f] of [[0, 7], [2, 7], [3, 8], [14, 10]] as const) expect(seen[a]).toEqual(['bowRelease', 'bow_rapid', f]);
    expect(seen[15]).toEqual(['bowHold', 'bow_shot', 0]);
  });
  it('a = 22 で 引きはじめ → 連射でない。a = 21 は 連射', () => {
    for (const [a, rapid] of [[21, true], [22, false]] as const) {
      const m = new MotionMachine();
      shootThen(m, 45);
      for (let i = 0; i < a - 1; i++) m.step(bowIn());
      m.step(bowIn({ bow: { drawing: true, drawTicks: 1 } }));
      expect(m.motion).toBe(rapid ? 'bow_rapid' : 'bow_shot');
    }
  });
});

describe('AC10 引きながら歩く', () => {
  it('bowDrawWalk・bow_walk、60 ステップで 5 ±1', () => {
    const m = new MotionMachine();
    let t = 0;
    m.step(bowIn({ bow: { drawing: true, drawTicks: ++t }, vx: 2 }));
    expect([m.scene, m.motion]).toEqual(['bowDrawWalk', 'bow_walk']);
    const c = changes(m, () => bowIn({ bow: { drawing: true, drawTicks: ++t }, vx: 2 }));
    expect(Math.abs(c - 5)).toBeLessThanOrEqual(1);
  });
  it('歩きながら はなすと bowHoldWalk（番号は 引きつぐ）。止まると bowDraw', () => {
    const m = new MotionMachine();
    let t = 0;
    for (let i = 0; i < 50; i++) m.step(bowIn({ bow: { drawing: true, drawTicks: ++t }, vx: 2 }));
    m.step(bowIn({ bow: { drawing: false, drawTicks: 0, shot: true }, vx: 2 }));
    expect([m.scene, m.motion]).toEqual(['bowHoldWalk', 'bow_hold_walk']);
    const m2 = new MotionMachine();
    t = 0;
    for (let i = 0; i < 50; i++) m2.step(bowIn({ bow: { drawing: true, drawTicks: ++t }, vx: 2 }));
    const before = m2.frame;
    m2.step(bowIn({ bow: { drawing: false, drawTicks: 0, shot: true }, vx: 2 }));
    expect(m2.frame - before === 0 || m2.frame - before === 1).toBe(true);
    m2.step(bowIn({ bow: { drawing: true, drawTicks: 20 } }));
    expect([m2.scene, m2.motion, m2.frame]).toEqual(['bowDraw', 'bow_rapid', 5]); // 直前に うったので 連射
  });
});

describe('AC11 うしろ歩き', () => {
  /** 5 ±1 コマ/秒 で 進む向き（+1 / −1）を 返す */
  function walkDir(make: (vx: number, vz: number) => SpriteStepInput, vx: number, vz: number): { rate: number; sign: number } {
    const m = new MotionMachine();
    m.step(make(vx, vz));
    let acc = 0;
    let prev = m.frame;
    let n = 0;
    let sign = 0;
    for (let i = 0; i < 60; i++) {
      m.step(make(vx, vz));
      const d = (((m.frame - prev) % 8) + 8) % 8;
      if (d === 1) { acc++; sign = 1; }
      else if (d === 7) { acc++; sign = -1; }
      else if (d !== 0) throw new Error(`とんだ ${prev}→${m.frame}`);
      prev = m.frame;
      n++;
    }
    return { rate: acc, sign };
  }
  it('facing 0 で 南へ v=2.0 で 引きながら: へる向き 5 ±1。東へは ふえる向き', () => {
    const mk = (vx: number, vz: number): SpriteStepInput => bowIn({ bow: { drawing: true, drawTicks: 1 }, vx, vz, facingDeg: 0 });
    const south = walkDir(mk, 0, 2);
    expect(south.sign).toBe(-1);
    expect(Math.abs(south.rate - 5)).toBeLessThanOrEqual(1);
    expect(walkDir(mk, 2, 0).sign).toBe(1);
  });
  it('80 度は ふえる向き、100 度は へる向き', () => {
    const at = (deg: number): SpriteStepInput => {
      const r = (deg * Math.PI) / 180;
      return bowIn({ bow: { drawing: true, drawTicks: 1 }, vx: 2 * Math.sin(r), vz: -2 * Math.cos(r), facingDeg: 0 });
    };
    expect(walkDir(() => at(80), 0, 0).sign).toBe(1);
    expect(walkDir(() => at(100), 0, 0).sign).toBe(-1);
  });
  it('はじめの 1 コマは 7（0 から へる）', () => {
    const m = new MotionMachine();
    m.step(bowIn({ vz: 2 }));
    for (let i = 0; i < 12; i++) m.step(bowIn({ vz: 2 }));
    expect(m.frame).toBeLessThan(8);
    const seq: number[] = [];
    for (let i = 0; i < 60; i++) {
      m.step(bowIn({ vz: 2 }));
      if (seq[seq.length - 1] !== m.frame) seq.push(m.frame);
    }
    for (let i = 1; i < seq.length; i++) expect((seq[i - 1]! - seq[i]! + 8) % 8).toBe(1);
  });
  it('刀のかまえ歩きも うしろは へる。刀なし・弓なしの walk は うしろ向きでも ふえる', () => {
    const k = walkDir(() => katana({ vz: 4 }), 0, 0);
    expect(k.sign).toBe(-1);
    const w = walkDir(() => inp({ vz: 4 }), 0, 0);
    expect(w.sign).toBe(1);
    const r = walkDir(() => inp({ vz: 5.6, running: true }), 0, 0);
    expect(r.sign).toBe(1);
  });
});

describe('刀も弓も 持たない: 今のまま (AC12)', () => {
  it('scene は stand・walk・run・jump', () => {
    const m = new MotionMachine();
    m.step(inp());
    expect([m.scene, m.motion]).toEqual(['stand', 'idle']);
    m.step(inp({ vx: 4 }));
    expect([m.scene, m.motion]).toEqual(['walk', 'walk']);
    m.step(inp({ vx: 5.6, running: true }));
    expect([m.scene, m.motion]).toEqual(['run', 'run']);
    m.step(inp({ onGround: false, vy: 8 }));
    expect([m.scene, m.motion]).toEqual(['jump', 'jump']);
  });
});

describe('持ちかえ', () => {
  it('歩く絵どうしの切りかわりは 番号を引きつぐ。わざ・立つからは 0 から', () => {
    const m = new MotionMachine();
    for (let i = 0; i < 20; i++) m.step(inp({ vx: 4 }));
    const f = m.frame;
    m.step(katana({ vx: 4 }));
    expect(Math.abs(m.frame - f)).toBeLessThanOrEqual(1);
    for (let i = 0; i < 5; i++) m.step(katana({ tech: 'thrust', phase: 'startup', frame: 1, lengths: LEN.thrust, vx: 4 }));
    m.step(katana({ vx: 4 }));
    expect(m.frame).toBe(0);
  });
});
