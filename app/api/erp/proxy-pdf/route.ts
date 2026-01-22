import { NextRequest, NextResponse } from "next/server";

/**
 * External PDF dosyalarını proxy ile geçirir
 * Bu sayede CORS sorunları çözülür
 */
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    let pdfUrl = searchParams.get("url");

    if (!pdfUrl) {
      return NextResponse.json(
        { error: "URL parameter is required" },
        { status: 400 }
      );
    }

    // URL'i decode et
    pdfUrl = decodeURIComponent(pdfUrl);

    console.log("📄 Fetching PDF:", pdfUrl);

    // PDF'i çek
    const response = await fetch(pdfUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/pdf',
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      console.error(`Failed to fetch PDF: ${response.status} ${response.statusText}`);
      console.error(`  - URL: ${pdfUrl}`);
      console.error(`  - Error response: ${errorText.substring(0, 200)}`);
      return NextResponse.json(
        { error: `Failed to fetch PDF: ${response.status} ${response.statusText}` },
        { status: response.status }
      );
    }

    // Content-Type'ı al
    const contentType = response.headers.get("content-type") || "application/pdf";
    console.log("✅ PDF fetched successfully:", {
      status: response.status,
      contentType,
      url: pdfUrl
    });

    // PDF verisini al
    const pdfBuffer = await response.arrayBuffer();

    // PDF'i döndür
    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `inline; filename="agreement.pdf"`,
        "Cache-Control": "public, max-age=3600", // 1 saat cache
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET",
      },
    });
  } catch (error: any) {
    console.error("Proxy PDF error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to proxy PDF" },
      { status: 500 }
    );
  }
}
