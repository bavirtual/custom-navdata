import { app, ipcMain } from 'electron';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { discoverDatabases, reloadDatabase } from '../discovery.js';
import { navDataService } from '../navdata/registry.js';
import type { InstallResult } from '../navdata/types.js';
import { parseInstallRequest, resolveInstallationTarget } from './installation-target.js';
import { isPlatformId } from '../shared/platforms.js';
import { rendererHtml } from './paths.js';

export function registerIpcHandlers(): void {
    ipcMain.handle('navdata:scan', () => discoverDatabases());
    ipcMain.handle('navdata:reload', (event, platformId: unknown, databasePath: unknown) => {
        if (event.senderFrame !== event.sender.mainFrame || event.senderFrame.url !== pathToFileURL(rendererHtml).href ||
            !isPlatformId(platformId) || typeof databasePath !== 'string') {
            throw new Error('Invalid reload request.');
        }
        return reloadDatabase(platformId, databasePath);
    });
    ipcMain.handle('navdata:packages', () => navDataService.packages.map(({ id, name, version, description }) => ({
        id,
        name,
        version,
        description
    })));
    ipcMain.handle('navdata:install', async (event, value: unknown): Promise<InstallResult> => {
        try {
            const trustedUrl = pathToFileURL(rendererHtml).href;
            if (event.senderFrame !== event.sender.mainFrame || event.senderFrame.url !== trustedUrl) {
                throw new Error('Untrusted insertion request.');
            }
            const request = parseInstallRequest(value);
            const file = await resolveInstallationTarget(request, await discoverDatabases());
            const backups = path.join(app.getPath('userData'), 'backups');
            return await navDataService.install(request.platformId, file, request.packageId, backups);
        }
        catch (error) {
            return { success: false, message: error instanceof Error ? error.message : 'Unable to insert data.' };
        }
    });
}
