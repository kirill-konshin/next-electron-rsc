import path from 'path';
import { app, BrowserWindow, globalShortcut, Menu, protocol, shell } from 'electron';
import './api/random';
import { processRequest, processStatic, startServer } from './next';
import defaultMenu from 'electron-default-menu';

const isDev = process.env.NODE_ENV === 'development';
const debugServer = true;
const appPath = app.getAppPath();
const preload = path.resolve(__dirname, 'preload.js');
const localhostUrl = 'http://localhost:3000';

let mainWindow;

if (isDev)
    require('electron-reload')(__dirname, {
        electron: path.join(__dirname, '..', 'node_modules', '.bin', 'electron'),
    });

process.env['ELECTRON_DISABLE_SECURITY_WARNINGS'] = 'true';
process.env['ELECTRON_ENABLE_LOGGING'] = 'true';

process.on('SIGTERM', () => process.exit(0));
process.on('SIGINT', () => process.exit(0));

const openDevTools = () => {
    mainWindow.setBounds({ width: 2000 });
    mainWindow.webContents.openDevTools();
};

if (!isDev || debugServer) {
    startServer();
}

const createWindow = async () => {
    mainWindow = new BrowserWindow({
        width: isDev ? 2000 : 1000,
        height: 1200, //FIXME Airs?
        icon: path.resolve(appPath, 'assets/icon.png'),
        // titleBarStyle: 'hidden', // Can't move with hidden
        webPreferences: {
            nodeIntegration: false, // is default value after Electron v5
            nodeIntegrationInWorker: true,
            contextIsolation: true, // protect against prototype pollution
            // enableRemoteModule: false, // turn off remote
            webSecurity: false,
            devTools: true,
            preload,
        },
    });

    mainWindow.once('ready-to-show', () => isDev && openDevTools());

    mainWindow.on('closed', () => (mainWindow = null));

    if (!isDev || debugServer) {
        protocol.interceptBufferProtocol('http', async (request, callback) => {
            if (request.url.includes(localhostUrl)) {
                // https://github.com/sindresorhus/electron-serve
                if (request.url.includes('/_next/')) {
                    console.log('[NEXT] Static', request.url);
                    return callback(processStatic(request));
                }

                try {
                    const response = await processRequest(request);
                    console.log('[NEXT] Success');
                    callback(response);
                } catch (e) {
                    console.log('[NEXT] Error', e);
                    callback(e);
                }
            }
        });
    }

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
