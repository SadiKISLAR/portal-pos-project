import { NextRequest, NextResponse } from "next/server";
import { erpGet, erpPost, erpPut, erpUploadFile } from "@/lib/erp";

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
      // Not: ERPNext'te field adı custom_tax_id_number veya custom_custom_tax_id_number olabilir
      if (companyInfo.taxIdNumber && companyInfo.taxIdNumber.trim() !== "") {
        const taxIdValue = companyInfo.taxIdNumber.trim();
        // Her iki formatı da dene (single ve double custom prefix)
        leadPayload.custom_tax_id_number = taxIdValue;
        leadPayload.custom_custom_tax_id_number = taxIdValue;
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
      // Not: File upload şimdilik devre dışı, sadece file name'leri kaydediliyor
      if (documents.documentData) {
        const documentDataToSave: Record<string, any> = {};
        
        // Uploaded files'dan file name'leri al (FormData'dan gelen file'lar)
        const fileNamesByDocId: Record<string, string[]> = {};
        if (uploadedFiles && Object.keys(uploadedFiles).length > 0) {
          for (const [docId, files] of Object.entries(uploadedFiles)) {
            if (files && files.length > 0) {
              fileNamesByDocId[docId] = files.map(f => f.name);
            }
          }
        }
        
        for (const [docId, docData] of Object.entries(documents.documentData)) {
          const data = docData as { files?: any[]; date?: string };
          
          // File name'leri önce uploadedFiles'dan al, yoksa documentData'dan al
          const fileNames = fileNamesByDocId[docId] || 
                           (data.files && data.files.length > 0 ? data.files.map((file: any) => file.name || file) : []);
          
          if (fileNames.length > 0) {
            documentDataToSave[docId] = {
              files: fileNames, // File name'leri kaydet (şimdilik URL yerine)
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

    // Services - Child Table olarak kaydet (boş array de kaydedilmeli)
    if (services !== null && services !== undefined && Array.isArray(services)) {
      if (services.length > 0) {
        // Service ID'lerinden service name'lerini al
        let serviceNames: string[] = [];
        let serviceMap = new Map<string, string>(); // serviceMap'i dışarıda tanımla
        
        try {
          const serviceFilters = encodeURIComponent(JSON.stringify([
            ["name", "in", services]
          ]));
          const serviceFields = encodeURIComponent(JSON.stringify(["name", "service_name"]));
          const servicesUrl = `/api/resource/Service?filters=${serviceFilters}&fields=${serviceFields}`;
          
          const servicesResult = await erpGet(servicesUrl, token);
          const servicesData = servicesResult?.data || (Array.isArray(servicesResult) ? servicesResult : []);
          
          if (Array.isArray(servicesData) && servicesData.length > 0) {
            // Service ID'lerine göre name'leri map et
            servicesData.forEach((svc: any) => {
              const serviceId = svc.name;
              const serviceName = svc.service_name || svc.name || "";
              serviceMap.set(serviceId, serviceName);
            });
            
            // Service ID'lerinin sırasına göre name'leri al
            serviceNames = services.map((serviceId: string) => {
              return serviceMap.get(serviceId) || serviceId;
            }).filter((name: string) => name);
          }
        } catch (serviceNameError: any) {
          console.warn("Error fetching service names:", serviceNameError);
          // Service name'leri alınamazsa devam et
        }
        
        // Services'i Child Table formatına çevir
        // ERPNext'te Lead DocType'ında "services" adında bir Child Table olmalı
        // Child Table DocType: "Lead Service" (veya sizin oluşturduğunuz isim)
        
        const servicesChildTable = services.map((serviceId: string, index: number) => {
          // Service ID'si genellikle Service DocType'ının name field'ıdır
          // Örnek: "SERVICE-001" veya "REST-SERVICE-001"
          // Service name'ini serviceMap'ten al, yoksa ID'yi kullan
          const serviceName = serviceMap.get(serviceId) || serviceId;
          
          return {
            service: serviceId, // Link field - Service DocType'ının name değeri
            service_name: serviceName, // Service'in gerçek ismini kaydet
            selected_date: new Date().toISOString().split('T')[0], // Bugünün tarihi
            terms_accepted: 1, // Check field - 1 = true
            idx: index + 1, // Row sırası
          };
        });

        // Child Table'ı Lead payload'ına ekle
        leadPayload.services = servicesChildTable;
        
        // Service name'lerini de kaydet (görüntüleme için)
        if (serviceNames.length > 0) {
          leadPayload.custom_selected_service_names = serviceNames.join(", ");
          // custom_selected_services field'ına da name'leri kaydet (ERPNext'te görüntüleme için)
          leadPayload.custom_selected_services = JSON.stringify(serviceNames);
        } else {
          // Service name'leri alınamadıysa ID'leri kaydet (fallback)
          leadPayload.custom_selected_services = JSON.stringify(services);
        }
      } else {
        // Boş array - tüm servisleri kaldır
        leadPayload.services = [];
        leadPayload.custom_selected_service_names = "";
        leadPayload.custom_selected_services = "[]";
      }
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

    // Address oluşturma durumunu takip et
    let addressCreationStatus = {
      companyAddress: { success: false, error: null as string | null, addressName: null as string | null },
      businessAddresses: [] as Array<{ success: boolean; error: string | null; addressName: string | null }>,
    };

    // Address kaydını oluştur veya güncelle (companyInfo varsa)
    if (companyInfo && (companyInfo.street || companyInfo.city || companyInfo.country)) {
      try {
        // Önce mevcut Address kaydını bul (Lead'e bağlı Billing address)
        // Not: Address'leri link_name ile aramak yerine, address_title ile arayalım
        // Çünkü Links Child Table'ı henüz oluşturulmamış olabilir
        let existingAddresses: any[] = [];
        try {
          // Önce address_title ile ara (daha güvenilir)
          const addressTitle = companyInfo.companyName || "Billing";
        const addressFilters = encodeURIComponent(
          JSON.stringify([
              ["address_title", "=", addressTitle],
            ["address_type", "=", "Billing"]
          ])
        );
          const addressFields = encodeURIComponent(JSON.stringify(["name", "address_title", "address_type"]));
        const existingAddressResult = await erpGet(
          `/api/resource/Address?filters=${addressFilters}&fields=${addressFields}`,
          token
        );

          existingAddresses = existingAddressResult?.data || (Array.isArray(existingAddressResult) ? existingAddressResult : []);
        } catch (searchError: any) {
          console.warn("Error searching for existing addresses:", searchError?.message);
          // Devam et, yeni Address oluşturulacak
        }
        
        // Address payload'ı hazırla
        const addressTitle = companyInfo.companyName || "Billing";
        // Önce Address'i temel bilgilerle oluştur (Links olmadan)
        // Links'i sonra ayrı bir işlemle ekleyeceğiz
        const addressPayload: any = {
          address_title: addressTitle,
          address_type: "Billing",
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
        

        let addressName: string | null = null;

        if (Array.isArray(existingAddresses) && existingAddresses.length > 0) {
          // Mevcut Address'i güncelle
          const existingAddress = existingAddresses[0];
          addressName = existingAddress.name;
          const { name, ...updateAddressPayload } = addressPayload;
          try {
            if (!addressName) {
              throw new Error("Address name is null");
            }
            await erpPut(`/api/resource/Address/${encodeURIComponent(addressName)}`, updateAddressPayload, token);
          } catch (updateError: any) {
            console.error("Address update failed:", updateError);
            throw updateError;
          }
        } else {
          // Yeni Address oluştur
          try {
            // Retry mekanizması - BrokenPipeError için
            let createResult;
            let retryCount = 0;
            const maxRetries = 3;
            
            while (retryCount < maxRetries) {
              try {
                createResult = await erpPost("/api/resource/Address", addressPayload, token);
                break; // Başarılı, döngüden çık
              } catch (retryError: any) {
                retryCount++;
                if (retryCount >= maxRetries) {
                  throw retryError; // Son deneme de başarısız, hatayı fırlat
                }
                // BrokenPipeError ise tekrar dene
                if (retryError?.message?.includes("BrokenPipeError") || retryError?.message?.includes("Broken pipe")) {
                  console.warn(`Address create failed (attempt ${retryCount}), retrying in 1 second...`);
                  await new Promise(resolve => setTimeout(resolve, 1000)); // 1 saniye bekle
                } else {
                  throw retryError; // Farklı bir hata, fırlat
                }
              }
            }
            
            addressName = createResult?.data?.name || createResult?.name || null;
          } catch (createError: any) {
            console.error("Address create failed:", createError);
            if (createError?.message) {
              console.error("Create error message:", createError.message);
            }
            if (createError?.response) {
              console.error("Create error response:", createError.response);
            }
            throw createError;
          }
        }
        
        // Address oluşturulduktan/güncellendikten sonra Links Child Table'ını ekle
        if (addressName) {
          addressCreationStatus.companyAddress.addressName = addressName;
          
          // Links'i eklemek için önce Address'i okuyalım
          try {
            const fullAddress = await erpGet(`/api/resource/Address/${encodeURIComponent(addressName)}`, token);
            const addressData = fullAddress?.data || fullAddress;
            
            // Mevcut links varsa onu kullan, yoksa yeni oluştur
            let linksArray = addressData?.links || [];
            
            // Eğer bu Lead zaten links'te yoksa ekle
            const leadLinkExists = linksArray.some((link: any) => 
              link.link_doctype === "Lead" && link.link_name === leadName
            );
            
            if (!leadLinkExists) {
              linksArray.push({
                link_doctype: "Lead",
                link_name: leadName,
                link_title: addressTitle,
                idx: linksArray.length + 1,
              });
              
              const linksPayload = {
                links: linksArray,
              };
              await erpPut(`/api/resource/Address/${encodeURIComponent(addressName)}`, linksPayload, token);
            }
            
            addressCreationStatus.companyAddress.success = true;
          } catch (linksError: any) {
            console.error("Error adding Links to Address:", linksError);
            console.error("Links error message:", linksError?.message);
            // Hata mesajını parse et
            let errorMsg = linksError?.message || "Failed to add Links to Address";
            if (typeof errorMsg === "string" && errorMsg.includes("HTTP")) {
              // HTTP hatası ise sadece hata tipini göster
              errorMsg = "Failed to add Links to Address (Server Error)";
            }
            addressCreationStatus.companyAddress.error = errorMsg;
            // Links eklenemezse de devam et, Address zaten oluşturuldu
          }
        } else {
          addressCreationStatus.companyAddress.error = "Address created but name is null";
        }
      } catch (addressError: any) {
        console.error("Error creating/updating Address:", addressError);
        console.error("Error message:", addressError?.message);
        console.error("Error response:", addressError?.response || addressError);
        console.error("Error stack:", addressError?.stack);
        addressCreationStatus.companyAddress.error = addressError?.message || "Failed to create/update Address";
        // Address hatası Lead'i etkilemesin, sadece log'layalım
        // Ama kullanıcıya bilgi verelim
      }
    } else {
      addressCreationStatus.companyAddress.error = "Address creation condition not met (no street, city, or country)";
    }

    // Business address'lerini Address DocType'ına kaydet
    if (businesses && Array.isArray(businesses) && businesses.length > 0) {
      try {
        
        for (let index = 0; index < businesses.length; index++) {
          const business = businesses[index];
          
          // Business için address oluştur - businessName varsa mutlaka oluştur
          // Sadece tamamen boş business'leri skip et
          if (!business.businessName && !business.ownerDirector && !business.street && !business.city && !business.country && !business.postalCode) {
            addressCreationStatus.businessAddresses[index] = {
              success: false,
              error: "Business is completely empty",
              addressName: null,
            };
            continue;
          }
          
          // Her Business Address arasında bekleme ekle (ilk business hariç)
          if (index > 0) {
            await new Promise(resolve => setTimeout(resolve, 1000));
          }

          // Business address için Address payload'ı hazırla
          const businessAddressTitle = business.businessName || `Business ${index + 1}`;
          
          // Önce Address'i EN MİNİMUM bilgilerle oluştur - sadece zorunlu field'lar
          // BrokenPipeError'ı önlemek için çok minimal payload gönder
          const businessAddressPayload: any = {
            address_title: businessAddressTitle,
            address_type: "Shop",
          };

          // Sadece temel bilgileri ekle - diğerlerini sonra güncelleyeceğiz
          // City (mutlaka ekle - yoksa varsayılan)
          if (business.city) {
            businessAddressPayload.city = business.city;
          } else {
            businessAddressPayload.city = "Unknown"; // City zorunlu olabilir
          }
          
          // Country (mutlaka ekle - yoksa varsayılan)
          if (business.country) {
            const normalizedCountry = normalizeCountry(business.country);
            businessAddressPayload.country = normalizedCountry;
          } else {
            businessAddressPayload.country = "United Kingdom";
          }
          
          // Diğer field'ları şimdilik ekleme - Address oluşturulduktan sonra güncelleyeceğiz


          // Mevcut Address'i bul (aynı business için daha önce oluşturulmuş mu?)
          // Not: address_title ile arayalım, çünkü Links henüz oluşturulmamış olabilir
          let existingBusinessAddresses: any[] = [];
          try {
            const businessAddressFilters = encodeURIComponent(
              JSON.stringify([
                ["address_title", "=", businessAddressTitle],
                ["address_type", "=", "Shop"]
              ])
            );
            const businessAddressFields = encodeURIComponent(JSON.stringify(["name", "address_title", "address_type"]));
            
            const existingBusinessAddressResult = await erpGet(
              `/api/resource/Address?filters=${businessAddressFilters}&fields=${businessAddressFields}`,
              token
            );

            existingBusinessAddresses = existingBusinessAddressResult?.data || 
              (Array.isArray(existingBusinessAddressResult) ? existingBusinessAddressResult : []);
          } catch (searchError: any) {
            console.warn(`Error searching for existing business addresses:`, searchError?.message);
            // Devam et, yeni Address oluşturulacak
          }

          try {
            let businessAddressName: string | null = null;
            
            if (Array.isArray(existingBusinessAddresses) && existingBusinessAddresses.length > 0) {
              // Mevcut Address'i güncelle
              const existingBusinessAddress = existingBusinessAddresses[0];
              businessAddressName = existingBusinessAddress.name;
              const { name, ...updateBusinessAddressPayload } = businessAddressPayload;
              try {
                await erpPut(`/api/resource/Address/${encodeURIComponent(businessAddressName!)}`, updateBusinessAddressPayload, token);
                
                // Custom field'ları da güncelle
                try {
                  const customFieldsPayload: any = {};

          // Business Name → b1_business_name (custom field)
          if (business.businessName) {
                    customFieldsPayload.b1_business_name = business.businessName;
          }

          // Owner/Managing Director → b1_owner_director
          if (business.ownerDirector) {
                    customFieldsPayload.b1_owner_director = business.ownerDirector;
          }

          // Owner Telephone → b1_telephone
                  // PhoneInput zaten tam telefon numarasını formatında tutuyor (örn: +44 123 456 7890)
          if (business.ownerTelephone) {
                    customFieldsPayload.b1_telephone = business.ownerTelephone;
          }

          // Owner Email → b1_email_address
          if (business.ownerEmail) {
                    customFieldsPayload.b1_email_address = business.ownerEmail;
          }

                  // Street → b1_street_and_house_number (custom field)
          if (business.street) {
                    customFieldsPayload.b1_street_and_house_number = business.street;
          }

                  // City → b1_city (custom field)
          if (business.city) {
                    customFieldsPayload.b1_city = business.city;
          }

                  // Postal Code → b1_postal_code (custom field)
          if (business.postalCode) {
                    customFieldsPayload.b1_postal_code = business.postalCode;
          }

                  // Federal State → b1_federal_state (custom field)
          if (business.federalState) {
                    customFieldsPayload.b1_federal_state = business.federalState;
          }

                  // Country → b1_country (custom field)
          if (business.country) {
                    const normalizedCountry = normalizeCountry(business.country);
                    customFieldsPayload.b1_country = normalizedCountry;
          }

          // Different Contact Details (varsa)
          if (business.differentContact) {
            // Contact Person → b1_contact_person
            if (business.contactPerson) {
                      customFieldsPayload.b1_contact_person = business.contactPerson;
            }

            // Contact Telephone → b1_contact_person_telephone
            if (business.contactTelephone) {
                      // PhoneInput zaten tam telefon numarasını formatında tutuyor (örn: +44 123 456 7890)
                      customFieldsPayload.b1_contact_person_telephone = business.contactTelephone;
            }

            // Contact Email → b1_contact_person_email
            if (business.contactEmail) {
                      customFieldsPayload.b1_contact_person_email = business.contactEmail;
                    }
                  }
                  
                  // Custom field'ları güncelle (eğer varsa)
                  if (Object.keys(customFieldsPayload).length > 0) {
                    await erpPut(`/api/resource/Address/${encodeURIComponent(businessAddressName!)}`, customFieldsPayload, token);
                  }
                } catch (customFieldsError: any) {
                  console.warn(`Error updating custom fields for Business Address ${index}:`, customFieldsError?.message);
                  // Custom field'lar güncellenemezse de devam et
                }
              } catch (updateError: any) {
                console.error(`Business Address update failed:`, updateError);
                throw updateError;
              }
            } else {
              // Yeni Address oluştur (sadece standart field'larla)
              try {
                // ERPNext'in önceki işlemi tamamlaması için kısa bir bekleme
                if (index > 0) {
                  await new Promise(resolve => setTimeout(resolve, 1000)); // 1 saniye bekle
                }
                
                // Retry mekanizması - BrokenPipeError için
                let createResult;
                let retryCount = 0;
                const maxRetries = 3;
                
                while (retryCount < maxRetries) {
                  try {
                    createResult = await erpPost("/api/resource/Address", businessAddressPayload, token);
                    break; // Başarılı, döngüden çık
                  } catch (retryError: any) {
                    retryCount++;
                    if (retryCount >= maxRetries) {
                      throw retryError; // Son deneme de başarısız, hatayı fırlat
                    }
                    // BrokenPipeError ise tekrar dene
                    if (retryError?.message?.includes("BrokenPipeError") || retryError?.message?.includes("Broken pipe")) {
                      console.warn(`Business Address create failed (attempt ${retryCount}), retrying in 1 second...`);
                      await new Promise(resolve => setTimeout(resolve, 1000)); // 1 saniye bekle
                    } else {
                      throw retryError; // Farklı bir hata, fırlat
                    }
                  }
                }
                
                businessAddressName = createResult?.data?.name || createResult?.name || null;
                if (businessAddressName) {
                  // Address oluşturulduktan sonra eksik standart field'ları ekle
                  // Önce kısa bir bekleme - ERPNext'in address'i işlemesi için
                  await new Promise(resolve => setTimeout(resolve, 1000));
                  
                  try {
                    const additionalStandardFields: any = {};
                    
                    // Street and House number → address_line1
                    if (business.street) {
                      additionalStandardFields.address_line1 = business.street;
                    }
                    
                    // Postal Code → pincode (standart field)
                    if (business.postalCode) {
                      additionalStandardFields.pincode = business.postalCode;
                    }

                    // Federal State → state (standart field)
                    if (business.federalState) {
                      additionalStandardFields.state = business.federalState;
                    }

                    // County
                    if (business.city) {
                      additionalStandardFields.county = business.city;
                    }
                    
                    // Eksik standart field'ları ekle
                    if (Object.keys(additionalStandardFields).length > 0) {
                      await erpPut(`/api/resource/Address/${encodeURIComponent(businessAddressName)}`, additionalStandardFields, token);
                      // Güncelleme sonrası kısa bekleme
                      await new Promise(resolve => setTimeout(resolve, 500));
                    }
                  } catch (standardFieldsError: any) {
                    console.warn(`⚠️ Error adding additional standard fields to Business Address ${index}:`, standardFieldsError?.message);
                    // Devam et - standart field'lar kritik değil
                  }
                  
                  // Address oluşturulduktan sonra custom field'ları ekle
                  // Önce kısa bir bekleme
                  await new Promise(resolve => setTimeout(resolve, 1000));
                  
                  try {
                    const customFieldsPayload: any = {};
                    
                    // Business Name → b1_business_name (custom field)
                    if (business.businessName) {
                      customFieldsPayload.b1_business_name = business.businessName;
                    }

                    // Owner/Managing Director → b1_owner_director
                    if (business.ownerDirector) {
                      customFieldsPayload.b1_owner_director = business.ownerDirector;
                    }

                    // Owner Telephone → b1_telephone
                    if (business.ownerTelephone) {
                    // PhoneInput zaten tam telefon numarasını formatında tutuyor (örn: +44 123 456 7890)
                    customFieldsPayload.b1_telephone = business.ownerTelephone;
                    }

                    // Owner Email → b1_email_address
                    if (business.ownerEmail) {
                      customFieldsPayload.b1_email_address = business.ownerEmail;
                    }

                    // Street → b1_street_and_house_number (custom field)
                    if (business.street) {
                      customFieldsPayload.b1_street_and_house_number = business.street;
                    }

                    // City → b1_city (custom field)
                    if (business.city) {
                      customFieldsPayload.b1_city = business.city;
                    }

                    // Postal Code → b1_postal_code (custom field)
                    if (business.postalCode) {
                      customFieldsPayload.b1_postal_code = business.postalCode;
                    }

                    // Federal State → b1_federal_state (custom field)
                    if (business.federalState) {
                      customFieldsPayload.b1_federal_state = business.federalState;
                    }

                    // Country → b1_country (custom field)
                    if (business.country) {
                      const normalizedCountry = normalizeCountry(business.country);
                      customFieldsPayload.b1_country = normalizedCountry;
                    }

                    // Different Contact Details (varsa)
                    if (business.differentContact) {
                      // Contact Person → b1_contact_person
                      if (business.contactPerson) {
                        customFieldsPayload.b1_contact_person = business.contactPerson;
                      }

                      // Contact Telephone → b1_contact_person_telephone
                      // PhoneInput zaten tam telefon numarasını formatında tutuyor (örn: +44 123 456 7890)
                      if (business.contactTelephone) {
                        customFieldsPayload.b1_contact_person_telephone = business.contactTelephone;
                      }

                      // Contact Email → b1_contact_person_email
                      if (business.contactEmail) {
                        customFieldsPayload.b1_contact_person_email = business.contactEmail;
                      }
                    }
                    
                    // Custom field'ları ekle (eğer varsa)
                    if (Object.keys(customFieldsPayload).length > 0) {
                      await erpPut(`/api/resource/Address/${encodeURIComponent(businessAddressName)}`, customFieldsPayload, token);
                      // Güncelleme sonrası kısa bekleme
                      await new Promise(resolve => setTimeout(resolve, 500));
                    }
                  } catch (customFieldsError: any) {
                    console.warn(`⚠️ Error adding custom fields to Business Address ${index}:`, customFieldsError?.message);
                    // Custom field'lar eklenemezse de devam et, Address zaten oluşturuldu
                  }
                }
              } catch (createError: any) {
                console.error(`❌ Business Address ${index} create failed:`, createError);
                if (createError?.message) {
                  console.error(`Create error message:`, createError.message);
                }
                if (createError?.response) {
                  console.error(`Create error response:`, createError.response);
                }
                // Hata durumunda addressCreationStatus'i güncelle
                addressCreationStatus.businessAddresses[index] = {
                  success: false,
                  error: createError?.message || "Failed to create Business Address",
                  addressName: null,
                };
                throw createError;
              }
            }
            
            // Address oluşturulduktan/güncellendikten sonra Links Child Table'ını ekle
            if (businessAddressName) {
              addressCreationStatus.businessAddresses[index] = {
                success: false,
                error: null,
                addressName: businessAddressName,
              };
              
              // Links'i eklemek için önce Address'i okuyalım
              // Önce kısa bir bekleme - custom field'ların işlenmesi için
              await new Promise(resolve => setTimeout(resolve, 1000));
              
              try {
                const fullBusinessAddress = await erpGet(`/api/resource/Address/${encodeURIComponent(businessAddressName)}`, token);
                const businessAddressData = fullBusinessAddress?.data || fullBusinessAddress;
                
                // Mevcut links varsa onu kullan, yoksa yeni oluştur
                let businessLinksArray = businessAddressData?.links || [];
                
                // Eğer bu Lead zaten links'te yoksa ekle
                const leadLinkExists = businessLinksArray.some((link: any) => 
                  link.link_doctype === "Lead" && link.link_name === leadName
                );
                
                if (!leadLinkExists) {
                  businessLinksArray.push({
                    link_doctype: "Lead",
                    link_name: leadName,
                    link_title: businessAddressTitle,
                    idx: businessLinksArray.length + 1,
                  });
                  
                  const businessLinksPayload = {
                    links: businessLinksArray,
                  };
                  
                  // Links eklemeden önce kısa bekleme
                  await new Promise(resolve => setTimeout(resolve, 500));
                  
                  await erpPut(`/api/resource/Address/${encodeURIComponent(businessAddressName)}`, businessLinksPayload, token);
                }
                
                addressCreationStatus.businessAddresses[index].success = true;
              } catch (businessLinksError: any) {
                console.error(`❌ Error adding Links to Business Address ${index}:`, businessLinksError);
                console.error(`Business Links error message:`, businessLinksError?.message);
                // Hata mesajını parse et
                let errorMsg = businessLinksError?.message || "Failed to add Links to Business Address";
                if (typeof errorMsg === "string" && errorMsg.includes("HTTP")) {
                  // HTTP hatası ise sadece hata tipini göster
                  errorMsg = "Failed to add Links to Business Address (Server Error)";
                }
                addressCreationStatus.businessAddresses[index].error = errorMsg;
                // Links eklenemezse de devam et, Address zaten oluşturuldu
              }
            } else {
              addressCreationStatus.businessAddresses[index] = {
                success: false,
                error: "Business Address created but name is null - Address may not have been created successfully",
                addressName: null,
              };
            }
          } catch (businessAddressError: any) {
            console.error(`Error creating/updating business address ${index}:`, businessAddressError);
            console.error(`Error message:`, businessAddressError.message);
            console.error(`Error response:`, businessAddressError.response || businessAddressError);
            console.error(`Error stack:`, businessAddressError.stack);
            addressCreationStatus.businessAddresses[index] = {
              success: false,
              error: businessAddressError?.message || "Failed to create/update Business Address",
              addressName: null,
            };
            // Business address hatası diğer business'leri etkilemesin, devam et
          }
        }
      } catch (businessAddressesError: any) {
        console.error("Error processing business addresses:", businessAddressesError);
        // Business address'leri hatası Lead'i etkilemesin, sadece log'layalım
      }
    }

    // File upload işlemi (Lead oluşturulduktan sonra)
    // NOT: File upload şimdilik devre dışı, sadece file name'leri kaydediyoruz
    // File upload'ı daha sonra aktif edeceğiz
    if (false && uploadedFiles && Object.keys(uploadedFiles).length > 0 && documents?.documentData) {
      try {
        const documentDataToUpdate: Record<string, any> = {};
        
        // Mevcut document data'yı parse et (eğer varsa)
        let existingDocumentData: Record<string, any> = {};
        if (updatedLead.custom_document_data) {
          try {
            existingDocumentData = JSON.parse(updatedLead.custom_document_data);
          } catch (parseError) {
            console.warn("Error parsing existing document data:", parseError);
          }
        }
        
        // Her belge için file'ları upload et
        for (const [docId, files] of Object.entries(uploadedFiles)) {
          if (files && files.length > 0) {
            const uploadedFileUrls: string[] = [];
            
            // Her file'ı upload et
            for (const file of files) {
              try {
                // Folder path: Home/Attachments/Lead/{LeadName}/{DocumentId}
                const folderPath = `Home/Attachments/Lead/${leadName}/${docId}`;
                const fileUrl = await erpUploadFile(file, folderPath, token);
                uploadedFileUrls.push(fileUrl);
              } catch (uploadError: any) {
                console.error(`Error uploading file ${file.name} for document ${docId}:`, uploadError);
                console.error(`Error message:`, uploadError.message);
                console.error(`Error stack:`, uploadError.stack);
                // Upload hatası olsa bile devam et, diğer file'ları yükle
              }
            }
            
            // Document data'yı güncelle
            const existingDocData = existingDocumentData[docId] || documents.documentData[docId] || {};
            documentDataToUpdate[docId] = {
              files: uploadedFileUrls.length > 0 ? uploadedFileUrls : (existingDocData.files || []),
              fileNames: files.map(f => f.name), // Original file names
              date: existingDocData.date || null,
            };
          }
        }
        
        // Date field'ları da ekle (file olmayan belgeler için)
        if (documents.documentData) {
          for (const [docId, docData] of Object.entries(documents.documentData)) {
            const data = docData as { files?: any[]; date?: string };
            
            // Eğer bu belge için file upload yapılmadıysa ama date varsa, date'i kaydet
            if (!documentDataToUpdate[docId] && data.date) {
              documentDataToUpdate[docId] = {
                files: [],
                date: data.date,
              };
            } else if (documentDataToUpdate[docId] && data.date) {
              // File upload yapıldıysa ama date de varsa, date'i ekle
              documentDataToUpdate[docId].date = data.date;
            }
          }
        }
        
        // Document data'yı Lead'e kaydet
        if (Object.keys(documentDataToUpdate).length > 0) {
          const finalDocumentData = { ...existingDocumentData, ...documentDataToUpdate };
          await erpPut(
            `/api/resource/Lead/${encodeURIComponent(leadName)}`,
            { custom_document_data: JSON.stringify(finalDocumentData) },
            token
          );
        }
      } catch (fileUploadError: any) {
        console.error("Error uploading files:", fileUploadError);
        console.error("Error message:", fileUploadError.message);
        console.error("Error stack:", fileUploadError.stack);
        // File upload hatası Lead'i etkilemesin, sadece log'layalım
        // Kullanıcıya hata mesajı gösterilmez, çünkü Lead zaten oluşturuldu
      }
    }

    return NextResponse.json({
      success: true,
      lead: updatedLead,
      message: existingLead ? "Lead updated successfully" : "Lead created successfully",
      addressCreationStatus: addressCreationStatus,
    });
  } catch (e: any) {
    console.error("ERP lead update/create error:", e);
    console.error("Error type:", typeof e);
    console.error("Error message:", e?.message);
    console.error("Error stack:", e?.stack);
    
    // ERPNext'ten gelen hata mesajını parse et
    let errorMessage = "Failed to update/create lead in ERP";
    
    if (typeof e?.message === "string") {
      errorMessage = e.message;
      
      // BrokenPipeError kontrolü
      if (e.message.includes("BrokenPipeError") || e.message.includes("Broken pipe")) {
        errorMessage = "Server connection error. Please try again or reduce the file size.";
      }
    }
    
    // Eğer response varsa, onu da log'la
    if (e?.response) {
      console.error("Error response:", e.response);
    }
    
    return NextResponse.json(
      {
        error: errorMessage,
        details: process.env.NODE_ENV === "development" ? e?.message : undefined,
      },
      { status: 500 }
    );
  }
}
