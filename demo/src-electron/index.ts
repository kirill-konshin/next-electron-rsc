import path from 'path';
import { app, BrowserWindow, Menu, protocol, shell } from 'electron';
import defaultMenu from 'electron-default-menu';
import { createHandler } from 'next-electron-rsc';

const isDev = process.env.NODE_ENV === 'development';
const debugServer = !!process.env.DEBUG_SERVER;
const appPath = app.getAppPath();
const localhostUrl = 'http://localhost:666'; // must match Next.js dev server

let mainWindow;

process.env['ELECTRON_DISABLE_SECURITY_WARNINGS'] = 'true';
process.env['ELECTRON_ENABLE_LOGGING'] = 'true';

process.on('SIGTERM', () => process.exit(0));
process.on('SIGINT', () => process.exit(0));

const openDevTools = () => {
    mainWindow.setBounds({ width: 2000 });
    mainWindow.webContents.openDevTools();
};

const createWindow = async () => {
    mainWindow = new BrowserWindow({
        width: isDev ? 2000 : 1000,
        height: 800,
        webPreferences: {
            contextIsolation: true, // protect against prototype pollution
            devTools: true,
        },
    });

    // Next.js handler

    const standaloneDir = path.join(appPath, '.next', 'standalone', 'demo');

    const { createInterceptor } = createHandler({
        standaloneDir,
        localhostUrl,
        protocol,
        debug: true,
    });

    if (!isDev || debugServer) {
        if (debugServer) console.log(`[APP] Server Debugging Enabled, ${localhostUrl} will be intercepted`);
        createInterceptor();
    }

    // Next.js handler

    mainWindow.once('ready-to-show', () => isDev && openDevTools());

    mainWindow.on('closed', () => (mainWindow = null));

    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        shell.openExternal(url).catch((e) => console.error(e));
        return { action: 'deny' };
    });

    Menu.setApplicationMenu(Menu.buildFromTemplate(defaultMenu(app, shell)));

    // Should be last, after all listeners and menu

    await app.whenReady();

    await mainWindow.loadURL(localhostUrl + '/');

    console.log('[APP] Loaded', localhostUrl);
};

app.on('ready', createWindow);

app.on('window-all-closed', () => app.quit()); // if (process.platform !== 'darwin')

app.on('activate', () => BrowserWindow.getAllWindows().length === 0 && !mainWindow && createWindow());
