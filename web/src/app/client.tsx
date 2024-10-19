'use client';

import { useEffect, useState } from 'react';
import { useApi } from '../lib/api';
import { IpcEvents } from 'next-pkg-common';

export default function Client({ foo }) {
    const { send, error, loading, data } = useApi<any[]>(IpcEvents.RANDOM);
    const [test, setTest] = useState<string>();

    useEffect(() => {
        send();
    }, [send]);

    useEffect(() => {
        fetch('/test', { method: 'POST', body: 'Hello from frontend!' })
            .then((res) => res.text())
            .then((text) => setTest(text));
    }, []);

    if (loading) return <div>Loading...</div>;
    if (error) return <div>Error: {error}</div>;

    return (
        <div>
            IPC: {data}, getServerSideProps: {foo}, API: {test}
        </div>
    );
}
