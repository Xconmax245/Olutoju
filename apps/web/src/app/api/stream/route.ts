export async function GET() {
  try {
    const res = await fetch('http://localhost:4000/api/stream');
    return new Response(res.body, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      }
    });
  } catch (err) {
    return new Response("Agent offline", { status: 500 });
  }
}
