"use client";

import { RegistrationProvider } from "@/contexts/RegistrationContext";

export default function RegisterLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <RegistrationProvider>{children}</RegistrationProvider>;
}
