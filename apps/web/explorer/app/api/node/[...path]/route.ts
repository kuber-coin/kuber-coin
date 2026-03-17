import { NextRequest, NextResponse } from 'next/server';
import { getRpcAuthHeaders } from '../../_utils/auth';

const NODE_URL = process.env.KUBERCOIN_RPC_URL || 'http://localhost:8634';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  const apiPath = path.join('/');
  const search = request.nextUrl.search;
  const target = `${NODE_URL}/api/${apiPath}${search}`;

  try {
    const response = await fetch(target, {
      headers: {
        'Content-Type': 'application/json',
        ...getRpcAuthHeaders(),
      },
      cache: 'no-store',
    });

    const text = await response.text();
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      return NextResponse.json(
        { error: `HTTP ${response.status}` },
        { status: response.status },
      );
    }

    return NextResponse.json(data, { status: response.status });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Node request failed';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
