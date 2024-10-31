'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';

export default function Client({ foo }) {
    const [text, setText] = useState<string>();

    useEffect(() => {
        fetch('/test', { method: 'POST', body: 'Hello from frontend!' })
            .then((res) => res.text())
            .then((text) => setText(text));
    }, []);

    return (
        <div>
            Server: {foo}, API: {text}
            <Image src="/image.png" width={1000} height={420} alt="Next Electron RSC" />
            <img src="https://picsum.photos/1000/420" width={1000} height={420} alt="Next Electron RSC" />
        </div>
    );
}
