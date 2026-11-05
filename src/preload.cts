import { contextBridge, ipcRenderer } from 'electron';
import type { NavDataApi } from './shared/api.js';

// Keep runtime dependencies limited to Electron: sandboxed preloads cannot load local modules.
const api: NavDataApi = {
    scan: () => ipcRenderer.invoke('navdata:scan'),
    reload: (platformId, databasePath) => ipcRenderer.invoke('navdata:reload', platformId, databasePath),
    packages: () => ipcRenderer.invoke('navdata:packages'),
    install: request => ipcRenderer.invoke('navdata:install', request)
};
contextBridge.exposeInMainWorld('navdata', api);
