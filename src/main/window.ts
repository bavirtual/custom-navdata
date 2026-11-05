import { BrowserWindow } from 'electron';
import { preloadScript, rendererHtml, windowIcon } from './paths.js';

export function createWindow(): BrowserWindow {
    const window = new BrowserWindow({
        title: 'BAVirtual Custom Nav Data',
        icon: windowIcon,
        autoHideMenuBar: true,
        backgroundColor: '#f3f5f8',
        width: 1100,
        height: 700,
        minWidth: 650,
        minHeight: 450,
        webPreferences: {
            preload: preloadScript,
            nodeIntegration: false,
            contextIsolation: true
        }
    });
    void window.loadFile(rendererHtml);
    return window;
}
