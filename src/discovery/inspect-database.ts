import { Worker } from 'node:worker_threads';
import type { DatabaseFile } from '../shared/api.js';
import type { PlatformId } from '../shared/platforms.js';

export function inspectDatabase(platform: PlatformId, file: string): Promise<Pick<DatabaseFile, 'airac' | 'packages'>> {
    return new Promise((resolve, reject) => {
        const worker = new Worker(new URL('../navdata/inspect-worker.js', import.meta.url), { workerData: { platform, file } });
        worker.once('message', resolve);
        worker.once('error', reject);
        worker.once('exit', code => reject(new Error(`Database inspection ended without a result (exit ${code}).`)));
    });
}
