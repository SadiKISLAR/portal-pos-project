import { NextRequest, NextResponse } from "next/server";
import { erpGet } from "@/lib/erp";

/**
 * Bu API endpoint'i kullanıcının Lead'ini getirir.
 * Login olduğunda form verilerini doldurmak için kullanılacak.
 */
export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();

    if (!email) {
      return NextResponse.json(
        { error: "Email is required" },
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

    // Lead'i email ile bul
    const leadFilters = encodeURIComponent(JSON.stringify([["email_id", "=", email]]));
    const leadFields = encodeURIComponent(JSON.stringify(["*"]));
    
    const leadResult = await erpGet(
      `/api/resource/Lead?filters=${leadFilters}&fields=${leadFields}`,
      token
    );

    const leads = leadResult?.data || (Array.isArray(leadResult) ? leadResult : []);

    if (Array.isArray(leads) && leads.length > 0) {
      const lead = leads[0];
      const leadName = lead.name;
      
      // Lead'i direkt name ile çek (Child Table'lar dahil)
      let fullLead;
      try {
        fullLead = await erpGet(`/api/resource/Lead/${encodeURIComponent(leadName)}`, token);
        fullLead = fullLead?.data || fullLead;
        
        // Eğer fullLead'de services varsa, onu kullan
        if (fullLead && fullLead.services) {
          lead.services = fullLead.services;
        }
      } catch (fullLeadError: any) {
        console.warn("Error fetching full Lead:", fullLeadError);
        // Hata olsa bile devam et, mevcut lead'i kullan
      }
      
      
      // Address kaydını oku (Billing Address - Company Information için)
      let billingAddress = null;
      try {
        // Address API çağrısı için filter'ları düzgün encode et
        const addressFilters = [
          ["link_doctype", "=", "Lead"],
          ["link_name", "=", leadName],
          ["address_type", "=", "Billing"]
        ];
        const addressFields = ["*"];
        
        // URL parametrelerini manuel olarak oluştur (417 hatasını önlemek için)
        const filtersParam = encodeURIComponent(JSON.stringify(addressFilters));
        const fieldsParam = encodeURIComponent(JSON.stringify(addressFields));
        const addressUrl = `/api/resource/Address?filters=${filtersParam}&fields=${fieldsParam}`;
        
        const addressResult = await erpGet(addressUrl, token);

        const addresses = addressResult?.data || (Array.isArray(addressResult) ? addressResult : []);
        
        // Eğer Address kaydı varsa, Lead'in address field'larını Address'ten güncelle
        if (Array.isArray(addresses) && addresses.length > 0) {
          billingAddress = addresses[0];
          
          // Address'ten gelen bilgileri Lead'e override et (Address öncelikli)
          if (billingAddress.address_line1) {
            lead.address_line1 = billingAddress.address_line1;
            lead.custom_address_line1 = billingAddress.address_line1; // Custom field'a da kaydet
          }
          if (billingAddress.address_line2) {
            lead.address_line2 = billingAddress.address_line2;
          }
          if (billingAddress.city) {
            lead.city = billingAddress.city;
          }
          if (billingAddress.county) {
            // County bilgisi varsa onu da sakla (ERPNext'te city bazen county'de olabilir)
            if (!lead.city) {
              lead.city = billingAddress.county;
            }
          }
          if (billingAddress.pincode) {
            lead.pincode = billingAddress.pincode;
            lead.custom_pincode = billingAddress.pincode; // Custom field'a da kaydet
          }
          if (billingAddress.state) {
            lead.state = billingAddress.state;
            lead.custom_state = billingAddress.state; // Custom field'a da kaydet
          }
          if (billingAddress.country) {
            lead.country = billingAddress.country;
          }
        } else {
          // Address yoksa, custom field'lardan oku (fallback)
          if (lead.custom_address_line1 && !lead.address_line1) {
            lead.address_line1 = lead.custom_address_line1;
          }
          if (lead.custom_pincode && !lead.pincode) {
            lead.pincode = lead.custom_pincode;
          }
          if (lead.custom_state && !lead.state) {
            lead.state = lead.custom_state;
          }
        }
      } catch (addressError: any) {
        console.warn("Error fetching Address:", addressError);
        // Address hatası Lead'i etkilemesin, devam et
      }
      
      // JSON string'leri parse et
      let businessRegistrationFiles = [];
      let idFiles = [];
      let shareholdersFiles = [];
      let registerExtractFiles = [];
      let hrExtractFiles = [];

      try {
        if (lead.custom_business_registration_files) {
          businessRegistrationFiles = JSON.parse(lead.custom_business_registration_files);
        }
      } catch (e) {
        console.warn("Error parsing business registration files:", e);
      }

      try {
        if (lead.custom_id_files) {
          idFiles = JSON.parse(lead.custom_id_files);
        }
      } catch (e) {
        console.warn("Error parsing ID files:", e);
      }

      try {
        if (lead.custom_shareholders_files) {
          shareholdersFiles = JSON.parse(lead.custom_shareholders_files);
        }
      } catch (e) {
        console.warn("Error parsing shareholders files:", e);
      }

      try {
        if (lead.custom_register_extract_files) {
          registerExtractFiles = JSON.parse(lead.custom_register_extract_files);
        }
      } catch (e) {
        console.warn("Error parsing register extract files:", e);
      }

      try {
        if (lead.custom_hr_extract_files) {
          hrExtractFiles = JSON.parse(lead.custom_hr_extract_files);
        }
      } catch (e) {
        console.warn("Error parsing HR extract files:", e);
      }

      // Parse services from Child Table
      let selectedServices = [];
      try {
        // Önce Child Table'dan services'i al (eğer varsa)
        if (lead.services && Array.isArray(lead.services) && lead.services.length > 0) {
          // Child Table'dan service ID'lerini çıkar
          selectedServices = lead.services.map((serviceRow: any) => {
            // service field'ı Link type olduğu için Service DocType'ının name'ini içerir
            return serviceRow.service || serviceRow.service_name || serviceRow.name;
          }).filter((id: string) => id); // Boş değerleri filtrele
        }
        
        // Eğer Child Table'da yoksa, eski JSON field'ından oku (backward compatibility)
        if (selectedServices.length === 0 && lead.custom_selected_services) {
          selectedServices = JSON.parse(lead.custom_selected_services);
        }
      } catch (e) {
        console.warn("Error parsing selected services:", e);
      }

      // Parse businesses array
      let businesses = [];
      try {
        if (lead.custom_businesses) {
          businesses = JSON.parse(lead.custom_businesses);
        }
      } catch (e) {
        console.warn("Error parsing businesses:", e);
      }

      // Business Address'lerini çek (Shop type)
      let businessAddresses = [];
      try {
        const businessAddressFilters = [
          ["link_doctype", "=", "Lead"],
          ["link_name", "=", leadName],
          ["address_type", "=", "Shop"]
        ];
        const businessAddressFields = ["*"];
        
        const businessAddressFiltersParam = encodeURIComponent(JSON.stringify(businessAddressFilters));
        const businessAddressFieldsParam = encodeURIComponent(JSON.stringify(businessAddressFields));
        const businessAddressUrl = `/api/resource/Address?filters=${businessAddressFiltersParam}&fields=${businessAddressFieldsParam}`;
        
        const businessAddressResult = await erpGet(businessAddressUrl, token);

        businessAddresses = businessAddressResult?.data || (Array.isArray(businessAddressResult) ? businessAddressResult : []);
        
        
        // Business address'lerini businesses array'ine merge et
        if (Array.isArray(businessAddresses) && businessAddresses.length > 0) {
          // Her business address'i businesses array'indeki ilgili business ile eşleştir
          businessAddresses.forEach((address: any, index: number) => {
            // Business name ile eşleştir
            const businessName = address.b1_business_name || address.address_title;
            let businessIndex = businesses.findIndex((b: any) => b.businessName === businessName);
            
            // Eğer bulunamazsa, index'e göre eşleştir
            if (businessIndex === -1 && businesses[index]) {
              businessIndex = index;
            }
            
            if (businessIndex !== -1 && businesses[businessIndex]) {
              // Address'ten gelen bilgileri business'e merge et
              if (address.b1_business_name) businesses[businessIndex].businessName = address.b1_business_name;
              if (address.b1_owner_director) businesses[businessIndex].ownerDirector = address.b1_owner_director;
              if (address.b1_telephone) businesses[businessIndex].ownerTelephone = address.b1_telephone;
              if (address.b1_email_address) businesses[businessIndex].ownerEmail = address.b1_email_address;
              if (address.b1_street_and_house_number) businesses[businessIndex].street = address.b1_street_and_house_number;
              if (address.b1_city) businesses[businessIndex].city = address.b1_city;
              if (address.b1_postal_code) businesses[businessIndex].postalCode = address.b1_postal_code;
              if (address.b1_federal_state) businesses[businessIndex].federalState = address.b1_federal_state;
              if (address.b1_country) businesses[businessIndex].country = address.b1_country;
              
              // Different contact details
              if (address.b1_contact_person || address.b1_contact_person_telephone || address.b1_contact_person_email) {
                businesses[businessIndex].differentContact = true;
                if (address.b1_contact_person) businesses[businessIndex].contactPerson = address.b1_contact_person;
                if (address.b1_contact_person_telephone) businesses[businessIndex].contactTelephone = address.b1_contact_person_telephone;
                if (address.b1_contact_person_email) businesses[businessIndex].contactEmail = address.b1_contact_person_email;
              }
            }
          });
          
        }
      } catch (businessAddressError: any) {
        console.warn("Error fetching Business Addresses:", businessAddressError);
        // Business address hatası Lead'i etkilemesin, devam et
      }

      return NextResponse.json({
        success: true,
        lead: {
          ...lead,
          // Parse edilmiş file arrays
          businessRegistrationFiles,
          idFiles,
          shareholdersFiles,
          registerExtractFiles,
          hrExtractFiles,
          businesses, // Parse edilmiş businesses array
          custom_selected_services: selectedServices.length > 0 ? JSON.stringify(selectedServices) : lead.custom_selected_services, // Services array (backward compatibility için JSON)
          services: lead.services || [], // Child Table services (eğer varsa)
        },
      });
    } else {
      return NextResponse.json({
        success: false,
        lead: null,
        message: "No lead found for this user",
      });
    }
  } catch (e: any) {
    console.error("ERP get lead error:", e);
    
    return NextResponse.json(
      {
        error: e.message || "Failed to get lead from ERP",
      },
      { status: 500 }
    );
  }
}

