import { NextRequest, NextResponse } from "next/server";
import { erpGet, erpPut, erpUploadFile } from "@/lib/erp";

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const { token: signatureToken, signatureData, signerName, signerIp } = await req.json();

    if (!signatureToken) {
      return NextResponse.json({ error: "Token required" }, { status: 400 });
    }

    if (!signatureData) {
      return NextResponse.json({ error: "Signature data required" }, { status: 400 });
    }

    const token = process.env.ERP_API_TOKEN;
    if (!token) {
      return NextResponse.json({ error: "API token missing" }, { status: 500 });
    }

    // Token ile Lead'i bul
    const leadFilters = encodeURIComponent(JSON.stringify([["custom_esignature_token", "=", signatureToken]]));
    const leadResult = await erpGet(`/api/resource/Lead?filters=${leadFilters}&limit_page_length=1`, token);
    const leads = leadResult?.data || (Array.isArray(leadResult) ? leadResult : []);

    if (leads.length === 0) {
      return NextResponse.json({ error: "Invalid or expired token" }, { status: 404 });
    }

    const leadName = leads[0].name;

    // Lead'in tam verisini çek
    const fullLeadRes = await erpGet(`/api/resource/Lead/${encodeURIComponent(leadName)}`, token);
    const lead = fullLeadRes?.data || fullLeadRes;

    if (!lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    // Token süresini kontrol et
    if (lead.custom_esignature_token_expiry) {
      const expiryDate = new Date(lead.custom_esignature_token_expiry);
      if (expiryDate < new Date()) {
        return NextResponse.json({ error: "Token expired" }, { status: 410 });
      }
    }

    // Zaten imzalanmış mı kontrol et
    if (lead.custom_esignature_signed_at) {
      return NextResponse.json({ 
        error: "Document already signed",
        signedAt: lead.custom_esignature_signed_at 
      }, { status: 409 });
    }

    // İmza zamanı
    const signedAt = new Date().toISOString();

    // İmza verisini base64'ten binary'ye çevir ve dosya olarak kaydet
    let signatureFileUrl = "";
    try {
      // Base64 data URL'den sadece base64 kısmını al
      const base64Data = signatureData.replace(/^data:image\/\w+;base64,/, "");
      const buffer = Buffer.from(base64Data, "base64");
      
      // File objesi oluştur
      const signatureBlob = new Blob([buffer], { type: "image/png" });
      const signatureFile = new File([signatureBlob], `signature_${leadName}_${Date.now()}.png`, { type: "image/png" });
      
      // ERPNext'e yükle
      const uploadResult = await erpUploadFile(signatureFile, token, {
        doctype: "Lead",
        docname: leadName,
        is_private: 1  // Private dosya olarak kaydet
      });

      if (uploadResult?.message?.file_url) {
        const BASE_URL = process.env.NEXT_PUBLIC_ERP_BASE_URL;
        const relativePath = uploadResult.message.file_url.startsWith("/") 
          ? uploadResult.message.file_url 
          : `/${uploadResult.message.file_url}`;
        signatureFileUrl = BASE_URL ? `${BASE_URL}${relativePath}` : relativePath;
      }
    } catch (uploadError) {
      console.error("⚠️ Signature file upload failed:", uploadError);
      // Yükleme başarısız olsa bile devam et, base64 olarak kaydet
    }

    // Lead'i güncelle - İmza bilgilerini ve statüyü kaydet
    const updatePayload: any = {
      custom_esignature_signed_at: signedAt,
      custom_esignature_signer_name: signerName || lead.lead_name || "",
      custom_esignature_signer_ip: signerIp || "",
      custom_registration_status: "Completed",  // İmza atıldıktan sonra Completed yap
      // Token'ı temizle (bir kere kullanıldı)
      custom_esignature_token: "",
      custom_esignature_token_expiry: ""
    };

    // İmza dosyası URL'i varsa ekle
    if (signatureFileUrl) {
      updatePayload.custom_esignature_file = signatureFileUrl;
    } else {
      // Dosya yüklenemezse base64 olarak kaydet (kısaltılmış)
      updatePayload.custom_esignature_data = signatureData.substring(0, 65000); // ERPNext text field limiti
    }

    await erpPut(`/api/resource/Lead/${encodeURIComponent(leadName)}`, updatePayload, token);

    console.log("✅ E-Signature saved successfully for Lead:", leadName);

    return NextResponse.json({
      success: true,
      message: "Document signed successfully",
      signedAt,
      leadName,
      companyName: lead.company_name || lead.lead_name
    });

  } catch (e: any) {
    console.error("❌ Save e-signature failed:", e);
    return NextResponse.json({ 
      error: e.message || "Server Error",
      details: e?.response?.data 
    }, { status: 500 });
  }
}
