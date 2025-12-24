import { NextRequest, NextResponse } from "next/server";
import { erpPost, erpGet } from "@/lib/erp";

export async function POST(req: NextRequest) {
  try {
    const { 
      email, // User'ı bulmak için
      companyInfo, // Company Information form verileri
      businesses, // Business bilgileri (array)
    } = await req.json();

    if (!email) {
      return NextResponse.json(
        { error: "Email is required to find user" },
        { status: 400 }
      );
    }

    const token = process.env.ERP_API_TOKEN;

    if (!token) {
      return NextResponse.json(
        { error: "ERP_API_TOKEN environment variable is not set" },
        { status: 500 }
      );
    }

    // 1) User'ı email ile bul
    let user;
    try {
      user = await erpGet(`/api/resource/User/${encodeURIComponent(email)}`, token);
      user = user?.data || user;
    } catch (e: any) {
      return NextResponse.json(
        { error: "User not found. Please register first." },
        { status: 404 }
      );
    }

    // 2) Custom User Register'dan company_name gibi ek bilgileri al
    let customUserRegister = null;
    try {
      // Custom User Register'ı user link'i ile bul
      // ERPNext filter formatı: [["field","=","value"]]
      const filters = encodeURIComponent(JSON.stringify([["user", "=", user.name]]));
      const fields = encodeURIComponent(JSON.stringify(["*"]));
      const customUserResult = await erpGet(
        `/api/resource/Custom User Register?filters=${filters}&fields=${fields}`,
        token
      );
      
      if (customUserResult?.data && Array.isArray(customUserResult.data) && customUserResult.data.length > 0) {
        customUserRegister = customUserResult.data[0];
      } else if (Array.isArray(customUserResult) && customUserResult.length > 0) {
        customUserRegister = customUserResult[0];
      }
    } catch (e: any) {
      console.warn("Could not fetch Custom User Register:", e.message);
      // Custom User Register bulunamazsa devam et, zorunlu değil
    }

    // 3) Lead oluştur
    // Company name'i Custom User Register'dan al, yoksa formdan al
    const companyName = customUserRegister?.company_name || companyInfo?.companyName || "";

    // Lead payload'ı hazırla
    const leadPayload: any = {
      lead_name: companyName || user.first_name || email, // Lead'in ana ismi
      company_name: companyName,
      email_id: email,
      status: "Open",
      lead_type: "Client",
    };

    // Telefon numarası (Custom User Register'dan veya User'dan)
    if (customUserRegister?.telephone) {
      leadPayload.phone = customUserRegister.telephone;
      leadPayload.mobile_no = customUserRegister.telephone;
    } else if (user.mobile_no) {
      leadPayload.phone = user.mobile_no;
      leadPayload.mobile_no = user.mobile_no;
    }

    // Company Address bilgileri
    if (companyInfo) {
      if (companyInfo.street) {
        leadPayload.address_line1 = companyInfo.street;
      }
      if (companyInfo.city) {
        leadPayload.city = companyInfo.city;
      }
      if (companyInfo.zipCode) {
        leadPayload.pincode = companyInfo.zipCode;
      }
      if (companyInfo.federalState) {
        leadPayload.state = companyInfo.federalState;
      }
      if (companyInfo.country) {
        leadPayload.country = companyInfo.country;
      }
      
      // VAT ve Tax ID
      if (companyInfo.vatIdentificationNumber) {
        // Lead'de custom field varsa burada eklenebilir
        // Şimdilik ekstra bir alan yoksa yoruma alınabilir
      }
      if (companyInfo.taxIdNumber) {
        // Lead'de custom field varsa burada eklenebilir
      }
    }

    // Reference (Sales Person) varsa lead_owner olarak set et
    if (customUserRegister?.reference) {
      leadPayload.lead_owner = customUserRegister.reference;
    }

    // Lead oluştur
    const leadResult = await erpPost("/api/resource/Lead", leadPayload, token);
    const createdLead = leadResult?.data || leadResult;

    return NextResponse.json({
      success: true,
      lead: createdLead,
      message: "Lead created successfully",
    });
  } catch (e: any) {
    console.error("ERP lead creation error:", e);
    
    const errorMessage = typeof e?.message === "string" ? e.message : "";
    
    return NextResponse.json(
      {
        error: errorMessage || "Failed to create lead in ERP",
      },
      { status: 500 }
    );
  }
}

