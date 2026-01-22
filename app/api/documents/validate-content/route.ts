import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import { tmpdir } from "os";
import path from "path";
import { erpGet } from "@/lib/erp";

// Node.js runtime kullan
export const runtime = "nodejs";

// Public klasörünün yolunu bul
function getPublicPath() {
  return path.join(process.cwd(), "public");
}

// ERP'den referans belgeyi çek
async function getReferenceDocumentFromERP(documentName: string): Promise<{ buffer: Buffer; url: string } | null> {
  try {
    const token = process.env.ERP_API_TOKEN;
    if (!token) return null;

    const BASE_URL = process.env.NEXT_PUBLIC_ERP_BASE_URL;
    if (!BASE_URL) return null;

    // Olası DocType isimlerini dene
    const possibleDocTypeNames = [
      "Reference Document",
      "ReferenceDocument",
      "Reference Documents",
      "ReferenceDocuments",
      "Reference_Document",
      "Reference_Documents",
    ];

    for (const doctypeName of possibleDocTypeNames) {
      try {
        // Belge adına göre filtrele
        const filters = encodeURIComponent(
          JSON.stringify([
            ["document_name", "=", documentName],
            ["is_active", "=", 1],
          ])
        );

        const url = `/api/resource/${encodeURIComponent(doctypeName)}?filters=${filters}&limit_page_length=1`;
        const result = await erpGet(url, token);

        if (result?.data && Array.isArray(result.data) && result.data.length > 0) {
          const refDoc = result.data[0];
          
          // File attachment'ı bul
          // ERPNext'te file field'ı genellikle file_url veya attachment field'ında olur
          const fileUrl = refDoc.file_url || refDoc.attachment || refDoc.file;
          
          if (fileUrl) {
            // URL'i tam URL'e çevir
            const fullUrl = fileUrl.startsWith("http") 
              ? fileUrl 
              : `${BASE_URL}${fileUrl.startsWith("/") ? "" : "/"}${fileUrl}`;

            // Dosyayı indir
            const fileResponse = await fetch(fullUrl, {
              headers: {
                "Authorization": token,
              },
            });

            if (fileResponse.ok) {
              const arrayBuffer = await fileResponse.arrayBuffer();
              return {
                buffer: Buffer.from(arrayBuffer),
                url: fullUrl,
              };
            }
          }
        }
      } catch (error) {
        // Bu DocType bulunamadı, bir sonrakini dene
        continue;
      }
    }

    return null;
  } catch (error) {
    console.error("Error fetching reference document from ERP:", error);
    return null;
  }
}

// PDF'den metin çıkarmak için
async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  const tempDir = tmpdir();
  const tempFile = path.join(tempDir, `pdf_${Date.now()}.pdf`);
  
  try {
    await fs.writeFile(tempFile, buffer);
    const PDFParser = (await import("pdf2json")).default;
    
    return new Promise((resolve, reject) => {
      const pdfParser = new PDFParser();
      
      pdfParser.on("pdfParser_dataError", (errData: any) => {
        reject(new Error(errData.parserError || "PDF parsing failed"));
      });
      
      pdfParser.on("pdfParser_dataReady", (pdfData: any) => {
        try {
          let text = "";
          if (pdfData && pdfData.Pages) {
            for (const page of pdfData.Pages) {
              if (page.Texts) {
                for (const textItem of page.Texts) {
                  if (textItem.R) {
                    for (const run of textItem.R) {
                      if (run.T) {
                        text += decodeURIComponent(run.T) + " ";
                      }
                    }
                  }
                }
              }
              text += "\n";
            }
          }
          resolve(text.trim());
        } catch (err) {
          reject(err);
        }
      });
      
      pdfParser.loadPDF(tempFile);
    });
  } finally {
    try {
      await fs.unlink(tempFile);
    } catch {
      // Ignore
    }
  }
}

