import { NextRequest, NextResponse } from "next/server";
import { erpGet } from "@/lib/erp";

export async function POST(req: NextRequest) {
  try {
    const { reference } = await req.json();

    if (!reference) {
      return NextResponse.json(
        { error: "Reference (Sales Person ID) is required" },
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

    // ERPNext REST API: filter Sales Person by custom_sales_person_id
    const filters = encodeURIComponent(
      JSON.stringify([
        ["Sales Person", "custom_sales_person_id", "=", reference],
      ])
    );

    const fields = encodeURIComponent(
      JSON.stringify(["name", "sales_person_name", "custom_sales_person_id"])
    );

    const result = await erpGet(
      `/api/resource/Sales Person?filters=${filters}&fields=${fields}`,
      token
    );

    const data = result?.data || [];

    if (!Array.isArray(data) || data.length === 0) {
      return NextResponse.json(
        {
          valid: false,
          message: "No ID reference",
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      valid: true,
      sales_person: data[0],
    });
  } catch (e: any) {
    console.error("Reference validation error:", e);
    return NextResponse.json(
      {
        error: e.message || "Failed to validate reference",
      },
      { status: 500 }
    );
  }
}


