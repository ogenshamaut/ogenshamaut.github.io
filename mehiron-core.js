/* Ogen price list engine (shared by index.html and mehiron.html).
 * Data: Ministry of Transport open data on data.gov.il. No data from any other price list.
 */
(function () {
  "use strict";
  const API = "https://data.gov.il/api/3/action/datastore_search";
  const R = {
    active: "053cea08-09bc-40ec-8f7a-156f0677aff3",
    cancelled: "851ecab1-0622-4dbe-a6c7-f950cf82abf9",
    inactive: "f6efe89a-fb3d-43a4-bb61-9bf12a9b9099",
    owners: "bb2355dc-9ec7-4f06-9c3f-3344672171da",
    history: "56063a99-8a3e-4ff4-912e-5966c0279bad",
    price: "39f455bf-6db0-4926-859d-017f34eacbcb",
    model: "142afde2-6228-49f9-8a29-9b6c3a0cbe40",
    recall: "36bf1404-0be4-49d2-82dc-2f1ead4a8b93",
  };
  async function ds(rid, o = {}) {
    const p = new URLSearchParams({ resource_id: rid, limit: String(o.limit ?? 100) });
    if (o.filters) p.set("filters", JSON.stringify(o.filters));
    if (o.fields) p.set("fields", o.fields);
    if (o.sort) p.set("sort", o.sort);
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 20000);
    try {
      const j = await (await fetch(`${API}?${p}`, { signal: ctl.signal })).json();
      if (!j.success) throw new Error("api");
      return j.result;
    } finally { clearTimeout(t); }
  }

  // ---------- small helpers ----------
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const digits = (s) => String(s || "").replace(/\D/g, "");
  const fmtPlate = (d) => d.length === 7 ? `${d.slice(0,2)}-${d.slice(2,5)}-${d.slice(5)}` : d.length === 8 ? `${d.slice(0,3)}-${d.slice(3,5)}-${d.slice(5)}` : d;
  const num = (n) => Math.round(n).toLocaleString("he-IL");
  const nis = (n) => "₪" + num(n);
  const r100 = (n) => Math.round(n / 100) * 100;
  function ym(v) {
    const s = String(v || "");
    if (/^\d{6}$/.test(s)) return `${s.slice(4, 6)}/${s.slice(0, 4)}`;
    const m = s.match(/^(\d{4})-(\d{1,2})/);
    return m ? `${m[2].padStart(2, "0")}/${m[1]}` : s;
  }
  function monthsSince(v) {
    const m = String(v || "").match(/^(\d{4})-?(\d{1,2})?/); if (!m) return null;
    const now = new Date(); return (now.getFullYear() - +m[1]) * 12 + (now.getMonth() + 1 - (m[2] ? +m[2] : 6));
  }

  // ---------- parameters (appraisers can change them; saved per browser) ----------
  // Defaults are tuned in the calibration step (tools/calib). Keep the keys stable.
  const DEF = { newIdx: 0, initialDrop: 10, year1: 8, y2to5: 8, y6to10: 8.5, y11plus: 6, kmPerYear: 15000, kmPct: 0.3, kmCap: 15, handPct: 2, leasing: 8, rental: 12, company: 5 };
  const LABELS = {
    newIdx: "עדכון מחיר חדש להיום, לכל שנה (%)", initialDrop: "ירידה ביום העלייה לכביש (%)", year1: "ירידה בשנה הראשונה (%)",
    y2to5: "ירידה לשנה, שנים 2–5 (%)", y6to10: "ירידה לשנה, שנים 6–10 (%)", y11plus: "ירידה לשנה, משנה 11 (%)",
    kmPerYear: "ק\"מ רגיל לשנה", kmPct: "% לכל 1,000 ק\"מ חריגה", kmCap: "מקסימום התאמת ק\"מ (%)", handPct: "% לכל יד נוספת",
    leasing: "היה בליסינג (%)", rental: "היה בהשכרה (%)", company: "היה בחברה (%)",
  };
  const PKEY = "ogen-mehiron-params-v3";
  const P = { ...DEF };
  try { Object.assign(P, JSON.parse(localStorage.getItem(PKEY) || "{}")); } catch {}
  const saveP = () => { try { localStorage.setItem(PKEY, JSON.stringify(P)); } catch {} };
  const resetP = () => { Object.assign(P, DEF); saveP(); };

  const KIND = { private: "פרטית", leasing: "ליסינג / החכר", rental: "השכרה", company: "חברה" };
  function kindOf(s) {
    s = String(s || "");
    if (s.includes("השכר")) return "rental";
    if (s.includes("ליסינג") || s.includes("החכר")) return "leasing";
    if (s.includes("חברה")) return "company";
    return "private";
  }

  // ---------- valuation ----------
  function ageFactor(m) {
    m = Math.max(0, m);
    let f = 1 - P.initialDrop / 100, left = m;
    for (const [len, pct] of [[12, P.year1], [48, P.y2to5], [60, P.y6to10], [Infinity, P.y11plus]]) {
      const x = Math.min(left, len); if (x <= 0) break;
      f *= Math.pow(1 - pct / 100, x / 12); left -= x;
    }
    return f;
  }
  /** v: {newPrice, priceYear, road:"YYYY-MM", km, hand, prev, priceNote} */
  function valuate(v) {
    const lines = [];
    const ageMonths = Math.max(0, monthsSince(v.road) ?? 0);
    lines.push({ t: "מחיר הרכב כשהיה חדש", sub: v.priceNote || "", amt: v.newPrice, base: true });
    let base = v.newPrice;
    const yrs = Math.max(0, new Date().getFullYear() - (v.priceYear || new Date().getFullYear()));
    if (P.newIdx > 0 && yrs > 0) {
      const up = base * (Math.pow(1 + P.newIdx / 100, yrs) - 1);
      lines.push({ t: "עדכון למחירי היום", sub: `${yrs} שנים × ${P.newIdx}%`, amt: up });
      base += up;
    }
    const ageVal = base * ageFactor(ageMonths);
    lines.push({ t: "ירידה לפי גיל", sub: `${Math.floor(ageMonths / 12)} שנים ו-${ageMonths % 12} חודשים מהעלייה לכביש`, amt: ageVal - base });
    let value = ageVal;
    if (v.km != null && v.km !== "" && +v.km >= 0) {
      const expected = P.kmPerYear * Math.max(ageMonths, 1) / 12;
      let pct = -((+v.km - expected) / 1000) * P.kmPct;
      pct = Math.max(-P.kmCap, Math.min(P.kmCap, pct));
      const d = ageVal * pct / 100; value += d;
      lines.push({ t: "קילומטראז'", sub: `${num(+v.km)} ק"מ, לעומת ${num(expected)} רגיל לגיל הזה`, amt: d });
    }
    if (v.hand > 1) { const d = ageVal * -(v.hand - 1) * P.handPct / 100; value += d; lines.push({ t: `יד ${v.hand}`, sub: `${v.hand - 1} בעלים קודמים`, amt: d }); }
    if (v.prev && v.prev !== "private" && P[v.prev] != null) { const d = ageVal * -P[v.prev] / 100; value += d; lines.push({ t: "בעלות קודמת", sub: KIND[v.prev], amt: d }); }
    value = Math.max(value, v.newPrice * 0.05);
    return { value: r100(value), low: r100(value * 0.93), high: r100(value * 1.07), lines, ageMonths };
  }

  // ---------- catalog (brand -> model -> year -> factory codes) ----------
  const POPULAR = ["טויוטה", "יונדאי", "קיה", "מאזדה", "סקודה", "מיצובישי", "סוזוקי", "שברולט", "סיאט", "פולקסווגן", "רנו", "ניסאן", "פיג'ו", "סיטרואן", "פורד", "הונדה", "סובארו", "אופל", "דאצ'יה", "ב.מ.וו", "מרצדס-בנץ", "אאודי", "לקסוס", "וולבו", "טסלה", "BYD", "MG", "ג'ילי", "צ'רי", "קופרה", "ג'יפ", "מיני"];
  let catalogP = null;
  const loadCatalog = () => (catalogP ||= fetch("mehiron-catalog.json").then((r) => r.json()).then((rows) => {
    const map = new Map(rows.map(([b, models]) => [b, models]));
    return { brands: rows.map((r) => r[0]), popular: POPULAR.filter((b) => map.has(b)), models: (b) => map.get(b) || {} };
  }));
  /** All importer versions of a model/year, cheapest first, with a readable label. */
  async function trims(cds, model, year) {
    const lists = await Promise.all(cds.map((cd) => ds(R.price, { filters: { tozeret_cd: cd, kinuy_mishari: model, shnat_yitzur: +year }, limit: 100 }).then((r) => r.records).catch(() => [])));
    const rows = lists.flat().sort((a, b) => a.mehir - b.mehir);
    const specs = await Promise.all(rows.map((t) => ds(R.model, { filters: { tozeret_cd: t.tozeret_cd, degem_cd: t.degem_cd, shnat_yitzur: t.shnat_yitzur }, fields: "ramat_gimur,nefah_manoa,koah_sus,automatic_ind,delek_nm", limit: 1 }).then((x) => x.records[0] || null).catch(() => null)));
    return rows.map((t, i) => {
      const s = specs[i] || {};
      const bits = [s.ramat_gimur || t.degem_nm, s.nefah_manoa ? `${num(s.nefah_manoa)} סמ"ק` : "", s.delek_nm && s.delek_nm !== "בנזין" ? s.delek_nm : "", s.automatic_ind === 0 ? "ידני" : ""].filter(Boolean);
      return { ...t, spec: s, label: `${bits.join(" · ")} · ${nis(t.mehir)} חדש` };
    });
  }

  // ---------- plate lookup ----------
  async function findPrice(f) {
    try {
      let r = await ds(R.price, { filters: f, limit: 5 });
      if (r.records.length) return { ...r.records[0], exact: true };
      r = await ds(R.price, { filters: { tozeret_cd: f.tozeret_cd, degem_cd: f.degem_cd }, limit: 50 });
      if (!r.records.length) return null;
      return { ...r.records.sort((a, b) => Math.abs(a.shnat_yitzur - f.shnat_yitzur) - Math.abs(b.shnat_yitzur - f.shnat_yitzur))[0], exact: false };
    } catch { return null; }
  }
  /** Returns null when not found; throws when the government site is unreachable. */
  async function lookupPlate(plate) {
    const n = Number(digits(plate));
    let car = (await ds(R.active, { filters: { mispar_rechev: n }, limit: 1 })).records[0], source = "active";
    if (!car) { car = (await ds(R.cancelled, { filters: { mispar_rechev: n }, limit: 1 })).records[0]; if (car) source = "cancelled"; }
    if (!car) { car = (await ds(R.inactive, { filters: { mispar_rechev: n }, limit: 1 })).records[0]; if (car) source = "inactive"; }
    if (!car) return null;
    const f = { tozeret_cd: car.tozeret_cd, degem_cd: car.degem_cd, shnat_yitzur: car.shnat_yitzur };
    const [owners, hist, price, model, recall, count] = await Promise.all([
      ds(R.owners, { filters: { mispar_rechev: n }, sort: "baalut_dt", limit: 50 }).then((r) => r.records).catch(() => []),
      ds(R.history, { filters: { mispar_rechev: n }, limit: 1 }).then((r) => r.records[0] || null).catch(() => null),
      findPrice(f),
      ds(R.model, { filters: f, limit: 1 }).then((r) => r.records[0] || null).catch(() => null),
      ds(R.recall, { filters: { MISPAR_RECHEV: n }, limit: 20 }).then((r) => r.records).catch(() => []),
      ds(R.active, { filters: f, limit: 0 }).then((r) => r.total).catch(() => null),
    ]);
    // Road month (YYYY-MM), owners (dealers are not a "hand"), previous ownership, km now.
    let road = String(car.moed_aliya_lakvish || (hist?.rishum_rishon_dt || "").slice(0, 7) || `${car.shnat_yitzur}-06`);
    const rm = road.match(/^(\d{4})-?(\d{1,2})?/); road = rm ? `${rm[1]}-${String(rm[2] || 6).padStart(2, "0")}` : road;
    const own = owners.filter((o) => !String(o.baalut).includes("סוחר"));
    const hand = Math.max(1, own.length);
    const past = own.slice(0, -1).map((o) => kindOf(o.baalut));
    const prev = ["rental", "leasing", "company"].find((k) => past.includes(k)) || (own.length <= 1 ? kindOf(car.baalut) : "private");
    // 0 km means "no test yet" (new cars), not a real reading.
    const testKm = hist?.kilometer_test_aharon ? hist.kilometer_test_aharon : null;
    let km = testKm;
    const ageM = Math.max(0, monthsSince(road) ?? 0);
    if (testKm != null && car.mivchan_acharon_dt) {
      const since = Math.max(0, monthsSince(car.mivchan_acharon_dt) ?? 0);
      km = Math.round(testKm + since * testKm / Math.max(ageM - since, 1));
    }
    // Older cars are often missing from the ownership / test history tables.
    const handKnown = own.length > 0;
    return { plate: String(n), source, car, owners, hist, price, model, recall, count, road, hand, handKnown, prev, testKm, km };
  }

  window.OgenMehiron = { R, ds, P, DEF, LABELS, saveP, resetP, KIND, kindOf, valuate, ageFactor, loadCatalog, trims, lookupPlate,
    esc, digits, fmtPlate, num, nis, ym, monthsSince };
})();
