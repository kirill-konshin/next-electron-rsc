'use client';

import { useEffect, useState } from 'react';

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
        </div>
    );
}