// Görsel dosyalardan metin çıkarmak için (OCR gerekebilir, şimdilik basit kontrol)
async function extractTextFromImage(buffer: Buffer): Promise<string> {
  // Görsel dosyalar için şimdilik boş string döndür
  // İleride OCR eklenebilir
  return "";
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;
    const documentName = formData.get("documentName") as string;

    if (!file) {
      return NextResponse.json(
        { error: "File is required" },
        { status: 400 }
      );
    }

    if (!documentName) {
      return NextResponse.json(
        { error: "Document name is required" },
        { status: 400 }
      );
    }

    const openaiApiKey = process.env.OPENAI_API_KEY;
    if (!openaiApiKey) {
      return NextResponse.json(
        { error: "OpenAI API key is not configured" },
        { status: 500 }
      );
    }

    // Dosyayı ArrayBuffer'a çevir
    const arrayBuffer = await file.arrayBuffer();
    const fileBuffer = Buffer.from(arrayBuffer);

    // Dosya tipine göre metin çıkar
    let documentText: string;
    if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
      try {
        documentText = await extractTextFromPdf(fileBuffer);
        if (!documentText || documentText.trim().length === 0) {
          return NextResponse.json({
            isValid: false,
            message: "Could not extract text from PDF. The document might be image-based or corrupted.",
          });
        }
      } catch (pdfError: any) {
        console.error("PDF text extraction error:", pdfError);
        return NextResponse.json({
          isValid: false,
          message: "Failed to read PDF: " + (pdfError.message || "Unknown error"),
        });
      }
    } else if (file.type.startsWith("image/")) {
      // Görsel dosyalar için şimdilik sadece format kontrolü yapıyoruz
      // İleride OCR eklenebilir
      documentText = "";
    } else {
      return NextResponse.json({
        isValid: false,
        message: "Unsupported file format. Only PDF and image files are supported.",
      });
    }

    // Referans belgeyi bul ve oku (eğer varsa)
    // Önce ERP'den dene, sonra public klasöründen
    let referenceText = "";
    let hasReference = false;
    let referenceSource = ""; // "erp" veya "public"
    
    try {
      // 1. ÖNCE ERP'DEN REFERANS BELGEYİ ÇEK
      const erpReference = await getReferenceDocumentFromERP(documentName);
      
      if (erpReference) {
        try {
          referenceText = await extractTextFromPdf(erpReference.buffer);
          hasReference = true;
          referenceSource = "erp";
          console.log("Reference document found and read from ERP:", documentName);
        } catch (readError) {
          console.error("Failed to read reference document from ERP:", readError);
        }
      }

      // 2. EĞER ERP'DE YOKSA, PUBLIC KLASÖRÜNDEN BAK
      if (!hasReference) {
        try {
          const publicPath = getPublicPath();
          const referenceDir = path.join(publicPath, "reference-documents");
          
          // Belge adına göre referans belgeyi bul (dosya adı belge adıyla eşleşmeli)
          const possibleNames = [
            documentName.toLowerCase().replace(/\s+/g, "-") + ".pdf",
            documentName.toLowerCase().replace(/\s+/g, "_") + ".pdf",
            documentName.toLowerCase().replace(/[^a-z0-9]/g, "") + ".pdf",
            "reference_" + documentName.toLowerCase().replace(/\s+/g, "_") + ".pdf",
          ];
          
          let referenceFile = null;
          try {
            const files = await fs.readdir(referenceDir);
            for (const fileName of files) {
              const fileNameLower = fileName.toLowerCase();
              if (fileNameLower.endsWith(".pdf")) {
                // Belge adıyla eşleşen dosyayı bul
                const docNameLower = documentName.toLowerCase();
                const fileNameWithoutExt = fileNameLower.replace(".pdf", "");
                
                if (
                  fileNameWithoutExt.includes(docNameLower.replace(/\s+/g, "")) ||
                  docNameLower.replace(/\s+/g, "").includes(fileNameWithoutExt) ||
                  possibleNames.some(name => fileNameLower === name)
                ) {
                  referenceFile = path.join(referenceDir, fileName);
                  break;
                }
              }
            }
          } catch (dirError) {
            // Klasör yoksa veya okunamazsa devam et
            console.log("Reference document folder not found or cannot be read:", dirError);
          }
          
          // Referans belgeyi oku
          if (referenceFile) {
            try {
              const referenceBuffer = await fs.readFile(referenceFile);
              referenceText = await extractTextFromPdf(referenceBuffer);
              hasReference = true;
              referenceSource = "public";
              console.log("Reference document found and read from public folder:", referenceFile);
            } catch (readError) {
              console.error("Failed to read reference document from public folder:", readError);
            }
          }
        } catch (error) {
          console.log("Error checking reference document:", error);
        }
      }
    } catch (error) {
      console.log("Error during reference document check:", error);
    }

    // İlk 8000 karakteri al (hem yüklenen hem referans için)
    const uploadedText = documentText.substring(0, 8000);
    const referenceTextToSend = referenceText.substring(0, 8000);

    // OpenAI API'ye istek gönder - belgenin doğru belge olup olmadığını kontrol et
    try {
      const systemPrompt = hasReference
        ? `You are a document validation expert. Check if the uploaded document is EXACTLY THE SAME FORMAT, STRUCTURE, and TEMPLATE as the reference document.

Expected document type: "${documentName}"

Your task:
1. Analyze the structure, format, template, fields, and layout of the reference document
2. Analyze the structure, format, template, fields, and layout of the uploaded document
3. Compare the two documents in DETAIL:
   - Document structure (headings, sections, layout)
   - Fields and labels (field labels)
   - Format and template
   - Document type and category
   - General appearance and layout
4. Content can be different (e.g., different company information), but the STRUCTURE, FORMAT, and TEMPLATE MUST BE THE SAME
5. If the documents are not in the same format, explain in detail why they are not the same

Respond ONLY in JSON format:
{
  "isValid": true/false,
  "message": "Description message (in English)",
  "reason": "Detailed explanation of why it is correct/incorrect",
  "differences": ["Difference 1", "Difference 2", ...] // If invalid
}

IMPORTANT RULES:
- Document name is not important, STRUCTURE and FORMAT are important
- Content can be different but structure must be the same
- Must be EXACTLY THE SAME template as the reference document
- If the document is a different document type, mark it as invalid
- Perform very strict validation - not just similar, must be THE SAME format`
        : `You are a document validation expert. Check if the uploaded document is the document type the user wants to upload.

Expected document type: "${documentName}"

Your task:
1. Analyze the content, structure, and format of the document
2. Determine if this document is a "${documentName}" document
3. Make a decision based on the document's structure, format, fields, and general appearance
4. If the document is not correct, explain in detail why it is not correct

Respond ONLY in JSON format:
{
  "isValid": true/false,
  "message": "Description message (in English)",
  "reason": "Detailed explanation of why it is correct/incorrect",
  "differences": ["Difference 1", "Difference 2", ...] // If invalid
}

IMPORTANT:
- Document name is not important, content, structure, and format are important
- Make a decision based on the document's content, structure, and format
- Perform very strict validation - not just similar, must be the CORRECT document type
- If the document is image-based and text cannot be extracted, mention this`;

      const userPrompt = hasReference
        ? `Compare the following two documents:

REFERENCE DOCUMENT (Correct format):
${referenceTextToSend || "Could not extract text from reference document"}

UPLOADED DOCUMENT:
${uploadedText || "Could not extract text from uploaded document (might be image-based)"}

Is the uploaded document EXACTLY THE SAME FORMAT, STRUCTURE, and TEMPLATE as the reference document?
Content can be different (different company information), but structure, format, and template must be THE SAME.`
        : `Analyze the following document content and check if it is a "${documentName}" document:

${uploadedText || "Could not extract text from document (might be image-based)"}

Is this document a "${documentName}" document? Make a decision based on the document's structure, format, and content.`;

      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${openaiApiKey}`,
        },
        body: JSON.stringify({
          model: "gpt-4o",
          messages: [
            {
              role: "system",
              content: systemPrompt,
            },
            {
              role: "user",
              content: userPrompt,
            },
          ],
          temperature: 0.2, // Daha düşük temperature = daha sıkı kontrol
          response_format: { type: "json_object" },
          max_tokens: 1000, // Daha fazla token = daha detaylı açıklama
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error("OpenAI API error:", errorData);
        return NextResponse.json(
          { 
            isValid: false,
            message: "Belge doğrulama sırasında hata oluştu",
            error: errorData 
          },
          { status: response.status }
        );
      }

      const data = await response.json();
      const validationResult = JSON.parse(data.choices[0].message.content);

      // Çok sıkı kontrol: isValid false ise veya belirtilmemişse, false döndür
      const isValid = validationResult.isValid === true;

      let message = validationResult.message || "";
      if (!message) {
        message = isValid 
          ? "Belge doğru formatta görünüyor." 
          : "Bu belge beklenen belge türünde değil veya referans belgeyle aynı formatta değil.";
      }

      // Eğer referans belge kullanıldıysa mesaja ekle
      if (hasReference && !isValid) {
        message += " Referans belgeyle karşılaştırıldı ve farklı formatta olduğu tespit edildi.";
      }

      return NextResponse.json({
        isValid,
        message,
        reason: validationResult.reason || "",
        differences: validationResult.differences || [],
        hasReference,
      });
    } catch (apiError: any) {
      console.error("OpenAI API error:", apiError);
      return NextResponse.json({
        isValid: false,
        message: "Error occurred during document validation: " + (apiError.message || "Unknown error"),
      });
    }
  } catch (error: any) {
    console.error("General error:", error);
    return NextResponse.json(
      { 
        isValid: false,
        message: "Error occurred while validating document: " + (error.message || "Unknown error"),
      },
      { status: 500 }
    );
  }
}
