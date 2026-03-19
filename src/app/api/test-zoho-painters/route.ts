import { NextResponse } from 'next/server';
import { zohoClient } from '@/lib/zoho';

export async function GET() {
  try {
    const list = await zohoClient.getPainters();
    return NextResponse.json({
      count: list.length,
      sample: list.slice(0, 5),
      maddie: list.find(x => x.Name === "Maddie" || x.Name?.includes("Maddie"))
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
