import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const res = await fetch('http://localhost:4000/api/mcp/tools', { cache: 'no-store' });
    if (!res.ok) return NextResponse.json({ error: 'Agent unreachable' }, { status: 502 });
    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: 'Agent unreachable' }, { status: 502 });
  }
}
