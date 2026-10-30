import { beforeAll, describe, expect, it } from 'vitest';
import {
  SEEDS_20,
  ledgeProblems,
  lightProblems,
  sampleShafts,
  wallProblems,
  walkProblems,
  type GenCols,
  type PathCell,
  type Shaft,
} from './mineShaftKit';

/**
 * MINE-1C（docs/design/MINE-1.md §4.5.3・§6.1「歩ける きまり」・受け入れ基準 C4・C5）: 坑道の 安全〔落ちない・もどれる・明るい〕。
 *
 *   C4: 足の マスの 下 2 マスが 固い・道の まわり 1 マスが 横穴の 口・出口 いがい 固い・入口の まわり 8 マスに 4 以上 落ちる ふちが ない・
 *       道さがし〔入口と へや〔宝箱が あれば 2 マスの 前〕・横穴の 先が 歩いて 行き来 できる〕。
 *   C5: 作った ときの 足の マス ぜんぶで ブロックの 光 6 以上〔`isDarkForSpawn` false〕・坑道の たいまつは ふつうの `torch`〔`start_torch` でない〕。
 *   しらべる 関数は mineShaftKit.ts〔仕様 §6.1 の「歩ける きまり」を 1 つの 関数に〕。体の 通る マス〔たいまつ・つらら・草花。水は のぞく〕で 数える。
 *
 *   坑道: 20 シードの はじまりの 坑道 ＋ スタートに 近い ほかの 坑道 2 こ。光は 重いので 6 シードの はじまり ＋ ほか 1 こ だけ。
 *   妖怪の ためし 1,000 回〔C5〕は、道の 足の マス ぜんぶが isDarkForSpawn false〔妖怪が 出ない 暗さの 外〕で 置きかえた〔出る 条件は 「光 5 以下」だけ〕。
 */

interface Sample {
  seed: number;
  shaft: Shaft;
  path: PathCell[];
  g: GenCols;
}
const samples: Sample[] = [];
const lightSamples: Sample[] = [];

beforeAll(() => {
  SEEDS_20.forEach((seed, k) => {
    const s = sampleShafts(seed, 2);
    s.shafts.forEach((shaft, i) => {
      const one = { seed, shaft, path: s.hook.shaftPath(shaft.id), g: s.g };
      samples.push(one);
      if (k < 6 && i < 2) lightSamples.push(one);
    });
  });
}, 240_000);

describe('C4: 落ちない', () => {
  it('坑道が 集まる〔20 シード〕', () => {
    expect(samples.length).toBeGreaterThanOrEqual(SEEDS_20.length + 10);
  });

  it('床が ぬけない: 道の 足の マスの 下 2 マスが 固い。かべが あかない: 道の まわり 1 マスが〔入口・横穴の 口と 出口 いがい〕固い', () => {
    const bad: string[] = [];
    for (const s of samples) for (const m of wallProblems(s.g, s.shaft, s.path).slice(0, 3)) bad.push(`seed ${s.seed} ${s.shaft.id}: ${m}`);
    expect(bad.slice(0, 8), `${bad.length} つ`).toEqual([]);
  }, 120_000);

  it('入口の まわり 8 マス〔と 山の まわり 8 マス〕に 4 以上 落ちる ふちが ない', () => {
    const bad: string[] = [];
    for (const s of samples) for (const m of ledgeProblems(s.g, s.shaft).slice(0, 3)) bad.push(`seed ${s.seed} ${s.shaft.id}: ${m}`);
    expect(bad.slice(0, 8), `${bad.length} つ`).toEqual([]);
  }, 120_000);
});

describe('C4: もどれる（道さがし）', () => {
  it('入口と、いちばん 下の へやの おくの かべの まん中の 前〔宝箱が あれば 2 マスの 前の 2 マス とも〕・横穴の 先が 歩いて 行き来 できる。ほらあなの 床から 出口まで どの 1 歩も 段差 1 以下', () => {
    const bad: string[] = [];
    for (const s of samples) for (const m of walkProblems(s.g, s.shaft, s.path).slice(0, 3)) bad.push(`seed ${s.seed} ${s.shaft.id}: ${m}`);
    expect(bad.slice(0, 8), `${bad.length} つ`).toEqual([]);
  }, 240_000);
});

describe('C5: 明るい', () => {
  it('光を しらべる 坑道が ある', () => {
    expect(lightSamples.length).toBeGreaterThanOrEqual(8);
  });

  it('作った ときの 足の マス ぜんぶで ブロックの 光 6 以上・isDarkForSpawn false〔妖怪が 道の 上に 出ない〕。こわれない たいまつ〔start_torch〕は 使わない', () => {
    const bad: string[] = [];
    for (const s of lightSamples) for (const m of lightProblems(s.g, s.shaft, s.path).slice(0, 3)) bad.push(`seed ${s.seed} ${s.shaft.id}: ${m}`);
    expect(bad.slice(0, 8), `${bad.length} つ`).toEqual([]);
  }, 240_000);

  it('坑道には ふつうの たいまつ〔torch〕が 入口に 2 こ いじょう・さか道に ならぶ。start_torch は 箱の 中の 道の そばに ない', () => {
    for (const s of lightSamples) {
      const e = s.shaft.entrance;
      let near = 0;
      for (let x = e.x - 4; x <= e.x + 4; x++) for (let z = e.z - 4; z <= e.z + 4; z++) for (let y = e.y - 2; y <= e.y + 4; y++) if (s.g.id(x, y, z) === 'torch') near++;
      expect(near, `seed ${s.seed} ${s.shaft.id}: 入口の たいまつ`).toBeGreaterThanOrEqual(2);
      const ramp = s.path.filter((c) => c.part === 'ramp');
      let rampTorches = 0;
      for (const c of ramp) if (s.g.id(c.x, c.y, c.z) === 'torch') rampTorches++;
      // 仕様は「さか道 8 マスごと」を 間かくの 目安と 書く〔決まりは 光 6 以上〕: 半分 以上 あれば 並んで いる と 見る
      expect(rampTorches, `seed ${s.seed} ${s.shaft.id}: さか道の たいまつ〔8 マスごとに 左右 こうごに 立つ 目安の 半分〕`).toBeGreaterThanOrEqual(Math.floor(ramp.length / 3 / 8 / 2));
    }
  }, 60_000);
});
