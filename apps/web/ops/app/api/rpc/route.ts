import { NextRequest, NextResponse } from 'next/server';
import { getRpcAuthHeaders } from '../_utils/auth';

const RPC_URL = process.env.KUBERCOIN_RPC_URL || 'http://localhost:8634';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    const response = await fetch(RPC_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getRpcAuthHeaders(),
      },
      body: JSON.stringify(body),
    });

    const text = await response.text();
    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      data = { error: { message: text || `HTTP ${response.status}` } };
    }

    if (!response.ok) {
      return NextResponse.json(data, { status: response.status });
    }

    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json(
      { error: { message: error.message || 'RPC call failed' } },
      { status: 500 }
    );
  }
}
