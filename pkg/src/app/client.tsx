'use client';

import { useEffect, useState } from 'react';

import Image from 'next/image';

export function Client({ foo }) {
    const [text, setText] = useState<string>();

    useEffect(() => {
        void (async () => {
            const res = await fetch('/test', { method: 'POST', body: 'Hello from frontend!' });
            setText(await res.text());
        })();
    }, []);

    return (
        <div>
            Server: {foo}, API: {text}
            <Image src="/image.png" width={1000} height={420} alt="Next Electron RSC" />
            <img src="https://picsum.photos/1000/420" width={1000} height={420} alt="Next Electron RSC" />
        </div>
    );
}
