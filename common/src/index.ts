export enum IpcEvents {
    RANDOM = 'RANDOM',
}

export const ipcSuccess = (event: IpcEvents) => event + ':SUCCESS';
export const ipcError = (event: IpcEvents) => event + ':ERROR';
