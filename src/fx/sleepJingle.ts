import type { Tone } from './sound';
import { GADGET_TUNING } from '../content/items/gadgetTuning';

/**
 * ふとんで ねる ときの ジングル（ITEM-FX-1。yuzu が 案 A を えらんだ。約 5 秒 = futon.sleepSteps）。
 * 大きさは 「ひろう」より 少し 大きい 程度（もとの gain に 表の 倍率 futon.jingleGainMul を かける）。
 */
const RAW: readonly Tone[] = [
  {
   type: "sine",
   f0: 659.2551138257398,
   f1: 665.8476649639972,
   delay: 0,
   dur: 1.2,
   gain: 0.16,
   attack: 0.002,
   partials: [
    {
     ratio: 2,
     gain: 0.15,
     durScale: 0.6
    },
    {
     ratio: 5.4,
     gain: 0.06,
     durScale: 0.25
    }
   ]
  },
  {
   type: "sine",
   f0: 783.9908719634986,
   f1: 791.8307806831336,
   delay: 0.5,
   dur: 1.2,
   gain: 0.16,
   attack: 0.002,
   partials: [
    {
     ratio: 2,
     gain: 0.15,
     durScale: 0.6
    },
    {
     ratio: 5.4,
     gain: 0.06,
     durScale: 0.25
    }
   ]
  },
  {
   type: "sine",
   f0: 1046.5022612023945,
   f1: 1056.9672838144184,
   delay: 1,
   dur: 1.4,
   gain: 0.16,
   attack: 0.002,
   partials: [
    {
     ratio: 2,
     gain: 0.15,
     durScale: 0.6
    },
    {
     ratio: 5.4,
     gain: 0.06,
     durScale: 0.25
    }
   ]
  },
  {
   type: "sine",
   f0: 987.7666025122483,
   f1: 997.6442685373707,
   delay: 1.6,
   dur: 1.2,
   gain: 0.14,
   attack: 0.002,
   partials: [
    {
     ratio: 2,
     gain: 0.15,
     durScale: 0.6
    },
    {
     ratio: 5.4,
     gain: 0.06,
     durScale: 0.25
    }
   ]
  },
  {
   type: "sine",
   f0: 783.9908719634986,
   f1: 791.8307806831336,
   delay: 2.1,
   dur: 1.4,
   gain: 0.12,
   attack: 0.002,
   partials: [
    {
     ratio: 2,
     gain: 0.15,
     durScale: 0.6
    },
    {
     ratio: 5.4,
     gain: 0.06,
     durScale: 0.25
    }
   ]
  },
  {
   type: "sine",
   f0: 261.6255653005986,
   f1: 261.6255653005986,
   delay: 0,
   dur: 2.4,
   gain: 0.12,
   attack: 0.003,
   partials: [
    {
     ratio: 4,
     gain: 0.18,
     durScale: 0.3
    }
   ]
  },
  {
   type: "sine",
   f0: 391.99543598174927,
   f1: 391.99543598174927,
   delay: 0.5,
   dur: 2,
   gain: 0.07,
   attack: 0.003,
   partials: [
    {
     ratio: 4,
     gain: 0.18,
     durScale: 0.3
    }
   ]
  },
  {
   type: "sine",
   f0: 1318.5102276514797,
   f1: 1331.6953299279944,
   delay: 3.3,
   dur: 1.4,
   gain: 0.2,
   attack: 0.002,
   partials: [
    {
     ratio: 2,
     gain: 0.15,
     durScale: 0.6
    },
    {
     ratio: 5.4,
     gain: 0.06,
     durScale: 0.25
    }
   ]
  },
  {
   type: "sine",
   f0: 2093.004522404789,
   f1: 2113.9345676288367,
   delay: 3.7,
   dur: 1.6,
   gain: 0.2,
   attack: 0.002,
   partials: [
    {
     ratio: 2,
     gain: 0.15,
     durScale: 0.6
    },
    {
     ratio: 5.4,
     gain: 0.06,
     durScale: 0.25
    }
   ]
  },
  {
   type: "sine",
   f0: 261.6255653005986,
   f1: 261.6255653005986,
   delay: 3.3,
   dur: 1.4,
   gain: 0.1,
   attack: 0.003,
   partials: [
    {
     ratio: 4,
     gain: 0.18,
     durScale: 0.3
    }
   ]
  },
  {
   type: "sine",
   f0: 391.99543598174927,
   f1: 391.99543598174927,
   delay: 3.3,
   dur: 1.4,
   gain: 0.07,
   attack: 0.003,
   partials: [
    {
     ratio: 4,
     gain: 0.18,
     durScale: 0.3
    }
   ]
  }
 ];

const SLEEP_JINGLE: readonly Tone[] = RAW.map((t) => ({ ...t, gain: t.gain * GADGET_TUNING.futon.jingleGainMul }));

/** ねはじめに 鳴らす */
export function playSleepJingle(s: { playTones(t: readonly Tone[]): void }): void {
  s.playTones(SLEEP_JINGLE);
}
