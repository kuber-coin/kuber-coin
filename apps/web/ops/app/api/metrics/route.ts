import { NextResponse } from 'next/server';

const METRICS_URL = process.env.KUBERCOIN_METRICS_URL || 'http://localhost:9091/metrics';

export async function GET() {
  try {
    const response = await fetch(METRICS_URL);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const text = await response.text();
    return new NextResponse(text, {
      headers: { 'Content-Type': 'text/plain' },
    });
  } catch (error: any) {
    return new NextResponse(
      `# Error fetching metrics: ${error.message}`,
      { status: 500, headers: { 'Content-Type': 'text/plain' } }
    );
  }
}
