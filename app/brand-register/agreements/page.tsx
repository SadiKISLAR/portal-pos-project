"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import RegisterButton from "@/components/RegisterButton";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import BrandProgressBar from "@/components/BrandProgressBar";
import { ArrowRight, AlertTriangle, Download, CheckCircle2 } from "lucide-react";
import dynamic from "next/dynamic";
import { PDFDocument, rgb } from "pdf-lib";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

// Signature Canvas dinamik import
const SignatureCanvas = dynamic(
  () => import("react-signature-canvas"),
  {
    ssr: false,
  }
) as any;

interface BrandSelection {
  brandId: string;
  platforms: string[];
}

// Varsayılan PDF URL - tüm brand'ler için kullanılacak
const DEFAULT_PDF_URL = "https://culinary.erpsfer.com/files/Business%20Registration767714.pdf";

// Mock brand data - gerçekte API'den gelecek
const BRAND_AGREEMENTS: { [key: string]: { name: string; pdfUrl: string } } = {
  "burger-boost": { name: "Burger Boost", pdfUrl: DEFAULT_PDF_URL },
  "burger-boost-2": { name: "Burger Boost 2", pdfUrl: DEFAULT_PDF_URL },
  "burger-boost-3": { name: "Burger Boost 3", pdfUrl: DEFAULT_PDF_URL },
  "chickenico": { name: "Chickenico", pdfUrl: DEFAULT_PDF_URL },
  "doner-kapsalon": { name: "Döner Kapsalon", pdfUrl: DEFAULT_PDF_URL },
  "doner-menu": { name: "Doner menu", pdfUrl: DEFAULT_PDF_URL },
  "edel-weiss": { name: "Edel Weiss", pdfUrl: DEFAULT_PDF_URL },
  "crispy-chicken": { name: "Crispy Chicken", pdfUrl: DEFAULT_PDF_URL },
  "pizza-palace": { name: "Pizza Palace", pdfUrl: DEFAULT_PDF_URL },
};

