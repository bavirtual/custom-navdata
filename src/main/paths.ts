import path from 'node:path';

// This module compiles to dist/main/paths.js.
export const rendererHtml = path.resolve(import.meta.dirname, '../../src/index.html');
export const preloadScript = path.resolve(import.meta.dirname, '../preload.cjs');
export const windowIcon = path.resolve(import.meta.dirname, '../../src/images/logo.png');
