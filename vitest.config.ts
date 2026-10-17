import { defineConfig } from 'vitest/config';

// #184: 8192 四方を 数えるユニット（biome.test.ts）は expect を 数百万回 呼ぶので 5 秒では足りない。
// 重いファイルだけ 120 秒、ほかは 今まで どおりの 5 秒（おそいテストを見のがさない）
const HEAVY = ['src/world/gen/biome.test.ts'];

export default defineConfig({
  test: {
    environment: 'node',
    projects: [
      { extends: true, test: { name: 'heavy', include: HEAVY, testTimeout: 120_000 } },
      { extends: true, test: { name: 'unit', include: ['src/**/*.test.ts'], exclude: HEAVY } },
    ],
  },
});
