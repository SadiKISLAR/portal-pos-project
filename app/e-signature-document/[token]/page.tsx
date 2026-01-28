"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle, XCircle, Loader2, Eraser, Download, PenTool } from "lucide-react";

interface LeadInfo {
  name: string;
  companyName: string;
  email: string;
  city: string;
  status: string;
}

export default function ESignatureDocumentPage() {
  const params = useParams();
  const router = useRouter();
  const token = params.token as string;
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [documentHtml, setDocumentHtml] = useState<string>("");
  const [leadInfo, setLeadInfo] = useState<LeadInfo | null>(null);
  const [signing, setSigning] = useState(false);
  const [signed, setSigned] = useState(false);
  const [signedAt, setSignedAt] = useState<string | null>(null);
  
  // Canvas ref ve state'leri
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);
  const [signerName, setSignerName] = useState("");

  // Belgeyi yükle
  useEffect(() => {
    const fetchDocument = async () => {
      if (!token) {
        setError("Token bulunamadı");
        setLoading(false);
        return;
      }

      try {
        const res = await fetch(`/api/e-signature/get-document?token=${encodeURIComponent(token)}`);
        const data = await res.json();

        if (!res.ok) {
          if (res.status === 409) {
            // Zaten imzalanmış
            setSigned(true);
            setSignedAt(data.signedAt);
            setError(null);
          } else if (res.status === 410) {
            setError("Bu link'in süresi dolmuş. Lütfen yeni bir imza linki talep edin.");
          } else if (res.status === 404) {
            setError("Geçersiz veya süresi dolmuş link.");
          } else {
            setError(data.error || "Belge yüklenirken bir hata oluştu");
          }
          setLoading(false);
          return;
        }

        setDocumentHtml(data.document);
        setLeadInfo(data.lead);
        setSignerName(data.lead?.companyName || "");
        setError(null);
      } catch (e: any) {
        console.error("Error fetching document:", e);
        setError("Belge yüklenirken bir hata oluştu");
      } finally {
        setLoading(false);
      }
    };

    fetchDocument();
  }, [token]);

  // Canvas başlatma
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Canvas boyutunu ayarla
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * window.devicePixelRatio;
    canvas.height = rect.height * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

    // Başlangıç ayarları
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }, [loading, signed]);

  // Çizim fonksiyonları
  const getCoordinates = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();
    
    if ("touches" in e) {
      return {
        x: e.touches[0].clientX - rect.left,
        y: e.touches[0].clientY - rect.top
      };
    }
    
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
  }, []);

  const startDrawing = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx) return;

    const { x, y } = getCoordinates(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
  }, [getCoordinates]);

  const draw = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;
    e.preventDefault();
    
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx) return;

    const { x, y } = getCoordinates(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    setHasSignature(true);
  }, [isDrawing, getCoordinates]);

  const stopDrawing = useCallback(() => {
    setIsDrawing(false);
  }, []);

  const clearSignature = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx || !canvas) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
  };

  const getSignatureData = (): string | null => {
    const canvas = canvasRef.current;
    if (!canvas || !hasSignature) return null;
    return canvas.toDataURL("image/png");
  };

  // İmzayı kaydet
  const handleSignDocument = async () => {
    const signatureData = getSignatureData();
    
    if (!signatureData) {
      alert("Lütfen önce imzanızı atın");
      return;
    }

    if (!signerName.trim()) {
      alert("Lütfen imzalayan kişinin adını girin");
      return;
    }

    setSigning(true);

    try {
      const res = await fetch("/api/e-signature/save-signature", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          token,
          signatureData,
          signerName: signerName.trim(),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "İmza kaydedilemedi");
      }

      setSigned(true);
      setSignedAt(data.signedAt);
      alert("Belge başarıyla imzalandı!");
    } catch (e: any) {
      console.error("Error saving signature:", e);
      alert(e.message || "İmza kaydedilirken bir hata oluştu");
    } finally {
      setSigning(false);
    }
  };

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-green-600 animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Belge yükleniyor...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="p-8 text-center">
            <XCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
            <h1 className="text-xl font-bold text-gray-900 mb-2">Hata</h1>
            <p className="text-gray-600 mb-6">{error}</p>
            <Button onClick={() => router.push("/")} variant="outline">
              Ana Sayfaya Dön
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Already signed state
  if (signed) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="p-8 text-center">
            <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
            <h1 className="text-xl font-bold text-gray-900 mb-2">Belge İmzalandı</h1>
            <p className="text-gray-600 mb-2">
              Bu belge başarıyla imzalanmıştır.
            </p>
            {signedAt && (
              <p className="text-sm text-gray-500 mb-6">
                İmza Tarihi: {new Date(signedAt).toLocaleString("tr-TR")}
              </p>
            )}
            <Button onClick={() => router.push("/dashboard")} className="bg-green-600 hover:bg-green-700">
              Dashboard&apos;a Git
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold">CC</span>
              </div>
              <div>
                <h1 className="font-semibold text-gray-900">Elektronik İmza</h1>
                <p className="text-sm text-gray-500">Mitgliedsvertrag - {leadInfo?.companyName}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <PenTool className="w-5 h-5 text-gray-400" />
              <span className="text-sm text-gray-500">İmza bekliyor</span>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Bilgi Banner */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <p className="text-sm text-blue-800">
            <strong>Bilgi:</strong> Aşağıdaki belgeyi dikkatlice okuyun ve kabul ediyorsanız 
            sayfanın altındaki imza alanına imzanızı atın.
          </p>
        </div>

        {/* Document Content */}
        <Card className="mb-8">
          <CardContent className="p-0">
            <div 
              className="prose max-w-none p-8 bg-white"
              dangerouslySetInnerHTML={{ __html: documentHtml }}
            />
          </CardContent>
        </Card>

        {/* Signature Section */}
        <Card className="border-2 border-green-200">
          <CardContent className="p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <PenTool className="w-5 h-5 text-green-600" />
              İmza Alanı
            </h2>

            {/* Signer Name */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                İmzalayan Kişi / Şirket Adı
              </label>
              <input
                type="text"
                value={signerName}
                onChange={(e) => setSignerName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                placeholder="Adınızı girin"
              />
            </div>

            {/* Signature Canvas */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                İmzanız (Fare veya dokunmatik ekranla çizin)
              </label>
              <div className="relative border-2 border-dashed border-gray-300 rounded-lg bg-white">
                <canvas
                  ref={canvasRef}
                  className="w-full h-40 cursor-crosshair touch-none"
                  onMouseDown={startDrawing}
                  onMouseMove={draw}
                  onMouseUp={stopDrawing}
                  onMouseLeave={stopDrawing}
                  onTouchStart={startDrawing}
                  onTouchMove={draw}
                  onTouchEnd={stopDrawing}
                />
                {!hasSignature && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <p className="text-gray-400 text-sm">Buraya imzanızı çizin</p>
                  </div>
                )}
              </div>
              <div className="flex justify-end mt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={clearSignature}
                  disabled={!hasSignature}
                  className="flex items-center gap-1"
                >
                  <Eraser className="w-4 h-4" />
                  Temizle
                </Button>
              </div>
            </div>

            {/* Legal Text */}
            <p className="text-xs text-gray-500 mb-6">
              &quot;Belgeyi İmzala&quot; butonuna tıklayarak, yukarıdaki sözleşmeyi okuduğunuzu, anladığınızı 
              ve kabul ettiğinizi, elektronik imzanızın el yazısı imzanızla aynı yasal geçerliliğe 
              sahip olduğunu kabul etmiş olursunuz.
            </p>

            {/* Sign Button */}
            <div className="flex justify-center">
              <Button
                onClick={handleSignDocument}
                disabled={!hasSignature || !signerName.trim() || signing}
                className="bg-green-600 hover:bg-green-700 text-white px-8 py-3 text-lg font-semibold"
              >
                {signing ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    İmzalanıyor...
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-5 h-5 mr-2" />
                    Belgeyi İmzala
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Footer Info */}
        <div className="mt-6 text-center text-sm text-gray-500">
          <p>CC Culinary Collective GmbH - Hohenzollerndamm 58, 14199 Berlin</p>
          <p className="mt-1">
            Sorularınız için: <a href="mailto:info@ccculinary.de" className="text-green-600 hover:underline">info@ccculinary.de</a>
          </p>
        </div>
      </div>
    </div>
  );
}
