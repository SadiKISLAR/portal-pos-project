"use client";

import { useState, useEffect } from "react";
import PlacesAutocomplete, {
  geocodeByAddress,
  getLatLng,
} from "react-places-autocomplete";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface AddressAutocompleteProps {
  value: string;
  onChange: (address: string, details?: {
    street: string;
    city: string;
    country: string;
    postalCode: string;
    federalState?: string;
  }) => void;
  placeholder?: string;
  className?: string;
  required?: boolean;
  fieldType?: "address" | "city" | "country" | "state" | "postalCode";
  countryRestriction?: string; // For state and postal code autocomplete
}

export default function AddressAutocomplete({
  value,
  onChange,
  placeholder = "Enter Location",
  className,
  required = false,
  fieldType = "address",
  countryRestriction,
}: AddressAutocompleteProps) {
  const [address, setAddress] = useState(value);

  // Update local state when value prop changes
  useEffect(() => {
    setAddress(value);
  }, [value]);

  const handleSelect = async (selectedAddress: string) => {
    setAddress(selectedAddress);

    try {
      const results = await geocodeByAddress(selectedAddress);
      const latLng = await getLatLng(results[0]);
      
      // Parse address components
      const addressComponents = results[0].address_components;
      
      let street = "";
      let city = "";
      let country = "";
      let postalCode = "";
      let federalState = "";

      addressComponents.forEach((component) => {
        const types = component.types;

        if (types.includes("street_number") || types.includes("route")) {
          street += component.long_name + " ";
        }
        if (types.includes("locality")) {
          city = component.long_name;
        }
        if (types.includes("administrative_area_level_1")) {
          federalState = component.long_name;
        }
        if (types.includes("country")) {
          country = component.long_name;
        }
        if (types.includes("postal_code")) {
          postalCode = component.long_name;
        }
      });

      // For specific field types, return only the relevant value
      if (fieldType === "city") {
        onChange(city || selectedAddress);
      } else if (fieldType === "country") {
        onChange(country || selectedAddress);
      } else if (fieldType === "state") {
        onChange(federalState || selectedAddress);
      } else if (fieldType === "postalCode") {
        onChange(postalCode || selectedAddress);
      } else {
        onChange(selectedAddress, {
          street: street.trim(),
          city,
          country,
          postalCode,
          federalState,
        });
      }
    } catch (error) {
      console.error("Error fetching address details:", error);
      onChange(selectedAddress);
    }
  };

  return (
    <PlacesAutocomplete
      value={address}
      onChange={setAddress}
      onSelect={handleSelect}
      searchOptions={{
        ...(fieldType === "city" && { types: ["(cities)"] }),
        ...(fieldType === "country" && { types: ["(regions)"] }),
        ...(fieldType === "state" && { 
          types: ["(regions)"],
          ...(countryRestriction && { componentRestrictions: { country: countryRestriction } })
        }),
        ...(fieldType === "postalCode" && { 
          types: ["postal_code"],
          ...(countryRestriction && { componentRestrictions: { country: countryRestriction } })
        }),
        ...(fieldType === "address" && { types: ["address"] }),
      }}
    >
      {({ getInputProps, suggestions, getSuggestionItemProps, loading }) => (
        <div className="relative">
          <Input
            {...getInputProps({
              placeholder,
              className: cn("w-full", className),
              required,
            })}
          />
          <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-auto">
            {loading && (
              <div className="p-3 text-sm text-gray-500">Loading...</div>
            )}
            {suggestions.map((suggestion) => {
              const className = suggestion.active
                ? "bg-orange-100 p-3 cursor-pointer"
                : "bg-white p-3 cursor-pointer hover:bg-gray-50";
              return (
                <div
                  {...getSuggestionItemProps(suggestion, { className })}
                  key={suggestion.placeId}
                >
                  <span className="text-sm text-gray-700">
                    {suggestion.description}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </PlacesAutocomplete>
  );
}
