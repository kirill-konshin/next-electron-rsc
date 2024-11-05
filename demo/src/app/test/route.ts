import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getIronSession } from 'iron-session';

export const dynamic = 'force-dynamic';

const password = '3YiABv0hXEjwD1Pof36HJUpW4HW7dQAG';

export async function POST(req: NextRequest) {
    const iteration = parseInt(req.cookies.get('iteration')?.value, 10) || 0;

    const res = NextResponse.json({
        message: 'Hello from Next.js! in response to ' + (await req.text()),
        cookies: (await cookies()).getAll(),
    });

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

    // const session = await getIronSession(req, res, { password, cookieName: 'iron' });
    const session = await getIronSession(await cookies(), { password, cookieName: 'iron' });
    session['username'] = 'Alison';
    await session.save();

    return res;
}
