"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useRegistration } from "@/contexts/RegistrationContext";
import ProgressBar from "@/components/ProgressBar";
import AddressAutocomplete from "@/components/AddressAutocomplete";
import RegisterButton from "@/components/RegisterButton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Trash2, Plus } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import PhoneInput, { Country } from "react-phone-number-input";
import "react-phone-number-input/style.css";
import countries from "i18n-iso-countries";
import en from "i18n-iso-countries/langs/en.json";
import tr from "i18n-iso-countries/langs/tr.json";
import de from "i18n-iso-countries/langs/de.json";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { useLanguage } from "@/contexts/LanguageContext";

countries.registerLocale(en);
countries.registerLocale(tr);
countries.registerLocale(de);

const getCountryIsoCode = (countryName?: string): Country | undefined => {
  if (!countryName) return undefined;
  const code = countries.getAlpha2Code(countryName, "en") || 
               countries.getAlpha2Code(countryName, "tr") ||
               countries.getAlpha2Code(countryName, "de");
  return code as Country;
};

export default function CompanyInformationPage() {
  const router = useRouter();
  const { t } = useLanguage();
  const { formData, updateFormData, goToStep } = useRegistration();
  const [restaurantCount, setRestaurantCount] = useState(
    formData.companyInfo.restaurantCount || "1"
  );
  const hasLoadedCompanyInfo = useRef(false);
  const hasCompletedSignup = useRef(false);
  const lastSelectedStreetRef = useRef<string | null>(null);
  const companyMainIso = getCountryIsoCode(formData.companyInfo.country) || "DE";

  const [businesses, setBusinesses] = useState([
    {
      businessName: "",
      ownerDirector: "",
      ownerTelephone: "",
      ownerEmail: "",
      differentContact: false,
      contactPerson: "",
      contactTelephone: "",
      contactEmail: "",
      street: "",
      city: "",
      postalCode: "",
      federalState: "",
      country: "",
    },
  ]);

  const addBusiness = () => {
    setBusinesses([
      ...businesses,
      {
        businessName: "",
        ownerDirector: "",
        ownerTelephone: "",
        ownerEmail: "",
        differentContact: false,
        contactPerson: "",
        contactTelephone: "",
        contactEmail: "",
        street: "",
        city: "",
        postalCode: "",
        federalState: "",
        country: "",
      },
    ]);
  };

  const removeBusiness = (index: number) => {
    if (businesses.length <= 1) return;
    setBusinesses(businesses.filter((_, i) => i !== index));
  };

  const updateBusiness = (index: number, field: string, value: any) => {
    setBusinesses((prevBusinesses) => {
      const updatedBusinesses = [...prevBusinesses];
      updatedBusinesses[index] = {
        ...updatedBusinesses[index],
        [field]: value,
      };
      return updatedBusinesses;
    });
  };

  const updateBusinessAddress = (index: number, details: any) => {
    setBusinesses((prevBusinesses) => {
      const updatedBusinesses = [...prevBusinesses];
      updatedBusinesses[index] = {
        ...updatedBusinesses[index],
        street: details.street,
        city: details.city || updatedBusinesses[index].city,
        postalCode: details.postalCode || updatedBusinesses[index].postalCode,
        country: details.country || updatedBusinesses[index].country,
        federalState: details.federalState || updatedBusinesses[index].federalState,
      };
      return updatedBusinesses;
    });
  };

  // DÜZELTME: useEffect dependency uyarısı için disable eklendi
  useEffect(() => {
    if (formData.currentStep !== 4) {
      goToStep(4);
    }
    const count = parseInt(restaurantCount) || 1;
    if (formData.restaurants.length !== count) {
      const newRestaurants = Array.from({ length: count }, (_, index) => {
        return formData.restaurants[index] || {
          restaurantName: "",
          street: "",
          city: "",
          country: "",
          federalState: "",
        };
      });
      updateFormData({ restaurants: newRestaurants });
    }
    // Sonsuz döngüyü önlemek için formData.restaurants dependency array'e eklenmemeli
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantCount, formData.currentStep, goToStep, updateFormData]);

  useEffect(() => {
    if (hasCompletedSignup.current) return;
    hasCompletedSignup.current = true;

    const completeSignupIfNeeded = async () => {
      if (typeof window === "undefined") return;
      const completed = localStorage.getItem("signupCompleted");
      if (completed === "true") return;

      const initialDataRaw = localStorage.getItem("initialRegistrationData");
      if (!initialDataRaw) return;

      let initialData: any = null;
      try {
        initialData = JSON.parse(initialDataRaw);
      } catch {
        return;
      }

      if (!initialData?.email) return;

      try {
        const res = await fetch("/api/auth/complete-signup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: initialData.email,
            companyName: initialData.companyName,
            firstName: initialData.firstName,
            lastName: initialData.lastName,
            password: initialData.password,
          }),
        });

        const data = await res.json();
        if (res.ok && data.success) {
          localStorage.setItem("signupCompleted", "true");
          sessionStorage.setItem("userEmail", initialData.email);
        } else {
          console.error("complete-signup failed:", data);
        }
      } catch (error) {
        console.error("complete-signup error:", error);
      }
    };

    completeSignupIfNeeded();
  }, []);

  useEffect(() => {
    if (hasLoadedCompanyInfo.current) return;
    hasLoadedCompanyInfo.current = true;

    const loadCompanyInfo = async () => {
      let userEmail = "";
      if (typeof window !== "undefined") {
        const initialData = localStorage.getItem("initialRegistrationData");
        if (initialData) {
          try { userEmail = JSON.parse(initialData).email || ""; } catch (e) {}
        }
        if (!userEmail) userEmail = sessionStorage.getItem("userEmail") || "";
        if (!userEmail) userEmail = localStorage.getItem("userEmail") || "";
      }

      if (!userEmail) { hasLoadedCompanyInfo.current = false; return; }

      // Önce parsed bilgileri localStorage'dan kontrol et (PDF'den okunan bilgiler)
      let parsedCompanyInfo: any = null;
      if (typeof window !== "undefined") {
        const parsedData = localStorage.getItem("parsedCompanyInfo");
        if (parsedData) {
          try {
            parsedCompanyInfo = JSON.parse(parsedData);
            console.log("✅ Found parsed company info from PDF:", parsedCompanyInfo);
          } catch (e) {
            console.error("Error parsing stored company info:", e);
          }
        }
      }

      try {
        const res = await fetch("/api/erp/get-lead", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: userEmail }),
        });

        const data = await res.json();

        if (data.success && data.lead) {
          const lead = data.lead;
          // Kontrol ettiğimiz alanlar (Yeni isimler eklendi)
          if (lead.company_name || lead.custom_vat_number || lead.custom_tax_id || 
              lead.address_line1 || lead.city || lead.country || lead.mainCompanyAddress || parsedCompanyInfo) {
            
            const companyInfo: any = {};
            
            // Önce parsed bilgileri yükle (PDF'den okunan bilgiler öncelikli)
            if (parsedCompanyInfo) {
              console.log("📄 Loading parsed company info from PDF (PRIORITY)");
              console.log("📄 Full parsedCompanyInfo object:", parsedCompanyInfo);
              
              // Parsed bilgiler öncelikli - tüm alanları yükle
              if (parsedCompanyInfo.companyName) {
                companyInfo.companyName = parsedCompanyInfo.companyName;
                console.log("✅ Set companyName:", parsedCompanyInfo.companyName);
              }
              if (parsedCompanyInfo.vatIdentificationNumber) {
                companyInfo.vatIdentificationNumber = parsedCompanyInfo.vatIdentificationNumber;
                console.log("✅ Set vatIdentificationNumber:", parsedCompanyInfo.vatIdentificationNumber);
              }
              if (parsedCompanyInfo.taxIdNumber) {
                companyInfo.taxIdNumber = parsedCompanyInfo.taxIdNumber;
                console.log("✅ Set taxIdNumber:", parsedCompanyInfo.taxIdNumber);
              }
              if (parsedCompanyInfo.restaurantCount) {
                companyInfo.restaurantCount = parsedCompanyInfo.restaurantCount;
                console.log("✅ Set restaurantCount:", parsedCompanyInfo.restaurantCount);
              }
              if (parsedCompanyInfo.street) {
                companyInfo.street = parsedCompanyInfo.street;
                console.log("✅ Set street:", parsedCompanyInfo.street);
              }
              if (parsedCompanyInfo.city) {
                companyInfo.city = parsedCompanyInfo.city;
                console.log("✅ Set city:", parsedCompanyInfo.city);
              }
              if (parsedCompanyInfo.zipCode) {
                companyInfo.zipCode = parsedCompanyInfo.zipCode;
                console.log("✅ Set zipCode:", parsedCompanyInfo.zipCode);
              }
              if (parsedCompanyInfo.country) {
                companyInfo.country = parsedCompanyInfo.country;
                console.log("✅ Set country:", parsedCompanyInfo.country);
              }
              if (parsedCompanyInfo.federalState) {
                companyInfo.federalState = parsedCompanyInfo.federalState;
                console.log("✅ Set federalState:", parsedCompanyInfo.federalState);
              }
              
              console.log("✅ Parsed company info loaded:", companyInfo);
              console.log("📋 Business info from PDF:", {
                businessName: parsedCompanyInfo.businessName,
                ownerDirector: parsedCompanyInfo.ownerDirector,
                ownerEmail: parsedCompanyInfo.ownerEmail,
                ownerTelephone: parsedCompanyInfo.ownerTelephone
              });
            } else {
              console.warn("⚠️ No parsedCompanyInfo found in localStorage");
            }
            
            // Lead'den gelen bilgileri sadece parsed bilgiler yoksa veya eksikse ekle
            // Parsed bilgiler öncelikli olduğu için, sadece eksik alanları doldur
            if (!companyInfo.companyName && lead.company_name) companyInfo.companyName = lead.company_name;
            if (!companyInfo.vatIdentificationNumber && lead.custom_vat_number) companyInfo.vatIdentificationNumber = lead.custom_vat_number;
            if (!companyInfo.taxIdNumber && lead.custom_tax_id) companyInfo.taxIdNumber = lead.custom_tax_id;
            if (!companyInfo.restaurantCount && lead.custom_restaurant_count) companyInfo.restaurantCount = String(lead.custom_restaurant_count);

            // Adres bilgileri - Sadece parsed bilgiler yoksa Address DocType'ından veya Lead'den yükle
            // Parsed bilgiler öncelikli olduğu için, sadece eksik alanları doldur
            if (!companyInfo.street || !companyInfo.city || !companyInfo.country) {
              // ÖNCE Address DocType'ından kontrol et (Billing type)
              if (lead.mainCompanyAddress) {
                const address = lead.mainCompanyAddress;
                console.log("📍 Loading address from Address DocType:", address.name);
                
                // Address DocType'ından bilgileri yükle (sadece eksik alanlar)
                if (!companyInfo.street && address.address_line1) companyInfo.street = address.address_line1;
                if (!companyInfo.city && address.city) companyInfo.city = address.city;
                if (!companyInfo.zipCode && address.pincode) companyInfo.zipCode = address.pincode;
                if (!companyInfo.federalState && address.state) companyInfo.federalState = address.state;
                if (!companyInfo.country && address.country) companyInfo.country = address.country;
                
                console.log("✅ Address loaded from Address DocType (missing fields only)");
              }
              // Eğer Address DocType'ında yoksa, Lead'in kendi address field'larına bak
              else {
                const addressLine1 = lead.address_line1 || lead.custom_address_line1;
                const addressLine2 = lead.address_line2;
                
                // Eğer structured adres bilgileri varsa, onları kullan (sadece eksik alanlar)
                if (addressLine1 || addressLine2 || lead.city || lead.country) {
                  if (!companyInfo.street && (addressLine1 || addressLine2)) {
                    const streetParts = [];
                    if (addressLine1) streetParts.push(addressLine1);
                    if (addressLine2) streetParts.push(addressLine2);
                    companyInfo.street = streetParts.join(" ");
                  }
                  if (!companyInfo.city && lead.city) companyInfo.city = lead.city;
                  if (!companyInfo.zipCode && (lead.pincode || lead.custom_pincode)) {
                    companyInfo.zipCode = lead.pincode || lead.custom_pincode;
                  }
                  if (!companyInfo.federalState && (lead.state || lead.custom_state)) {
                    companyInfo.federalState = lead.state || lead.custom_state;
                  }
                  if (!companyInfo.country && lead.country) companyInfo.country = lead.country;
                }
              }
            }

            console.log("🔄 Updating formData with companyInfo:", companyInfo);
            updateFormData({ companyInfo: companyInfo });
            console.log("✅ FormData updated. New formData.companyInfo:", formData.companyInfo);
          }

          // Lead'den businesses yükle, ama PDF'den okunan bilgiler öncelikli
          // ÖNEMLİ: Yeni PDF yüklendiğinde eski contact bilgileri korunmamalı
          if (parsedCompanyInfo) {
            // PDF'den bilgi varsa, tamamen yeni business oluştur (eski contact bilgilerini SİL)
            console.log("📄 Creating fresh business from PDF (clearing old contact info)");
            setBusinesses([{
              businessName: parsedCompanyInfo.businessName || "",
              ownerDirector: parsedCompanyInfo.ownerDirector || "",
              ownerTelephone: parsedCompanyInfo.ownerTelephone || "",
              ownerEmail: parsedCompanyInfo.ownerEmail || "",
              differentContact: false,
              contactPerson: "", // Eski contact bilgileri temizlendi
              contactTelephone: "", // Eski contact bilgileri temizlendi
              contactEmail: "", // Eski contact bilgileri temizlendi
              street: parsedCompanyInfo.street || "",
              city: parsedCompanyInfo.city || "",
              postalCode: parsedCompanyInfo.zipCode || "",
              federalState: parsedCompanyInfo.federalState || "",
              country: parsedCompanyInfo.country || "",
            }]);
            
            // PDF işlendikten sonra localStorage'dan sil (bir kere kullanılsın)
            localStorage.removeItem("parsedCompanyInfo");
            console.log("🗑️ parsedCompanyInfo removed from localStorage after use");
          } else if (lead.businesses && Array.isArray(lead.businesses) && lead.businesses.length > 0) {
            // PDF yoksa Lead'den businesses yükle
            setBusinesses(lead.businesses);
          }
        }
      } catch (error) {
        console.error("Error loading company info:", error);
        hasLoadedCompanyInfo.current = false;
      }
    };

    loadCompanyInfo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [updateFormData]);

  const handleCompanyInfoChange = (field: keyof typeof formData.companyInfo, value: string) => {
    updateFormData({
      companyInfo: {
        ...formData.companyInfo,
        [field]: value,
      },
    });
  };

  const handleAddressSelect = (
    address: string,
    details?: { street: string; city: string; country: string; postalCode: string; federalState?: string }
  ) => {
    if (details) {
      const streetValue = details.street || address;
      lastSelectedStreetRef.current = streetValue;
      
      const updates: any = {
        street: streetValue
      };

      if (details.city) updates.city = details.city;
      if (details.country) updates.country = details.country;
      if (details.postalCode) updates.zipCode = details.postalCode;
      if (details.federalState) updates.federalState = details.federalState;

      updateFormData({
        companyInfo: {
          ...formData.companyInfo,
          ...updates
        }
      });

    } else {
      lastSelectedStreetRef.current = address;
      handleCompanyInfoChange("street", address);
    }
  };

  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    // Debug: check formData values
    console.log("📋 Current formData.companyInfo:", formData.companyInfo);
    
    if (!formData.companyInfo.companyName || !formData.companyInfo.vatIdentificationNumber) {
      console.log("❌ Validation failed - companyName:", formData.companyInfo.companyName, "vatNumber:", formData.companyInfo.vatIdentificationNumber);
      alert(t("register.company.fillRequiredFields"));
      return;
    }

    let userEmail = "";
    if (typeof window !== "undefined") {
      const initialData = localStorage.getItem("initialRegistrationData");
      if (initialData) {
        try {
          const parsed = JSON.parse(initialData);
          userEmail = parsed.email || "";
        } catch (error) {
          console.error("Error parsing initial registration data:", error);
        }
      }
      if (!userEmail) {
        const sessionEmail = sessionStorage.getItem("userEmail");
        if (sessionEmail) {
          userEmail = sessionEmail;
        }
      }
      if (!userEmail) {
        const localEmail = localStorage.getItem("userEmail");
        if (localEmail) userEmail = localEmail;
      }
    }

    if (!userEmail) {
      alert(t("register.company.userEmailNotFound"));
      return;
    }

    setSubmitting(true);

    try {
      const cleanCompanyInfo: any = {};
      if (formData.companyInfo.companyName) cleanCompanyInfo.companyName = formData.companyInfo.companyName;
      if (formData.companyInfo.restaurantCount) cleanCompanyInfo.restaurantCount = formData.companyInfo.restaurantCount;
      if (formData.companyInfo.taxIdNumber) cleanCompanyInfo.taxIdNumber = formData.companyInfo.taxIdNumber;
      if (formData.companyInfo.vatIdentificationNumber) cleanCompanyInfo.vatIdentificationNumber = formData.companyInfo.vatIdentificationNumber;

      let streetForLead =
        (lastSelectedStreetRef.current || formData.companyInfo.street || "").trim();
      if (!streetForLead) {
        const streetParts: string[] = [];
        if (formData.companyInfo.city) streetParts.push(formData.companyInfo.city);
        if (formData.companyInfo.zipCode) streetParts.push(formData.companyInfo.zipCode);
        if (formData.companyInfo.country) streetParts.push(formData.companyInfo.country);
        streetForLead = streetParts.join(" ").trim();
      }
      if (streetForLead) cleanCompanyInfo.street = streetForLead;

      if (formData.companyInfo.city) cleanCompanyInfo.city = formData.companyInfo.city;
      if (formData.companyInfo.country) cleanCompanyInfo.country = formData.companyInfo.country;
      if (formData.companyInfo.federalState) cleanCompanyInfo.federalState = formData.companyInfo.federalState;
      if (formData.companyInfo.zipCode) cleanCompanyInfo.zipCode = formData.companyInfo.zipCode;
      
      // Debug: Log what we're sending
      console.log("📤 Submitting company information:");
      console.log("  - Email:", userEmail);
      console.log("  - cleanCompanyInfo:", JSON.stringify(cleanCompanyInfo, null, 2));
      console.log("  - businesses:", JSON.stringify(businesses, null, 2));
      
      // Önce Lead'i kaydet (isCompleted: false - henüz imza bekleniyor)
      const res = await fetch("/api/erp/update-lead", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: userEmail,
          companyInfo: cleanCompanyInfo,
          businesses: businesses,
          documents: {
            isCompleted: false // E-imza bekliyor, henüz tamamlanmadı
          }
        }),
      });

      const data = await res.json();
      console.log("📥 Update lead response:", data);

      if (!res.ok || !data.success) {
        console.error("❌ Update lead failed:", data);
        alert(data.error || t("register.company.updateFailed"));
        setSubmitting(false);
        return;
      }
      
      console.log("✅ Lead updated successfully");
      
      // E-imza token oluştur
      console.log("📝 Creating e-signature token...");
      let tokenRes;
      let tokenData;
      
      try {
        tokenRes = await fetch("/api/e-signature/create-token", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ email: userEmail }),
        });

        tokenData = await tokenRes.json();
        console.log("📥 E-signature token response:", tokenData);
        console.log("📥 Response status:", tokenRes.status);
        console.log("📥 Response ok:", tokenRes.ok);
      } catch (fetchError: any) {
        console.error("❌ Fetch error creating token:", fetchError);
        alert("E-imza token oluşturulurken bir hata oluştu: " + (fetchError.message || "Bilinmeyen hata"));
        setSubmitting(false);
        return;
      }

      if (!tokenRes.ok || !tokenData.success) {
        console.error("❌ E-signature token creation failed:", tokenData);
        console.error("  - Status:", tokenRes.status);
        console.error("  - Error:", tokenData.error);
        console.error("  - Details:", tokenData.details);
        
        // Özel hata mesajları
        let errorMessage = "Kayıt tamamlandı ancak e-imza linki oluşturulamadı.";
        
        if (tokenData.error?.includes("field") || tokenData.error?.includes("custom_esignature")) {
          errorMessage = "⚠️ E-imza field'ları ERPNext'te tanımlı değil!\n\n" +
            "Lütfen şu field'ları ERPNext Lead DocType'ına ekleyin:\n" +
            (tokenData.requiredFields?.join("\n") || 
             "- custom_esignature_token\n" +
             "- custom_esignature_token_expiry\n" +
             "- custom_registration_status");
        } else if (tokenData.error) {
          errorMessage = tokenData.error + (tokenData.details ? "\n\nDetay: " + JSON.stringify(tokenData.details) : "");
        }
        
        alert(errorMessage);
        setSubmitting(false);
        return;
      }

      console.log("✅ E-signature token created:", tokenData.signatureUrl);
      
      // Company info'yu localStorage'a kaydet (validation için)
      try {
        localStorage.setItem("companyInfo", JSON.stringify(cleanCompanyInfo));
        localStorage.setItem("esignatureUrl", tokenData.signatureUrl);
        console.log("✅ Company info and e-signature URL saved to localStorage");
      } catch (e) {
        console.error("❌ Error saving to localStorage:", e);
      }
      
      // parsedCompanyInfo'yu temizle (artık kaydedildi)
      try {
        localStorage.removeItem("parsedCompanyInfo");
        console.log("✅ Cleared parsedCompanyInfo from localStorage");
      } catch (e) {}
      
      // Kullanıcıya e-imza hakkında bilgi ver
      const confirmMessage = t("register.company.registrationPendingSignature") || 
        `Kayıt işleminiz tamamlandı!\n\nSözleşmenizi imzalamanız için size bir e-posta gönderilecektir.\n\nE-imza linkiniz:\n${tokenData.signatureUrl}\n\nBu linki şimdi açmak ister misiniz?`;
      
      const openNow = confirm(confirmMessage);
      
      if (openNow) {
        // E-imza sayfasını yeni sekmede aç
        window.open(tokenData.signatureUrl, "_blank");
      }
      
      // Dashboard'a yönlendir
      console.log("🚀 Redirecting to dashboard...");
      router.push("/dashboard");
      
    } catch (error) {
      console.error("❌ Submit error:", error);
      alert(t("register.company.updateFailed"));
    } finally {
      setSubmitting(false);
    }
  };

  const handleBack = () => {
    goToStep(3); // Üçüncü sayfa: Payment Information
    router.push("/register/payment-information");
  };

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-12 sm:px-6 lg:px-8 relative">
      {/* Language Switcher - Top Right */}
      <div className="absolute top-4 right-4">
        <LanguageSwitcher />
      </div>
      
      <div className="max-w-4xl mx-auto">
        <ProgressBar />
        
        <div className="mb-8 mt-8 ml-10">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">{t("register.company.title")}</h1>
          <p className="text-sm text-gray-600">{t("register.company.subtitle")}</p>
        </div>
        
        <Card className="border-gray-200 shadow-lg">
          <CardContent className="p-8">
            <form className="space-y-8" onSubmit={(e) => e.preventDefault()}>
              <div className="space-y-6">
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="companyName" className="text-sm font-semibold text-gray-700">
                      {t("register.company.companyName")} <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="companyName"
                      placeholder={t("register.company.enterCompanyName")}
                      value={formData.companyInfo.companyName}
                      onChange={(e) => handleCompanyInfoChange("companyName", e.target.value)}
                      className="w-full"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="vatId" className="text-sm font-semibold text-gray-700">
                      {t("register.company.vatNumber")} <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="vatId"
                      placeholder={t("register.company.enterVatNumber")}
                      value={formData.companyInfo.vatIdentificationNumber}
                      onChange={(e) => handleCompanyInfoChange("vatIdentificationNumber", e.target.value)}
                      className="w-full"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="taxIdNumber" className="text-sm font-semibold text-gray-700">
                      {t("register.company.taxId")} <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="taxIdNumber"
                      placeholder={t("register.company.enterTaxId")}
                      value={formData.companyInfo.taxIdNumber}
                      onChange={(e) => handleCompanyInfoChange("taxIdNumber", e.target.value)}
                      className="w-full"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="companyStreet" className="text-sm font-semibold text-gray-700">
                    {t("register.company.street")}
                  </Label>
                  <AddressAutocomplete
                    value={formData.companyInfo.street}
                    onChange={(address, details) => {
                      if (details) {
                        handleAddressSelect(address, details);
                      } else {
                        handleCompanyInfoChange("street", address);
                      }
                    }}
                    placeholder={t("register.company.enterLocation")}
                    className="w-full"
                    required
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="companyCity" className="text-sm font-semibold text-gray-700">
                      {t("register.company.city")}
                    </Label>
                    <AddressAutocomplete
                      value={formData.companyInfo.city}
                      onChange={(address) => handleCompanyInfoChange("city", address)}
                      placeholder={t("register.company.enterCity")}
                      className="w-full"
                      fieldType="city"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="companyCountry" className="text-sm font-semibold text-gray-700">
                      {t("register.company.country")} <span className="text-red-500">*</span>
                    </Label>
                    <AddressAutocomplete
                      value={formData.companyInfo.country}
                      onChange={(address) => {
                        handleCompanyInfoChange("country", address);
                        handleCompanyInfoChange("federalState", "");
                      }}
                      placeholder={t("register.company.enterCountry")}
                      className="w-full"
                      fieldType="country"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="companyState" className="text-sm font-semibold text-gray-700">
                      {t("register.company.federalState")} <span className="text-red-500">*</span>
                    </Label>
                    <AddressAutocomplete
                      value={formData.companyInfo.federalState}
                      onChange={(address) => handleCompanyInfoChange("federalState", address)}
                      placeholder={t("register.company.enterState")}
                      className="w-full"
                      fieldType="state"
                      countryRestriction={formData.companyInfo.country}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="companyPostalCode" className="text-sm font-semibold text-gray-700">
                      {t("register.company.postalCode")}
                    </Label>
                    <AddressAutocomplete
                      value={formData.companyInfo.zipCode}
                      onChange={(address) => handleCompanyInfoChange("zipCode", address)}
                      placeholder={t("register.company.enterPostalCode")}
                      className="w-full"
                      fieldType="postalCode"
                      countryRestriction={formData.companyInfo.country}
                    />
                  </div>
                </div>
                </div>

              {businesses.length > 0 && businesses.map((business, index) => (
                <div key={index} className={`space-y-6 ${index === 0 ? 'border-t pt-6' : 'mt-8'}`}>
                  {index > 0 && (
                     <Card className="border-gray-200 shadow-md">
                      <CardContent className="pt-6 relative">
                         <button
                            type="button"
                            onClick={() => removeBusiness(index)}
                              className="absolute top-4 right-4 text-red-500 hover:text-red-600"
                              aria-label={t("register.company.removeBusiness")}
                            >
                            <Trash2 className="w-5 h-5" />
                          </button>
                           <div className="space-y-6">
                            <h2 className="text-lg font-semibold text-gray-800">{t("register.company.businessInfoNumber").replace("{number}", String(index + 1))}</h2>
                            {renderBusinessForm(index, business, updateBusiness, updateBusinessAddress, companyMainIso, t)}
                           </div>
                      </CardContent>
                    </Card>
                  )}

                  {index === 0 && (
                    <div className="space-y-6">
                      <h2 className="text-lg font-semibold text-gray-800">{t("register.company.businessInfoNumber").replace("{number}", "1")}</h2>
                      {renderBusinessForm(index, business, updateBusiness, updateBusinessAddress, companyMainIso, t)}
                    </div>
                  )}
                </div>
              ))}
            </form>
          </CardContent>
        </Card>

        <div className="mt-8 space-y-4">
          <div className="flex justify-center">
            <button
              type="button"
              onClick={addBusiness}
              className="inline-flex flex-col items-center justify-center px-12 py-4 border-2 border-dashed border-gray-300 rounded-md hover:border-gray-400 transition-colors"
            >
              <span className="mb-2 flex items-center justify-center w-8 h-8 rounded-full bg-[#111827]">
                <Plus className="w-4 h-4 text-white" strokeWidth={3} />
              </span>
              <span className="text-sm font-semibold text-gray-700">{t("register.company.addBusiness")}</span>
            </button>
          </div>

          <div className="flex justify-center gap-4 pt-4">
            <Button
              type="button"
              onClick={handleBack}
              variant="outline"
              className="px-8 h-[50px] text-base font-semibold border-gray-300 text-gray-700 hover:bg-gray-50"
            >
              {t("common.back")}
            </Button>
            <RegisterButton type="button" onClick={handleSubmit} disabled={submitting}>
              {submitting ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  {t("common.loading") || "Yükleniyor..."}
                </>
              ) : (
                t("common.submit")
              )}
            </RegisterButton>
          </div>
        </div>
      </div>
    </div>
  );
}

