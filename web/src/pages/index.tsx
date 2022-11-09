import { useEffect } from 'react';
import { useApi } from '../lib/api';
import { IpcEvents } from 'next-pkg-common';

export default function Index({ foo }) {
    const { send, error, loading, data } = useApi<any[]>(IpcEvents.RANDOM);

    useEffect(() => {
        send();
    }, [send]);

    if (loading) return <div>Loading...</div>;
    if (error) return <div>Error: {error}</div>;

    return (
        <div>
            {data}, foo: {foo}
        </div>
    );
}

export const getServerSideProps = () => ({ props: { foo: Math.random() } });
