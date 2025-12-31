"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useRegistration } from "@/contexts/RegistrationContext";
import ProgressBar from "@/components/ProgressBar";
import RegisterButton from "@/components/RegisterButton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface FileWithPreview extends File {
  preview?: string;
}

interface CompanyType {
  id: string;
  name: string;
  description: string;
  isActive: boolean;
}

interface RequiredDocument {
  id: string;
  documentName: string;
  documentType: string;
  isRequired: boolean;
  maxFiles: number;
  allowedFileTypes: string;
  isDateField: boolean;
  dateFieldLabel: string;
}

interface DocumentData {
  files?: FileWithPreview[];
  date?: string;
}

export default function RegistrationDocumentsPage() {
  const router = useRouter();
  const { formData, updateFormData, goToStep } = useRegistration();
  const [companyTypes, setCompanyTypes] = useState<CompanyType[]>([]);
  const [selectedCompanyType, setSelectedCompanyType] = useState("");
  const [requiredDocuments, setRequiredDocuments] = useState<RequiredDocument[]>([]);
  const [documentData, setDocumentData] = useState<Record<string, DocumentData>>({});
  const [loadingCompanyTypes, setLoadingCompanyTypes] = useState(false);
  const [loadingDocuments, setLoadingDocuments] = useState(false);
  const [error, setError] = useState("");

  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const hasLoadedCompanyTypes = useRef(false);

  // Company type'ları ERPNext'ten çek
  const fetchCompanyTypes = useCallback(async () => {
    if (hasLoadedCompanyTypes.current) return;
    
    setLoadingCompanyTypes(true);
    setError("");
    
    try {
      const res = await fetch("/api/erp/get-company-types");
      const data = await res.json();

      if (data.success && data.companyTypes) {
        setCompanyTypes(data.companyTypes);
        hasLoadedCompanyTypes.current = true;
      } else {
        setError(data.error || "Failed to load company types");
      }
    } catch (error: any) {
      console.error("Error fetching company types:", error);
      setError("Failed to load company types. Please try again.");
    } finally {
      setLoadingCompanyTypes(false);
    }
  }, []);

  // Seçilen company type için gerekli belgeleri çek
  const fetchRequiredDocuments = useCallback(async (companyTypeName: string) => {
    if (!companyTypeName) {
      setRequiredDocuments([]);
      setDocumentData({});
      return;
    }

    setLoadingDocuments(true);
    setError("");

    try {
      const res = await fetch(`/api/erp/get-required-documents?companyType=${encodeURIComponent(companyTypeName)}`);
      const data = await res.json();

      if (data.success && data.requiredDocuments) {
        setRequiredDocuments(data.requiredDocuments);
        
        // Her belge için boş state oluştur
        const initialDocumentData: Record<string, DocumentData> = {};
        data.requiredDocuments.forEach((doc: RequiredDocument) => {
          if (doc.isDateField) {
            initialDocumentData[doc.id] = { date: "" };
          } else {
            initialDocumentData[doc.id] = { files: [] };
          }
        });
        setDocumentData(initialDocumentData);
        
      } else {
        setError(data.error || "Failed to load required documents");
        setRequiredDocuments([]);
      }
    } catch (error: any) {
      console.error("Error fetching required documents:", error);
      setError("Failed to load required documents. Please try again.");
      setRequiredDocuments([]);
    } finally {
      setLoadingDocuments(false);
    }
  }, []);

  // Company type değiştiğinde belgeleri çek
  useEffect(() => {
    if (selectedCompanyType) {
      fetchRequiredDocuments(selectedCompanyType);
    } else {
      setRequiredDocuments([]);
      setDocumentData({});
    }
  }, [selectedCompanyType, fetchRequiredDocuments]);

  // Mevcut Lead'den company type'ı yükle
  const loadDocumentsInfo = useCallback(async () => {
    let userEmail = "";
    if (typeof window !== "undefined") {
      const sessionEmail = sessionStorage.getItem("userEmail");
      if (sessionEmail) {
        userEmail = sessionEmail;
      } else {
        const initialData = localStorage.getItem("initialRegistrationData");
        if (initialData) {
          try {
            const parsed = JSON.parse(initialData);
            userEmail = parsed.email || "";
          } catch (error) {
            console.error("Error parsing initial data:", error);
          }
        }
      }
    }

    if (!userEmail) {
      return;
    }

    try {
      const res = await fetch("/api/erp/get-lead", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email: userEmail }),
      });

      const data = await res.json();

      if (data.success && data.lead) {
        const lead = data.lead;
        
        // Type of Company
        if (lead.custom_type_of_company) {
          setSelectedCompanyType(lead.custom_type_of_company);
        }
      }
    } catch (error) {
      console.error("Error loading documents info:", error);
    }
  }, []);

  useEffect(() => {
    if (formData.currentStep !== 4) {
      goToStep(4);
    }

    // Company type'ları yükle
    fetchCompanyTypes();
    
    // Mevcut Lead'den bilgileri yükle
    loadDocumentsInfo();
  }, [formData.currentStep, goToStep, fetchCompanyTypes, loadDocumentsInfo]);

  const handleFileSelect = (
    files: FileList | null,
    documentId: string,
    maxFiles: number = 5
  ) => {
    if (!files) return;

    const fileArray = Array.from(files);
    const validFiles = fileArray.filter((file) => {
      const isValidSize = file.size <= 5 * 1024 * 1024; // 5MB
      const isValidFormat = ["image/jpeg", "image/jpg", "image/png", "application/pdf"].includes(file.type);
      return isValidSize && isValidFormat;
    });

    setDocumentData((prev) => {
      const currentFiles = prev[documentId]?.files || [];
      const combined = [...currentFiles, ...validFiles];
      return {
        ...prev,
        [documentId]: {
          ...prev[documentId],
          files: combined.slice(0, maxFiles),
        },
      };
    });
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (
    e: React.DragEvent,
    documentId: string,
    maxFiles: number = 5
  ) => {
    e.preventDefault();
    e.stopPropagation();
    handleFileSelect(e.dataTransfer.files, documentId, maxFiles);
  };

  const handleFileInputClick = (documentId: string) => {
    fileInputRefs.current[documentId]?.click();
  };

  const removeFile = (documentId: string, index: number) => {
    setDocumentData((prev) => {
      const currentFiles = prev[documentId]?.files || [];
      return {
        ...prev,
        [documentId]: {
          ...prev[documentId],
          files: currentFiles.filter((_, i) => i !== index),
        },
      };
    });
  };

  const handleDateChange = (documentId: string, date: string) => {
    setDocumentData((prev) => ({
      ...prev,
      [documentId]: {
        ...prev[documentId],
        date: date,
      },
    }));
  };

  const handleBack = () => {
    goToStep(3);
    router.push("/register/payment-information");
  };

  const handleSubmit = async () => {
    // Validation
    if (!selectedCompanyType) {
      alert("Please select a company type");
      return;
    }

    // Her required document için validation
    for (const doc of requiredDocuments) {
      if (doc.isRequired) {
        if (doc.isDateField) {
          if (!documentData[doc.id]?.date) {
            alert(`Please fill in ${doc.documentName}`);
            return;
          }
        } else {
          if (!documentData[doc.id]?.files || documentData[doc.id].files!.length === 0) {
            alert(`Please upload ${doc.documentName}`);
            return;
          }
        }
      }
    }

    // TODO: Upload files to server and save to Lead
    // Şimdilik sadece console'a yazdır

    // Update Lead with documents
    let userEmail = "";
    if (typeof window !== "undefined") {
      const sessionEmail = sessionStorage.getItem("userEmail");
      if (sessionEmail) {
        userEmail = sessionEmail;
      } else {
        const initialData = localStorage.getItem("initialRegistrationData");
        if (initialData) {
          try {
            const parsed = JSON.parse(initialData);
            userEmail = parsed.email || "";
          } catch (error) {
            console.error("Error parsing initial data:", error);
          }
        }
      }
    }

    if (!userEmail) {
      alert("User email not found. Please login again.");
      return;
    }

    try {
      // File'ları FormData ile göndermek için hazırla
      const formDataToSend = new FormData();
      formDataToSend.append("email", userEmail);
      formDataToSend.append("documents", JSON.stringify({
        typeOfCompany: selectedCompanyType,
        documentData: documentData,
        isCompleted: true, // Tüm belgeler yüklendi
      }));

      // Her belge için file'ları ekle
      Object.keys(documentData).forEach((docId) => {
        const doc = documentData[docId];
        if (doc.files && doc.files.length > 0) {
          doc.files.forEach((file, index) => {
            formDataToSend.append(`document_${docId}_${index}`, file);
          });
        }
        if (doc.date) {
          formDataToSend.append(`document_${docId}_date`, doc.date);
        }
      });

        typeOfCompany: selectedCompanyType,
        documentData: documentData,
      });

      const res = await fetch("/api/erp/update-lead", {
        method: "POST",
        body: formDataToSend,
      });

      const data = await res.json();

      if (data.success) {
        // Registration tamamlandı, dashboard'a yönlendir
        alert("Registration completed successfully!");
        router.push("/dashboard");
      } else {
        alert(data.error || "Failed to save documents");
      }
    } catch (error: any) {
      console.error("Error submitting documents:", error);
      alert("Failed to submit documents. Please try again.");
    }
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
              <h1 className="text-2xl font-bold text-gray-900 mb-2">Registration Documents</h1>
              <p className="text-sm text-gray-600">
                Please upload the required documents to complete your registration
              </p>
            </div>

            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
                {error}
              </div>
            )}

            <form className="space-y-8" onSubmit={(e) => e.preventDefault()}>
              {/* Type of Company */}
              <div className="space-y-2">
                <Label htmlFor="companyType" className="text-sm font-semibold text-gray-700">
                  Type of Company <span className="text-red-500">*</span>
                </Label>
                <select
                  id="companyType"
                  value={selectedCompanyType}
                  onChange={(e) => setSelectedCompanyType(e.target.value)}
                  disabled={loadingCompanyTypes}
                  className="w-full h-10 px-3 rounded-md border border-gray-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-green-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                >
                  <option value="">
                    {loadingCompanyTypes ? "Loading..." : "Select"}
                  </option>
                  {companyTypes.map((ct) => (
                    <option key={ct.id} value={ct.name}>
                      {ct.name}
                    </option>
                  ))}
                </select>
                {selectedCompanyType && companyTypes.find((ct) => ct.name === selectedCompanyType)?.description && (
                  <p className="text-xs text-gray-500 mt-1">
                    {companyTypes.find((ct) => ct.name === selectedCompanyType)?.description}
                  </p>
                )}
              </div>

              {/* Required Documents */}
              {loadingDocuments && (
                <div className="text-center py-4 text-gray-600">
                  Loading required documents...
                </div>
              )}

              {!loadingDocuments && requiredDocuments.length > 0 && (
                <div className="space-y-8">
                  {requiredDocuments.map((doc) => (
                    <div key={doc.id} className="space-y-4">
                      <div className="space-y-2">
                        <Label className="text-sm font-semibold text-gray-700">
                          {doc.documentName} {doc.isRequired && <span className="text-red-500">*</span>}
                        </Label>
                        {doc.isDateField ? (
                          // Date Field
                          <div className="space-y-2">
                            <Input
                              type="date"
                              value={documentData[doc.id]?.date || ""}
                              onChange={(e) => handleDateChange(doc.id, e.target.value)}
                              className="w-full h-10 px-3 rounded-md border border-gray-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                              required={doc.isRequired}
                            />
                            <p className="text-xs text-gray-500">
                              {doc.dateFieldLabel}
                            </p>
                          </div>
                        ) : (
                          // File Upload Field
                          <>
                            <p
                              style={{
                                fontFamily: 'SF Pro Text',
                                fontWeight: 'normal',
                                fontSize: '13px',
                                lineHeight: '15px',
                                color: '#d4d8de',
                                letterSpacing: '0',
                              }}
                            >
                              You can upload multiple files - up to {doc.maxFiles} files are possible.
                              Allowed formats: {doc.allowedFileTypes}
                            </p>

                            <div
                              className="border-2 border-dashed border-green-500 rounded-lg text-center cursor-pointer hover:bg-green-50 transition-colors flex flex-col items-center justify-center"
                              style={{
                                width: '641px',
                                height: '153px',
                              }}
                              onDragOver={handleDragOver}
                              onDrop={(e) => handleDrop(e, doc.id, doc.maxFiles)}
                              onClick={() => handleFileInputClick(doc.id)}
                            >
                              <p className="text-sm text-gray-600 mb-2">Drag and drop files here</p>
                              <p className="text-sm text-gray-600 mb-4">or</p>
                              <div className="flex flex-col items-center gap-2">
                                <Button
                                  type="button"
                                  variant="default"
                                  className="text-white hover:opacity-90"
                                  style={{
                                    backgroundColor: '#111827',
                                    borderRadius: '10px',
                                    width: '63px',
                                    height: '24px',
                                    fontSize: '14px',
                                    padding: '0',
                                  }}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleFileInputClick(doc.id);
                                  }}
                                >
                                  Upload
                                </Button>
                                <p className="text-xs" style={{ color: '#F4A023' }}>
                                  Maximum file size: 5MB. Accepted formats: {doc.allowedFileTypes}.
                                </p>
                              </div>
                              <input
                                ref={(el) => {
                                  fileInputRefs.current[doc.id] = el;
                                }}
                                type="file"
                                multiple
                                accept=".pdf,.jpg,.jpeg,.png"
                                className="hidden"
                                onChange={(e) => handleFileSelect(e.target.files, doc.id, doc.maxFiles)}
                              />
                            </div>

                            {documentData[doc.id]?.files && documentData[doc.id].files!.length > 0 && (
                              <div className="space-y-2">
                                {documentData[doc.id].files!.map((file, index) => (
                                  <div
                                    key={index}
                                    className="flex items-center justify-between p-2 bg-gray-50 rounded border"
                                  >
                                    <span className="text-sm text-gray-700 truncate flex-1">{file.name}</span>
                                    <button
                                      type="button"
                                      onClick={() => removeFile(doc.id, index)}
                                      className="text-red-500 hover:text-red-700 text-sm ml-2"
                                    >
                                      Remove
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {!loadingDocuments && selectedCompanyType && requiredDocuments.length === 0 && (
                <div className="text-center py-4 text-gray-600">
                  No required documents found for this company type.
                </div>
              )}

              {/* Navigation Buttons */}
              <div className="flex justify-center gap-4 pt-6 border-t">
                <Button
                  type="button"
                  onClick={handleBack}
                  variant="outline"
                  className="px-8 h-[50px] text-base font-semibold border-gray-300 text-gray-700 hover:bg-gray-50"
                  style={{ width: "343px" }}
                >
                  Back
                </Button>
                <RegisterButton type="button" onClick={handleSubmit} disabled={!selectedCompanyType || requiredDocuments.length === 0}>
                  Submit
                </RegisterButton>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
