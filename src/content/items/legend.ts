import { KATANA_HOW } from './howText';
import type { LegendId } from './ids';
import type { ItemDef } from './types';

/**
 * レジェンダリー武器（WEAPON-7/8/9）。雷神剣・風神剣・虹の値は ここ 1 か所（ルール #304）。
 * ヌシが おとす（contracts.ts の nushiDrops）。作れないので レシピは なし。たいきゅう 10000（つくれず ヌシでしか 手に 入らない 武器だけの 例外。WEAPON-7 §2.4）。
 * ためわざ・こうげき時の 効果・ずっと 効く 力は `legend`（contracts.ts の LEGENDARY_DEFAULTS は ここから 作る）。
 * 絵は ui/itemArtW7.ts、手に持つ 形は camera/heldTools.ts、雷・風・虹の 効果は legend/ と fx/。
 * 値は これまでの 表から そのまま 写した もの（2026-10-25）。
 */
export const LEGEND = {
  // 雷神剣: ためて はなすと そら から かみなり が おちる
  raijin_ken: {
    name: '［雷神剣｜らいじんけん］',
    zukan: 'むかし むかし、［雲｜くも］の ［上｜うえ］に すむ ［雷神｜らいじん］さまが、たいこを たたいて かみなりを おとして いた。ある あらしの ［夜｜よる］、たいこの ばちが ［一｜ひと］つ ［地｜ち］［上｜じょう］に おちて、［長｜なが］い ［年｜とし］［月｜つき］の うちに ［一｜いっ］［本｜ぽん］の けんに なったと いう。それが この ［雷神剣｜らいじんけん］。［力｜ちから］を ためて はなせば、［今｜いま］でも ［空｜そら］から かみなりが どーんと おちて くる。この けんは ヌシと よばれる ようかいたちが だいじに かくして いる らしい。',
    maxStack: 1,
    rarity: 'legendary', // 7 段目
    category: 'weapon',
    info: { use: 'ようかい を つよく たたく', special: 'ためて はなすと そら から かみなり が おちる', how: `${KATANA_HOW}。ながおし して はなすと ためわざ`, buttons: ['1-9', 'left'], stats: 'blade' },
    wear: 10000,
    // 刃は むらさき（0xb070ff 系）、軌跡は 白〜うすい 黄（雷 v4 の 色）。刃の 届く 長さ 2.2（ブロック）
    blade: { reach: 2.2, trail: { color: 0xfff6c0, glow: 0xffffff, blade: 0xb070ff, bladeShine: 0xe6d2ff, style: 'thunder' } },
    legend: {
      power: 8,
      charge: { kind: 'lightning', chargeTicks: 60, range: 20, radius: 5, damageMul: 2.0, knock: [2, 4], strikeF: 8, boltSteps: 12, recovery: 40 },
      onAttack: [{ kind: 'trail', style: 'thunder' }],
      passive: [],
    },
  },
  // 風神剣: 手に もつと はやく はしれる。ためて はなすと かぜ が とぶ
  fujin_ken: {
    name: '［風神剣｜ふうじんけん］',
    zukan: '［風神｜ふうじん］さまは、［大｜おお］きな ［風｜かぜ］ぶくろを せおって せかいじゅうに ［風｜かぜ］を ふかせて いた。あるとき ［風｜かぜ］ぶくろから こぼれた ひとすじの ［風｜かぜ］が、［山｜やま］の ［岩｜いわ］に ささって けんに なった。それが この ［風神剣｜ふうじんけん］。もつと ［体｜からだ］が ［風｜かぜ］の ように かるく なって ［早｜はや］く ［走｜はし］れる。ためて はなせば、らせんの ［風｜かぜ］が ようかいを ふきとばす。［雷神剣｜らいじんけん］とは むかしからの なかよしの きょうだいけん。',
    maxStack: 1,
    rarity: 'legendary',
    category: 'weapon',
    info: { use: 'ようかい を つよく たたく', special: 'てに もつと はやく はしれる。ためて はなすと かぜ が とぶ', how: `${KATANA_HOW}。ながおし して はなすと ためわざ`, buttons: ['1-9', 'left'], stats: 'blade' },
    wear: 10000,
    // ふつうの 斬撃の 形（plain）で 白〜みずいろ
    blade: { reach: 2.2, trail: { color: 0xe6f8ff, glow: 0xffffff, blade: 0xcfefff, bladeShine: 0xffffff, style: 'plain' } },
    legend: {
      power: 6,
      // WEAPON-8: ためわざ「らせんの かぜ」（前へ まっすぐ 12 マス・つらぬく・12 ダメージ）
      charge: { kind: 'spiral', chargeTicks: 60, launchF: 6, recovery: 40, speed: 12, range: 12, radius: 1.0, damageMul: 2.0, knock: [3, 1] },
      onAttack: [{ kind: 'wave', speed: 15, range: 5, radius: 0.5, damageMul: 0.3, knock: [0.5, 0] }],
      passive: [{ kind: 'moveMul', mul: 1.2 }], // 走る 速さ 1.2 倍
    },
  },
  // 虹: ためて はなすと ひかり の ドーム。強さは 1 本ごと 4〜10
  niji: {
    name: '［虹｜にじ］',
    zukan: '［雨｜あめ］が やんだ あとの ［空｜そら］に、なないろの はしが かかる ことが ある。むかしの ［人｜ひと］は、それを かみさまが わたる はしだと しんじて いた。この けんは、その にじの かけらを あつめて ［作｜つく］られたと いう ［虹｜にじ］の けん。ためて はなすと、［光｜ひかり］の ドームが まわりの ようかいを つつみこむ。おなじ にじが ［二｜ふた］つと ない ように、［一｜いっ］［本｜ぽん］ごとに ［力｜ちから］が すこしずつ ちがう。',
    maxStack: 1,
    rarity: 'legendary',
    category: 'weapon',
    info: { use: 'ようかい を つよく たたく', special: 'ためて はなすと ひかり の ドーム', how: `${KATANA_HOW}。ながおし して はなすと ためわざ`, buttons: ['1-9', 'left'], stats: 'blade' },
    wear: 10000,
    blade: { reach: 2.2, trail: { color: 0xd16be6, glow: 0xffffff, blade: 0xc3cee2, bladeShine: 0x5fd98e, style: 'plain' } },
    legend: {
      power: [4, 10],
      // WEAPON-9 §5.1: ため 2.5 秒 → シャイニング（うかぶ 40・とどまる 160・おりる 40・もどり 20）。休み 600
      charge: { kind: 'shining', chargeTicks: 150, rise: 2.0, riseSteps: 40, holdSteps: 160, fallSteps: 40, radius: 7, damageMul: 2.5, hitEvery: 60, push: [9, 6], cooldown: 600, takenMul: 1 / 3, pullRange: 12, pullSpeed: 3 },
      onAttack: [{ kind: 'trail', style: 'rainbow' }],
      passive: [],
    },
  },
} satisfies Record<LegendId, ItemDef>;
