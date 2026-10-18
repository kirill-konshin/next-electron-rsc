export const dynamic = 'force-dynamic';

export function GET() {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
        async start(controller) {
            for (const chunk of ['a', 'b', 'c']) {
                controller.enqueue(encoder.encode(chunk));
                await new Promise((resolve) => setTimeout(resolve, 20));
            }
            controller.close();
        },
    });
    return new Response(stream, { headers: { 'content-type': 'text/plain' } });
}
