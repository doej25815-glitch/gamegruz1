import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json(
    {
      ok: false,
      message: "Auth route scaffold. Implement your auth flow here.",
    },
    { status: 501 }
  );
}
