import Client from './client';

import electron, { app, ipcMain } from 'electron';

export default async function Page() {
    electron.shell?.beep();

    return (
        <Client
            server={`Node Version: ${process.version}, Electron Version: ${process.versions.electron}, App Version: ${app?.getVersion()}`}
        />
    );
}

export const dynamic = 'force-dynamic'; // ⚠️⚠️⚠️ THIS IS REQUIRED TO ENSURE PAGE IS DYNAMIC, NOT PRE-BUILT
