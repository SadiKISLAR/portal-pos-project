import { NextRequest, NextResponse } from "next/server";
import { erpGet } from "@/lib/erp";

/**
 * Bu API endpoint'i seçilen company type için gerekli belgeleri getirir.
 * Registration Documents sayfasında dinamik belge alanları oluşturmak için kullanılacak.
 */
export async function GET(req: NextRequest) {
  try {
    const token = process.env.ERP_API_TOKEN;

    if (!token) {
      return NextResponse.json(
        { error: "ERP_API_TOKEN environment variable is not set" },
        { status: 500 }
      );
    }

    // URL'den company type parametresini al
    const { searchParams } = new URL(req.url);
    const companyTypeName = searchParams.get("companyType");

    if (!companyTypeName) {
      return NextResponse.json(
        { error: "companyType parameter is required" },
        { status: 400 }
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
    
    let companyTypeResult;
    let foundDocType = null;
    
    // Her DocType adını dene
    for (const doctypeName of possibleDocTypeNames) {
      try {
        // Önce company type'ı custom_company_type_name veya company_type_name ile bul
        const filtersByName = encodeURIComponent(JSON.stringify([
          ["custom_company_type_name", "=", companyTypeName]
        ]));
        const fields = encodeURIComponent(JSON.stringify(["*"]));
        
        let url = `/api/resource/${encodeURIComponent(doctypeName)}?filters=${filtersByName}&fields=${fields}`;
        
        let result = await erpGet(url, token);
        
        let companyTypes = [];
        if (result?.data && Array.isArray(result.data)) {
          companyTypes = result.data;
        } else if (Array.isArray(result)) {
          companyTypes = result;
        } else if (result?.message && Array.isArray(result.message)) {
          companyTypes = result.message;
        }

        // Eğer custom_company_type_name ile bulunamazsa, company_type_name ile dene
        if (companyTypes.length === 0) {
          const filtersByName2 = encodeURIComponent(JSON.stringify([
            ["company_type_name", "=", companyTypeName]
          ]));
          url = `/api/resource/${encodeURIComponent(doctypeName)}?filters=${filtersByName2}&fields=${fields}`;
          
          result = await erpGet(url, token);
          
          if (result?.data && Array.isArray(result.data)) {
            companyTypes = result.data;
          } else if (Array.isArray(result)) {
            companyTypes = result;
          } else if (result?.message && Array.isArray(result.message)) {
            companyTypes = result.message;
          }
        }

        if (companyTypes.length > 0) {
          companyTypeResult = companyTypes[0];
          foundDocType = doctypeName;
          break;
        }
      } catch (error: any) {
        continue;
      }
    }
    
    if (!foundDocType || !companyTypeResult) {
      return NextResponse.json(
        {
          error: `Company Type '${companyTypeName}' not found`,
          requiredDocuments: [],
        },
        { status: 404 }
      );
    }

    // Company Type'ı direkt name ile çek (Child Table'lar dahil)
    let fullCompanyType;
    try {
      const companyTypeNameId = companyTypeResult.name;
      fullCompanyType = await erpGet(`/api/resource/${encodeURIComponent(foundDocType)}/${encodeURIComponent(companyTypeNameId)}`, token);
      fullCompanyType = fullCompanyType?.data || fullCompanyType;
      
      // Farklı olası field isimlerini dene (custom_ prefix'li olanlar dahil)
      const possibleFieldNames = [
        'custom_required_document',  // Custom field (tek form) - ÖNCE BUNU DENE
        'custom_required_documents', // Custom field (çoğul form)
        'required_documents',
        'required_document',
        'requiredDocuments',
        'Required Document',
        'requiredDocument'
      ];
      
      let foundRequiredDocuments = null;
      for (const fieldName of possibleFieldNames) {
        if (fullCompanyType && fullCompanyType[fieldName]) {
          foundRequiredDocuments = fullCompanyType[fieldName];
          break;
        }
      }
      
      // Eğer required_documents field'ı bulunduysa, onu kullan
      if (foundRequiredDocuments) {
        companyTypeResult.required_documents = foundRequiredDocuments;
      } else {
        // Tüm field'ları listele (custom_ ile başlayanlar dahil)
        const customFields = Object.keys(fullCompanyType || {}).filter(key => key.includes('required') || key.includes('document'));
      }
    } catch (fullCompanyTypeError: any) {
      console.warn("Error fetching full Company Type:", fullCompanyTypeError);
      console.warn("Error message:", fullCompanyTypeError.message);
    }

    // Required Documents Child Table'ını parse et
    let requiredDocuments = [];
    
    if (companyTypeResult.required_documents && Array.isArray(companyTypeResult.required_documents)) {
      requiredDocuments = companyTypeResult.required_documents.map((doc: any, index: number) => {
        
        // Custom field isimlerini kontrol et (custom_ prefix'li)
        const documentName = doc.custom_document_name || doc.document_name || "";
        const documentType = doc.custom_document_type || doc.document_type || "";
        const isRequired = doc.custom_is_required !== undefined ? doc.custom_is_required : 
                          (doc.is_required !== undefined ? doc.is_required : true);
        const maxFiles = doc.custom_max_files !== undefined ? doc.custom_max_files : 
                        (doc.max_files !== undefined ? doc.max_files : 5);
        const allowedFileTypes = doc.custom_allowed_file_types || doc.allowed_file_types || "PDF, JPG, PNG";
        const isDateField = doc.custom_is_date_field !== undefined ? doc.custom_is_date_field : 
                           (doc.is_date_field !== undefined ? doc.is_date_field : false);
        const dateFieldLabel = doc.custom_date_field_label || doc.date_field_label || doc.custom_document_name || doc.document_name || "";
        
        return {
          id: doc.name || documentName || `doc_${index}`,
          documentName: documentName,
          documentType: documentType,
          isRequired: isRequired,
          maxFiles: maxFiles,
          allowedFileTypes: allowedFileTypes,
          isDateField: isDateField,
          dateFieldLabel: dateFieldLabel,
        };
      });
    }


    // Field isimleri custom_ prefix'li olabilir
    const companyTypeDisplayName = companyTypeResult.custom_company_type_name || 
                                   companyTypeResult.company_type_name || 
                                   companyTypeResult.name;
    const description = companyTypeResult.custom_description || 
                       companyTypeResult.description || "";

    return NextResponse.json({
      success: true,
      companyType: {
        id: companyTypeResult.name,
        name: companyTypeDisplayName,
        description: description,
      },
      requiredDocuments: requiredDocuments,
    });
  } catch (e: any) {
    console.error("ERP get required documents error:", e);
    
    return NextResponse.json(
      {
        error: e.message || "Failed to get required documents from ERP",
        requiredDocuments: [],
      },
      { status: 500 }
    );
  }
}