// Yardımcı render fonksiyonu
function renderBusinessForm(
  index: number, 
  business: any, 
  updateBusiness: any, 
  updateBusinessAddress: any,
  defaultCompanyIso: Country,
  t: (key: string) => string
) {
  const currentCountryIso = getCountryIsoCode(business.country) || defaultCompanyIso;

  return (
    <>
      <div className="space-y-2">
        <Label htmlFor={`businessName-${index}`} className="text-sm font-semibold text-gray-700">
          {t("register.company.businessName")}
        </Label>
        <Input
          id={`businessName-${index}`}
          placeholder={t("register.company.enterBusinessName")}
          value={business.businessName}
          onChange={(e) => updateBusiness(index, "businessName", e.target.value)}
          className="w-full"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor={`ownerDirector-${index}`} className="text-sm font-semibold text-gray-700">
            {t("register.company.ownerDirector")} <span className="text-red-500">*</span>
          </Label>
          <Input
            id={`ownerDirector-${index}`}
            placeholder={t("register.company.enterOwnerName")}
            value={business.ownerDirector}
            onChange={(e) => updateBusiness(index, "ownerDirector", e.target.value)}
            className="w-full"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor={`ownerTelephone-${index}`} className="text-sm font-semibold text-gray-700">
            {t("register.company.phone")} <span className="text-red-500">*</span>
          </Label>
          <PhoneInput
            international
            key={currentCountryIso} 
            defaultCountry={currentCountryIso}
            value={business.ownerTelephone}
            onChange={(value) => updateBusiness(index, "ownerTelephone", value || "")}
            className="phone-input"
            numberInputProps={{
              id: `ownerTelephone-${index}`,
              name: `ownerTelephone-${index}`,
              required: true,
            }}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor={`ownerEmail-${index}`} className="text-sm font-semibold text-gray-700">
          {t("register.company.email")} <span className="text-red-500">*</span>
        </Label>
        <Input
          id={`ownerEmail-${index}`}
          type="email"
          placeholder={t("register.company.enterEmail")}
          value={business.ownerEmail}
          onChange={(e) => updateBusiness(index, "ownerEmail", e.target.value)}
          className="w-full"
          required
        />
      </div>

      <div className="flex items-start space-x-2">
        <Checkbox
          id={`differentContact-${index}`}
          checked={business.differentContact}
          onCheckedChange={(checked) => updateBusiness(index, "differentContact", checked === true)}
          className="mt-1"
        />
        <Label
          htmlFor={`differentContact-${index}`}
          className="text-sm font-normal text-gray-700 cursor-pointer leading-relaxed"
        >
          {t("register.company.differentContact")}
        </Label>
      </div>

      {business.differentContact && (
        <div className="space-y-6 pl-6 border-l-2 border-gray-200">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor={`contactPerson-${index}`} className="text-sm font-semibold text-gray-700">
                {t("register.company.contactPerson")} <span className="text-red-500">*</span>
              </Label>
              <Input
                id={`contactPerson-${index}`}
                placeholder={t("register.company.enterContactPerson")}
                value={business.contactPerson}
                onChange={(e) => updateBusiness(index, "contactPerson", e.target.value)}
                className="w-full"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor={`contactTelephone-${index}`} className="text-sm font-semibold text-gray-700">
                {t("register.company.phone")} <span className="text-red-500">*</span>
              </Label>
              <PhoneInput
                international
                key={currentCountryIso}
                defaultCountry={currentCountryIso}
                value={business.contactTelephone}
                onChange={(value) => updateBusiness(index, "contactTelephone", value || "")}
                className="phone-input"
                numberInputProps={{
                  id: `contactTelephone-${index}`,
                  name: `contactTelephone-${index}`,
                  required: true,
                }}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor={`contactEmail-${index}`} className="text-sm font-semibold text-gray-700">
              {t("register.company.email")} <span className="text-red-500">*</span>
            </Label>
            <Input
              id={`contactEmail-${index}`}
              type="email"
              placeholder={t("register.company.enterEmail")}
              value={business.contactEmail}
              onChange={(e) => updateBusiness(index, "contactEmail", e.target.value)}
              className="w-full"
              required
            />
          </div>
        </div>
      )}

      <div className="space-y-6 border-t pt-6">
        <h2 className="text-lg font-semibold text-gray-800">{t("register.company.businessAddressInfo").replace("{number}", String(index + 1))}</h2>

        <div className="space-y-2">
          <Label htmlFor={`businessStreet-${index}`} className="text-sm font-semibold text-gray-700">
            {t("register.company.street")}
          </Label>
          <AddressAutocomplete
            value={business.street}
            onChange={(address, details) => {
              if (details) {
                updateBusinessAddress(index, {
                    street: details.street || address,
                    city: details.city,
                    postalCode: details.postalCode,
                    country: details.country,
                    federalState: details.federalState
                });
              } else {
                updateBusiness(index, "street", address);
              }
            }}
            placeholder={t("register.company.enterLocation")}
            className="w-full"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor={`businessCity-${index}`} className="text-sm font-semibold text-gray-700">
              {t("register.company.city")}
            </Label>
            <AddressAutocomplete
              value={business.city}
              onChange={(address) => updateBusiness(index, "city", address)}
              placeholder={t("register.company.enterCity")}
              className="w-full"
              fieldType="city"
              countryRestriction={business.country}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor={`businessPostalCode-${index}`} className="text-sm font-semibold text-gray-700">
              {t("register.company.postalCode")}
            </Label>
            <AddressAutocomplete
              value={business.postalCode}
              onChange={(address) => updateBusiness(index, "postalCode", address)}
              placeholder={t("register.company.enterPostalCode")}
              className="w-full"
              fieldType="postalCode"
              countryRestriction={business.country}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor={`businessState-${index}`} className="text-sm font-semibold text-gray-700">
              {t("register.company.federalState")} <span className="text-red-500">*</span>
            </Label>
            <AddressAutocomplete
              value={business.federalState}
              onChange={(address) => updateBusiness(index, "federalState", address)}
              placeholder={t("register.company.enterState")}
              className="w-full"
              fieldType="state"
              countryRestriction={business.country}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor={`businessCountry-${index}`} className="text-sm font-semibold text-gray-700">
              {t("register.company.country")} <span className="text-red-500">*</span>
            </Label>
            <AddressAutocomplete
              value={business.country}
              onChange={(address) => {
                updateBusiness(index, "country", address);
                updateBusiness(index, "federalState", "");
              }}
              placeholder={t("register.company.enterCountry")}
              className="w-full"
              fieldType="country"
            />
          </div>
        </div>
      </div>
    </>
  );
}