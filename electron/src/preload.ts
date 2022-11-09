import { contextBridge, ipcRenderer } from 'electron';
import { ipcError, IpcEvents, ipcSuccess } from 'next-pkg-common';

let validSendChannels = [IpcEvents.RANDOM];
let validReceiveChannels = [IpcEvents.RANDOM].reduce((r, c) => [...r, ipcSuccess(c), ipcError(c)], []);

contextBridge.exposeInMainWorld('api', {
    send: (channel, data) => {
        if (!validSendChannels.includes(channel)) {
            throw new Error(`Not a valid channel ${channel}`);
        }
        ipcRenderer.send(channel, data);
        console.log('Sent', channel, data);
    },
    receive: (channel, func) => {
        if (!validReceiveChannels.includes(channel)) {
            throw new Error(`Not a valid channel ${channel}`);
        }
        const listener = (event, data) => {
            console.log('Received', channel, data);
            func(data);
        };
        ipcRenderer.on(channel, listener);
        return () => ipcRenderer.removeListener(channel, listener);
    },
});
