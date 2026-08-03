import { NextResponse } from 'next/server';

export async function POST() {
  try {
    const headers: Record<string, string> = {};
    if (process.env.CHAOS_TRIGGER_SECRET) {
      headers['x-chaos-secret'] = process.env.CHAOS_TRIGGER_SECRET;
    }

    const res = await fetch('http://localhost:4000/api/chaos-mode/trigger', { 
      method: 'POST', 
      headers,
      cache: 'no-store' 
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return NextResponse.json({ error: data.error || "Request failed" }, { status: res.status });
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: "Agent connection failed" }, { status: 500 });
  }
}
