import { NextRequest, NextResponse } from "next/server";
import { erpPost } from "@/lib/erp";

export async function POST(req: NextRequest) {
  try {
    const { full_name, email } = await req.json();

    if (!full_name || !email) {
      return NextResponse.json({ error: "Ad Soyad ve Email zorunludur." }, { status: 400 });
    }

    const token = process.env.ERP_API_TOKEN;

    if (!token) {
      return NextResponse.json({ error: "Server configuration missing (check .env)." }, { status: 500 });
    }

    // Frontend URL'ini environment variable'dan al, yoksa varsayılan olarak Vercel URL'ini kullan
    const frontendUrl = process.env.NEXT_PUBLIC_FRONTEND_URL || "https://portal-pos-projectv2.vercel.app";

    // İŞLEMİ ERP'YE DEVRET
    // Bu Python fonksiyonu ERP'de yüklü olmalı: portal_onboarding.api.signup.start_signup
    const data = await erpPost(
      "/api/method/portal_onboarding.api.signup.start_signup",
      { full_name, email, frontend_url: frontendUrl },
      token
    );

    if (data?.exc_type || data?.exception || data?.error) {
      // ERP'den dönen hatayı okunaklı hale getir
      let errorMessage = "An error occurred.";
      if (data?._server_messages) {
        try {
          const msgs = JSON.parse(data._server_messages);
          const msgObj = JSON.parse(msgs[0]);
          errorMessage = msgObj.message || errorMessage;
        } catch {}
      } else if (data?.message) {
        errorMessage = data.message;
      } else if (data?.exception) {
        errorMessage = data.exception;
      }
      
      return NextResponse.json({ error: errorMessage }, { status: 400 });
    }

    return NextResponse.json({ 
        success: true, 
        message: data.message?.message || "Verification email sent by ERP." 
    });

  } catch (error: any) {
    console.error("Proxy error:", error);
    return NextResponse.json({ error: "Could not connect to ERP server." }, { status: 500 });
  }
}