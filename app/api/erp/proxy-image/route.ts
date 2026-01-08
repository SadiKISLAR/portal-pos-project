import { NextRequest, NextResponse } from "next/server";

/**
 * ERPNext'teki private dosyaları proxy ile geçirir
 * Bu sayede frontend'den authentication olmadan erişilebilir
 */
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const imageUrl = searchParams.get("url");

    if (!imageUrl) {
      return NextResponse.json(
        { error: "URL parameter is required" },
        { status: 400 }
      );
    }

    const token = process.env.ERP_API_TOKEN;
    const baseUrl = process.env.NEXT_PUBLIC_ERP_BASE_URL;

    if (!token || !baseUrl) {
      return NextResponse.json(
        { error: "ERP configuration is missing" },
        { status: 500 }
      );
    }

    // URL'i oluştur
    let fullUrl = imageUrl;
    if (!imageUrl.startsWith("http")) {
      fullUrl = `${baseUrl}${imageUrl}`;
    }

    // ERPNext'ten resmi çek (authentication ile)
    const response = await fetch(fullUrl, {
      headers: {
        'Authorization': `token ${token}`,
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      console.error(`Failed to fetch image: ${response.status} ${response.statusText}`);
      return NextResponse.json(
        { error: `Failed to fetch image: ${response.status}` },
        { status: response.status }
      );
    }

    // Content-Type'ı al
    const contentType = response.headers.get("content-type") || "image/jpeg";

    // Resim verisini al
    const imageBuffer = await response.arrayBuffer();

    // Resmi döndür
    return new NextResponse(imageBuffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400", // 1 gün cache
      },
    });
  } catch (error: any) {
    console.error("Proxy image error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to proxy image" },
      { status: 500 }
    );
  }
}

