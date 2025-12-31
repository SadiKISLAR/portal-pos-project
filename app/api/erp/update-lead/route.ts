import { NextRequest, NextResponse } from "next/server";
import { erpGet, erpPost, erpPut } from "@/lib/erp";

/**
 * Bu API endpoint'i Lead'i bulur ve günceller, yoksa oluşturur.
 * Her registration sayfasından Next'e basıldığında bu endpoint çağrılacak.
 */
export async function POST(req: NextRequest) {
  try {
    // Check if request is FormData (for file uploads) or JSON
    const contentType = req.headers.get("content-type") || "";
    let email: string = "";
    let companyInfo: any = null;
    let businesses: any = null;
    let paymentInfo: any = null;
    let documents: any = null;
    let services: any = null;
    let uploadedFiles: Record<string, File[]> = {};

    if (contentType.includes("multipart/form-data")) {
      // Parse FormData
      const formData = await req.formData();
      
      email = formData.get("email") as string || "";
      
      // Parse JSON fields
      const companyInfoStr = formData.get("companyInfo") as string;
      if (companyInfoStr) {
        try {
          companyInfo = JSON.parse(companyInfoStr);
        } catch (e) {
          console.warn("Error parsing companyInfo:", e);
        }
      }

      const businessesStr = formData.get("businesses") as string;
      if (businessesStr) {
        try {
          businesses = JSON.parse(businessesStr);
        } catch (e) {
          console.warn("Error parsing businesses:", e);
        }
      }

      const paymentInfoStr = formData.get("paymentInfo") as string;
      if (paymentInfoStr) {
        try {
          paymentInfo = JSON.parse(paymentInfoStr);
        } catch (e) {
          console.warn("Error parsing paymentInfo:", e);
        }
      }

      const documentsStr = formData.get("documents") as string;
      if (documentsStr) {
        try {
          documents = JSON.parse(documentsStr);
        } catch (e) {
          console.warn("Error parsing documents:", e);
        }
      }

      const servicesStr = formData.get("services") as string;
      if (servicesStr) {
        try {
          services = JSON.parse(servicesStr);
        } catch (e) {
          console.warn("Error parsing services:", e);
        }
      }

      // Collect uploaded files
      for (const [key, value] of Array.from(formData.entries())) {
        if (value instanceof File) {
          const match = key.match(/^document_(.+)_(\d+)$/);
          if (match) {
            const docId = match[1];
            if (!uploadedFiles[docId]) {
              uploadedFiles[docId] = [];
            }
            uploadedFiles[docId].push(value);
          }
        }
      }
    } else {
      // Parse JSON body (backward compatibility)
      const body = await req.json();
      email = body.email || "";
      companyInfo = body.companyInfo || null;
      businesses = body.businesses || null;
      paymentInfo = body.paymentInfo || null;
      documents = body.documents || null;
      services = body.services || null;
    }

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
      // Önce direkt email ile name olarak dene
      try {
        user = await erpGet(`/api/resource/User/${encodeURIComponent(email)}`, token);
        user = user?.data || user;
      } catch (directError: any) {
        // Direkt bulunamazsa, email field'ı ile filter kullanarak ara
        const userFilters = encodeURIComponent(JSON.stringify([["email", "=", email]]));
        const userFields = encodeURIComponent(JSON.stringify(["name", "email", "first_name", "mobile_no"]));
        
        const userResult = await erpGet(
          `/api/resource/User?filters=${userFilters}&fields=${userFields}&limit_page_length=1`,
          token
        );
        
        const users = userResult?.data || (Array.isArray(userResult) ? userResult : []);
        
        if (Array.isArray(users) && users.length > 0) {
          user = users[0];
        } else {
          throw new Error("User not found");
        }
      }
    } catch (e: any) {
      console.error("Error finding user:", e);
      return NextResponse.json(
        { error: "User not found. Please register first." },
        { status: 404 }
      );
    }

    // 2) Custom User Register'dan company_name gibi ek bilgileri al
    let customUserRegister = null;
    try {
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
    }

    // 3) Lead'i email ile bul (yoksa oluşturulacak)
    let existingLead = null;
    try {
      // Email ile Lead ara - farklı formatlarda dene
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
      } else {
      }
    } catch (e: any) {
      console.error("Error fetching existing Lead:", e);
      // Hata durumunda devam et, yeni Lead oluşturulacak
    }

    // 4) Country isimlerini normalize et
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

    // 5) Lead payload'ı hazırla (mevcut Lead varsa güncelle, yoksa yeni oluştur)
    const companyName = customUserRegister?.company_name || companyInfo?.companyName || existingLead?.company_name || "";

    const leadPayload: any = {
      email_id: email,
      status: "Open",
      lead_type: "Client",
    };

    // Eğer yeni Lead oluşturuluyorsa lead_name ve company_name ekle
    if (!existingLead) {
      leadPayload.lead_name = companyName || user.first_name || email;
      leadPayload.company_name = companyName;
    } else {
      // Mevcut Lead'i güncelle
      leadPayload.name = existingLead.name;
    }

    // Telefon numarası
    if (customUserRegister?.telephone) {
      leadPayload.phone = customUserRegister.telephone;
      leadPayload.mobile_no = customUserRegister.telephone;
    } else if (user.mobile_no) {
      leadPayload.phone = user.mobile_no;
      leadPayload.mobile_no = user.mobile_no;
    }

    // Company Information (varsa)
    if (companyInfo) {
      
      // Address fields - hem standart hem custom field'lara kaydet (fallback için)
      // Not: ERPNext field name'leri farklı formatlarda olabilir, hepsini deniyoruz
      // Street boş gelirse, en azından City + Postal Code + Country'den bir Address Line 1 üretelim
      let streetForAddress =
        (companyInfo.street && companyInfo.street.trim()) || "";

      if (!streetForAddress) {
        const streetParts: string[] = [];
        if (companyInfo.city) streetParts.push(companyInfo.city);
        if (companyInfo.zipCode) streetParts.push(companyInfo.zipCode);
        if (companyInfo.country) {
          const normalizedCountry = normalizeCountry(companyInfo.country);
          if (normalizedCountry) streetParts.push(normalizedCountry);
        }
        streetForAddress = streetParts.join(" ").trim();
      }

      if (streetForAddress) {
        leadPayload.address_line1 = streetForAddress;
        // Olası field name formatlarını deniyoruz
        leadPayload.custom_address_line1 = streetForAddress;
        leadPayload.custom_address_line_1 = streetForAddress; // Alt çizgi ile
      }
      if (companyInfo.city) {
        leadPayload.city = companyInfo.city;
      }
      if (companyInfo.zipCode) {
        leadPayload.pincode = companyInfo.zipCode;
        // Olası field name formatlarını deniyoruz
        leadPayload.custom_pincode = companyInfo.zipCode;
        leadPayload.custom_postal_code = companyInfo.zipCode; // "Postal Code" → custom_postal_code olabilir
      }
      if (companyInfo.federalState) {
        leadPayload.state = companyInfo.federalState;
        leadPayload.custom_state = companyInfo.federalState;
      }
      if (companyInfo.country) {
        leadPayload.country = normalizeCountry(companyInfo.country);
      }
      if (companyInfo.vatIdentificationNumber) {
        leadPayload.custom_vat_identification_number = companyInfo.vatIdentificationNumber;
      }
      // taxIdNumber için hem undefined/null hem de boş string kontrolü yap
      // Not: ERPNext'te field adı custom_custom_tax_id_number (double custom prefix)
      if (companyInfo.taxIdNumber && companyInfo.taxIdNumber.trim() !== "") {
        leadPayload.custom_custom_tax_id_number = companyInfo.taxIdNumber.trim();
      } else {
      }
      
      // restaurantCount ekle
      if (companyInfo.restaurantCount) {
        const restaurantCount = parseInt(companyInfo.restaurantCount) || 1;
        leadPayload.custom_restaurant_count = restaurantCount;
      }
      
    } else {
    }

    // Businesses array'ini JSON olarak kaydet
    if (businesses && Array.isArray(businesses) && businesses.length > 0) {
      leadPayload.custom_businesses = JSON.stringify(businesses);
      // Business address'leri Address DocType'ına kaydedilecek (Lead oluşturulduktan sonra)
    } else {
    }

    // Lead'i oluştur veya güncelle (Address oluşturmak için Lead'in name'ine ihtiyacımız var)

    // Payment Information (varsa)
    if (paymentInfo) {
      if (paymentInfo.accountHolder) {
        leadPayload.custom_account_holder = paymentInfo.accountHolder;
      }
      if (paymentInfo.iban) {
        leadPayload.custom_iban = paymentInfo.iban;
      }
      if (paymentInfo.bic) {
        // BIC field'ını kaydet - ERPNext'te field adı custom_bic veya custom_custom_bic olabilir
        leadPayload.custom_bic = paymentInfo.bic;
        // Eğer custom_custom_bic gerekirse (Tax ID gibi double prefix varsa)
        // leadPayload.custom_custom_bic = paymentInfo.bic;
      } else {
      }
    } else {
    }

    // Documents (varsa) - Dinamik belge yönetimi
    if (documents) {
      if (documents.typeOfCompany) {
        leadPayload.custom_type_of_company = documents.typeOfCompany;
      }

      // Yeni dinamik belge sistemi
      if (documents.documentData) {
        // Her belge için file name'lerini ve date değerlerini kaydet
        const documentDataToSave: Record<string, any> = {};
        
        for (const [docId, docData] of Object.entries(documents.documentData)) {
          const data = docData as { files?: any[]; date?: string };
          
          if (data.files && data.files.length > 0) {
            // File name'lerini kaydet (şimdilik, daha sonra ERPNext'e upload edilebilir)
            const fileNames: string[] = data.files.map((file: any) => file.name || file);
            documentDataToSave[docId] = {
              files: fileNames,
              date: data.date || null,
            };
          } else if (data.date) {
            documentDataToSave[docId] = {
              files: [],
              date: data.date,
            };
          }
        }
        
        // Tüm belge verilerini JSON olarak kaydet
        // Not: ERPNext'te field type'ı "Long Text" veya "Small Text" olmalı (JSON string için)
        leadPayload.custom_document_data = JSON.stringify(documentDataToSave);
      }

      // Backward compatibility - eski field'lar
      if (documents.businessRegistrationFiles) {
        leadPayload.custom_business_registration_files = JSON.stringify(documents.businessRegistrationFiles);
      }
      if (documents.idFiles) {
        leadPayload.custom_id_files = JSON.stringify(documents.idFiles);
      }
      if (documents.shareholdersFiles) {
        leadPayload.custom_shareholders_files = JSON.stringify(documents.shareholdersFiles);
      }
      if (documents.registerExtractFiles) {
        leadPayload.custom_register_extract_files = JSON.stringify(documents.registerExtractFiles);
      }
      if (documents.hrExtractFiles) {
        leadPayload.custom_hr_extract_files = JSON.stringify(documents.hrExtractFiles);
      }
      
      // Eğer tüm belgeler yüklendiyse registration status'u güncelle
      if (documents.isCompleted) {
        leadPayload.custom_registration_status = "Completed";
      } else {
        // Documents sayfasına gelindiğinde status'u güncelle
        leadPayload.custom_registration_status = "In Progress";
      }
    }

    // Services (varsa) - Child Table olarak kaydet
    if (services && Array.isArray(services) && services.length > 0) {
      // Services'i Child Table formatına çevir
      // ERPNext'te Lead DocType'ında "services" adında bir Child Table olmalı
      // Child Table DocType: "Lead Service" (veya sizin oluşturduğunuz isim)
      
      const servicesChildTable = services.map((serviceId: string, index: number) => {
        // Service ID'si genellikle Service DocType'ının name field'ıdır
        // Örnek: "SERVICE-001" veya "REST-SERVICE-001"
        return {
          service: serviceId, // Link field - Service DocType'ının name değeri
          service_name: serviceId, // Geçici olarak ID'yi name olarak kaydet, sonra ERPNext Link'ten çekecek
          selected_date: new Date().toISOString().split('T')[0], // Bugünün tarihi
          terms_accepted: 1, // Check field - 1 = true
          idx: index + 1, // Row sırası
        };
      });

      // Child Table'ı Lead payload'ına ekle
      leadPayload.services = servicesChildTable;
      
      // Ayrıca backward compatibility için JSON field'ı da kaydet (eğer hala kullanılıyorsa)
      leadPayload.custom_selected_services = JSON.stringify(services);
    }

    // Lead'i oluştur veya güncelle
    let leadResult;
    if (existingLead && existingLead.name) {
      // Mevcut Lead'i güncelle
      // PUT için name field'ını kaldır (path'te zaten var)
      const { name, ...updatePayload } = leadPayload;
      leadResult = await erpPut(`/api/resource/Lead/${encodeURIComponent(existingLead.name)}`, updatePayload, token);
    } else {
      // Yeni Lead oluştur
      // Yeni Lead oluştururken name field'ını gönderme (ERPNext otomatik oluşturur)
      const { name, ...createPayload } = leadPayload;
      
      try {
        leadResult = await erpPost("/api/resource/Lead", createPayload, token);
      } catch (createError: any) {
        // Eğer duplicate error alırsak (email zaten kullanılıyorsa), Lead'i tekrar bul ve güncelle
        if (createError.message?.includes("Email Address must be unique") || createError.message?.includes("DuplicateEntryError")) {
          
          // Lead'i tekrar bul
          const leadFilters = encodeURIComponent(JSON.stringify([["email_id", "=", email]]));
          const leadFields = encodeURIComponent(JSON.stringify(["name", "email_id"]));
          const retryLeadResult = await erpGet(
            `/api/resource/Lead?filters=${leadFilters}&fields=${leadFields}`,
            token
          );

          const retryLeads = retryLeadResult?.data || (Array.isArray(retryLeadResult) ? retryLeadResult : []);
          if (Array.isArray(retryLeads) && retryLeads.length > 0) {
            const foundLead = retryLeads[0];
            const { name, ...updatePayload } = leadPayload;
            leadResult = await erpPut(`/api/resource/Lead/${encodeURIComponent(foundLead.name)}`, updatePayload, token);
          } else {
            // Bulamadıysak hatayı fırlat
            throw createError;
          }
        } else {
          // Başka bir hata ise fırlat
          throw createError;
        }
      }
    }

    const updatedLead = leadResult?.data || leadResult;
    const leadName = updatedLead.name;
    
    // Debug: Updated Lead'i kontrol et

    // Address kaydını oluştur veya güncelle (companyInfo varsa)
    if (companyInfo && (companyInfo.street || companyInfo.city || companyInfo.country)) {
      try {
        // Önce mevcut Address kaydını bul (Lead'e bağlı Billing address)
        const addressFilters = encodeURIComponent(
          JSON.stringify([
            ["link_doctype", "=", "Lead"],
            ["link_name", "=", leadName],
            ["address_type", "=", "Billing"]
          ])
        );
        const addressFields = encodeURIComponent(JSON.stringify(["name", "address_title"]));
        const existingAddressResult = await erpGet(
          `/api/resource/Address?filters=${addressFilters}&fields=${addressFields}`,
          token
        );

        const existingAddresses = existingAddressResult?.data || (Array.isArray(existingAddressResult) ? existingAddressResult : []);
        
        // Address payload'ı hazırla
        const addressTitle = companyInfo.companyName || "Billing";
        const addressPayload: any = {
          address_title: addressTitle,
          address_type: "Billing",
          link_doctype: "Lead",
          link_name: leadName,
        };

        // Street and House number -> Address Line 1
        if (companyInfo.street) {
          addressPayload.address_line1 = companyInfo.street;
        }
        
        // City
        if (companyInfo.city) {
          addressPayload.city = companyInfo.city;
          addressPayload.county = companyInfo.city; // County olarak da kaydet
        }
        
        // Postal Code
        if (companyInfo.zipCode) {
          addressPayload.pincode = companyInfo.zipCode;
        }
        
        // Federal State
        if (companyInfo.federalState) {
          addressPayload.state = companyInfo.federalState;
        }
        
        // Country (normalize edilmiş)
        if (companyInfo.country) {
          addressPayload.country = normalizeCountry(companyInfo.country);
        }
        

        if (Array.isArray(existingAddresses) && existingAddresses.length > 0) {
          // Mevcut Address'i güncelle
          const existingAddress = existingAddresses[0];
          const { name, ...updateAddressPayload } = addressPayload;
          await erpPut(`/api/resource/Address/${encodeURIComponent(existingAddress.name)}`, updateAddressPayload, token);
        } else {
          // Yeni Address oluştur
          await erpPost("/api/resource/Address", addressPayload, token);
        }
      } catch (addressError: any) {
        console.error("Error creating/updating Address:", addressError);
        // Address hatası Lead'i etkilemesin, sadece log'layalım
      }
    }

    // Business address'lerini Address DocType'ına kaydet
    
    if (businesses && Array.isArray(businesses) && businesses.length > 0) {
      try {
        
        for (let index = 0; index < businesses.length; index++) {
          const business = businesses[index];
          
          // Business için gerekli adres bilgileri var mı kontrol et
          // En az city veya country olmalı (street opsiyonel)
          if (!business.city && !business.country) {
            continue;
          }

          // Business address için Address payload'ı hazırla
          const businessAddressTitle = business.businessName || `Business ${index + 1}`;
          const businessAddressPayload: any = {
            address_title: businessAddressTitle, // Standart field (hala kullanılıyor)
            address_type: "Shop", // Her zaman "Shop"
            link_doctype: "Lead",
            link_name: leadName,
          };

          // Business Name → b1_business_name (custom field)
          if (business.businessName) {
            businessAddressPayload.b1_business_name = business.businessName;
          }

          // Owner/Managing Director → b1_owner_director
          if (business.ownerDirector) {
            businessAddressPayload.b1_owner_director = business.ownerDirector;
          }

          // Owner Telephone → b1_telephone
          if (business.ownerTelephone) {
            const phoneNumber = business.ownerTelephoneCode 
              ? `${business.ownerTelephoneCode} ${business.ownerTelephone}`.trim()
              : business.ownerTelephone;
            businessAddressPayload.b1_telephone = phoneNumber;
          }

          // Owner Email → b1_email_address
          if (business.ownerEmail) {
            businessAddressPayload.b1_email_address = business.ownerEmail;
          }

          // Street → b1_street_and_house_number
          if (business.street) {
            businessAddressPayload.b1_street_and_house_number = business.street;
          }

          // City → b1_city
          if (business.city) {
            businessAddressPayload.b1_city = business.city;
          }

          // Postal Code → b1_postal_code
          if (business.postalCode) {
            businessAddressPayload.b1_postal_code = business.postalCode;
          }

          // Federal State → b1_federal_state
          if (business.federalState) {
            businessAddressPayload.b1_federal_state = business.federalState;
          }

          // Country → b1_country
          if (business.country) {
            businessAddressPayload.b1_country = normalizeCountry(business.country);
          }

          // Different Contact Details (varsa)
          if (business.differentContact) {
            // Contact Person → b1_contact_person
            if (business.contactPerson) {
              businessAddressPayload.b1_contact_person = business.contactPerson;
            }

            // Contact Telephone → b1_contact_person_telephone
            if (business.contactTelephone) {
              const contactPhoneNumber = business.contactTelephoneCode 
                ? `${business.contactTelephoneCode} ${business.contactTelephone}`.trim()
                : business.contactTelephone;
              businessAddressPayload.b1_contact_person_telephone = contactPhoneNumber;
            }

            // Contact Email → b1_contact_person_email
            if (business.contactEmail) {
              businessAddressPayload.b1_contact_person_email = business.contactEmail;
            }
          }


          // Mevcut Address'i bul (aynı business için daha önce oluşturulmuş mu?)
          const businessAddressFilters = encodeURIComponent(
            JSON.stringify([
              ["link_doctype", "=", "Lead"],
              ["link_name", "=", leadName],
              ["address_type", "=", "Shop"],
              ["address_title", "=", businessAddressTitle]
            ])
          );
          const businessAddressFields = encodeURIComponent(JSON.stringify(["name", "address_title"]));
          
          try {
            const existingBusinessAddressResult = await erpGet(
              `/api/resource/Address?filters=${businessAddressFilters}&fields=${businessAddressFields}`,
              token
            );

            const existingBusinessAddresses = existingBusinessAddressResult?.data || 
              (Array.isArray(existingBusinessAddressResult) ? existingBusinessAddressResult : []);

            if (Array.isArray(existingBusinessAddresses) && existingBusinessAddresses.length > 0) {
              // Mevcut Address'i güncelle
              const existingBusinessAddress = existingBusinessAddresses[0];
              const { name, ...updateBusinessAddressPayload } = businessAddressPayload;
              await erpPut(`/api/resource/Address/${encodeURIComponent(existingBusinessAddress.name)}`, updateBusinessAddressPayload, token);
            } else {
              // Yeni Address oluştur
              const createResult = await erpPost("/api/resource/Address", businessAddressPayload, token);
            }
          } catch (businessAddressError: any) {
            console.error(`Error creating/updating business address ${index}:`, businessAddressError);
            console.error(`Error message:`, businessAddressError.message);
            console.error(`Error response:`, businessAddressError.response || businessAddressError);
            // Business address hatası diğer business'leri etkilemesin, devam et
          }
        }
      } catch (businessAddressesError: any) {
        console.error("Error processing business addresses:", businessAddressesError);
        // Business address'leri hatası Lead'i etkilemesin, sadece log'layalım
      }
    }

    return NextResponse.json({
      success: true,
      lead: updatedLead,
      message: existingLead ? "Lead updated successfully" : "Lead created successfully",
    });
  } catch (e: any) {
    console.error("ERP lead update/create error:", e);
    
    const errorMessage = typeof e?.message === "string" ? e.message : "";
    
    return NextResponse.json(
      {
        error: errorMessage || "Failed to update/create lead in ERP",
      },
      { status: 500 }
    );
  }
}

