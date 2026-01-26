import { NextRequest, NextResponse } from "next/server";

// Node.js runtime kullan
export const runtime = "nodejs";

// Vercel timeout ayarları
export const maxDuration = 60; // Pro plan için 60 saniye (Hobby plan'da 10 saniye limit var)

// OpenAI Assistants API ile PDF'den metin çıkar (Code Interpreter kullanarak - ChatGPT gibi)
async function extractTextFromPdfWithAssistant(pdfBuffer: Buffer, apiKey: string): Promise<string> {
  console.log("📄 Reading PDF with OpenAI Assistants API (Code Interpreter)...");
  
  // 1. Upload PDF file to OpenAI
  const formData = new FormData();
  // Convert Buffer to ArrayBuffer and create Blob
  const arrayBuffer = pdfBuffer.buffer.slice(pdfBuffer.byteOffset, pdfBuffer.byteOffset + pdfBuffer.byteLength) as ArrayBuffer;
  const blob = new Blob([arrayBuffer], { type: "application/pdf" });
  formData.append("file", blob, "document.pdf");
  formData.append("purpose", "assistants");
  
  console.log("📤 Uploading PDF file...");
  
  const uploadResponse = await fetch("https://api.openai.com/v1/files", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: formData,
  });
  
  if (!uploadResponse.ok) {
    const error = await uploadResponse.json().catch(() => ({}));
    console.error("File upload error:", error);
    throw new Error(`Failed to upload file: ${JSON.stringify(error)}`);
  }
  
  const fileData = await uploadResponse.json();
  const fileId = fileData.id;
  console.log("✅ File uploaded:", fileId);
  
  try {
    // 2. Create Assistant - Use CODE INTERPRETER (can read PDFs like ChatGPT)
    console.log("🤖 Creating Assistant (with Code Interpreter)...");
    
    const assistantResponse = await fetch("https://api.openai.com/v1/assistants", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "OpenAI-Beta": "assistants=v2",
      },
      body: JSON.stringify({
        name: "PDF OCR Reader",
        instructions: `Sen bir Almanca belge okuyucu ve OCR uzmanısın. Yüklenen PDF dosyasını oku ve içindeki TÜM bilgileri çıkar.

Bu bir Gewerbeanmeldung (işletme tescil belgesi) olabilir. Şu bilgileri özellikle ara:
- Firma/Şirket adı
- Geschäftsbezeichnung (İşletmenin ticari adı - örn: "Komagene", "Restaurant" vb.)
- Adres bilgileri (Straße, PLZ, Ort)
- Yetkili kişi adı (Inhaber, Geschäftsführer)
- Telefon, E-posta
- Steuernummer, USt-IdNr
- HRB numarası

PDF'deki TÜM metni ve bilgileri döndür. Taranmış belge ise OCR yap.`,
        model: "gpt-4o",
        tools: [{ type: "code_interpreter" }], // Code Interpreter - PDF okuyabilir!
      }),
    });
    
    if (!assistantResponse.ok) {
      const error = await assistantResponse.json().catch(() => ({}));
      console.error("Assistant creation error:", error);
      throw new Error(`Failed to create assistant: ${JSON.stringify(error)}`);
    }
    
    const assistant = await assistantResponse.json();
    const assistantId = assistant.id;
    console.log("✅ Assistant created:", assistantId);
    
    try {
      // 3. Create thread and send message
      console.log("💬 Creating thread...");
      
      const threadResponse = await fetch("https://api.openai.com/v1/threads", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "OpenAI-Beta": "assistants=v2",
        },
        body: JSON.stringify({
          messages: [
            {
              role: "user",
              content: `Bu PDF belgesini oku ve içindeki TÜM bilgileri çıkar. 

Özellikle şunları bul:
1. Şirket/Firma adı (örn: "GENE Europe GmbH")
2. Geschäftsbezeichnung - İşletmenin ticari adı (örn: "Komagene")
3. Tam adres (Sokak, Posta kodu, Şehir)
4. Yetkili kişi adı soyadı
5. Telefon numarası
6. E-posta adresi
7. Vergi numaraları (Steuernummer, USt-IdNr)

Belgedeki tüm metni ve değerleri döndür.`,
              attachments: [
                {
                  file_id: fileId,
                  tools: [{ type: "code_interpreter" }],
                },
              ],
            },
          ],
        }),
      });
      
      if (!threadResponse.ok) {
        const error = await threadResponse.json().catch(() => ({}));
        console.error("Thread creation error:", error);
        throw new Error(`Failed to create thread: ${JSON.stringify(error)}`);
      }
      
      const thread = await threadResponse.json();
      const threadId = thread.id;
      console.log("✅ Thread created:", threadId);
      
      // 4. Start run
      console.log("🚀 Starting run...");
      
      const runResponse = await fetch(`https://api.openai.com/v1/threads/${threadId}/runs`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "OpenAI-Beta": "assistants=v2",
        },
        body: JSON.stringify({
          assistant_id: assistantId,
        }),
      });
      
      if (!runResponse.ok) {
        const error = await runResponse.json().catch(() => ({}));
        console.error("Run start error:", error);
        throw new Error(`Failed to start run: ${JSON.stringify(error)}`);
      }
      
      const run = await runResponse.json();
      const runId = run.id;
      console.log("✅ Run started:", runId);
      
      // 5. Wait for run completion (Code Interpreter may take longer)
      console.log("⏳ Reading PDF (this may take a moment)...");
      
      let runStatus = run.status;
      let attempts = 0;
      // Vercel timeout limitleri: Hobby=10s, Pro=60s, Enterprise=300s
      // Güvenli limit: 50 saniye (Pro plan için)
      const maxAttempts = 50; // 50 saniye timeout (Vercel Pro plan limiti)
      const startTime = Date.now();
      const maxDuration = 50000; // 50 saniye milisaniye cinsinden
      
      while (runStatus !== "completed" && runStatus !== "failed" && runStatus !== "expired" && attempts < maxAttempts) {
        // Vercel timeout kontrolü
        const elapsed = Date.now() - startTime;
        if (elapsed > maxDuration) {
          console.warn("⏰ Vercel timeout limitine yaklaşıldı, işlem durduruluyor");
          throw new Error("PDF reading timeout - Vercel function timeout limit reached. Please try with a smaller PDF or upgrade to Pro plan.");
        }
        
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        const statusResponse = await fetch(`https://api.openai.com/v1/threads/${threadId}/runs/${runId}`, {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "OpenAI-Beta": "assistants=v2",
          },
        });
        
        if (!statusResponse.ok) {
          const errorData = await statusResponse.json().catch(() => ({}));
          throw new Error(`Failed to check run status: ${JSON.stringify(errorData)}`);
        }
        
        const statusData = await statusResponse.json();
        runStatus = statusData.status;
        attempts++;
        
        if (attempts % 10 === 0) {
          console.log(`⏳ Durum: ${runStatus} (${attempts}s)`);
        }
        
        // Eğer run failed veya expired olduysa hata fırlat
        if (runStatus === "failed" || runStatus === "expired") {
          const errorMsg = statusData.last_error?.message || `Run ${runStatus}`;
          throw new Error(`PDF reading failed: ${errorMsg}`);
        }
      }
      
      if (runStatus !== "completed") {
        throw new Error(`Run failed to complete: ${runStatus}. Timeout after ${attempts} seconds.`);
      }
      
      console.log("✅ PDF reading completed");
      
      // 6. Mesajları al
      const messagesResponse = await fetch(`https://api.openai.com/v1/threads/${threadId}/messages`, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "OpenAI-Beta": "assistants=v2",
        },
      });
      
      const messagesData = await messagesResponse.json();
      const assistantMessage = messagesData.data?.find((m: any) => m.role === "assistant");
      
      if (!assistantMessage) {
        throw new Error("Assistant response not found");
      }
      
      // Extract text content
      let extractedText = "";
      for (const content of assistantMessage.content) {
        if (content.type === "text") {
          extractedText += content.text.value + "\n";
        }
      }
      
      console.log(`✅ ${extractedText.length} characters extracted`);
      console.log("📄 Extracted text preview:", extractedText.substring(0, 500));
      
      // Thread'i temizle
      await fetch(`https://api.openai.com/v1/threads/${threadId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "OpenAI-Beta": "assistants=v2",
        },
      }).catch(() => {});
      
      return extractedText.trim();
      
    } finally {
      // Assistant'ı sil
      await fetch(`https://api.openai.com/v1/assistants/${assistantId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "OpenAI-Beta": "assistants=v2",
        },
      }).catch(() => {});
      console.log("🗑️ Assistant silindi");
    }
    
  } finally {
    // Dosyayı sil
    await fetch(`https://api.openai.com/v1/files/${fileId}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    }).catch(() => {});
    console.log("🗑️ Dosya silindi");
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

    // PDF'i Buffer'a çevir
    const arrayBuffer = await file.arrayBuffer();
    const pdfBuffer = Buffer.from(arrayBuffer);

    // Extract text from PDF using OpenAI Assistants API
    console.log("📄 Processing PDF...");
    let pdfText: string;
    
    try {
      pdfText = await extractTextFromPdfWithAssistant(pdfBuffer, openaiApiKey);
      
      if (!pdfText || pdfText.trim().length === 0) {
        return NextResponse.json(
          { 
            error: "Could not extract text from PDF.",
            suggestion: "You can enter the information manually."
          },
          { status: 400 }
        );
      }
    } catch (extractError: any) {
      console.error("PDF reading error:", extractError);
      
      // Timeout hatası için özel mesaj
      if (extractError.message?.includes("timeout") || extractError.message?.includes("Vercel")) {
        return NextResponse.json(
          { 
            error: "PDF reading timeout - The PDF is too large or complex.",
            suggestion: "Please try with a smaller PDF file, or enter the information manually. If you're on Vercel Hobby plan, consider upgrading to Pro plan for longer processing times.",
            details: extractError.message
          },
          { status: 408 } // 408 Request Timeout
        );
      }
      
      return NextResponse.json(
        { 
          error: "Could not read PDF.",
          suggestion: "You can enter the information manually.",
          details: extractError.message
        },
        { status: 400 }
      );
    }
    
    // İlk 8000 karakteri al
    const textToSend = pdfText.substring(0, 8000);
    console.log(`📄 ${textToSend.length} karakter analiz edilecek`);

    // OpenAI ile şirket bilgilerini çıkar
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
              content: `You are an expert in German Gewerbeanmeldung (business registration documents). Extract company information from the given text.

Return ONLY in this JSON format:
{
  "companyName": "Company name - e.g.: GENE Europe GmbH",
  "vatIdentificationNumber": "USt-IdNr if available",
  "taxIdNumber": "Steuernummer if available",
  "restaurantCount": "Number of businesses if available",
  "street": "Street and house number - e.g.: Frankfurter Str. 123",
  "city": "City - e.g.: Köln",
  "postalCode": "Postal code - e.g.: 51147",
  "country": "Germany",
  "federalState": "Federal state if available",
  "businessName": "Geschäftsbezeichnung - Trade name, e.g.: Komagene, Restaurant etc.",
  "ownerDirector": "Owner/Director full name - e.g.: Sivrikaya Kaya",
  "ownerEmail": "Email address if available",
  "ownerTelephone": "Phone number if available"
}

IMPORTANT:
- companyName: Official company name registered with HRB (e.g.: "GENE Europe GmbH")
- businessName: Trade name from Geschäftsbezeichnung field (e.g.: "Komagene")
- street: Only street and house number from address
- ownerDirector: Name from Gesetzlicher Vertreter or Inhaber section
- Use empty string "" for fields not found
- Return ONLY JSON, no explanations`,
            },
            {
              role: "user",
              content: `Extract company information from this Gewerbeanmeldung document:\n\n${textToSend}`,
            },
          ],
          temperature: 0.3,
          response_format: { type: "json_object" },
          max_tokens: 2000,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return NextResponse.json(
          { error: "Analysis failed", details: errorData },
          { status: response.status }
        );
      }

      const data = await response.json();
      
      let parsedInfo;
      try {
        const content = data.choices[0].message.content;
        parsedInfo = typeof content === 'string' ? JSON.parse(content) : content;
      } catch {
        return NextResponse.json(
          { success: false, error: "JSON parse error" },
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

      console.log("✅ Company information extracted");

      return NextResponse.json({
        success: true,
        companyInfo: companyInfo,
      });
    } catch (apiError: any) {
      return NextResponse.json(
        { error: "Analysis error", details: apiError.message },
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error("General error:", error);
    return NextResponse.json(
      { error: "Operation failed", details: error.message },
      { status: 500 }
    );
  }
}
