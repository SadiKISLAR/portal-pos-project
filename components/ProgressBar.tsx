"use client";

import React from "react";
import { useRegistration } from "@/contexts/RegistrationContext";
import { Check } from "lucide-react";

const steps = [
  { number: 1, label: "COMPANY INFORMATION" },
  { number: 2, label: "COMPANY REPRESENTATIVE" },
  { number: 3, label: "PAYMENT INFORMATION" },
  { number: 4, label: "REGISTRATION DOCUMENTS" },
];

export default function ProgressBar() {
  const { formData } = useRegistration();
  const currentStep = formData.currentStep;

  return (
    <div className="w-full mb-8">
      {/* Labels Row */}
      <div className="flex items-start pb-0 mb-4">
        {steps.map((step) => (
          <div key={`label-${step.number}`} className="flex-1">
            <div className="text-sm font-bold text-gray-900 uppercase w-full">
              {step.label}
            </div>
          </div>
        ))}
      </div>

      {/* Circles and Lines Row */}
      <div className="flex items-center pb-0">
        {steps.map((step, index) => {
          const isActive = currentStep === step.number;
          const isCompleted = currentStep > step.number;

          return (
            <React.Fragment key={step.number}>
              <div className="flex flex-col items-center flex-1 relative">
                {/* Circle or Checkmark */}
                <div
                  className="rounded-full flex items-center justify-center transition-all relative z-10"
                  style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '20px',
                    backgroundColor: isCompleted ? '#39A845' : '#F4A023',
                    opacity: isCompleted || isActive ? 1 : 0.3,
                  }}
                >
                  {isCompleted ? (
                    <Check className="w-6 h-6 text-white" strokeWidth={3} />
                  ) : (
                    <span className="text-white font-bold text-sm">{step.number}</span>
                  )}
                </div>
              </div>

              {/* Aradaki Çizgi */}
              {index !== steps.length - 1 && (
                <div 
                  className="flex-auto border-t-2 transition-colors"
                  style={{
                    borderColor: isCompleted ? '#39A845' : '#F4A023',
                    opacity: isCompleted ? 1 : (isActive ? 1 : 0.3),
                  }}
                >
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}
