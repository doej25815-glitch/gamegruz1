import { NextResponse } from "next/server";
import { farcasterConfig } from "@/farcaster.config";

export async function GET() {
  return NextResponse.json(farcasterConfig);
}
