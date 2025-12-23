import { NextRequest, NextResponse } from "next/server";
import { erpGet } from "@/lib/erp";

export async function POST(req: NextRequest) {
  try {
    const { reference } = await req.json();

    if (!reference) {
      return NextResponse.json(
        { error: "Sales Person ID is required" },
        { status: 400 }
      );
    }

    const token = process.env.ERP_API_TOKEN;

    if (!token) {
      return NextResponse.json(
        { error: "ERP_API_TOKEN environment variable is not set" },
        { status: 500 }
      );
    }

    // ERPNext REST API: fetch Sales Person directly by document name (e.g. uh213jdhpd)
    // This matches the \"ID\" you see at the top of the Sales Person form.
    const result = await erpGet(
      `/api/resource/Sales Person/${encodeURIComponent(reference)}`,
      token
    );

    const salesPerson = result?.data || result;

    if (!salesPerson) {
      return NextResponse.json(
        {
          valid: false,
          message: "Sales Person ID not found",
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      valid: true,
      sales_person: salesPerson,
    });
  } catch (e: any) {
    console.error("Sales Person ID validation error:", e);

    const message = typeof e?.message === "string" ? e.message : "";

    // Eğer ERP tarafı 404 / DoesNotExistError döndürdüyse, bunu daha okunabilir bir
    // \"Sales Person ID not found\" mesajına çevir.
    if (message.includes("DoesNotExistError") || message.toLowerCase().includes("not found")) {
      return NextResponse.json(
        {
          valid: false,
          message: "Sales Person ID not found",
        },
        { status: 404 }
      );
    }

    // Diğer tüm hatalar için genel mesaj
    return NextResponse.json(
      {
        error: "Failed to validate Sales Person ID",
      },
      { status: 500 }
    );
  }
}


