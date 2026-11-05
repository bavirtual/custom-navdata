import { app, BrowserWindow } from 'electron';
import squirrelStartup from 'electron-squirrel-startup';
import { registerIpcHandlers } from './main/ipc.js';
import { startAutomaticUpdates } from './main/updates.js';
import { createWindow } from './main/window.js';

if (squirrelStartup) {
    app.quit();
} else {
    if (process.argv.includes('--dev')) {
        const { default: reload } = await import('electron-reloader');
        reload(import.meta, { ignore: [/\.(?:c|m)?ts$/, 'package-lock.json'] });
    }
    app.whenReady().then(() => {
        app.setAppUserModelId(app.isPackaged
            ? 'com.squirrel.bavirtual_custom_navdata.BAVirtualCustomNavData'
            : 'BAVirtual.CustomNavData.Dev');
        registerIpcHandlers();
        createWindow();
        startAutomaticUpdates();
        app.on('activate', () => {
            if (BrowserWindow.getAllWindows().length === 0) createWindow();
        });
    });
    app.on('window-all-closed', () => {
        if (process.platform !== 'darwin') app.quit();
    });
}
