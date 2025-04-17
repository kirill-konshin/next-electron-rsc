import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getIronSession } from 'iron-session';
import electron from 'electron';

export const dynamic = 'force-dynamic';

const password = '3YiABv0hXEjwD1Pof36HJUpW4HW7dQAG'; // random garbage for demo

export async function POST(req: NextRequest) {
    const iteration = parseInt(req.cookies.get('iteration')?.value, 10) || 0;

    const session = await getIronSession(await cookies(), { password, cookieName: 'iron' });
    session['username'] = 'Alison';
    session['iteration'] = iteration + 1;
    await session.save();

    const res = NextResponse.json({
        message: 'Hello from Next.js! in response to ' + (await req.text()),
        requestCookies: (await cookies()).getAll(),
        electron: electron.app.getVersion(),
        session, // never do this, it's just for demo to show what server knows
    });

    res.cookies.set('iteration', (iteration + 1).toString(), {
        path: '/',
        maxAge: 60 * 60, // 1 hour
    });

    res.cookies.set('sidebar:state', Date.now().toString(), {
        path: '/',
        maxAge: 60 * 60, // 1 hour
    });

    return res;
}
