import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { PlatformId } from '../navdata/types.js';
import type { DatabaseFile, ScanResult } from '../shared/api.js';

export type PackageInspector = (platform: PlatformId, file: string) => Promise<Pick<DatabaseFile, 'airac' | 'packages'>>;
/** Read only direct children; never traverse subfolders or linked files. */
export async function scanDirectory(id: ScanResult['id'], name: string, location: string, extension: string, inspect: PackageInspector, databasePath?: string): Promise<ScanResult> {
    const result: ScanResult = {
        id,
        name,
        location,
        status: 'ready',
        message: '',
        files: []
    };
    let failures = 0;
    try {
        const entries = await fs.readdir(location, { withFileTypes: true });
        for (const entry of entries) {
            if (!entry.isFile() || path.extname(entry.name).toLowerCase() !== extension)
                continue;
            const fullPath = path.join(location, entry.name);
            if (databasePath !== undefined && fullPath !== databasePath)
                continue;
            try {
                const stat = await fs.lstat(fullPath);
                if (!stat.isFile())
                    continue;
                result.files.push({
                    name: entry.name,
                    path: fullPath,
                    size: stat.size,
                    modified: stat.mtime.toISOString(),
                    ...await inspect(id, fullPath)
                });
            }
            catch {
                failures++;
            }
        }
    }
    catch (error) {
        const missing = ['ENOENT', 'ENOTDIR'].includes((error as NodeJS.ErrnoException).code || '');
        return {
            ...result,
            status: missing ? 'unavailable' : 'error',
            message: missing ? `${name} folder was not found. Install or configure the platform, then rescan.` : `${name} folder could not be read. Check permissions, then rescan.`
        };
    }
    result.files.sort((a, b) => id === 'fslabs'
        ? b.name.localeCompare(a.name, undefined, { numeric: true })
        : a.path.localeCompare(b.path));
    result.message = result.files.length ? `Found ${result.files.length} database file${result.files.length === 1 ? '' : 's'}.` : `No ${extension} database files were found in this folder.`;
    if (failures) {
        result.status = 'error';
        result.message += ' Some files could not be read. Check permissions and rescan.';
    }
    return result;
}
