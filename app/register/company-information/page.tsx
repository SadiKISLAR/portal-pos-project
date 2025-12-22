"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useRegistration } from "@/contexts/RegistrationContext";
import ProgressBar from "@/components/ProgressBar";
import AddressAutocomplete from "@/components/AddressAutocomplete";
import RegisterButton from "@/components/RegisterButton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";

export default function CompanyInformationPage() {
  const router = useRouter();
  const { formData, updateFormData, goToStep } = useRegistration();
  const [restaurantCount, setRestaurantCount] = useState(
    formData.companyInfo.restaurantCount || "1"
  );

  useEffect(() => {
    // Ensure we're on step 1
    if (formData.currentStep !== 1) {
      goToStep(1);
    }

    // Initialize restaurants array based on restaurant count
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
  }, [restaurantCount]);

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
    details?: { street: string; city: string; country: string; postalCode: string }
  ) => {
    if (details) {
      handleCompanyInfoChange("street", details.street || address);
      if (details.city) handleCompanyInfoChange("city", details.city);
      if (details.country) handleCompanyInfoChange("country", details.country);
    } else {
      handleCompanyInfoChange("street", address);
    }
  };

  const handleRestaurantAddressSelect = (
    index: number,
    address: string,
    details?: { street: string; city: string; country: string; postalCode: string }
  ) => {
    if (details) {
      handleRestaurantChange(index, "street", details.street || address);
      if (details.city) handleRestaurantChange(index, "city", details.city);
      if (details.country) handleRestaurantChange(index, "country", details.country);
    } else {
      handleRestaurantChange(index, "street", address);
    }
  };

  const handleRestaurantChange = (
    index: number,
    field: keyof (typeof formData.restaurants)[0],
    value: string
  ) => {
    const updatedRestaurants = [...formData.restaurants];
    updatedRestaurants[index] = {
      ...updatedRestaurants[index],
      [field]: value,
    };
    updateFormData({ restaurants: updatedRestaurants });
  };

  const handleRestaurantCountChange = (value: string) => {
    setRestaurantCount(value);
    handleCompanyInfoChange("restaurantCount", value);
    const count = parseInt(value) || 1;
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
  };

  const handleNext = () => {
    // Basic validation - can be enhanced
    if (!formData.companyInfo.companyName || !formData.companyInfo.vatIdentificationNumber) {
      alert("Please fill in required fields");
      return;
    }

    // Navigate to next step
    goToStep(2);
    router.push("/register/company-representative");
  };

  const countries = ["Germany", "Turkey", "United Kingdom", "United States"];
  const states: Record<string, string[]> = {
    Germany: ["Bavaria", "Berlin", "Hamburg", "North Rhine-Westphalia"],
    Turkey: ["Istanbul", "Ankara", "Izmir", "Antalya"],
    "United Kingdom": ["England", "Scotland", "Wales", "Northern Ireland"],
    "United States": ["California", "New York", "Texas", "Florida"],
  };

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-12 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        <Card className="border-gray-200 shadow-lg">
          <CardContent className="p-8">
            {/* Progress Bar */}
            <ProgressBar />

            {/* Section Title */}
            <div className="mb-8">
              <h1 className="text-2xl font-bold text-gray-900 mb-2">Company Information</h1>
              <p className="text-sm text-gray-600">Please provide your company details to get started</p>
            </div>

            <form className="space-y-8" onSubmit={(e) => e.preventDefault()}>
              {/* Company Details Section */}
              <div className="space-y-6">
                <h2 className="text-lg font-semibold text-gray-800">Company Details</h2>

                {/* First Row: Company Name and Restaurant Count */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Company Name */}
                  <div className="space-y-2">
                    <Label htmlFor="companyName" className="text-sm font-semibold text-gray-700">
                      Company Name <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="companyName"
                      placeholder="Enter Company Name"
                      value={formData.companyInfo.companyName}
                      onChange={(e) => handleCompanyInfoChange("companyName", e.target.value)}
                      className="w-full"
                    />
                  </div>

                  {/* Restaurant Count */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Label htmlFor="restaurantCount" className="text-sm font-semibold text-gray-700">
                        Restaurant Count <span className="text-red-500">*</span>
                      </Label>
                    </div>
                    <select
                      id="restaurantCount"
                      value={restaurantCount}
                      onChange={(e) => handleRestaurantCountChange(e.target.value)}
                      className="w-full h-10 px-3 rounded-md border border-gray-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                    >
                      {[1, 2, 3, 4, 5].map((num) => (
                        <option key={num} value={num.toString()}>
                          {num}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Second Row: Tax ID Number and VAT Identification Number */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Tax ID Number */}
                  <div className="space-y-2">
                    <Label htmlFor="taxIdNumber" className="text-sm font-semibold text-gray-700">
                      Tax ID Number <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="taxIdNumber"
                      placeholder="Enter Tax ID Number"
                      value={formData.companyInfo.taxIdNumber}
                      onChange={(e) => handleCompanyInfoChange("taxIdNumber", e.target.value)}
                      className="w-full"
                    />
                  </div>

                  {/* VAT Identification Number */}
                  <div className="space-y-2">
                    <Label htmlFor="vatId" className="text-sm font-semibold text-gray-700">
                      VAT Identification Number <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="vatId"
                      placeholder="e.g. DE123456789"
                      value={formData.companyInfo.vatIdentificationNumber}
                      onChange={(e) => handleCompanyInfoChange("vatIdentificationNumber", e.target.value)}
                      className="w-full"
                    />
                  </div>
                </div>

                {/* Company Address */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Label htmlFor="companyStreet" className="text-sm font-semibold text-gray-700">
                        Street and House number <span className="text-red-500">*</span>
                      </Label>
                    </div>
                    <AddressAutocomplete
                      value={formData.companyInfo.street}
                      onChange={handleAddressSelect}
                      placeholder="Enter Location"
                      className="w-full"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="companyCity" className="text-sm font-semibold text-gray-700">
                      City <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="companyCity"
                      placeholder="Enter City"
                      value={formData.companyInfo.city}
                      onChange={(e) => handleCompanyInfoChange("city", e.target.value)}
                      className="w-full"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="companyCountry" className="text-sm font-semibold text-gray-700">
                      Country <span className="text-red-500">*</span>
                    </Label>
                    <select
                      id="companyCountry"
                      value={formData.companyInfo.country}
                      onChange={(e) => {
                        handleCompanyInfoChange("country", e.target.value);
                        handleCompanyInfoChange("federalState", ""); // Reset state when country changes
                      }}
                      className="w-full h-10 px-3 rounded-md border border-gray-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                    >
                      <option value="">Select Country</option>
                      {countries.map((country) => (
                        <option key={country} value={country}>
                          {country}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="companyState" className="text-sm font-semibold text-gray-700">
                      Federal State <span className="text-red-500">*</span>
                    </Label>
                    <select
                      id="companyState"
                      value={formData.companyInfo.federalState}
                      onChange={(e) => handleCompanyInfoChange("federalState", e.target.value)}
                      disabled={!formData.companyInfo.country}
                      className="w-full h-10 px-3 rounded-md border border-gray-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-green-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                    >
                      <option value="">Select State</option>
                      {formData.companyInfo.country &&
                        states[formData.companyInfo.country]?.map((state) => (
                          <option key={state} value={state}>
                            {state}
                          </option>
                        ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Restaurant Addresses */}
              {formData.restaurants.map((restaurant, index) => (
                <div key={index} className="space-y-6 border-t pt-6">
                  <h2 className="text-lg font-semibold text-gray-800">
                    Restaurant {index + 1} Address Information
                  </h2>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Label
                          htmlFor={`restaurantStreet-${index}`}
                          className="text-sm font-semibold text-gray-700"
                        >
                          Street and House number <span className="text-red-500">*</span>
                        </Label>
                      </div>
                      <AddressAutocomplete
                        value={restaurant.street}
                        onChange={(address, details) => handleRestaurantAddressSelect(index, address, details)}
                        placeholder="Enter Location"
                        className="w-full"
                        required
                      />
                    </div>

                    <div className="space-y-2">
                      <Label
                        htmlFor={`restaurantName-${index}`}
                        className="text-sm font-semibold text-gray-700"
                      >
                        Restaurant Name
                      </Label>
                      <Input
                        id={`restaurantName-${index}`}
                        placeholder="Enter Restaurant Name"
                        value={restaurant.restaurantName}
                        onChange={(e) => handleRestaurantChange(index, "restaurantName", e.target.value)}
                        className="w-full"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label
                        htmlFor={`restaurantCity-${index}`}
                        className="text-sm font-semibold text-gray-700"
                      >
                        City <span className="text-red-500">*</span>
                      </Label>
                      <Input
                        id={`restaurantCity-${index}`}
                        placeholder="Enter City"
                        value={restaurant.city}
                        onChange={(e) => handleRestaurantChange(index, "city", e.target.value)}
                        className="w-full"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label
                        htmlFor={`restaurantCountry-${index}`}
                        className="text-sm font-semibold text-gray-700"
                      >
                        Country <span className="text-red-500">*</span>
                      </Label>
                      <select
                        id={`restaurantCountry-${index}`}
                        value={restaurant.country}
                        onChange={(e) => {
                          handleRestaurantChange(index, "country", e.target.value);
                          handleRestaurantChange(index, "federalState", "");
                        }}
                        className="w-full h-10 px-3 rounded-md border border-gray-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                      >
                        <option value="">Select Country</option>
                        {countries.map((country) => (
                          <option key={country} value={country}>
                            {country}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-2">
                      <Label
                        htmlFor={`restaurantState-${index}`}
                        className="text-sm font-semibold text-gray-700"
                      >
                        Federal State <span className="text-red-500">*</span>
                      </Label>
                      <select
                        id={`restaurantState-${index}`}
                        value={restaurant.federalState}
                        onChange={(e) => handleRestaurantChange(index, "federalState", e.target.value)}
                        disabled={!restaurant.country}
                        className="w-full h-10 px-3 rounded-md border border-gray-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-green-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                      >
                        <option value="">Select State</option>
                        {restaurant.country &&
                          states[restaurant.country]?.map((state) => (
                            <option key={state} value={state}>
                              {state}
                            </option>
                          ))}
                      </select>
                    </div>
                  </div>
                </div>
              ))}

              {/* Next Button */}
              <div className="flex justify-center pt-6 border-t">
                <RegisterButton type="button" onClick={handleNext}>
                  Next
                </RegisterButton>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
