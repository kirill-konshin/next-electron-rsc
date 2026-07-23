export const ELECTRON_APP_KEY = '__NEXT_ELECTRON_RSC_APP__';
export const ELECTRON_MODULE_KEY = '__NEXT_ELECTRON_RSC_ELECTRON__';

const NOT_AVAILABLE_MSG =
    'Electron app not available. Ensure createHandler() from next-electron-rsc has been called in the Electron main process.';

/**
 * Returns the Electron app. Throws if createHandler() has not been called in the Electron main process.
 * Use this in Next.js server code (pages, route handlers) for guaranteed access to the app.
 */
export function getApp(): import('electron').App {
    const app = (globalThis as any)[ELECTRON_APP_KEY];
    if (app === undefined) throw new Error(NOT_AVAILABLE_MSG);
    return app;
}

/**
 * Returns the full Electron module. Throws if createHandler() has not been called in the Electron main process.
 * Use this in Next.js server code for shell, ipcMain, etc.
 */
export function getElectron(): typeof import('electron') {
    const electron = (globalThis as any)[ELECTRON_MODULE_KEY];
    if (electron === undefined) throw new Error(NOT_AVAILABLE_MSG);
    return electron;
}
