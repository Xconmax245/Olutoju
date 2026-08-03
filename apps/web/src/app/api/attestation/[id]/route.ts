import { NextResponse } from 'next/server';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const res = await fetch(`http://localhost:4000/api/attestation/${id}`, { cache: 'no-store' });
    if (!res.ok) return NextResponse.json(null, { status: 500 });
    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(null, { status: 500 });
  }
}
