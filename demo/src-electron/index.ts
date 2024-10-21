import path from 'path';
import { app, BrowserWindow, Menu, protocol, shell } from 'electron';
import defaultMenu from 'electron-default-menu';
import { createHandler } from 'next-electron-rsc';

const isDev = process.env.NODE_ENV === 'development';
const debugServer = !!process.env.DEBUG_SERVER;
const appPath = app.getAppPath();
const localhostUrl = 'http://localhost:3000'; // must match Next.js dev server

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
        icon: path.resolve(appPath, 'assets/icon.png'),
        webPreferences: {
            contextIsolation: true, // protect against prototype pollution
            devTools: true,
        },
    });

    mainWindow.once('ready-to-show', () => isDev && openDevTools());

    mainWindow.on('closed', () => (mainWindow = null));

    // Next.js handler

    const standaloneDir = path.join(appPath, '.next', 'standalone', 'demo');
    const staticDir = path.join(appPath, '.next', 'static');

    const { createInterceptor } = createHandler({
        standaloneDir,
        staticDir,
        localhostUrl,
        protocol,
        debug: true,
    });

    if (!isDev || debugServer) {
        if (debugServer) console.log(`[APP] Server Debugging Enabled, ${localhostUrl} will be intercepted`);
        createInterceptor();
    }

    // Next.js handler

    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        shell.openExternal(url).catch((e) => console.error(e));
        return { action: 'deny' };
    });

    const menu = defaultMenu(app, shell);
    Menu.setApplicationMenu(Menu.buildFromTemplate(menu));

    // Should be last, after all listeners and menu

    await app.whenReady();

    await mainWindow.loadURL(localhostUrl);

    console.log('[APP] Loaded', localhostUrl);
};

app.on('ready', createWindow);

app.on('window-all-closed', () => app.quit()); // if (process.platform !== 'darwin')

app.on('activate', () => mainWindow === null && createWindow());