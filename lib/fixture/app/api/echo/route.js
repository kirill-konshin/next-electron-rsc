export const dynamic = 'force-dynamic';

async function echo(request) {
    return Response.json({
        method: request.method,
        body: await request.text(),
        test: request.headers.get('x-test'),
        cookie: request.headers.get('cookie'),
    });
}

export { echo as GET, echo as POST, echo as PUT };
