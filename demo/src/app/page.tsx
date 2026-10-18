import electron, { app } from 'electron';

import { Client } from './client';

export default async function Page() {
    electron.shell?.beep();

    return (
        <Client
            server={`Node Version: ${process.version}, Electron Version: ${process.versions.electron}, App Version: ${app?.getVersion()}`}
        />
    );
}

export const dynamic = 'force-dynamic'; // ⚠️⚠️⚠️ THIS IS REQUIRED TO ENSURE PAGE IS DYNAMIC, NOT PRE-BUILT
