import { parentPort, workerData } from 'node:worker_threads';
import { navDataService } from './registry.js';
import { readAirac } from './database/airac.js';
import type { PlatformId } from '../shared/platforms.js';

const { platform, file } = workerData as { platform: PlatformId; file: string };
parentPort?.postMessage({
    airac: readAirac(platform, file),
    packages: navDataService.inspect(platform, file)
});
