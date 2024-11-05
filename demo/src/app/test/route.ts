import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
    const iteration = parseInt(req.cookies.get('iteration')?.value, 10) || 0;

    const res = NextResponse.json({ message: 'Hello from Next.js! in response to ' + (await req.text()) });

    res.cookies.set('iteration', (iteration + 1).toString(), {
        path: '/',
        maxAge: 60 * 60, // 1 hour
    });

    res.cookies.set('date', Date.now().toString(), {
        path: '/',
        maxAge: 60 * 60, // 1 hour
    });

    res.cookies.set('sidebar:state', Date.now().toString(), {
        path: '/',
        maxAge: 60 * 60, // 1 hour
    });

    return res;
}
