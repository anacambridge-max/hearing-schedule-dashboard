import { NextResponse } from "next/server";

const SHEET_ID = "1KRfUfvw0JmbNBolkVDHyevutOv8nd3JYPgngT5xchFI";

export async function GET(req) {
  const tab = new URL(req.url).searchParams.get("tab");
  if (!tab) return new NextResponse("Missing tab", { status: 400 });

  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(tab)}`;
  try {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) return new NextResponse(`Google Sheets returned ${r.status}`, { status: 502 });
    const text = await r.text();
    return new NextResponse(text, {
      status: 200,
      headers: {
        "Content-Type": "application/javascript; charset=utf-8",
        "Cache-Control": "no-store, max-age=0"
      }
    });
  } catch (e) {
    return new NextResponse("Unable to reach Google Sheets: " + e.message, { status: 502 });
  }
}