import { useEffect, useState } from 'react';
import { useApi } from '../lib/api';
import { IpcEvents } from 'next-pkg-common';

export default function Index({ foo }) {
    const { send, error, loading, data } = useApi<any[]>(IpcEvents.RANDOM);
    const [test, setTest] = useState<string>();

    useEffect(() => {
        send();
    }, [send]);

    useEffect(() => {
        fetch('/api/test')
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

export const getServerSideProps = () => ({ props: { foo: Math.random() } });
