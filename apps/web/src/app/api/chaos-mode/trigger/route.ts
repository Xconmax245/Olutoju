import { NextResponse } from 'next/server';

export async function POST() {
  try {
    const res = await fetch('http://localhost:4000/api/chaos-mode/trigger', { method: 'POST', cache: 'no-store' });
    const data = await res.json();
    if (!res.ok) return NextResponse.json({ error: data.error }, { status: 500 });
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: "Agent connection failed" }, { status: 500 });
  }
}
