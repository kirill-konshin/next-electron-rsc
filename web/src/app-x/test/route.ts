import { NextResponse as Response } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
    console.log(req);
    return Response.json({ message: 'Hello from Next.js! in response to ' + (await req.text()) });
}
