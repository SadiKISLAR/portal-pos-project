"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Login failed");
      }

      // Başarılı giriş
      if (rememberMe) {
        // Remember me seçildiyse localStorage'a kaydet
        localStorage.setItem("rememberMe", "true");
        localStorage.setItem("userEmail", email);
      } else {
        localStorage.removeItem("rememberMe");
        localStorage.removeItem("userEmail");
      }

      // Session storage'a kullanıcı bilgisini kaydet
      sessionStorage.setItem("user", JSON.stringify(data.user));
      sessionStorage.setItem("userEmail", data.email);

      // Başarılı giriş sonrası Lead kontrolü yap
      try {
        const leadCheckResponse = await fetch("/api/erp/check-lead", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ email: data.email }),
        });

        const leadCheckData = await leadCheckResponse.json();

        // Eğer Lead yoksa, company-information sayfasına yönlendir
        if (!leadCheckData.hasLead) {
          router.push("/register/company-information");
          return;
        }

          // Lead varsa ama registration tamamlanmamışsa, registration sayfalarına yönlendir
          if (!leadCheckData.isRegistrationCompleted) {
            // Hangi adımda kaldığını belirle
            const lead = leadCheckData.lead;
            let redirectPath = "/register/company-information"; // Default: step 1
            
            // Services seçilmiş mi kontrol et (Step 2)
            if (lead.custom_selected_services) {
              try {
                const services = JSON.parse(lead.custom_selected_services);
                if (Array.isArray(services) && services.length > 0) {
                  redirectPath = "/register/payment-information"; // Step 3
                }
              } catch (e) {
                // JSON parse hatası, services yok demektir
              }
            }
            
            // Payment bilgileri var mı kontrol et (Step 3)
            if (lead.custom_account_holder) {
              redirectPath = "/register/registration-documents"; // Step 4
            }
            
            // Documents bilgileri var mı kontrol et (Step 4)
            if (lead.custom_type_of_company && lead.custom_registration_status !== "Completed") {
              redirectPath = "/register/registration-documents"; // Step 4 - zaten burada
            }
            
            // Eğer registration status "Completed" ise, dashboard'a git
            if (lead.custom_registration_status === "Completed") {
              router.push("/dashboard");
              return;
            }
            
            router.push(redirectPath);
            return;
          }

          // Registration tamamlanmışsa dashboard'a yönlendir
        router.push("/dashboard");
      } catch (leadCheckError) {
        console.error("Error checking lead:", leadCheckError);
        // Lead kontrolü başarısız olursa, güvenli tarafta kalıp company-information'a yönlendir
        router.push("/register/company-information");
      }
    } catch (err: any) {
      setError(err.message || "Giriş yapılırken bir hata oluştu");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-12 sm:px-6 lg:px-8">
      <div className="w-full max-w-md">
        <Card className="border-gray-200 shadow-lg">
          <CardHeader className="space-y-1">
            <CardTitle className="text-[30px] leading-[36px] font-bold text-[#111827] tracking-[0px]">
              Restaurant Registration
            </CardTitle>
            <CardDescription className="text-sm text-gray-600 mt-2">
              Please Login to your account.
            </CardDescription>
          </CardHeader>

          <CardContent>
            <form className="space-y-6" onSubmit={handleSubmit}>
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
              {error}
            </div>
          )}

          <div className="space-y-5">
            {/* Email Input */}
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-semibold text-gray-700">
                Email Address
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="Enter"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={loading}
                className="w-full"
              />
            </div>

            {/* Password Input */}
            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-semibold text-gray-700">
                Password
              </Label>
              <Input
                id="password"
                type="password"
                placeholder="Enter"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={loading}
                className="w-full"
              />
            </div>
          </div>

          {/* Remember Me and Forgot Password */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="remember"
                checked={rememberMe}
                onCheckedChange={(checked) => setRememberMe(checked === true)}
              />
              <Label
                htmlFor="remember"
                className="text-sm font-normal text-gray-700 cursor-pointer"
              >
                Remember me
              </Label>
            </div>
            <Link
              href="/forgot-password"
              className="text-sm font-medium text-orange-600 hover:text-orange-500 transition-colors"
            >
              Forgot Password?
            </Link>
          </div>

          {/* Login Button */}
          <Button
            type="submit"
            disabled={loading}
            className="w-full h-11 text-base font-semibold bg-green-600 hover:bg-green-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Logging in..." : "Login"}
          </Button>

              {/* Register Link */}
              <div className="text-center text-sm text-gray-600">
                Don&apos;t have an account?{" "}
                <Link
                  href="/register"
                  className="font-medium text-orange-600 hover:text-orange-500 transition-colors"
                >
                  Register here.
                </Link>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}