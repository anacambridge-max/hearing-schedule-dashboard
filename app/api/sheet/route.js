import { NextResponse } from "next/server";

const SHEET_ID = "1KRfUfvw0JmbNBolkVDHyevutOv8nd3JYPgngT5xchFI";

function parseCSV(text) {
  const rows = [];
  let row = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i], next = text[i + 1];
    if (ch === '"') {
      if (quoted && next === '"') { cell += '"'; i++; }
      else quoted = !quoted;
    } else if (ch === ',' && !quoted) {
      row.push(cell); cell = "";
    } else if ((ch === '\n' || ch === '\r') && !quoted) {
      if (ch === '\r' && next === '\n') i++;
      row.push(cell); cell = "";
      if (row.some(v => String(v).trim() !== "")) rows.push(row);
      row = [];
    } else cell += ch;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    if (row.some(v => String(v).trim() !== "")) rows.push(row);
  }
  return rows;
}

// These workbooks intentionally have title/instruction rows above the real headers.
// Keep the source structure stable instead of guessing from data values.
const HEADER_ROWS = {
  "Rough Data": 1,                 // Excel row 2
  "For Hearing Entry": 1,         // Excel row 2
  "Centre Wise Report": 2,        // Excel row 3
  "Hearing Schedule Report": 2,   // Excel row 3
  "Date wise Report": 2            // Excel row 3
};

function normalizeHeader(v) {
  return String(v ?? "").replace(/^\uFEFF/, "").trim();
}

function makeUniqueHeaders(headers) {
  const used = new Map();
  return headers.map((value, i) => {
    const base = normalizeHeader(value) || `Column ${i + 1}`;
    const count = used.get(base) || 0;
    used.set(base, count + 1);
    return count ? `${base} (${count + 1})` : base;
  });
}

export async function GET(req) {
  const tab = new URL(req.url).searchParams.get("tab");
  if (!tab) return NextResponse.json({ error: "Missing tab" }, { status: 400 });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tab)}`;

  try {
    const r = await fetch(url, {
      cache: "no-store",
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0" }
    });
    if (!r.ok) return NextResponse.json({ error: `Google Sheets returned ${r.status}` }, { status: 502 });

    const rows = parseCSV(await r.text());
    if (!rows.length) return NextResponse.json({ cols: [], rows: [] });

    const headerIndex = Math.min(HEADER_ROWS[tab] ?? 0, rows.length - 1);
    const cols = makeUniqueHeaders(rows[headerIndex]);
    const data = rows.slice(headerIndex + 1).map(r => {
      const obj = {};
      cols.forEach((c, i) => { obj[c] = normalizeHeader(r[i] ?? ""); });
      return obj;
    });

    return NextResponse.json(
      { cols, rows: data, headerIndex },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (e) {
    const message = e?.name === "AbortError"
      ? "Google Sheets request timed out"
      : (e?.message || "Unable to reach Google Sheets");
    return NextResponse.json({ error: message }, { status: 502 });
  } finally {
    clearTimeout(timer);
  }
}
