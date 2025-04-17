'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';

export default function Client({ server }) {
    const [json, setJson] = useState<string>();
    const [cookie, setCookie] = useState<string>();

    useEffect(() => {
        console.log('Fetch');
        fetch('/test', { method: 'POST', body: 'Hello from frontend!' })
            .then((res) => res.json())
            .then((text) => setJson(text))
            .catch((err) => err.toString());
    }, []);

    useEffect(() => {
        setCookie(document.cookie);
    }, []);

    return (
        <pre>
            Server: {server}
            <br />
            API response: {JSON.stringify(json, null, 2)}
            <br />
            Frontend cookie: {cookie}
            <br />
            <Image src="/image.png" width={1000} height={420} alt="Next Electron RSC" />
            <br />
            <img src="https://picsum.photos/1000/420" width={1000} height={420} alt="Next Electron RSC" />
        </pre>
    );
}
