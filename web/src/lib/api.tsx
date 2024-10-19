import { useCallback, useEffect, useState } from 'react';
import { ipcError, IpcEvents, ipcSuccess } from 'next-pkg-common';

export const api = global.api as {
    send: (name: IpcEvents | string, req?: any) => () => void;
    receive: (name: IpcEvents | string, cb: (res: any) => void) => () => void;
};

export function useApi<T>(event: IpcEvents) {
    const [error, setError] = useState<null | string>(null);
    const [data, setData] = useState<null | T>(undefined);
    const [loading, setLoading] = useState<boolean>(false);

    useEffect(() => {
        if (!api) return; // not in electron

        const unsubSuccess = api.receive(ipcSuccess(event), (data) => {
            setLoading(false);
            setData(data);
        });

        const unsubError = api.receive(ipcError(event), (e: string) => {
            setLoading(false);
            setError(e);
        });

        return () => {
            unsubSuccess();
            unsubError();
        };
    }, [event]);

    const reset = useCallback(() => {
        setData(undefined);
        setError(null);
        setLoading(true);
    }, []);

    const send = useCallback(
        (...args) => {
            if (!api) return; // not in electron
            //TODO Erase data? Currently we just keep it
            setError(null);
            setLoading(true);
            api.send(event, ...args);
        },
        [event],
    );

    return { send, error, data, loading, reset };
}
