import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    status: "OK",
    message: "Welcome to the FixFX API Documentation.",
    routes: [
      {
        name: "search",
        path: "/api/search?query=test",
      },
    ],
  });
}
