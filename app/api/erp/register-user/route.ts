import { NextRequest, NextResponse } from "next/server";
import { erpPost, erpGet } from "@/lib/erp";

export async function POST(req: NextRequest) {
  try {
    const { email, password, firstName, telephone, companyName, reference } = await req.json();

    if (!email || !password || !firstName) {
      return NextResponse.json(
        { error: "Email, password and customer name are required" },
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

    // 1) Önce ERP'de User oluştur
    const userPayload: any = {
      email,
      first_name: firstName,
      enabled: 1,
      send_welcome_email: 0,
      user_type: "Website User",
      new_password: password,
    };

    if (telephone) {
      userPayload.mobile_no = telephone;
    }

    const userResult = await erpPost("/api/resource/User", userPayload, token);
    const createdUser = userResult?.data || userResult;
    const userName = createdUser?.name || email;

    // 2) Ek bilgileri Custom User Register DocType'ına yaz (Opsiyonel - hata verirse atla)
    // Not: DocType adı ERP'de oluşturduğun isimle birebir aynı olmalı.
    let registrationResult = null;
    try {
      const registrationPayload: any = {
        user: userName,
        email,
      };

      if (reference) {
        registrationPayload.reference = reference;
      }

      if (companyName) {
        registrationPayload.company_name = companyName;
      }

      if (firstName) {
        registrationPayload.customer_name = firstName;
      }

      if (telephone) {
        registrationPayload.telephone = telephone;
      }

      const registrationDoctype = "Custom User Register";
      registrationResult = await erpPost(
        `/api/resource/${encodeURIComponent(registrationDoctype)}`,
        registrationPayload,
        token
      );
    } catch (registrationError: any) {
      // Custom User Register opsiyonel - hata verirse sadece log'la ve devam et
      console.warn("Custom User Register oluşturulamadı (opsiyonel):", registrationError?.message);
    }

    // 3) Lead oluştur (User ve Custom User Register oluşturulduktan sonra)
    let createdLead = null;
    try {
      // Önce mevcut Lead var mı kontrol et (email ile)
      let existingLead = null;
      try {
        const leadFilters = encodeURIComponent(JSON.stringify([["email_id", "=", email]]));
        const leadFields = encodeURIComponent(JSON.stringify(["name", "email_id", "company_name"]));
        
        const leadResult = await erpGet(
          `/api/resource/Lead?filters=${leadFilters}&fields=${leadFields}&limit_page_length=1`,
          token
        );

        // ERPNext response formatını kontrol et
        let leads = [];
        if (leadResult?.data && Array.isArray(leadResult.data)) {
          leads = leadResult.data;
        } else if (Array.isArray(leadResult)) {
          leads = leadResult;
        } else if (leadResult?.message && Array.isArray(leadResult.message)) {
          leads = leadResult.message;
        }

        if (leads.length > 0) {
          existingLead = leads[0];
        }
      } catch (leadCheckError: any) {
        // Lead kontrolü başarısız olursa devam et, yeni Lead oluşturulacak
        console.warn("Error checking existing Lead:", leadCheckError);
      }

      // Eğer Lead yoksa oluştur
      if (!existingLead) {
        // Country isimlerini normalize et
        const normalizeCountry = (country: string | undefined | null): string | undefined => {
          if (!country) return country ?? undefined;

          const map: Record<string, string> = {
            "Türkiye": "Turkey",
            "Turkiye": "Turkey",
            "Republic of Turkey": "Turkey",
            "Deutschland": "Germany",
            "Federal Republic of Germany": "Germany",
            "United States of America": "United States",
          };

          return map[country] || country;
        };

        // Lead payload'ı hazırla
        const leadPayload: any = {
          email_id: email,
          status: "Open",
          lead_type: "Client",
        };

        // Lead name ve company name
        const leadCompanyName = registrationResult?.data?.company_name || companyName || firstName || email;
        leadPayload.lead_name = leadCompanyName;
        leadPayload.company_name = leadCompanyName;

        // Telefon numarası
        if (telephone) {
          leadPayload.phone = telephone;
          leadPayload.mobile_no = telephone;
        }

        // Lead oluştur
        try {
          const leadResult = await erpPost("/api/resource/Lead", leadPayload, token);
          createdLead = leadResult?.data || leadResult;
        } catch (createError: any) {
          // Eğer duplicate error alırsak (email zaten kullanılıyorsa), Lead'i tekrar bul
          if (createError.message?.includes("Email Address must be unique") || createError.message?.includes("DuplicateEntryError")) {
            const leadFilters = encodeURIComponent(JSON.stringify([["email_id", "=", email]]));
            const leadFields = encodeURIComponent(JSON.stringify(["name", "email_id"]));
            const retryLeadResult = await erpGet(
              `/api/resource/Lead?filters=${leadFilters}&fields=${leadFields}`,
              token
            );

            const retryLeads = retryLeadResult?.data || (Array.isArray(retryLeadResult) ? retryLeadResult : []);
            if (Array.isArray(retryLeads) && retryLeads.length > 0) {
              createdLead = retryLeads[0];
            } else {
              // Bulamadıysak hatayı log'la ama devam et
              console.warn("Lead duplicate error but could not find existing Lead:", createError);
            }
          } else {
            // Başka bir hata ise log'la ama devam et (Lead oluşturulamazsa bile User oluşturuldu)
            console.warn("Error creating Lead (non-critical):", createError);
          }
        }
      } else {
        // Mevcut Lead varsa onu kullan
        createdLead = existingLead;
      }
    } catch (leadError: any) {
      // Lead oluşturma hatası kritik değil - User zaten oluşturuldu
      // Sadece log'la ve devam et
      console.warn("Error creating Lead (non-critical):", leadError);
    }

    return NextResponse.json({
      success: true,
      user: createdUser,
      registration: registrationResult?.data || registrationResult || null,
      lead: createdLead,
    });
  } catch (e: any) {
    console.error("ERP user registration error:", e);
    console.error("Error message:", e?.message);
    
    // ERPNext hata mesajını parse et
    let errorMessage = typeof e?.message === "string" ? e.message : "";
    
    // HTTP error formatından gerçek hata mesajını çıkar
    // Format: "HTTP 400 Bad Request: {...}"
    if (errorMessage.includes("HTTP") && errorMessage.includes(":")) {
      const parts = errorMessage.split(":");
      if (parts.length > 1) {
        const jsonPart = parts.slice(1).join(":").trim();
        try {
          const errorJson = JSON.parse(jsonPart);
          if (errorJson.message) {
            errorMessage = errorJson.message;
          } else if (errorJson.exc) {
            errorMessage = errorJson.exc;
          } else if (typeof errorJson === "object") {
            // ERPNext hata objesi içindeki mesajı bul
            const excMessage = errorJson.exception || errorJson.error || JSON.stringify(errorJson);
            errorMessage = excMessage;
          }
        } catch {
          // JSON parse edilemezse, orijinal mesajı kullan
        }
      }
    }
    
    const errorText = errorMessage.toLowerCase();
    
    // Email zaten kullanılıyor hatası
    if (
      errorText.includes("already exists") ||
      errorText.includes("duplicate") ||
      errorText.includes("email address must be unique") ||
      errorText.includes("already registered")
    ) {
      return NextResponse.json(
        {
          error: "Bu email adresi zaten kullanılıyor. Lütfen farklı bir email adresi deneyin.",
          errorType: "email_exists",
        },
        { status: 400 }
      );
    }
    
    // Parola güvenlik hatası kontrolü - sadece gerçek parola hatalarını yakala
    const isPasswordError = 
      errorText.includes("commonly used password") ||
      errorText.includes("all-uppercase") ||
      errorText.includes("all-lowercase") ||
      errorText.includes("too common") ||
      errorText.includes("password validation") ||
      errorText.includes("password strength") ||
      (errorText.includes("password") && (
        errorText.includes("weak") ||
        errorText.includes("invalid") ||
        errorText.includes("not strong") ||
        errorText.includes("must contain") ||
        errorText.includes("too short") ||
        errorText.includes("too long")
      ));
    
    if (isPasswordError) {
      // ERPNext'in parola hatasını daha anlaşılır hale getir
      let userFriendlyMessage = "Parola gereksinimleri karşılanmıyor. Lütfen daha güçlü bir parola kullanın.";
      
      if (errorText.includes("commonly used password") || errorText.includes("too common")) {
        userFriendlyMessage = "Bu parola çok yaygın kullanılan bir parolaya benziyor. Lütfen daha benzersiz bir parola seçin.";
      } else if (errorText.includes("all-uppercase") || errorText.includes("all-lowercase")) {
        userFriendlyMessage = "Parola hem büyük hem küçük harf içermelidir.";
      } else if (errorText.includes("too short")) {
        userFriendlyMessage = "Parola çok kısa. Lütfen daha uzun bir parola kullanın.";
      } else if (errorText.includes("too long")) {
        userFriendlyMessage = "Parola çok uzun. Lütfen daha kısa bir parola kullanın.";
      }
      
      return NextResponse.json(
        {
          error: userFriendlyMessage,
          errorType: "password_validation",
        },
        { status: 400 }
      );
    }
    
    // Diğer hatalar için gerçek hata mesajını döndür
    // Eğer hata mesajı çok uzun veya HTML içeriyorsa, genel bir mesaj döndür
    let finalErrorMessage = errorMessage;
    if (!errorMessage || errorMessage.length > 500 || errorMessage.includes("<html>") || errorMessage.includes("<!doctype")) {
      finalErrorMessage = "User registration failed. Please check your information and try again.";
    }
    
    // Hata mesajını temizle (gereksiz prefix'leri kaldır)
    finalErrorMessage = finalErrorMessage
      .replace(/^http \d+ /i, "")
      .replace(/^bad request: /i, "")
      .trim();
    
    return NextResponse.json(
      {
        error: finalErrorMessage || "User registration failed. Please try again.",
      },
      { status: 500 }
    );
  }
}


