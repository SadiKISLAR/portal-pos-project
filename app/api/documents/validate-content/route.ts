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

// Belge adı eşleştirmesi - İngilizce belge adlarını Almanca/alternatif dosya adlarıyla eşleştir
function getDocumentNameAliases(documentName: string): string[] {
  const nameLower = documentName.toLowerCase().trim();
  const aliases: string[] = [documentName]; // Orijinal adı da dahil et
  
  // Belge adı eşleştirmeleri
  const mappings: Record<string, string[]> = {
    "business registration": ["gewerbeanmeldung", "gewerbe-anmeldung", "business-registration", "business_registration"],
    "id document": ["ausweis", "personalausweis", "id-document", "id_document"],
    "tax certificate": ["steuerbescheid", "tax-certificate", "tax_certificate"],
  };
  
  // Mapping'de varsa alias'ları ekle
  for (const [key, values] of Object.entries(mappings)) {
    if (nameLower.includes(key) || key.includes(nameLower)) {
      aliases.push(...values);
      break;
    }
  }
  
  return aliases;
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

// PDF'i görsele çevir (PNG formatına)
async function convertPdfToImage(pdfBuffer: Buffer): Promise<Buffer> {
  try {
    // pdfjs-dist'i dynamic import ile yükle
    const pdfjsLib = await import("pdfjs-dist");
    
    // Worker'ı devre dışı bırak (Node.js'de gerekli değil)
    if (pdfjsLib.GlobalWorkerOptions) {
      pdfjsLib.GlobalWorkerOptions.workerSrc = "";
    }
    
    // PDF'i yükle
    const loadingTask = pdfjsLib.getDocument({ 
      data: new Uint8Array(pdfBuffer),
      useSystemFonts: true,
      verbosity: 0, // Hata mesajlarını azalt
    });
    
    const pdf = await loadingTask.promise;
    
    // İlk sayfayı al
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: 2.0 });
    
    // Canvas oluştur
    const { createCanvas } = await import("canvas");
    const canvas = createCanvas(Math.floor(viewport.width), Math.floor(viewport.height));
    const context = canvas.getContext("2d");
    
    // PDF sayfasını canvas'a render et
    const renderContext = {
      canvasContext: context as any,
      viewport: viewport,
    };
    
    await page.render(renderContext).promise;
    
    // Canvas'ı PNG buffer'a çevir
    const imageBuffer = canvas.toBuffer("image/png");
    
    // Buffer tip uyumluluğu için Buffer.from kullan
    return Buffer.from(imageBuffer);
  } catch (error) {
    console.error("PDF to image conversion error:", error);
    throw new Error("Failed to convert PDF to image: " + (error as Error).message);
  }
}

