import Client from './client';

export default async function Page() {
    const foo = process.version;

    return (
        <div>
            <Client foo={foo} />
        </div>
    );
}
