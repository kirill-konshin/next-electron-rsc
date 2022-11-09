import path from 'path';
import fs from 'fs';
import vm from 'vm';
import resolve from 'resolve';
import { app, BrowserWindow, globalShortcut, Menu, protocol, shell } from 'electron';
import './api/random';

const isDev = process.env['NODE_ENV'] === 'development';
const appPath = app.getAppPath();
const indexPath = path.resolve(appPath, 'out');
const preload = path.resolve(__dirname, 'preload.js');
const localhostUrl = 'http://localhost:3000';

let mainWindow;

// if (isDev)
//     require('electron-reload')(__dirname, {
//         electron: path.join(__dirname, '..', 'node_modules', '.bin', 'electron'),
//     });

process.env['ELECTRON_DISABLE_SECURITY_WARNINGS'] = 'true';
process.env['ELECTRON_ENABLE_LOGGING'] = 'true';

const openDevTools = () => {
    mainWindow.setBounds({ width: 2000 });
    mainWindow.webContents.openDevTools();
};

// if (!isDev) {
const nextPath = path.join(__dirname, '..', 'out', '.next', 'standalone');

const requireCwd = (name) => require(resolve.sync(name, { basedir: nextPath }));

const sandbox = {
    require: requireCwd,
    __dirname: nextPath,
    process,
    console,
};
const data = fs.readFileSync(__dirname + '/server.js');
vm.runInNewContext(data.toString(), sandbox);
// }

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

    // if (!isDev) {
    //     // https://github.com/sindresorhus/electron-serve
    //     // https://stackoverflow.com/questions/52856299/youtube-videos-not-played-in-electron-app-but-in-a-website-does
    //     protocol.interceptBufferProtocol('http', (request, callback) => {
    //         if (request.url.includes(localhostUrl)) {
    //             let fileUrl = request.url.replace(localhostUrl, '');
    //             if (fileUrl === '/') {
    //                 fileUrl = 'index.html';
    //             }
    //             return callback(fs.readFileSync(path.join(indexPath, fileUrl)));
    //         }
    //         fetch(request.url, request)
    //             .then((res) => res.buffer())
    //             .then(callback)
    //             .catch(callback);
    //     });
    // }

    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        shell.openExternal(url).catch((e) => console.error(e));
        return { action: 'deny' };
    });

    const createMenu = (dev) =>
        Menu.setApplicationMenu(
            Menu.buildFromTemplate(
                [
                    {
                        label: 'Application',
                        submenu: [
                            {
                                label: 'Quit',
                                accelerator: 'Command+Q',
                                click: () => app.quit(),
                            },
                        ],
                    },
                    {
                        label: 'Edit',
                        submenu: [
                            {
                                label: 'Undo',
                                accelerator: 'CmdOrCtrl+Z',
                                selector: 'undo:',
                            },
                            {
                                label: 'Redo',
                                accelerator: 'Shift+CmdOrCtrl+Z',
                                selector: 'redo:',
                            },
                            { type: 'separator' },
                            {
                                label: 'Cut',
                                accelerator: 'CmdOrCtrl+X',
                                selector: 'cut:',
                            },
                            {
                                label: 'Copy',
                                accelerator: 'CmdOrCtrl+C',
                                selector: 'copy:',
                            },
                            {
                                label: 'Paste',
                                accelerator: 'CmdOrCtrl+V',
                                selector: 'paste:',
                            },
                            {
                                label: 'Select All',
                                accelerator: 'CmdOrCtrl+A',
                                selector: 'selectAll:',
                            },
                        ],
                    },
                    dev
                        ? {
                              label: 'Developer',
                              submenu: [
                                  {
                                      label: 'Open Dev Tools',
                                      accelerator: 'CmdOrCtrl+Alt+J',
                                      click: openDevTools,
                                  },
                              ],
                          }
                        : null,
                ].filter(Boolean) as any
            )
        );

    globalShortcut.register('CommandOrControl+Shift+D', () => {
        console.log('Dev Menu enabled');
        createMenu(true);
    });

    createMenu(isDev);

    // Should be last, after all listeners and menu

    await app.whenReady();

    await mainWindow.loadURL(localhostUrl);

    console.log('Loaded', localhostUrl);
};

app.on('ready', createWindow);

app.on('window-all-closed', () => app.quit()); // if (process.platform !== 'darwin')

app.on('activate', () => mainWindow === null && createWindow());
