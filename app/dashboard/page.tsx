"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check if user is logged in
    if (typeof window !== "undefined") {
      const storedUser = sessionStorage.getItem("user");
      const storedEmail = sessionStorage.getItem("userEmail");

      if (!storedUser || !storedEmail) {
        // Not logged in, redirect to login
        router.push("/");
        return;
      }

      try {
        setUser(JSON.parse(storedUser));
        setUserEmail(storedEmail);
      } catch (error) {
        console.error("Error parsing user data:", error);
        router.push("/");
      }
    }
    setLoading(false);
  }, [router]);

  const handleLogout = () => {
    if (typeof window !== "undefined") {
      sessionStorage.removeItem("user");
      sessionStorage.removeItem("userEmail");
      localStorage.removeItem("rememberMe");
      localStorage.removeItem("userEmail");
    }
    router.push("/");
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-gray-600">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-12 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        <Card className="border-gray-200 shadow-lg">
          <CardHeader className="space-y-1">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-[30px] leading-[36px] font-bold text-[#111827] tracking-[0px]">
                  Dashboard
                </CardTitle>
                <p className="text-sm text-gray-600 mt-2">Welcome back!</p>
              </div>
              <Button
                onClick={handleLogout}
                variant="outline"
                className="text-sm font-semibold border-gray-300 text-gray-700 hover:bg-gray-50"
              >
                Logout
              </Button>
            </div>
          </CardHeader>

          <CardContent>
            <div className="space-y-6">
              {/* User Info */}
              <div className="bg-gray-50 p-6 rounded-lg">
                <h2 className="text-lg font-semibold text-gray-800 mb-4">User Information</h2>
                <div className="space-y-2">
                  <div>
                    <span className="text-sm font-medium text-gray-600">Name:</span>
                    <span className="ml-2 text-sm text-gray-900">{user || "N/A"}</span>
                  </div>
                  <div>
                    <span className="text-sm font-medium text-gray-600">Email:</span>
                    <span className="ml-2 text-sm text-gray-900">{userEmail || "N/A"}</span>
                  </div>
                </div>
              </div>

              {/* Welcome Message */}
              <div className="bg-green-50 border border-green-200 p-6 rounded-lg">
                <p className="text-green-800">
                  <strong>Login successful!</strong> You have successfully logged in to the system.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
