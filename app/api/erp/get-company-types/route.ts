import { NextRequest, NextResponse } from "next/server";
import { erpGet } from "@/lib/erp";

/**
 * Bu API endpoint'i ERPNext'ten aktif company type'ları getirir.
 * Registration Documents sayfasında company type seçimi için kullanılacak.
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

    // Company Type DocType'ını bul - farklı olası isimleri dene
    const possibleDocTypeNames = [
      "Company Type",
      "CompanyType",
      "Company Types",
      "CompanyTypes",
      "Company_Type",
      "Company_Types",
    ];
    
    let companyTypesResult;
    let foundDocType = null;
    
    // Her DocType adını dene
    for (const doctypeName of possibleDocTypeNames) {
      try {
        // Önce filter olmadan deneyelim, sonra field'ları kontrol edelim
        const fields = encodeURIComponent(JSON.stringify(["*"]));
        const url = `/api/resource/${encodeURIComponent(doctypeName)}?fields=${fields}&limit_page_length=1`;
        
        const testResult = await erpGet(url, token);
        
        // Eğer başarılıysa, aktif olanları filtrele
        // Field isimleri custom_ prefix'li olabilir
        try {
          const filters = encodeURIComponent(JSON.stringify([
            ["custom_is_active", "=", 1]
          ]));
          const fieldsWithCustom = encodeURIComponent(JSON.stringify(["*"]));
          
          const filteredUrl = `/api/resource/${encodeURIComponent(doctypeName)}?filters=${filters}&fields=${fieldsWithCustom}`;
          
          companyTypesResult = await erpGet(filteredUrl, token);
        } catch (filterError: any) {
          // Filter çalışmazsa, filter olmadan tümünü çek
          const fieldsWithCustom = encodeURIComponent(JSON.stringify(["*"]));
          const urlWithoutFilter = `/api/resource/${encodeURIComponent(doctypeName)}?fields=${fieldsWithCustom}`;
          companyTypesResult = await erpGet(urlWithoutFilter, token);
        }
        
        
        foundDocType = doctypeName;
        break;
      } catch (error: any) {
        continue;
      }
    }
    
    if (!foundDocType) {
      // Build sırasında environment variable'lar yüklenmemiş olabilir
      // Runtime'da tekrar denenecek, bu yüzden boş array döndür
      console.warn(
        `Could not find Company Type DocType. Tried: ${possibleDocTypeNames.join(", ")}. ` +
        `This might be a build-time issue. Will retry at runtime.`
      );
      return NextResponse.json({
        success: true,
        companyTypes: [],
      });
    }

    // Response formatını kontrol et
    let companyTypes = [];
    if (companyTypesResult?.data && Array.isArray(companyTypesResult.data)) {
      companyTypes = companyTypesResult.data;
    } else if (Array.isArray(companyTypesResult)) {
      companyTypes = companyTypesResult;
    } else if (companyTypesResult?.message && Array.isArray(companyTypesResult.message)) {
      companyTypes = companyTypesResult.message;
    }


    // Company type'ları formatla - custom_ prefix'li field'ları da kontrol et
    const processedCompanyTypes = Array.isArray(companyTypes) ? companyTypes.map((ct: any) => {
      // Field isimleri custom_ prefix'li olabilir
      const companyTypeName = ct.custom_company_type_name || ct.company_type_name || ct.name;
      const description = ct.custom_description || ct.description || "";
      const isActive = ct.custom_is_active !== undefined ? ct.custom_is_active : 
                      (ct.is_active !== undefined ? ct.is_active : true);
      
      return {
        id: ct.name,
        name: companyTypeName,
        description: description,
        isActive: isActive,
      };
    }) : [];


    return NextResponse.json({
      success: true,
      companyTypes: processedCompanyTypes,
    });
  } catch (e: any) {
    console.error("ERP get company types error:", e);
    
    return NextResponse.json(
      {
        error: e.message || "Failed to get company types from ERP",
        companyTypes: [],
      },
      { status: 500 }
    );
  }
}

