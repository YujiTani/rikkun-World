import { yokaiTraits } from '../content/yokai/registry';

/**
 * 妖怪ごとの動きの分かれ道の印（浮く・石になる・重い攻撃だけでのけぞる など）。値は content/yokai/<kind>.ts の traits。
 * ai/ の動きは `e.kind === 'nurikabe'` と書かず、ここを読む（国の妖怪を足すときは 印を書くだけで 同じ動きが 使える）。
 */
export const KIND_TRAITS = yokaiTraits();
