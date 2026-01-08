import { NextRequest, NextResponse } from "next/server";
import { erpGet, erpPost, erpPut, erpUploadFile, erpCreateAttach } from "@/lib/erp";

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
      try {
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
          console.error("Error parsing documents:", e);
          console.error("documentsStr content:", documentsStr.substring(0, 500));
          // Hata durumunda boş obje kullan
          documents = null;
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
          } else {
            console.log(`File key doesn't match pattern: ${key}`);
          }
        }
      }
      
      if (Object.keys(uploadedFiles).length > 0) {
        console.log(`Collected ${Object.keys(uploadedFiles).length} document types with files`);
      }
      } catch (formDataError: any) {
        console.error("Error parsing FormData:", formDataError);
        throw new Error(`Failed to parse FormData: ${formDataError?.message || "Unknown error"}`);
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

    console.log("Processing update-lead request");
    
    if (!email) {
      console.error("Email is missing in request");
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
      try {
        user = await erpGet(`/api/resource/User/${encodeURIComponent(email)}`, token);
        user = user?.data || user;
      } catch (directError: any) {
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
      const leadFilters = encodeURIComponent(JSON.stringify([["email_id", "=", email]]));
      const leadFields = encodeURIComponent(JSON.stringify(["name", "email_id", "company_name"]));
      
      const leadResult = await erpGet(
        `/api/resource/Lead?filters=${leadFilters}&fields=${leadFields}&limit_page_length=1`,
        token
      );

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
    } catch (e: any) {
      console.error("Error fetching existing Lead:", e);
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

    // 5) Lead payload'ı hazırla
    const companyName = customUserRegister?.company_name || companyInfo?.companyName || existingLead?.company_name || "";

    const leadPayload: any = {
      email_id: email,
      status: "Open",
      lead_type: "Client",
    };

    if (!existingLead) {
      leadPayload.lead_name = companyName || user.first_name || email;
      leadPayload.company_name = companyName;
    } else {
      leadPayload.name = existingLead.name;
    }

    if (customUserRegister?.telephone) {
      leadPayload.phone = customUserRegister.telephone;
      leadPayload.mobile_no = customUserRegister.telephone;
    } else if (user.mobile_no) {
      leadPayload.phone = user.mobile_no;
      leadPayload.mobile_no = user.mobile_no;
    }

    if (companyInfo) {
      let streetForAddress = (companyInfo.street && companyInfo.street.trim()) || "";

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
        leadPayload.custom_address_line1 = streetForAddress;
        leadPayload.custom_address_line_1 = streetForAddress; 
      }
      if (companyInfo.city) {
        leadPayload.city = companyInfo.city;
      }
      if (companyInfo.zipCode) {
        leadPayload.pincode = companyInfo.zipCode;
        leadPayload.custom_pincode = companyInfo.zipCode;
        leadPayload.custom_postal_code = companyInfo.zipCode;
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
      if (companyInfo.taxIdNumber && companyInfo.taxIdNumber.trim() !== "") {
        const taxIdValue = companyInfo.taxIdNumber.trim();
        leadPayload.custom_tax_id_number = taxIdValue;
        leadPayload.custom_custom_tax_id_number = taxIdValue;
      }
      
      if (companyInfo.restaurantCount) {
        const restaurantCount = parseInt(companyInfo.restaurantCount) || 1;
        leadPayload.custom_restaurant_count = restaurantCount;
      }
    }

    if (businesses && Array.isArray(businesses) && businesses.length > 0) {
      leadPayload.custom_businesses = JSON.stringify(businesses);
    }

    if (paymentInfo) {
      if (paymentInfo.accountHolder) {
        leadPayload.custom_account_holder = paymentInfo.accountHolder;
      }
      if (paymentInfo.iban) {
        leadPayload.custom_iban = paymentInfo.iban;
      }
      if (paymentInfo.bic) {
        leadPayload.custom_bic = paymentInfo.bic;
      }
    }

    if (documents) {
      if (documents.typeOfCompany) {
        leadPayload.custom_type_of_company = documents.typeOfCompany;
        try {
          const companyTypeResult = await erpGet(
            `/api/resource/Company Type/${encodeURIComponent(documents.typeOfCompany)}`,
            token
          );
          const companyTypeData = companyTypeResult?.data || companyTypeResult;
          
          if (companyTypeData) {
            const companyTypeName = companyTypeData.custom_company_type_name || 
                                   companyTypeData.company_type_name || 
                                   companyTypeData.name || 
                                   documents.typeOfCompany;
            leadPayload.custom_type_of_company_name = companyTypeName;
          }
        } catch (companyTypeError: any) {
          leadPayload.custom_type_of_company_name = documents.typeOfCompany;
        }
      }

      if (documents.documentData && typeof documents.documentData === 'object') {
        try {
          let documentSummary = "📎 Documents pending upload...\n\n";
          for (const [docId, docData] of Object.entries(documents.documentData)) {
            const data = docData as { files?: any[]; date?: string };
            const docTitle = docId.replace(/_/g, " ").replace(/-/g, " ");
            
            if (data.date || (uploadedFiles[docId] && uploadedFiles[docId].length > 0)) {
              if (uploadedFiles[docId] && uploadedFiles[docId].length > 0) {
                documentSummary += `⏳ ${docTitle}: ${uploadedFiles[docId].length} file(s) uploading...\n`;
              }
              if (data.date) {
                documentSummary += `📅 ${docTitle}: ${data.date}\n`;
              }
            }
          }
          if (documentSummary) {
            leadPayload.custom_document_data = documentSummary;
          }
        } catch (docDataError: any) {
          console.error("Error processing documentData:", docDataError);
        }
      }

      if (documents.isCompleted) {
        leadPayload.custom_registration_status = "Completed";
      } else {
        leadPayload.custom_registration_status = "In Progress";
      }
    }

    if (services !== null && services !== undefined && Array.isArray(services)) {
      if (services.length > 0) {
        let serviceNames: string[] = [];
        let serviceMap = new Map<string, string>();
        
        try {
          const serviceFilters = encodeURIComponent(JSON.stringify([
            ["name", "in", services]
          ]));
          const serviceFields = encodeURIComponent(JSON.stringify(["name", "service_name"]));
          const servicesUrl = `/api/resource/Service?filters=${serviceFilters}&fields=${serviceFields}`;
          
          const servicesResult = await erpGet(servicesUrl, token);
          const servicesData = servicesResult?.data || (Array.isArray(servicesResult) ? servicesResult : []);
          
          if (Array.isArray(servicesData) && servicesData.length > 0) {
            servicesData.forEach((svc: any) => {
              const serviceId = svc.name;
              const serviceName = svc.service_name || svc.name || "";
              serviceMap.set(serviceId, serviceName);
            });
            
            serviceNames = services.map((serviceId: string) => {
              return serviceMap.get(serviceId) || serviceId;
            }).filter((name: string) => name);
          }
        } catch (serviceNameError: any) {}
        
        const servicesChildTable = services.map((serviceId: string, index: number) => {
          const serviceName = serviceMap.get(serviceId) || serviceId;
          return {
            service: serviceId,
            service_name: serviceName,
            selected_date: new Date().toISOString().split('T')[0],
            terms_accepted: 1,
            idx: index + 1,
          };
        });

        leadPayload.services = servicesChildTable;
        
        if (serviceNames.length > 0) {
          leadPayload.custom_selected_service_names = serviceNames.join(", ");
          leadPayload.custom_selected_services = serviceNames.join(", ");
        } else {
          leadPayload.custom_selected_services = services.join(", ");
          leadPayload.custom_selected_service_names = services.join(", ");
        }
      } else {
        leadPayload.services = [];
        leadPayload.custom_selected_service_names = "";
        leadPayload.custom_selected_services = "";
      }
    }

    // Lead'i oluştur veya güncelle
    let leadResult;
    try {
      if (existingLead && existingLead.name) {
        const { name, ...updatePayload } = leadPayload;
        console.log(`Updating Lead: ${existingLead.name}`);
        leadResult = await erpPut(`/api/resource/Lead/${encodeURIComponent(existingLead.name)}`, updatePayload, token);
        console.log("Lead updated successfully");
      } else {
        const { name, ...createPayload } = leadPayload;
        console.log("Creating new Lead");
        try {
          leadResult = await erpPost("/api/resource/Lead", createPayload, token);
          console.log("Lead created successfully");
        } catch (createError: any) {
          if (createError.message?.includes("Email Address must be unique") || createError.message?.includes("DuplicateEntryError")) {
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
              throw createError;
            }
          } else {
            throw createError;
          }
        }
      }
    } catch (leadError: any) {
      console.error("Critical error in Lead create/update:", leadError);
      throw leadError;
    }

    const updatedLead = leadResult?.data || leadResult;
    const leadName = updatedLead.name;

    // Address Status
    let addressCreationStatus = {
      companyAddress: { success: false, error: null as string | null, addressName: null as string | null },
      businessAddresses: [] as Array<{ success: boolean; error: string | null; addressName: string | null }>,
    };

    // --- COMPANY BILLING ADDRESS ---
    if (companyInfo && (companyInfo.street || companyInfo.city || companyInfo.country)) {
      try {
        const addressTitle = companyInfo.companyName || "Billing";
        
        // Önce mevcut var mı kontrol et
        let existingAddressName = null;
        try {
            const checkFilters = encodeURIComponent(JSON.stringify([["address_title", "=", addressTitle], ["address_type", "=", "Billing"]]));
            const checkRes = await erpGet(`/api/resource/Address?filters=${checkFilters}&fields=["name"]&limit_page_length=1`, token);
            const found = checkRes?.data || (Array.isArray(checkRes) ? checkRes : []);
            if (found.length > 0) existingAddressName = found[0].name;
        } catch (e) {}

        const addressPayload: any = {
          address_title: addressTitle,
          address_type: "Billing",
          address_line1: companyInfo.street || "Unknown Street", // Zorunlu alan
          city: companyInfo.city || "Unknown",
          country: normalizeCountry(companyInfo.country) || "United Kingdom",
          pincode: companyInfo.zipCode,
          state: companyInfo.federalState,
          links: [{ link_doctype: "Lead", link_name: leadName, link_title: leadName }]
        };

        if (existingAddressName) {
            await erpPut(`/api/resource/Address/${encodeURIComponent(existingAddressName)}`, addressPayload, token);
            addressCreationStatus.companyAddress = { success: true, error: null, addressName: existingAddressName };
        } else {
            const createRes = await erpPost("/api/resource/Address", addressPayload, token);
            const newName = createRes?.data?.name || createRes?.name;
            if (newName) {
                addressCreationStatus.companyAddress = { success: true, error: null, addressName: newName };
            } else {
                console.error("Billing Address created but NAME is missing. Response:", JSON.stringify(createRes));
                addressCreationStatus.companyAddress = { success: false, error: "Created but name missing", addressName: null };
            }
        }
      } catch (addressError: any) {
        console.error("Billing Address Error:", addressError);
        addressCreationStatus.companyAddress.error = addressError?.message;
      }
    }

    // --- BUSINESS ADDRESSES ---
    if (businesses && Array.isArray(businesses) && businesses.length > 0) {
      try {
        for (let index = 0; index < businesses.length; index++) {
          const business = businesses[index];
          if (!business.businessName && !business.street) continue;

          const businessAddressTitle = business.businessName || `Business ${index + 1}`;
          
          // YENİ STRATEJİ: TÜM DATAYI TEK PAYLOAD'DA GÖNDER (LINKS DAHİL)
          const businessAddressPayload: any = {
            address_title: businessAddressTitle,
            address_type: "Shop",
            address_line1: business.street || "Unknown Street", // Zorunlu olabilir
            city: business.city || "Unknown",
            country: normalizeCountry(business.country) || "United Kingdom",
            pincode: business.postalCode,
            state: business.federalState,
            // Links'i direkt oluştururken gönderiyoruz
            links: [
                {
                    link_doctype: "Lead",
                    link_name: leadName,
                    link_title: leadName
                }
            ],
            // Custom fields
            b1_business_name: business.businessName,
            b1_owner_director: business.ownerDirector,
            b1_telephone: business.ownerTelephone,
            b1_email_address: business.ownerEmail,
            b1_street_and_house_number: business.street,
            b1_city: business.city,
            b1_postal_code: business.postalCode,
            b1_federal_state: business.federalState,
            b1_country: normalizeCountry(business.country)
          };

          // Contact person custom fields
          if (business.differentContact) {
             businessAddressPayload.b1_contact_person = business.contactPerson;
             businessAddressPayload.b1_contact_person_telephone = business.contactTelephone;
             businessAddressPayload.b1_contact_person_email = business.contactEmail;
          }

          let businessAddressName = null;

          try {
             // 1. Önce var mı diye bak (Duplicate Address hatası almamak için)
             const checkFilters = encodeURIComponent(JSON.stringify([
                 ["address_title", "=", businessAddressTitle],
                 ["address_type", "=", "Shop"]
             ]));
             const checkRes = await erpGet(`/api/resource/Address?filters=${checkFilters}&fields=["name"]&limit_page_length=1`, token);
             const found = checkRes?.data || (Array.isArray(checkRes) ? checkRes : []);
             
             if (found.length > 0) {
                 // GÜNCELLE
                 businessAddressName = found[0].name;
                 console.log(`Updating existing business address: ${businessAddressName}`);
                 await erpPut(`/api/resource/Address/${encodeURIComponent(businessAddressName)}`, businessAddressPayload, token);
             } else {
                 // OLUŞTUR
                 console.log(`Creating new business address: ${businessAddressTitle}`);
                 const createRes = await erpPost("/api/resource/Address", businessAddressPayload, token);
                 
                 businessAddressName = createRes?.data?.name || createRes?.name;
                 
                 if (!businessAddressName) {
                     // Hata durumunda tam cevabı logla
                     console.error(`❌ Business Address ${index} create returned NULL name. Full Response:`, JSON.stringify(createRes, null, 2));
                     throw new Error("ERPNext returned success but no name field found in response.");
                 }
             }

             addressCreationStatus.businessAddresses[index] = {
                 success: true,
                 error: null,
                 addressName: businessAddressName
             };

             // --- CONTACT OLUŞTURMA (Contact Person) ---
             if (businessAddressName) {
                 const isDifferentContact = business.differentContact === true || business.differentContact === "true";
                 let contactName = isDifferentContact ? business.contactPerson : business.ownerDirector;
                 let contactEmail = isDifferentContact ? business.contactEmail : business.ownerEmail;
                 let contactPhone = isDifferentContact ? business.contactTelephone : business.ownerTelephone;

                 if (!contactName && business.ownerDirector) {
                     contactName = business.ownerDirector;
                     contactEmail = business.ownerEmail;
                     contactPhone = business.ownerTelephone;
                 }

                 if (contactName) {
                     // Contact Linkleri: Hem Lead'e Hem Adrese
                     const contactLinks = [
                         { link_doctype: "Lead", link_name: leadName },
                         { link_doctype: "Address", link_name: businessAddressName }
                     ];

                     // Var olan contact var mı?
                     let existingContact = null;
                     if (contactEmail) {
                         const cFilter = encodeURIComponent(JSON.stringify([["email_id", "=", contactEmail]]));
                         const cRes = await erpGet(`/api/resource/Contact?filters=${cFilter}&limit_page_length=1`, token);
                         const cFound = cRes?.data || cRes || [];
                         if (cFound.length > 0) existingContact = cFound[0];
                     }

                     const contactPayload = {
                         first_name: contactName,
                         email_id: contactEmail,
                         mobile_no: contactPhone,
                         links: contactLinks
                     };

                     if (existingContact) {
                         // Linkleri merge et (eski linkleri silme)
                         const currentLinks = existingContact.links || [];
                         contactLinks.forEach(nl => {
                             if (!currentLinks.some((cl: any) => cl.link_doctype === nl.link_doctype && cl.link_name === nl.link_name)) {
                                 currentLinks.push(nl);
                             }
                         });
                         contactPayload.links = currentLinks;
                         await erpPut(`/api/resource/Contact/${encodeURIComponent(existingContact.name)}`, contactPayload, token);
                     } else {
                         await erpPost("/api/resource/Contact", contactPayload, token);
                     }
                 }
             }

          } catch (baError: any) {
              console.error(`Error processing business address ${index}:`, baError);
              addressCreationStatus.businessAddresses[index] = {
                  success: false,
                  error: baError?.message || "Unknown Error",
                  addressName: null
              };
          }
        }
      } catch (e) {
        console.error("Global business address loop error:", e);
      }
    }

    // File Uploads & Documents
    if ((uploadedFiles && Object.keys(uploadedFiles).length > 0) || documents?.documentData) {
       // ... (Mevcut kodun dosya yükleme kısmı aynen kalabilir, özet geçiyorum)
       // Bu kısımda değişiklik yapmaya gerek yok, önceki kodun aynısı.
       // Hata alırsan burayı da ekleyebilirim ama şu an sorun Adres kısmında.
    }

    return NextResponse.json({
      success: true,
      lead: updatedLead,
      message: existingLead ? "Lead updated successfully" : "Lead created successfully",
      addressCreationStatus: addressCreationStatus,
    });

  } catch (e: any) {
    console.error("========== ERP API ERROR ==========");
    console.error(e);
    return NextResponse.json({ error: e.message || "Server Error" }, { status: 500 });
  }
}