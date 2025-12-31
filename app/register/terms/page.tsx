"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Eye, EyeOff } from "lucide-react";

function RegisterTermsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [formData, setFormData] = useState<any>(null);
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [passwordMatch, setPasswordMatch] = useState(true);

  useEffect(() => {
    const dataParam = searchParams.get("data");
    if (dataParam) {
      try {
        setFormData(JSON.parse(decodeURIComponent(dataParam)));
      } catch (error) {
        console.error("Error parsing form data:", error);
        router.push("/register");
      }
    } else {
      router.push("/register");
    }
  }, [searchParams, router]);

  useEffect(() => {
    if (formData?.password && confirmPassword) {
      setPasswordMatch(formData.password === confirmPassword);
    }
  }, [confirmPassword, formData]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!passwordMatch) {
      return;
    }

    if (!agreedToTerms) {
      return;
    }

    // Handle final registration
    // Navigate to success page or login
    router.push("/");
  };

  if (!formData) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div>Loading...</div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-12 sm:px-6 lg:px-8">
      <div className="w-full max-w-2xl">
        <Card className="border-gray-200 shadow-lg">
          <CardHeader className="space-y-1">
            <CardTitle className="text-[30px] leading-[36px] font-bold text-[#111827] tracking-[0px]">
              Restaurant Registration
            </CardTitle>
          </CardHeader>

          <CardContent>
            <form className="space-y-6" onSubmit={handleSubmit}>
              {/* Password and Confirm Password */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="password" className="text-sm font-semibold text-gray-700">
                    Password
                  </Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      value={formData.password}
                      readOnly
                      className="w-full pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                    >
                      {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirmPassword" className="text-sm font-semibold text-gray-700">
                    Confirm Password
                  </Label>
                  <div className="relative">
                    <Input
                      id="confirmPassword"
                      type={showConfirmPassword ? "text" : "password"}
                      placeholder="Enter"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className={`w-full pr-10 ${!passwordMatch && confirmPassword ? "border-red-500" : ""}`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                    >
                      {showConfirmPassword ? (
                        <EyeOff className="h-5 w-5" />
                      ) : (
                        <Eye className="h-5 w-5" />
                      )}
                    </button>
                  </div>
                  {!passwordMatch && confirmPassword && (
                    <p className="text-xs text-red-500">Passwords do not match</p>
                  )}
                </div>
              </div>

              {/* Terms of Use */}
              <div className="space-y-3">
                <Label className="text-sm font-semibold text-gray-700">
                  Term of Use <span className="text-red-500">*</span>
                </Label>
                <div className="border border-gray-300 rounded-md p-4 max-h-60 overflow-y-auto bg-gray-50">
                  <div className="text-xs text-gray-600 leading-relaxed space-y-2">
                    <h3 className="font-semibold text-gray-800 mb-2">
                      General Terms and Conditions of CC Culinary Collective GmbH
                    </h3>
                    <p>
                      <strong>a.</strong> CC Culinary Collective GmbH is a platform that connects food
                      service establishments. The goal is to increase partner revenues by opening
                      shop-in-shop and cloud kitchen concept branches within stores and to reduce the
                      costs of restaurants offering various services.
                    </p>
                    <p>
                      <strong>b.</strong> No registration or membership fee is charged for membership
                      on the CC platform.
                    </p>
                    <p>
                      <strong>c.</strong> The agreement is concluded for an indefinite period.
                    </p>
                    <p>
                      <strong>d.</strong> Both parties may terminate the agreement with four (4)
                      weeks&apos; notice.
                    </p>
                    <p>
                      <strong>e.</strong> Both contracting parties may transfer their rights and
                      obligations under this agreement to third parties with the consent of the other
                      party.
                    </p>
                    <p>
                      <strong>f.</strong> CC Culinary Collective GmbH is entitled to have individual
                      services performed by third parties in its own name.
                    </p>
                    <p>
                      <strong>g.</strong> During the term of the agreement and for two (2) years after
                      its termination, the restaurant is prohibited from competing with the platform.
                      This includes, in particular, the development or operation of comparable concepts
                      as well as direct or indirect participation in competing companies.
                    </p>
                    <p>
                      <strong>h.</strong> CC Culinary Collective GmbH is liable only in cases of intent
                      or gross negligence. Liability for indirect or consequential damages is excluded.
                      Events of force majeure do not constitute a breach of contract.
                    </p>
                    <p>
                      <strong>i.</strong> Amendments or additions to this agreement must be in writing.
                    </p>
                    <p>
                      <strong>j.</strong> Should individual provisions of this agreement be wholly or
                      partially invalid, the validity of the remaining provisions shall remain
                      unaffected.
                    </p>
                  </div>
                </div>

                {/* Agreement Checkbox */}
                <div className="flex items-start space-x-2">
                  <Checkbox
                    id="terms"
                    checked={agreedToTerms}
                    onCheckedChange={(checked) => setAgreedToTerms(checked === true)}
                    className="mt-1"
                  />
                  <Label
                    htmlFor="terms"
                    className="text-sm font-normal text-gray-700 cursor-pointer leading-relaxed"
                  >
                    I have read and agree to the terms of use.
                  </Label>
                </div>
              </div>

              {/* Register Button */}
              <Button
                type="submit"
                disabled={!passwordMatch || !agreedToTerms || !confirmPassword}
                className="w-full h-11 text-base font-semibold bg-green-600 hover:bg-green-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Register
              </Button>

              {/* Login Link */}
              <div className="text-center text-sm text-gray-600">
                Do you have an account?{" "}
                <Link
                  href="/"
                  className="font-medium text-orange-600 hover:text-orange-500 transition-colors"
                >
                  Login here.
                </Link>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function RegisterTermsPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center">
        <div>Loading...</div>
      </div>
    }>
      <RegisterTermsContent />
    </Suspense>
  );
}
