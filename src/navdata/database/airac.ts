import { DatabaseSync } from 'node:sqlite';
import type { AiracInfo } from '../../shared/api.js';
import type { PlatformId } from '../../shared/platforms.js';

export function readAirac(platform: PlatformId, file: string): AiracInfo | null {
    let db: DatabaseSync | undefined;
    try {
        db = new DatabaseSync(file, { readOnly: true, timeout: 1000 });
        const row = platform === 'fslabs'
            ? db.prepare(`
                SELECT VALUE AS cycle,
                    (SELECT VALUE FROM CYCLE_INFO WHERE PARAMETER = 'SEQUENCE') AS revision
                FROM CYCLE_INFO WHERE PARAMETER = 'CYCLE'
            `).get()
            : db.prepare('SELECT cycle, revision FROM tbl_hdr_header').get();
        const cycle = String(row?.cycle ?? '').trim();
        if (!/^[0-9]{2}(0[1-9]|1[0-3])$/.test(cycle))
            return null;
        return {
            cycle,
            revision: String(row?.revision ?? '').trim() || undefined
        };
    }
    catch {
        return null;
    }
    finally {
        db?.close();
    }
}
