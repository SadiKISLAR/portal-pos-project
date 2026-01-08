import { NextRequest, NextResponse } from "next/server";
import { erpGet } from "@/lib/erp";

/**
 * Bu API endpoint'i ERPNext'ten aktif servisleri getirir.
 * Services sayfasında göstermek için kullanılacak.
 */
// Force dynamic rendering - bu route her zaman dynamic olmalı
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const token = process.env.ERP_API_TOKEN;

    if (!token) {
      return NextResponse.json(
        { error: "ERP_API_TOKEN environment variable is not set" },
        { status: 500 }
      );
    }

    // DocType adını bulmak için farklı olasılıkları dene
    const possibleDocTypeNames = [
      "Services", // Çoğul form
      "Service", // Tekil form
      "Restaurant Service", // Tam isim
      "Restaurant Services", // Çoğul tam isim
    ];
    
    let servicesResult;
    let foundDocType = null;
    
    // Her DocType adını dene
    for (const doctypeName of possibleDocTypeNames) {
      try {
        const fields = encodeURIComponent(JSON.stringify(["*"])); // Tüm field'ları getir
        
        const url = `/api/resource/${encodeURIComponent(doctypeName)}?fields=${fields}`;
        
        servicesResult = await erpGet(url, token);
        
        foundDocType = doctypeName;
        break; // Başarılı olursa döngüden çık
      } catch (error: any) {
        // Bu DocType bulunamadı, bir sonrakini dene
        continue;
      }
    }
    
    // Hiçbir DocType bulunamadıysa
    if (!foundDocType) {
      // Build sırasında environment variable'lar yüklenmemiş olabilir
      // Runtime'da tekrar denenecek, bu yüzden boş array döndür
      console.warn(
        `Could not find Service DocType. Tried: ${possibleDocTypeNames.join(", ")}. ` +
        `This might be a build-time issue. Will retry at runtime.`
      );
      return NextResponse.json({
        success: true,
        services: [],
      });
    }

    // Response formatını kontrol et
    let services = [];
    if (servicesResult?.data && Array.isArray(servicesResult.data)) {
      services = servicesResult.data;
    } else if (Array.isArray(servicesResult)) {
      services = servicesResult;
    } else if (servicesResult?.message && Array.isArray(servicesResult.message)) {
      services = servicesResult.message;
    }


    // Her service için image URL'ini base URL ile birleştir
    const baseUrl = process.env.NEXT_PUBLIC_ERP_BASE_URL;
    const processedServices = Array.isArray(services) ? services.map((service: any) => {
      
      // Field isimlerini kontrol et - farklı olabilir
      const serviceName = service.service_name || service.name || service.title || "";
      const description = service.description || service.desc || "";
      const imageField = service.service_image || service.image || service.attachment || null;
      const isActive = service.is_active !== undefined ? service.is_active : 
                      (service.enabled !== undefined ? service.enabled : true);
      const contracts = service.service_contracts || service.contracts || [];
      
      let imageUrl = null;
      if (imageField) {
        // ERPNext image path'i zaten tam path olabilir veya relative path olabilir
        if (typeof imageField === 'string') {
          // ERPNext'teki /private/files/ dosyaları authentication gerektiriyor
          // Bu yüzden proxy endpoint üzerinden geçiriyoruz
          // Frontend'den /api/erp/proxy-image?url=... şeklinde çağrılacak
          
          let erpImagePath = imageField;
          
          // Tam URL ise path'i çıkar
          if (imageField.startsWith("http")) {
            try {
              const url = new URL(imageField);
              erpImagePath = url.pathname;
            } catch {
              erpImagePath = imageField;
            }
          }
          
          // Proxy URL'i oluştur
          // encodeURIComponent ile URL'i encode et (path içindeki özel karakterler için)
          imageUrl = `/api/erp/proxy-image?url=${encodeURIComponent(erpImagePath)}`;
        }
      } else {
      }

      return {
        id: service.name,
        name: serviceName,
        description: description,
        image: imageUrl,
        isActive: isActive,
        contracts: contracts, // Child table verileri
      };
    }) : [];


    return NextResponse.json({
      success: true,
      services: processedServices,
    });
  } catch (e: any) {
    console.error("ERP get services error:", e);
    
    return NextResponse.json(
      {
        error: e.message || "Failed to get services from ERP",
        services: [],
      },
      { status: 500 }
    );
  }
}

