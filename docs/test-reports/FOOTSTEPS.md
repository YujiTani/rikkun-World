# FOOTSTEPS test report
- unit `src/fx/footsteps.test.ts`（5）: 種類の 表・歩く / 走る 間かく・空中 / 止まる / 水 で 鳴らない・gain 0.07 以下・下駄で 走る ときは 下駄 だけ。
- E2E `e2e/footsteps.spec.ts`: 止まって 2 秒 = 0 歩、歩いて 2 秒 = 3〜6 歩、空中 = 0。
- 音は 聞いて いない（耳での 確認は オーナー）。
