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
    } else if (ch === ',' && !quoted) { row.push(cell); cell = ""; }
    else if ((ch === '\n' || ch === '\r') && !quoted) {
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

function norm(v) {
  return String(v ?? "").replace(/^\uFEFF/, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

const EXPECTED = {
  "Rough Data": ["p s", "grand total"],
  "For Hearing Entry": ["p s", "hearing centre", "grand total"],
  "Centre Wise Report": ["hearing centre", "total notice scheduled"],
  "Hearing Schedule Report": ["date", "total hearing scheduled"],
  "Date wise Report": ["date", "hearing centre"]
};

function findHeaderIndex(rows, tab) {
  const wanted = EXPECTED[tab] || [];
  let best = 0, bestScore = -1;
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const cells = rows[i].map(norm).filter(Boolean);
    if (!cells.length) continue;
    let score = 0;
    for (const w of wanted) {
      const n = norm(w);
      if (cells.some(c => c === n || c.includes(n) || n.includes(c))) score += 3;
    }
    score += Math.min(cells.length / 20, 0.9);
    if (score > bestScore) { bestScore = score; best = i; }
  }
  return best;
}

function makeUniqueHeaders(headers) {
  const used = new Map();
  return headers.map((value, i) => {
    const base = String(value ?? "").replace(/^\uFEFF/, "").trim() || `Column ${i + 1}`;
    const count = used.get(base) || 0;
    used.set(base, count + 1);
    return count ? `${base} (${count + 1})` : base;
  });
}

export async function GET(req) {
  const tab = new URL(req.url).searchParams.get("tab");
  if (!tab) return NextResponse.json({ error: "Missing tab" }, { status: 400 });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tab)}`;
  try {
    const r = await fetch(url, { cache: "no-store", signal: controller.signal, headers: { "User-Agent": "Mozilla/5.0" } });
    if (!r.ok) return NextResponse.json({ error: `Google Sheets returned ${r.status}` }, { status: 502 });
    const rows = parseCSV(await r.text());
    if (!rows.length) return NextResponse.json({ cols: [], rows: [] });
    const headerIndex = findHeaderIndex(rows, tab);
    const cols = makeUniqueHeaders(rows[headerIndex]);
    const data = rows.slice(headerIndex + 1).map(r => {
      const obj = {};
      cols.forEach((c, i) => { obj[c] = String(r[i] ?? "").replace(/^\uFEFF/, "").trim(); });
      return obj;
    });
    return NextResponse.json({ cols, rows: data, headerIndex }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (e) {
    return NextResponse.json({ error: e?.name === "AbortError" ? "Google Sheets request timed out" : (e?.message || "Unable to reach Google Sheets") }, { status: 502 });
  } finally { clearTimeout(timer); }
}
