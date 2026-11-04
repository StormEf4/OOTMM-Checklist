import { writeFileSync } from 'node:fs';
import { Monitor, options } from '@ootmm/core';
import { logic } from '@ootmm/logic';
import { makeSpoilerLog } from '@ootmm/spoiler';
const monitor = new Monitor({ onLog: () => {}, onWarn: () => {}, onProgress: () => {} });
const opts = options({ seed: 'ui-sample', settings: { mqDungeons: { type: 'random' }, preCompletedDungeons: true, preCompletedDungeonsMajor: 2, cowShuffleOot: true, generateSpoilerLog: true } as any });
writeFileSync('.cache/spoiler-sample.txt', makeSpoilerLog(await logic(monitor, opts), opts));
process.exit(0);
