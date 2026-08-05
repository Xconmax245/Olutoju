import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const res = await fetch('http://localhost:4000/api/retainer', { cache: 'no-store' });
    if (!res.ok) return NextResponse.json({ configured: false }, { status: 500 });
    return NextResponse.json(await res.json());
  } catch {
    return NextResponse.json({ configured: false, error: 'Agent offline' }, { status: 500 });
  }
}
