import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import { tmpdir } from "os";
import path from "path";

// Node.js runtime kullan
export const runtime = "nodejs";

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
    
    return imageBuffer;
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

// PDF'den metin çıkarmak için pdf2json kullan
async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  // Geçici dosya oluştur
  const tempDir = tmpdir();
  const tempFile = path.join(tempDir, `pdf_${Date.now()}.pdf`);
  
  try {
    // Buffer'ı geçici dosyaya yaz
    await fs.writeFile(tempFile, buffer);
    
    // pdf2json'u dinamik olarak import et
    const PDFParser = (await import("pdf2json")).default;
    
    return new Promise((resolve, reject) => {
      const pdfParser = new PDFParser();
      
      pdfParser.on("pdfParser_dataError", (errData: any) => {
        reject(new Error(errData.parserError || "PDF parsing failed"));
      });
      
      pdfParser.on("pdfParser_dataReady", (pdfData: any) => {
        try {
          // PDF verilerinden metin çıkar
          let text = "";
          if (pdfData && pdfData.Pages) {
            for (const page of pdfData.Pages) {
              if (page.Texts) {
                for (const textItem of page.Texts) {
                  if (textItem.R) {
                    for (const run of textItem.R) {
                      if (run.T) {
                        // URL decode yap
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
    // Geçici dosyayı sil
    try {
      await fs.unlink(tempFile);
    } catch {
      // Silme hatası olursa ignore et
    }
  }
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;
    const companyTypeId = formData.get("companyTypeId") as string;

    if (!file) {
      return NextResponse.json(
        { error: "PDF file is required" },
        { status: 400 }
      );
    }

    if (!companyTypeId) {
      return NextResponse.json(
        { error: "Company type ID is required" },
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

    // PDF'i ArrayBuffer'a çevir
    const arrayBuffer = await file.arrayBuffer();
    const pdfBuffer = Buffer.from(arrayBuffer);

    // PDF'den metin çıkar
    let pdfText: string = "";
    try {
      // Önce normal PDF metin çıkarma dene
      pdfText = await extractTextFromPdf(pdfBuffer);
      
      // Eğer metin çıkarılamazsa OCR kullan (image-based PDF)
      if (!pdfText || pdfText.trim().length === 0) {
        console.log("PDF'den metin çıkarılamadı, OCR (görsel okuma) deneniyor...");
        try {
          pdfText = await extractTextWithOCR(pdfBuffer, "application/pdf");
          if (!pdfText || pdfText.trim().length === 0) {
            return NextResponse.json(
              { 
                error: "PDF'den metin çıkarılamadı. Bu PDF görsel tabanlı (image-based) olabilir. Lütfen bilgileri manuel olarak girin.",
                suggestion: "PDF içeriği görsel formatında olduğu için otomatik okuma yapılamıyor. Bilgileri Company Information sayfasında manuel olarak girebilirsiniz."
              },
              { status: 400 }
            );
          }
          console.log("✅ OCR ile metin başarıyla çıkarıldı");
        } catch (ocrError: any) {
          console.error("OCR extraction error:", ocrError);
          return NextResponse.json(
            { 
              error: "PDF'den metin çıkarılamadı. Bu PDF görsel tabanlı (image-based) olabilir.",
              suggestion: "Bilgileri Company Information sayfasında manuel olarak girebilirsiniz.",
              details: ocrError.message || String(ocrError)
            },
            { status: 400 }
          );
        }
      }
    } catch (pdfError: any) {
      console.error("PDF text extraction error:", pdfError);
      // PDF parsing hatası olsa bile OCR dene
      try {
        console.log("PDF parsing hatası, OCR (görsel okuma) deneniyor...");
        pdfText = await extractTextWithOCR(pdfBuffer, "application/pdf");
        if (!pdfText || pdfText.trim().length === 0) {
          return NextResponse.json(
            { 
              error: "PDF okunamadı. PDF dosyası bozuk olabilir veya görsel tabanlı olabilir.",
              suggestion: "Lütfen bilgileri Company Information sayfasında manuel olarak girin.",
              details: "Both PDF parsing and OCR failed"
            },
            { status: 400 }
          );
        }
        console.log("✅ OCR ile metin başarıyla çıkarıldı");
      } catch (ocrError: any) {
        console.error("OCR extraction error:", ocrError);
        return NextResponse.json(
          { 
            error: "PDF okunamadı. PDF dosyası bozuk olabilir veya görsel tabanlı olabilir.",
            suggestion: "Lütfen bilgileri Company Information sayfasında manuel olarak girin.",
            details: pdfError.message || String(pdfError)
          },
          { status: 400 }
        );
      }
    }
    
    // İlk 8000 karakteri al
    const textToSend = pdfText.substring(0, 8000);

    // OpenAI API'ye istek gönder
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
              role: "system",
              content: `You are an expert at extracting company information from business registration documents. 
              Extract all relevant information from the document text and return ONLY a valid JSON object with the following structure:
              {
                "companyName": "string (main company/legal entity name)",
                "vatIdentificationNumber": "string (VAT number, USt-IdNr, Umsatzsteuer-ID)",
                "taxIdNumber": "string (Tax ID, Steuernummer)",
                "restaurantCount": "string (number of restaurants/locations as string)",
                "street": "string (full street address with house number)",
                "city": "string",
                "postalCode": "string (zip code, PLZ)",
                "country": "string (country name in English)",
                "federalState": "string (state/province/Bundesland, optional)",
                "businessName": "string (business/trade name, Geschäftsbezeichnung)",
                "ownerDirector": "string (owner/managing director/Inhaber/Geschäftsführer full name)",
                "ownerEmail": "string (owner/director email if available)",
                "ownerTelephone": "string (owner/director phone/telephone if available)"
              }
              
              Important notes:
              - Look for "Inhaber", "Geschäftsführer", "Owner", "Managing Director", "Betriebsinhaber" for owner/director name
              - Look for "Steuernummer", "St.-Nr." for tax ID
              - Look for "USt-IdNr", "Umsatzsteuer-Identifikationsnummer" for VAT number
              - If a field cannot be found in the document, use an empty string
              - Always return valid JSON, no additional text or explanations.`,
            },
            {
              role: "user",
              content: `Extract company information from this business registration document. Company Type ID: ${companyTypeId}.

PDF Document Text:
${textToSend}

Please extract all relevant company information from the text above.`,
            },
          ],
          temperature: 0.3,
          response_format: { type: "json_object" },
          max_tokens: 2000,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error("OpenAI API error:", errorData);
        return NextResponse.json(
          { error: "Failed to analyze PDF content", details: errorData },
          { status: response.status }
        );
      }

      const data = await response.json();
      
      if (!data.choices || !data.choices[0] || !data.choices[0].message) {
        console.error("Unexpected OpenAI response format:", data);
        return NextResponse.json(
          { 
            success: false,
            error: "Unexpected response format from OpenAI API" 
          },
          { status: 500 }
        );
      }

      let parsedInfo;
      try {
        const content = data.choices[0].message.content;
        parsedInfo = typeof content === 'string' ? JSON.parse(content) : content;
        console.log("✅ Parsed company info from OpenAI:", parsedInfo);
      } catch (parseError) {
        console.error("JSON parse error:", parseError, "Content:", data.choices[0].message.content);
        return NextResponse.json(
          { 
            success: false,
            error: "Failed to parse OpenAI response" 
          },
          { status: 500 }
        );
      }

      const companyInfo = {
        companyName: parsedInfo.companyName || "",
        vatIdentificationNumber: parsedInfo.vatIdentificationNumber || "",
        taxIdNumber: parsedInfo.taxIdNumber || "",
        restaurantCount: parsedInfo.restaurantCount || "",
        street: parsedInfo.street || "",
        city: parsedInfo.city || "",
        zipCode: parsedInfo.postalCode || "",
        country: parsedInfo.country || "",
        federalState: parsedInfo.federalState || "",
        businessName: parsedInfo.businessName || "",
        ownerDirector: parsedInfo.ownerDirector || "",
        ownerEmail: parsedInfo.ownerEmail || "",
        ownerTelephone: parsedInfo.ownerTelephone || "",
      };

      console.log("✅ Returning company info:", companyInfo);

      return NextResponse.json({
        success: true,
        companyInfo: companyInfo,
      });
    } catch (apiError: any) {
      console.error("OpenAI API error:", apiError);
      return NextResponse.json(
        { 
          error: "Failed to analyze PDF content", 
          details: apiError.message || String(apiError)
        },
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error("General error:", error);
    return NextResponse.json(
      { 
        error: "Failed to parse PDF", 
        details: error.message || String(error)
      },
      { status: 500 }
    );
  }
}