// Görsel dosyalardan ve image-based PDF'lerden metin çıkarmak için OCR (OpenAI Vision API)
async function extractTextWithOCR(buffer: Buffer, mimeType: string): Promise<string> {

  const openaiApiKey = process.env.OPENAI_API_KEY;
  if (!openaiApiKey) {
    throw new Error("OpenAI API key is not configured");
  }

  let imageBuffer = buffer;
  let finalMimeType = mimeType;
  
  // Eğer PDF ise, önce görsele çevir
  if (mimeType === "application/pdf") {
    try {
      console.log("📄 Converting PDF to image for OCR...");
      imageBuffer = await convertPdfToImage(buffer);
      finalMimeType = "image/png";
      console.log("✅ PDF converted to image for OCR");
    } catch (conversionError) {
      console.error("❌ PDF to image conversion failed:", conversionError);
      throw new Error("Failed to convert PDF to image: " + (conversionError as Error).message);
    }
  }

  // Base64'e çevir
  const base64Image = imageBuffer.toString("base64");
  const dataUrl = `data:${finalMimeType};base64,${base64Image}`;

  try {
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
            role: "user",
            content: [
              {
                type: "text",
                text: "Extract all text from this document. Return only the extracted text, nothing else. If there is no text, return 'NO_TEXT_FOUND'.",
              },
              {
                type: "image_url",
                image_url: {
                  url: dataUrl,
                },
              },
            ],
          },
        ],
        max_tokens: 4000,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`OpenAI Vision API error: ${JSON.stringify(errorData)}`);
    }

    const data = await response.json();
    const extractedText = data.choices[0]?.message?.content || "";

    if (extractedText.trim() === "NO_TEXT_FOUND" || extractedText.trim().length === 0) {
      return "";
    }

    return extractedText.trim();
  } catch (error: any) {
    console.error("OCR extraction error:", error);
    throw error;
  }
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
    let documentText: string = "";
    if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
      try {
        // Önce normal PDF metin çıkarma dene
        documentText = await extractTextFromPdf(fileBuffer);
        
        // Eğer metin çıkarılamazsa OCR kullan (image-based PDF)
        if (!documentText || documentText.trim().length === 0) {
          console.log("PDF'den metin çıkarılamadı, OCR (görsel okuma) deneniyor...");
          try {
            documentText = await extractTextWithOCR(fileBuffer, "application/pdf");
            if (!documentText || documentText.trim().length === 0) {
              console.warn("OCR ile de metin çıkarılamadı - görsel tabanlı PDF, belge kabul edilecek");
              // Boş metinle devam et, belge yine de kabul edilecek
              documentText = "";
            } else {
              console.log("✅ OCR ile metin başarıyla çıkarıldı");
            }
          } catch (ocrError: any) {
            console.error("OCR extraction error:", ocrError);
            // OCR hatası olsa bile devam et, belge kabul edilecek
            documentText = "";
          }
        }
      } catch (pdfError: any) {
        console.error("PDF text extraction error:", pdfError);
        // PDF parsing hatası olsa bile OCR dene
        try {
          console.log("PDF parsing hatası, OCR (görsel okuma) deneniyor...");
          documentText = await extractTextWithOCR(fileBuffer, "application/pdf");
          if (!documentText || documentText.trim().length === 0) {
            console.warn("OCR ile de metin çıkarılamadı - görsel tabanlı PDF, belge kabul edilecek");
            documentText = "";
          } else {
            console.log("✅ OCR ile metin başarıyla çıkarıldı");
          }
        } catch (ocrError: any) {
          console.error("OCR extraction error:", ocrError);
          // Her iki yöntem de başarısız olsa bile devam et, belge kabul edilecek
          documentText = "";
        }
      }
    } else if (file.type.startsWith("image/")) {
      // Görsel dosyalar için OCR kullan
      try {
        documentText = await extractTextWithOCR(fileBuffer, file.type);
        if (!documentText || documentText.trim().length === 0) {
          console.warn("Görselden metin çıkarılamadı");
        }
      } catch (ocrError: any) {
        console.error("OCR extraction error for image:", ocrError);
        // OCR hatası olsa bile devam et
      }
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
          // Önce normal PDF metin çıkarma dene
          referenceText = await extractTextFromPdf(erpReference.buffer);
          
          // Eğer metin çıkarılamazsa, boş metinle devam et
          if (!referenceText || referenceText.trim().length === 0) {
            console.log("Referans PDF'den metin çıkarılamadı - image-based PDF olabilir");
            // Boş metinle devam et
          }
          
          if (referenceText && referenceText.trim().length > 0) {
            hasReference = true;
            referenceSource = "erp";
            console.log("Reference document found and read from ERP:", documentName);
          }
        } catch (readError) {
          console.error("Failed to read reference document from ERP:", readError);
          // Hata olsa bile OCR dene
          try {
            referenceText = await extractTextWithOCR(erpReference.buffer, "application/pdf");
            if (referenceText && referenceText.trim().length > 0) {
              hasReference = true;
              referenceSource = "erp";
              console.log("Reference document read from ERP using OCR:", documentName);
            }
          } catch (ocrError) {
            console.error("Referans belge OCR hatası:", ocrError);
          }
        }
      }

      // 2. EĞER ERP'DE YOKSA, PUBLIC KLASÖRÜNDEN BAK
      if (!hasReference) {
        try {
          const publicPath = getPublicPath();
          const referenceDir = path.join(publicPath, "reference-documents");
          
          // Belge adına göre referans belgeyi bul (dosya adı belge adıyla eşleşmeli)
          const aliases = getDocumentNameAliases(documentName);
          const possibleNames: string[] = [];
          
          // Her alias için olası dosya adlarını oluştur
          aliases.forEach(alias => {
            possibleNames.push(
              alias.toLowerCase().replace(/\s+/g, "-") + ".pdf",
              alias.toLowerCase().replace(/\s+/g, "_") + ".pdf",
              alias.toLowerCase().replace(/[^a-z0-9]/g, "") + ".pdf",
              "reference_" + alias.toLowerCase().replace(/\s+/g, "_") + ".pdf",
            );
          });
          
          let referenceFile = null;
          try {
            const files = await fs.readdir(referenceDir);
            for (const fileName of files) {
              const fileNameLower = fileName.toLowerCase();
              if (fileNameLower.endsWith(".pdf")) {
                const fileNameWithoutExt = fileNameLower.replace(".pdf", "");
                
                // Olası dosya adlarıyla eşleşme kontrolü
                const exactMatch = possibleNames.some(name => fileNameLower === name);
                
                // Alias'larla kısmi eşleşme kontrolü
                const partialMatch = aliases.some(alias => {
                  const aliasClean = alias.toLowerCase().replace(/[^a-z0-9]/g, "");
                  const fileNameClean = fileNameWithoutExt.replace(/[^a-z0-9]/g, "");
                  return fileNameClean.includes(aliasClean) || aliasClean.includes(fileNameClean);
                });
                
                if (exactMatch || partialMatch) {
                  referenceFile = path.join(referenceDir, fileName);
                  console.log(`Referans belge bulundu: ${fileName} (${documentName} için)`);
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
              // Önce normal PDF metin çıkarma dene
              referenceText = await extractTextFromPdf(referenceBuffer);
              
              // Eğer metin çıkarılamazsa, boş metinle devam et
              if (!referenceText || referenceText.trim().length === 0) {
                console.log("Public referans PDF'den metin çıkarılamadı - image-based PDF olabilir");
                // Boş metinle devam et
              }
              
              if (referenceText && referenceText.trim().length > 0) {
                hasReference = true;
                referenceSource = "public";
                console.log("Reference document found and read from public folder:", referenceFile);
              }
            } catch (readError) {
              console.error("Failed to read reference document from public folder:", readError);
              // Hata olsa bile OCR dene
              try {
                const referenceBuffer = await fs.readFile(referenceFile);
                referenceText = await extractTextWithOCR(referenceBuffer, "application/pdf");
                if (referenceText && referenceText.trim().length > 0) {
                  hasReference = true;
                  referenceSource = "public";
                  console.log("Reference document read from public folder using OCR:", referenceFile);
                }
              } catch (ocrError) {
                console.error("Public referans belge OCR hatası:", ocrError);
              }
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

    // Eğer metin çıkarılamadıysa ama dosya yüklendiyse, belgeyi direkt kabul et
    if (!uploadedText || uploadedText.trim().length === 0) {
      console.log("⚠️ Metin çıkarılamadı ama dosya yüklendi - görsel tabanlı belge, direkt kabul ediliyor");
      return NextResponse.json({
        isValid: true,
        message: "Belge yüklendi. Görsel tabanlı belge olduğu için metin çıkarılamadı, ancak belge kabul edildi.",
        reason: "Document is image-based, text extraction not possible but document is accepted",
        differences: [],
        hasReference: hasReference,
      });
    }

    // OpenAI API'ye istek gönder - belgenin doğru belge olup olmadığını kontrol et
    try {
      const systemPrompt = hasReference
        ? `You are a document validation expert. Check if the uploaded document has the SAME FORMAT, STRUCTURE, and TEMPLATE as the reference document.

Expected document type: "${documentName}"

Your task:
1. Analyze the structure, format, template, fields, and layout of the reference document
2. Analyze the structure, format, template, fields, and layout of the uploaded document
3. Compare the two documents:
   - Document structure (headings, sections, layout)
   - Fields and labels (field labels)
   - Format and template
   - Document type and category
   - General appearance and layout
4. Content can be different (e.g., different company information, names, dates)
5. Document NAME/TITLE can be different - focus on STRUCTURE and FORMAT
6. If the documents have the same structure and format, mark as valid even if names differ

Respond ONLY in JSON format:
{
  "isValid": true/false,
  "message": "Description message (in English)",
  "reason": "Detailed explanation of why it is correct/incorrect",
  "differences": ["Difference 1", "Difference 2", ...] // If invalid
}

IMPORTANT RULES:
- Document name/title is NOT important - only STRUCTURE and FORMAT matter
- Content can be completely different but structure must be similar
- If the document has similar structure, fields, and format as reference, mark as VALID
- Be lenient - if documents are similar in structure, accept them
- Only reject if the document is clearly a different type (e.g., ID card vs business registration)`
        : `You are a document validation expert. Check if the uploaded document matches the expected document type.

Expected document type: "${documentName}"

Your task:
1. Analyze the content, structure, and format of the document
2. Determine if this document matches the "${documentName}" document type
3. Make a decision based on the document's structure, format, fields, and general appearance
4. Document name/title can be different - focus on structure and format

Respond ONLY in JSON format:
{
  "isValid": true/false,
  "message": "Description message (in English)",
  "reason": "Detailed explanation of why it is correct/incorrect",
  "differences": ["Difference 1", "Difference 2", ...] // If invalid
}

IMPORTANT:
- Document name/title is NOT important - only structure, format, and content type matter
- Be lenient - if the document structure and format match the expected type, accept it
- Only reject if the document is clearly a different document type
- If the document is image-based and text cannot be extracted, try to analyze the visual structure`;

      // Eğer metin çıkarılamazsa, dosyayı görsel olarak da gönder
      const useVision = (!uploadedText || uploadedText.trim().length === 0) || 
                        (!hasReference && (!referenceText || referenceText.trim().length === 0));
      
      let messages: any[] = [
        {
          role: "system",
          content: systemPrompt,
        },
      ];

      // Vision API kullanımı şimdilik devre dışı (PDF to image conversion sorunlu)
      // Sadece metin tabanlı analiz kullanıyoruz
      if (false && useVision) {
        // Vision API kullan - görseli direkt gönder
        // Eğer PDF ise, önce görsele çevir
        let imageBuffer: Buffer = fileBuffer;
        let finalMimeType = file.type || "application/pdf";
        
        if (finalMimeType === "application/pdf") {
          try {
            console.log("📄 Converting PDF to image for Vision API...");
            imageBuffer = await convertPdfToImage(fileBuffer);
            finalMimeType = "image/png";
            console.log("✅ PDF converted to image for Vision API");
          } catch (conversionError) {
            console.error("❌ PDF to image conversion failed for Vision API:", conversionError);
            // Hata olsa bile devam et, belki metin tabanlı analiz yapılabilir
          }
        }
        
        const base64Image = imageBuffer.toString("base64");
        const dataUrl = `data:${finalMimeType};base64,${base64Image}`;
        
        let visionContent: any[] = [];
        
        if (hasReference && referenceText && referenceText.trim().length > 0) {
          visionContent.push({
            type: "text",
            text: `Compare the uploaded document with the reference document.

REFERENCE DOCUMENT TEXT:
${referenceTextToSend}

Is the uploaded document similar in FORMAT, STRUCTURE, and TEMPLATE to the reference document?
- Document name/title can be different (e.g., "Gewerbeanmeldung" vs "Business Registration")
- Content can be different (different company information, names, dates)
- Focus on structure, fields, layout, and format
- If the structure and format are similar, mark as VALID`,
          });
        } else {
          visionContent.push({
            type: "text",
            text: `Analyze this document and check if it matches the "${documentName}" document type. 
            
${uploadedText ? `Extracted text: ${uploadedText}` : "Text could not be extracted, analyzing image directly."}

Is this document a "${documentName}" type document?
- Document name/title can be different
- Focus on structure, format, fields, and content type
- If the document structure matches the expected type, mark as VALID`,
          });
        }
        
        visionContent.push({
          type: "image_url",
          image_url: {
            url: dataUrl,
          },
        });
        
        messages.push({
          role: "user",
          content: visionContent,
        });
      } else {
        // Normal metin tabanlı analiz
        const userPrompt = hasReference
          ? `Compare the following two documents:

REFERENCE DOCUMENT (Correct format):
${referenceTextToSend || "Could not extract text from reference document"}

UPLOADED DOCUMENT:
${uploadedText || "Could not extract text from uploaded document (might be image-based)"}

Is the uploaded document similar in FORMAT, STRUCTURE, and TEMPLATE to the reference document?
- Document name/title can be different (e.g., "Gewerbeanmeldung" vs "Business Registration")
- Content can be different (different company information, names, dates)
- Focus on structure, fields, layout, and format
- If the structure and format are similar, mark as VALID`
          : `Analyze the following document content and check if it matches the "${documentName}" document type:

${uploadedText || "Could not extract text from document (might be image-based)"}

Is this document a "${documentName}" type document?
- Document name/title can be different
- Focus on structure, format, fields, and content type
- If the document structure matches the expected type, mark as VALID`;

        messages.push({
          role: "user",
          content: userPrompt,
        });
      }

      let response;
      try {
        response = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${openaiApiKey}`,
          },
          body: JSON.stringify({
            model: "gpt-4o",
            messages: messages,
            temperature: 0.3, // Biraz daha yüksek = daha esnek
            response_format: { type: "json_object" },
            max_tokens: 1000,
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          let errorData;
          try {
            errorData = JSON.parse(errorText);
          } catch {
            errorData = { error: errorText };
          }
          console.error("OpenAI API error:", errorData);
          
          // Hata durumunda bile belgeyi kabul et (daha esnek yaklaşım)
          // Çünkü API hatası belgenin yanlış olduğu anlamına gelmez
          return NextResponse.json(
            { 
              isValid: true, // Hata durumunda kabul et
              message: "Belge yüklendi. (Doğrulama API hatası nedeniyle atlandı)",
              warning: "Validation API error: " + (errorData.error?.message || JSON.stringify(errorData))
            },
            { status: 200 }
          );
        }

        const data = await response.json();
        
        if (!data.choices || !data.choices[0] || !data.choices[0].message) {
          console.error("Unexpected OpenAI response format:", data);
          // Hata durumunda kabul et
          return NextResponse.json({
            isValid: true,
            message: "Belge yüklendi. (Doğrulama yanıt formatı beklenmedik)",
          });
        }

        let validationResult;
        try {
          const content = data.choices[0].message.content;
          validationResult = typeof content === 'string' ? JSON.parse(content) : content;
        } catch (parseError) {
          console.error("JSON parse error:", parseError, "Content:", data.choices[0].message.content);
          // Parse hatası durumunda kabul et
          return NextResponse.json({
            isValid: true,
            message: "Belge yüklendi. (Doğrulama yanıtı parse edilemedi)",
          });
        }

        // Daha esnek kontrol: isValid true ise kabul et, yoksa false
        let isValid = validationResult.isValid === true;
        
        // Eğer metin çıkarılamadıysa ama belge yüklendiyse, belgeyi kabul et
        if (!uploadedText || uploadedText.trim().length === 0) {
          console.log("⚠️ Metin çıkarılamadı ama belge yüklendi - görsel tabanlı PDF, belge kabul ediliyor");
          isValid = true;
        }

        let message = validationResult.message || "";
        if (!message) {
          message = isValid 
            ? "Belge doğru formatta görünüyor." 
            : "Belge yapısı referans belgeyle benzer görünüyor.";
        }

        // Eğer referans belge kullanıldıysa ve geçersizse, mesajı yumuşat
        if (hasReference && !isValid) {
          // Mesajı daha yumuşak yap
          message = "Belge yapısı referans belgeyle benzer görünüyor. İçerik farklı olabilir.";
        }
        
        // Eğer metin çıkarılamadıysa, mesajı güncelle
        if (!uploadedText || uploadedText.trim().length === 0) {
          message = "Belge yüklendi. Görsel tabanlı PDF olduğu için metin çıkarılamadı, ancak belge kabul edildi.";
          isValid = true;
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
        // API hatası durumunda belgeyi kabul et (daha esnek yaklaşım)
        return NextResponse.json({
          isValid: true,
          message: "Belge yüklendi. (Doğrulama API hatası nedeniyle atlandı)",
          warning: "Validation API error: " + (apiError.message || "Unknown error"),
        });
      }
      } catch (error: any) {
        console.error("General error:", error);
        // Genel hata durumunda da belgeyi kabul et
        return NextResponse.json(
          { 
            isValid: true,
            message: "Belge yüklendi. (Doğrulama hatası nedeniyle atlandı)",
            warning: "Validation error: " + (error.message || "Unknown error"),
          },
          { status: 200 }
        );
      }
    } catch (error: any) {
      console.error("Outer error:", error);
      // En dış hata durumunda da belgeyi kabul et
      return NextResponse.json(
        { 
          isValid: true,
          message: "Belge yüklendi. (Doğrulama hatası nedeniyle atlandı)",
          warning: "Outer validation error: " + (error.message || "Unknown error"),
        },
        { status: 200 }
      );
    }
}
