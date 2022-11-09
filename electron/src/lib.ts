import { ipcMain, IpcMainEvent } from 'electron';
import { ipcError, IpcEvents, ipcSuccess } from 'next-pkg-common';

export const wrapHandler = (event: IpcEvents, handler: (event: IpcMainEvent, data) => Promise<any>) => {
    ipcMain.on(event, async (ipcEvent, data) => {
        try {
            const res = await handler(ipcEvent, data);
            ipcEvent.sender.send(ipcSuccess(event), res);
        } catch (error) {
            ipcEvent.sender.send(ipcError(event), error.message);
            console.error(`Caught error`, error.stack);
        }
    });
};
