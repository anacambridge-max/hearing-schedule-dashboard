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
  "Rough Data": ["new p s no", "grand total"],
  "For Hearing Entry": ["new p s no", "grand total"],
  "Centre Wise Report": ["hearing centre", "total notice scheduled"],
  "Hearing Schedule Report": ["date", "total hearing scheduled"],
  "Date wise Report": ["date", "hearing centre"]
};

function findHeaderIndex(rows, tab) {
  const wanted = EXPECTED[tab] || [];
  let best = 0, bestScore = -1;
  for (let i = 0; i < Math.min(rows.length, 50); i++) {
    const cells = rows[i].map(norm).filter(Boolean);
    if (!cells.length) continue;
    let score = 0;
    for (const w of wanted) {
      const n = norm(w);
      if (cells.some(c => c === n || c.includes(n) || n.includes(c))) score += 3;
    }
    if (tab === "For Hearing Entry" && cells.some(c => c === "old p s no")) score += 2;
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

function psValue(value) {
  const n = Number(String(value ?? "").trim().replace(/,/g, ""));
  return Number.isInteger(n) && n >= 1 && n <= 430 ? n : 0;
}

function objectFromRow(cols, row) {
  const obj = {};
  cols.forEach((c, i) => { obj[c] = String(row[i] ?? "").replace(/^\uFEFF/, "").trim(); });
  return obj;
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
    const normalizedCols = cols.map(norm);
    let psIndex = normalizedCols.findIndex(x => x === "new p s no" || x.includes("new p s no"));

    let data = rows.slice(headerIndex + 1).map(r => objectFromRow(cols, r));

    if (tab === "For Hearing Entry") {
      // Never depend on the exact exported CSV position. In this sheet the PS column is
      // normally column C, but Google Sheets exports can shift blank leading columns.
      data = rows.slice(headerIndex + 1).flatMap(r => {
        let n = psIndex >= 0 ? psValue(r[psIndex]) : 0;
        if (!n) {
          // Prefer the column immediately after Old P.S. No.; otherwise find the first
          // standalone integer in the row. The cumulative PS text in column A is ignored.
          const oldIdx = normalizedCols.findIndex(x => x === "old p s no" || x.includes("old p s no"));
          if (oldIdx >= 0) {
            for (let i = oldIdx + 1; i < Math.min(r.length, oldIdx + 4); i++) {
              const candidate = psValue(r[i]);
              if (candidate) { n = candidate; break; }
            }
          }
          if (!n) {
            for (let i = 0; i < r.length; i++) {
              const candidate = psValue(r[i]);
              if (candidate) { n = candidate; psIndex = i; break; }
            }
          }
        }
        if (!n) return [];
        const obj = objectFromRow(cols, r);
        // Canonical key makes the client independent of any CSV/header quirks.
        obj[cols[psIndex] || "New P.S. No."] = String(n);
        obj["New P.S. No."] = String(n);
        return [obj];
      });
    }

    return NextResponse.json(
      { cols, rows: data, headerIndex, count: data.length, psIndex },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (e) {
    return NextResponse.json({ error: e?.name === "AbortError" ? "Google Sheets request timed out" : (e?.message || "Unable to reach Google Sheets") }, { status: 502 });
  } finally { clearTimeout(timer); }
}
