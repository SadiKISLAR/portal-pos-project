import { NextRequest, NextResponse } from "next/server";
import { erpGet, erpPut } from "@/lib/erp";
import crypto from "crypto";

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();
    
    if (!email) {
      return NextResponse.json({ error: "Email required" }, { status: 400 });
    }

    // Request'ten origin'i al
    const origin = req.headers.get('origin') || req.headers.get('referer')?.split('/').slice(0, 3).join('/') || '';

    const token = process.env.ERP_API_TOKEN;
    if (!token) {
      return NextResponse.json({ error: "Token missing" }, { status: 500 });
    }

    // Lead'i bul
    const leadFilters = encodeURIComponent(JSON.stringify([["email_id", "=", email]]));
    const leadResult = await erpGet(`/api/resource/Lead?filters=${leadFilters}&limit_page_length=1`, token);
    const leads = leadResult?.data || (Array.isArray(leadResult) ? leadResult : []);

    if (leads.length === 0) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    const leadName = leads[0].name;

    // Benzersiz e-imza token oluştur
    const signatureToken = crypto.randomBytes(32).toString('hex');
    const tokenExpiry = new Date();
    tokenExpiry.setDate(tokenExpiry.getDate() + 7); // 7 gün geçerli

    // Token'ı Lead'e kaydet ve statüyü "Pending E-Signature" yap
    const updatePayload = {
      custom_esignature_token: signatureToken,
      custom_esignature_token_expiry: tokenExpiry.toISOString().split('T')[0],
      custom_registration_status: "Pending E-Signature"
    };

    console.log("📤 Updating Lead with e-signature token:", {
      leadName,
      token: signatureToken.substring(0, 10) + "...",
      expiry: tokenExpiry.toISOString().split('T')[0],
      status: "Pending E-Signature"
    });

    const updateResult = await erpPut(`/api/resource/Lead/${encodeURIComponent(leadName)}`, updatePayload, token);
    
    console.log("📥 ERPNext update response:", JSON.stringify(updateResult, null, 2));

    // ERPNext hata kontrolü
    if (updateResult?.exc_type || updateResult?.exception || updateResult?.error) {
      console.error("❌ ERPNext update failed!");
      console.error("  - Error type:", updateResult?.exc_type);
      console.error("  - Exception:", updateResult?.exception);
      console.error("  - Error:", updateResult?.error);
      
      // Server messages'ı parse et
      if (updateResult?._server_messages) {
        try {
          const msgs = JSON.parse(updateResult._server_messages);
          const msgObj = JSON.parse(msgs[0]);
          console.error("  - Server message:", msgObj.message);
          
          // Field yoksa özel mesaj göster
          if (msgObj.message?.includes("custom_esignature") || msgObj.message?.includes("field")) {
            return NextResponse.json({ 
              error: "E-imza field'ları ERPNext'te tanımlı değil. Lütfen custom field'ları ekleyin.",
              details: msgObj.message,
              requiredFields: [
                "custom_esignature_token",
                "custom_esignature_token_expiry",
                "custom_registration_status"
              ]
            }, { status: 400 });
          }
        } catch (e) {
          console.error("  - Could not parse server messages");
        }
      }
      
      return NextResponse.json({ 
        error: updateResult?.exception || updateResult?.error || "Failed to update Lead",
        details: updateResult
      }, { status: 500 });
    }

    // Başarı kontrolü
    if (!updateResult?.data && !updateResult?.message) {
      console.warn("⚠️ Update response format unexpected:", updateResult);
    }

    // E-imza URL'ini oluştur
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 
                    process.env.NEXT_PUBLIC_FRONTEND_URL || 
                    origin ||
                    'http://localhost:3000';
    const signatureUrl = `${baseUrl}/e-signature-document/${signatureToken}`;
    
    console.log("🔗 E-signature URL created:", signatureUrl);
    console.log("  - Using baseUrl:", baseUrl);

    console.log("✅ E-signature token created successfully:", {
      signatureToken: signatureToken.substring(0, 10) + "...",
      signatureUrl,
      leadName
    });

    return NextResponse.json({
      success: true,
      signatureToken,
      signatureUrl,
      expiresAt: tokenExpiry.toISOString(),
      leadName
    });

  } catch (e: any) {
    console.error("❌ Create e-signature token failed:", e);
    return NextResponse.json({ 
      error: e.message || "Server Error",
      details: e?.response?.data 
    }, { status: 500 });
  }
}
