import { NextResponse, type NextRequest } from "next/server";
import { recordOpenAndRedirect } from "@/lib/landing";

type Params = Promise<{ salesSlug: string }>;

export async function GET(request: NextRequest, { params }: { params: Params }) {
  const { salesSlug } = await params;
  const source = request.nextUrl.searchParams.get("src");
  const userAgent = request.headers.get("user-agent");

  try {
    const { redirectTo } = await recordOpenAndRedirect({
      salesSlug,
      source,
      userAgent,
    });
    return NextResponse.redirect(redirectTo, 302);
  } catch (error) {
    console.error("[landing] failed to record open", error);
    return NextResponse.redirect("https://www.google.com/maps", 302);
  }
}
