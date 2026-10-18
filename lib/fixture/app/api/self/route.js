export const dynamic = 'force-dynamic';

// Next.js fetching its own origin, like the page a Server Action redirects to
export async function GET(request) {
    const response = await fetch(new URL('/api/echo', request.url), {
        headers: { 'x-test': 'self' },
        cache: 'no-store',
    });
    return Response.json(await response.json());
}