export default function AgreementsPage() {
  const router = useRouter();
  const signatureRef = useRef<any>(null);
  const [selections, setSelections] = useState<BrandSelection[]>([]);
  const [selectedBrand, setSelectedBrand] = useState<string | null>(null);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [signatureData, setSignatureData] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [signedBrands, setSignedBrands] = useState<Set<string>>(new Set());
  const [canvasReady, setCanvasReady] = useState(false);

  // PDF State - Her brand için ayrı PDF yönetimi
  const [brandPdfs, setBrandPdfs] = useState<{
    [brandId: string]: {
      originalBytes: ArrayBuffer | null;
      signedUrl: string | null;
      signedBlob: Blob | null;
      loading: boolean;
      error: string | null;
    };
  }>({});

  useEffect(() => {
    const savedSelections = localStorage.getItem("brandSelections");

    if (savedSelections) {
      const parsed = JSON.parse(savedSelections);
      setSelections(parsed);
      if (parsed.length > 0) {
        setSelectedBrand(parsed[0].brandId);
      }
    } else {
      router.push("/brand-register/brand-selection");
    }
  }, [router]);

  // Tüm seçili brand'lerin PDF'lerini yükle
  const loadAllPdfs = useCallback(async () => {
    const pdfPromises = selections.map(async (selection) => {
      const brandId = selection.brandId;
      // Brand bulunamazsa varsayılan PDF URL'ini kullan
      const pdfUrl = BRAND_AGREEMENTS[brandId]?.pdfUrl || DEFAULT_PDF_URL;
      
      console.log(`📋 Loading PDF for brand: ${brandId}, URL: ${pdfUrl}`);

      // Loading state
      setBrandPdfs((prev) => ({
        ...prev,
        [brandId]: {
          ...prev[brandId],
          loading: true,
          error: null,
        },
      }));

      try {
        console.log(`📄 Loading PDF for ${brandId}:`, pdfUrl);
        
        // Önce direkt URL'yi dene, CORS sorunu olursa proxy kullan
        let response: Response;
        try {
          response = await fetch(pdfUrl, {
            method: 'GET',
            mode: 'cors',
            headers: {
              'Accept': 'application/pdf',
            },
          });
        } catch (directError: any) {
          // Direkt fetch başarısız olursa proxy kullan
          console.log(`⚠️ Direct fetch failed, trying proxy for ${brandId}`);
          const proxyUrl = `/api/erp/proxy-pdf?url=${encodeURIComponent(pdfUrl)}`;
          response = await fetch(proxyUrl, {
            method: 'GET',
            headers: {
              'Accept': 'application/pdf',
            },
          });
        }
        
        console.log(`📄 Response status for ${brandId}:`, response.status, response.statusText);
        
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: response.statusText }));
          console.error(`❌ PDF fetch failed for ${brandId}:`, {
            status: response.status,
            statusText: response.statusText,
            error: errorData.error,
          });
          throw new Error(`PDF yüklenemedi (${response.status}): ${errorData.error || response.statusText}`);
        }

        const arrayBuffer = await response.arrayBuffer();
        console.log(`✅ PDF loaded for ${brandId}, size:`, arrayBuffer.byteLength, 'bytes');
        
        // Orijinal PDF'i göster
        const blob = new Blob([arrayBuffer], { type: "application/pdf" });
        const url = URL.createObjectURL(blob);

        setBrandPdfs((prev) => ({
          ...prev,
          [brandId]: {
            originalBytes: arrayBuffer,
            signedUrl: url,
            signedBlob: null,
            loading: false,
            error: null,
          },
        }));
      } catch (err: any) {
        console.error(`❌ Error loading PDF for ${brandId}:`, err);
        console.error(`   PDF URL: ${pdfUrl}`);
        console.error(`   Error details:`, {
          message: err.message,
          stack: err.stack,
          name: err.name,
        });
        
        // Daha detaylı hata mesajı
        let errorMessage = err.message || "PDF yüklenemedi.";
        if (err.message?.includes('CORS') || err.message?.includes('cors')) {
          errorMessage = "CORS hatası: PDF sunucusu erişime izin vermiyor.";
        } else if (err.message?.includes('Failed to fetch')) {
          errorMessage = "Ağ hatası: PDF sunucusuna bağlanılamıyor.";
        }
        
        setBrandPdfs((prev) => ({
          ...prev,
          [brandId]: {
            originalBytes: null,
            signedUrl: null,
            signedBlob: null,
            loading: false,
            error: errorMessage,
          },
        }));
      }
    });

    await Promise.all(pdfPromises);
  }, [selections]);

  // Seçimler değiştiğinde tüm PDF'leri yükle
  useEffect(() => {
    if (selections.length > 0) {
      loadAllPdfs();
    }
  }, [selections, loadAllPdfs]);

  // İmza eklendiğinde sadece imza verisini kaydet, PDF'leri oluşturma
  // PDF'ler Next butonuna basıldığında oluşturulacak

  const clearSignature = () => {
    if (signatureRef.current) {
      signatureRef.current.clear();
      setSignatureData(null);
    }
  };

  const saveSignature = () => {
    if (signatureRef.current) {
      // isEmpty kontrolü bazen yanlış sonuç verebilir, bu yüzden direkt dataURL al
      try {
        const dataUrl = signatureRef.current.toDataURL("image/png");
        // Boş canvas kontrolü - eğer sadece beyaz piksel varsa boş sayılır
        if (dataUrl && !signatureRef.current.isEmpty()) {
          setSignatureData(dataUrl);
          return dataUrl;
        }
      } catch (err) {
        console.error("Error saving signature:", err);
      }
    }
    return null;
  };

  // İmza çizildiğinde otomatik kaydet
  const handleSignatureEnd = () => {
    // Kısa bir gecikme ile kaydet - canvas'ın tamamen render olmasını bekle
    setTimeout(() => {
      const saved = saveSignature();
      if (saved) {
        toast.success("✅ Signature saved! Click 'Next' to sign the PDFs.", {
          position: "top-right",
          autoClose: 4000,
        });
      }
    }, 100);
  };

  // Tüm PDF'lere imza ekle (Next butonuna basıldığında çağrılacak)
  const addSignaturesToAllPdfs = async (sigData: string): Promise<boolean> => {
    if (!sigData) {
      toast.error("Please add your signature first.");
      return false;
    }

    if (selections.length === 0) {
      toast.error("No selected brands found.");
      return false;
    }

    toast.info("📄 Adding signatures to PDFs...", {
      position: "top-right",
      autoClose: 2000,
    });

    try {
      // İmza resmini bir kez yükle
      const response = await fetch(sigData);
      if (!response.ok) {
        throw new Error("Failed to load signature image");
      }
      const signatureImageBytes = await response.arrayBuffer();

      // Her brand için PDF'e imza ekle - functional update kullan
      const updatePromises = selections.map(async (selection) => {
        const brandId = selection.brandId;
        
        return new Promise<void>((resolve, reject) => {
          setBrandPdfs((prev) => {
            const brandPdf = prev[brandId];
            
            if (!brandPdf?.originalBytes) {
              console.warn(`PDF bytes not found for ${brandId}`);
              resolve();
              return prev;
            }

            // Async işlemi başlat
            (async () => {
              try {
                const pdfDoc = await PDFDocument.load(brandPdf.originalBytes!);
                const pages = pdfDoc.getPages();
                const lastPage = pages[pages.length - 1];

                // İmza resmini embed et
                const signatureImage = await pdfDoc.embedPng(signatureImageBytes);

                // İmza boyutlarını ayarla
                const signatureDims = signatureImage.scale(0.25);

                // Son sayfanın sağ alt köşesine imza ekle
                const { width } = lastPage.getSize();
                const signatureX = width - signatureDims.width - 40;
                const signatureY = 40;

                lastPage.drawImage(signatureImage, {
                  x: signatureX,
                  y: signatureY,
                  width: signatureDims.width,
                  height: signatureDims.height,
                });

                // İmza altına tarih ve çizgi ekle
                const currentDate = new Date().toLocaleDateString("de-DE", {
                  day: "2-digit",
                  month: "2-digit",
                  year: "numeric",
                });

                // Çizgi çiz
                lastPage.drawLine({
                  start: { x: signatureX, y: signatureY - 5 },
                  end: { x: signatureX + signatureDims.width, y: signatureY - 5 },
                  thickness: 1,
                  color: rgb(0.3, 0.3, 0.3),
                });

                lastPage.drawText(`Signature - ${currentDate}`, {
                  x: signatureX,
                  y: signatureY - 18,
                  size: 9,
                  color: rgb(0.3, 0.3, 0.3),
                });

                // PDF'i kaydet
                const signedPdfBytes = await pdfDoc.save();
                const blob = new Blob([signedPdfBytes as BlobPart], { type: "application/pdf" });
                const url = URL.createObjectURL(blob);

                setBrandPdfs((prev) => ({
                  ...prev,
                  [brandId]: {
                    ...prev[brandId],
                    signedUrl: url,
                    signedBlob: blob,
                  },
                }));

                resolve();
              } catch (err) {
                console.error(`Error adding signature to PDF for ${brandId}:`, err);
                reject(err);
              }
            })();

            return prev;
          });
        });
      });

      await Promise.all(updatePromises);

      // All PDFs signed
      toast.success(`✅ All PDFs signed! (${selections.length} files)`, {
        position: "top-right",
        autoClose: 4000,
      });

      return true;
    } catch (err: any) {
      console.error("Error adding signatures to PDFs:", err);
      toast.error("An error occurred while adding signatures to PDFs. Please try again.", {
        position: "top-right",
        autoClose: 4000,
      });
      return false;
    }
  };

  const handleViewAgreement = (brandId: string) => {
    setSelectedBrand(brandId);
  };

  const getBrandName = (brandId: string) => {
    // Brand bulunamazsa ID'yi formatla (burger-boost-2 -> Burger Boost 2)
    if (BRAND_AGREEMENTS[brandId]?.name) {
      return BRAND_AGREEMENTS[brandId].name;
    }
    // ID'yi formatla: burger-boost-2 -> Burger Boost 2
    return brandId
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  const downloadSignedPdf = (brandId: string) => {
    const brandPdf = brandPdfs[brandId];
    if (brandPdf?.signedBlob) {
      const link = document.createElement("a");
      link.href = URL.createObjectURL(brandPdf.signedBlob);
      link.download = `${getBrandName(brandId)}_signed_agreement.pdf`;
      link.click();
    }
  };

  const downloadAllSignedPdfs = () => {
    selections.forEach((selection) => {
      const brandPdf = brandPdfs[selection.brandId];
      if (brandPdf?.signedBlob) {
        setTimeout(() => {
          const link = document.createElement("a");
          link.href = URL.createObjectURL(brandPdf.signedBlob!);
          link.download = `${getBrandName(selection.brandId)}_signed_agreement.pdf`;
          link.click();
        }, 100 * selections.indexOf(selection));
      }
    });
  };

  const handleSubmit = async () => {
    if (!termsAccepted) {
      toast.error("Please accept the terms of use.");
      return;
    }

    // Next butonuna basıldığında canvas'tan direkt imzayı al
    let currentSignature = signatureData;
    
    // Ref hazır olana kadar bekle (max 1 saniye)
    let attempts = 0;
    while (!signatureRef.current && attempts < 10) {
      await new Promise(resolve => setTimeout(resolve, 100));
      attempts++;
    }
    
    // Canvas'tan imzayı al - ref veya DOM'dan
    let canvas: any = null;
    
    // Yöntem 1: Ref'ten al
    if (signatureRef.current) {
      canvas = signatureRef.current;
      console.log("✅ Got canvas from ref");
    } else {
      // Yöntem 2: DOM'dan direkt bul
      const signatureContainer = document.querySelector('.border-2.border-dashed');
      if (signatureContainer) {
        const innerCanvas = signatureContainer.querySelector('canvas');
        if (innerCanvas) {
          canvas = {
            toDataURL: (type: string) => innerCanvas.toDataURL(type),
            isEmpty: () => {
              const ctx = innerCanvas.getContext('2d');
              if (!ctx) return true;
              const imageData = ctx.getImageData(0, 0, innerCanvas.width, innerCanvas.height);
              const data = imageData.data;
              for (let i = 0; i < data.length; i += 4) {
                if (data[i + 3] !== 0) return false;
              }
              return true;
            }
          };
          console.log("✅ Got canvas from DOM");
        }
      }
    }
    
    if (canvas) {
      try {
        // Boş kontrolü
        if (canvas.isEmpty && canvas.isEmpty()) {
          toast.error("Please add your signature before proceeding.");
          return;
        }
        
        const dataUrl = canvas.toDataURL("image/png");
        console.log("📝 Canvas dataURL length:", dataUrl.length);
        
        if (dataUrl && dataUrl.length > 5000) {
          setSignatureData(dataUrl);
          currentSignature = dataUrl;
          console.log("✅ Signature captured, length:", dataUrl.length);
        } else {
          console.warn("⚠️ Canvas appears empty, dataURL length:", dataUrl?.length);
          toast.error("Please add your signature before proceeding.");
          return;
        }
      } catch (err) {
        console.error("❌ Error capturing signature:", err);
        toast.error("Error capturing signature. Please try again.");
        return;
      }
    } else {
      console.error("❌ Could not find signature canvas");
      toast.error("Signature canvas not found. Please refresh the page and try again.");
      return;
    }

    if (!currentSignature) {
      toast.error("Please add your signature before proceeding.");
      return;
    }

    setLoading(true);

    try {
      // Önce tüm PDF'lere imza ekle (currentSignature kullan)
      const success = await addSignaturesToAllPdfs(currentSignature);
      
      if (!success) {
        setLoading(false);
        return;
      }

      // State güncellemesi için kısa bir bekleme
      await new Promise(resolve => setTimeout(resolve, 1000));

      // İmzalı PDF'ler oluşturuldu - artık sayfada görünecek
      // Kullanıcı indirme butonlarını kullanarak PDF'leri indirebilir

      console.log("✅ İmzalı PDF'ler oluşturuldu:", {
        selections: selections.map(s => ({ brandId: s.brandId, brandName: getBrandName(s.brandId) })),
        signatureAdded: true,
        termsAccepted,
        signedAt: new Date().toISOString(),
      });

      // TODO: API'ye gönder - FormData ile imzalı PDF'leri gönder
      // const formData = new FormData();
      // formData.append("data", JSON.stringify(signedData));
      // signedPdfs.forEach((pdf) => {
      //   formData.append(`pdf_${pdf.brandId}`, pdf.pdfBlob, `${pdf.brandName}_signed.pdf`);
      // });
      // await fetch("/api/brand-register/sign-agreements", { method: "POST", body: formData });

      toast.success("✅ Signed PDFs are ready! You can download them using the download buttons.", {
        position: "top-right",
        autoClose: 5000,
      });

      // Stay on page, don't redirect
      // User will tell us what to do next after downloading PDFs
      
    } catch (error) {
      console.error("Error signing agreements:", error);
      toast.error("An error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    router.push("/brand-register/delivery-method");
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <ToastContainer
        position="top-right"
        autoClose={3000}
        hideProgressBar={false}
        newestOnTop={false}
        closeOnClick
        rtl={false}
        pauseOnFocusLoss
        draggable
        pauseOnHover
        theme="light"
      />
      <BrandProgressBar currentStep={3} />

      <div className="max-w-6xl mx-auto px-4 py-6">
        <Card className="shadow-lg">
          <CardContent className="pt-6">
            {/* Header */}
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              Agreements
            </h1>
            <p className="text-gray-600 mb-6">
              Please read all contracts that have been drawn up and sign them after reviewing them.
            </p>

            {/* Main Content - Two Column */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
              {/* Left Side - Brand Agreements List */}
              <div>
                <h2 className="text-lg font-bold text-gray-900 mb-4">
                  Trademark Usage Agreement
                </h2>

                <div className="space-y-3">
                  {selections.map((selection) => {
                    const brandName = getBrandName(selection.brandId);
                    const isSelected = selectedBrand === selection.brandId;

                    return (
                      <div key={selection.brandId}>
                        <div className="font-medium text-gray-700 mb-1">
                          {brandName}
                        </div>
                        <button
                          onClick={() => handleViewAgreement(selection.brandId)}
                          className={`w-full flex items-center justify-between px-4 py-3 border rounded-lg transition-colors ${
                            isSelected
                              ? "border-orange-400 bg-orange-50"
                              : "border-gray-200 hover:border-gray-300 bg-white"
                          }`}
                        >
                          <span className="text-sm text-gray-600">
                            View trademark usage agreement
                          </span>
                          <ArrowRight className="w-4 h-4 text-gray-400" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Right Side - PDF Viewer */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-medium text-gray-700">
                    Selected Agreements ({selections.length})
                  </h3>
                  {signatureData && Object.values(brandPdfs).some(pdf => pdf.signedBlob) && (
                    <button
                      onClick={downloadAllSignedPdfs}
                      className="flex items-center gap-2 px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors text-sm font-semibold shadow-md"
                    >
                      <Download className="w-4 h-4" />
                      Download All Signed PDFs
                    </button>
                  )}
                </div>
                {/* Signed PDFs ready info box */}
                {signatureData && Object.values(brandPdfs).some(pdf => pdf.signedBlob) && (
                  <div className="mb-3 p-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-green-800">
                        ✅ Signed PDFs are ready!
                      </p>
                      <p className="text-xs text-green-700 mt-1">
                        You can download each PDF individually using the &quot;Download&quot; button next to each PDF, or download all at once using the button above.
                      </p>
                    </div>
                  </div>
                )}
                <div className="w-full h-[500px] bg-gray-100 rounded-lg border overflow-y-auto">
                  {selections.length === 0 ? (
                    <div className="w-full h-full flex items-center justify-center">
                      <p className="text-gray-500">Henüz brand seçilmedi</p>
                    </div>
                  ) : (
                    <div className="space-y-4 p-4">
                      {selections.map((selection) => {
                        const brandId = selection.brandId;
                        const brandName = getBrandName(brandId);
                        const brandPdf = brandPdfs[brandId];
                        const isSelected = selectedBrand === brandId;

                        return (
                          <div
                            key={brandId}
                            className={`border rounded-lg overflow-hidden ${
                              isSelected ? "border-orange-400 shadow-md" : "border-gray-200"
                            }`}
                          >
                            <div className="bg-white px-4 py-2 border-b flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <h4 className="font-semibold text-gray-800">{brandName}</h4>
                                {brandPdf?.signedBlob && (
                                  <span className="flex items-center gap-1 text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full">
                                    <CheckCircle2 className="w-3 h-3" />
                                    Signed
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2">
                                {brandPdf?.signedBlob && (
                                  <button
                                    onClick={() => {
                                      downloadSignedPdf(brandId);
                                      toast.success(`Downloading ${brandName} PDF...`, {
                                        position: "top-right",
                                        autoClose: 2000,
                                      });
                                    }}
                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-500 text-white rounded-md hover:bg-orange-600 transition-colors text-xs font-semibold shadow-sm"
                                  >
                                    <Download className="w-3.5 h-3.5" />
                                    Download
                                  </button>
                                )}
                                <button
                                  onClick={() => setSelectedBrand(isSelected ? null : brandId)}
                                  className="text-xs text-gray-600 hover:text-gray-800 px-2 py-1 rounded hover:bg-gray-100"
                                >
                                  {isSelected ? "Collapse" : "Expand"}
                                </button>
                              </div>
                            </div>
                            {isSelected && (
                              <div className="h-[400px] bg-gray-50">
                                {brandPdf?.loading ? (
                                  <div className="w-full h-full flex items-center justify-center">
                                    <div className="text-center">
                                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500 mx-auto mb-2"></div>
                                      <p className="text-gray-500">Loading PDF...</p>
                                    </div>
                                  </div>
                                ) : brandPdf?.error ? (
                                  <div className="w-full h-full flex items-center justify-center">
                                    <div className="text-center text-red-500">
                                      <p className="font-medium mb-2">Failed to load PDF</p>
                                      <p className="text-sm">{brandPdf.error}</p>
                                    </div>
                                  </div>
                                ) : brandPdf?.signedUrl ? (
                                  <object
                                    data={`${brandPdf.signedUrl}#toolbar=1&navpanes=0&scrollbar=1`}
                                    type="application/pdf"
                                    className="w-full h-full"
                                    aria-label={`${brandName} PDF`}
                                  >
                                    <embed
                                      src={`${brandPdf.signedUrl}#toolbar=1&navpanes=0&scrollbar=1`}
                                      type="application/pdf"
                                      className="w-full h-full"
                                    />
                                  </object>
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center">
                                    <p className="text-gray-500">Loading PDF...</p>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
                {signatureData && Object.values(brandPdfs).some(pdf => pdf.signedBlob) && (
                  <p className="text-sm text-green-600 mt-2 text-center">
                    ✓ Signature added to all PDFs (bottom-right corner)
                  </p>
                )}
              </div>
            </div>

            {/* Signature Section */}
            <div className="border-t pt-8">
              <h2 className="text-xl font-bold text-gray-900 mb-6">
                Signature
              </h2>

              {/* Terms of Use */}
              <div className="mb-6">
                <Label className="text-sm font-semibold text-gray-700">
                  Terms of Use *
                </Label>
                <div className="mt-2 p-4 bg-yellow-50 border border-yellow-200 rounded-lg max-h-40 overflow-y-auto">
                  <p className="text-sm text-gray-700">
                    By agreeing, you declare that you have read, fully understood, and legally accepted the Terms of Use. Furthermore, you acknowledge that the Terms may be updated periodically and that any continued use of the service constitutes acceptance of the currently valid version. You confirm that you have familiarized yourself with all regulations and accept them as the basis for our contractual cooperation.
                  </p>
                  <p className="text-sm text-gray-700 mt-3">
                    Furthermore, you declare that all information you have provided is accurate, complete, and up-to-date. You agree to take the necessary security measures to protect your account and to refrain from any form of misuse. You also agree that personal data may be processed in accordance with applicable data protection regulations and may be disclosed to third parties where legally required or necessary for the performance of the contract.
                  </p>
                </div>
              </div>

              {/* Terms Checkbox */}
              <div className="flex items-start space-x-3 mb-6">
                <Checkbox
                  id="termsAccepted"
                  checked={termsAccepted}
                  onCheckedChange={(checked) => setTermsAccepted(checked as boolean)}
                  className="mt-1"
                />
                <Label htmlFor="termsAccepted" className="text-sm text-gray-700 cursor-pointer">
                  I confirm that I have read and accepted all of the above-mentioned contracts and terms of use.
                </Label>
              </div>

              {/* Signature Pad */}
              <div className="mb-6">
                <div className="flex items-center justify-between mb-2">
                  <Label className="text-sm font-semibold text-gray-700">
                    Signature *
                  </Label>
                  <button
                    onClick={clearSignature}
                    className="text-sm text-orange-500 hover:text-orange-600"
                  >
                    Clear
                  </button>
                </div>
                <p className="text-sm text-gray-500 mb-2">
                  Please sign the agreements to confirm. Your signature will be added to the bottom-right corner of all selected PDFs.
                </p>
                <div className="border-2 border-dashed border-gray-300 rounded-lg bg-white">
                  <SignatureCanvas
                    ref={(ref: any) => {
                      signatureRef.current = ref;
                      if (ref) {
                        setCanvasReady(true);
                        console.log("✅ Signature canvas ref set");
                      }
                    }}
                    onEnd={handleSignatureEnd}
                    canvasProps={{
                      className: "w-full h-32 rounded-lg",
                      style: { width: "100%", height: "128px" },
                    }}
                    backgroundColor="white"
                  />
                </div>
                <p className="text-xs text-gray-500 mt-2 text-center">
                  Draw your signature above. It will be added to all PDFs when you click &quot;Next&quot;.
                </p>
              </div>

              {/* Important Note */}
              <div className="p-4 bg-yellow-100 border border-yellow-300 rounded-lg mb-6">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <h4 className="font-semibold text-gray-800">Important note</h4>
                    <p className="text-sm text-gray-700 mt-1">
                      Generating the contract documents may take approximately 1 to 1.5 minutes. Please be patient and do not close this window. You will be automatically redirected once the process is complete.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Navigation Buttons */}
            <div className="flex justify-between items-center">
              <Button
                onClick={handleBack}
                variant="outline"
                className="px-8"
              >
                Back
              </Button>
              <div className="flex flex-col items-end gap-2">
                {!termsAccepted && (
                  <p className="text-xs text-gray-500 text-right">
                    Please accept the terms of use
                  </p>
                )}
                <RegisterButton
                  type="button"
                  onClick={handleSubmit}
                  disabled={!termsAccepted || loading}
                >
                  {loading ? "Processing..." : "Next"}
                </RegisterButton>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
