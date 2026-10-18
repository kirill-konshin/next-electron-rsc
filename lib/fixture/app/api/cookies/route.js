export const dynamic = 'force-dynamic';

export function GET() {
    const response = new Response('ok');
    response.headers.append('set-cookie', 'age=1; Max-Age=60; Path=/; HttpOnly; SameSite=Lax');
    response.headers.append('set-cookie', `expires=1; Expires=${new Date(Date.now() + 60_000).toUTCString()}; Path=/`);
    response.headers.append('set-cookie', 'gone=; Max-Age=0; Path=/');
    response.headers.append('set-cookie', 'signed=abc%2Fdef%3D; Path=/; SameSite=Strict');
    return response;
}
