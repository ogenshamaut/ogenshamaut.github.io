/* Ogen price list: the form (choose a car -> price -> depreciation after an accident).
 * Usage: <div id="ogenMehiron"></div> + mehiron-core.js + this file.
 * Everything updates live; the plate number is only an optional shortcut.
 */
(function () {
  "use strict";
  const M = window.OgenMehiron;
  const { esc, nis, num, digits, fmtPlate, ym, KIND } = M;

  // ---------- damage parts: [key, name, % if repaired, % if replaced] ----------
  const PARTS = [
    ["חלקים מוברגים", "פגושים, דלתות ומכסים. בדרך כלל ירידת ערך קטנה.", [
      ["bumpF", "פגוש קדמי", 0, 0], ["bumpR", "פגוש אחורי", 0, 0], ["hood", "מכסה מנוע", 0.5, 1],
      ["fenderF", "כנף קדמית", 0.5, 1], ["doorF", "דלת קדמית", 0.5, 1], ["doorR", "דלת אחורית", 0.5, 1], ["trunk", "מכסה תא מטען / דלת חמישית", 0.5, 1],
    ]],
    ["פחחות מרותכת", "חלקים שמחוברים בריתוך לגוף הרכב.", [
      ["fenderR", "כנף אחורית", 1.5, 3], ["roof", "גג", 2, 4], ["sill", "סף", 2, 3], ["panelF", "חזית (פנל קדמי)", 1, 2],
      ["panelR", "פנל אחורי", 1.5, 2.5], ["trunkFloor", "רצפת תא מטען", 2, 3],
    ]],
    ["שלדה ומבנה", "הפגיעה המשמעותית ביותר לשווי הרכב.", [
      ["pillarA", "עמוד קדמי (A)", 3, 5], ["pillarB", "עמוד אמצעי (B)", 3, 5], ["pillarC", "עמוד אחורי (C)", 2.5, 4],
      ["railF", "קורת שלדה קדמית", 3, 5], ["railR", "קורת שלדה אחורית", 2.5, 4], ["tower", "בית בולם / תושבת מתלה", 3, 5], ["floor", "רצפה", 3, 5],
    ]],
    ["נוסף", "", [["airbag", "כריות אוויר נפתחו", 2, 2]]],
  ];
  // Newer cars lose more value from an accident: share of the % that applies by age.
  const DV_DEF = { ageA: 100, ageB: 85, ageC: 70, ageD: 50, ageE: 30, cap: 30 };
  const DKEY = "ogen-mehiron-dv-v1";
  const DV = { ...DV_DEF, parts: {} };
  try { Object.assign(DV, JSON.parse(localStorage.getItem(DKEY) || "{}")); } catch {}
  const pct = (key, kind) => { const p = DV.parts[key]; const def = PARTS.flatMap((g) => g[2]).find((x) => x[0] === key); return p?.[kind] ?? (kind === "fix" ? def[2] : def[3]); };
  const saveDV = () => { try { localStorage.setItem(DKEY, JSON.stringify(DV)); } catch {} };
  function ageShare(months) {
    const y = months / 12;
    return (y <= 3 ? DV.ageA : y <= 5 ? DV.ageB : y <= 7 ? DV.ageC : y <= 10 ? DV.ageD : DV.ageE) / 100;
  }

  const CSS = `
  .om{--om-ink:#101823;--om-muted:#5d6b7b;--om-line:#e2e8ef;--om-brand:#0b9be0;--om-strong:#0a6ea6;--om-deep:#074f78;--om-soft:#e3f4fd;font:400 17px/1.6 "IBM Plex Sans Hebrew",system-ui,sans-serif;color:var(--om-ink)}
  .om *{box-sizing:border-box}
  .om-grid{display:grid;grid-template-columns:minmax(0,1.25fr) minmax(0,.9fr);grid-template-areas:"a r" "b r" "d d";gap:22px;align-items:start}
  .om-a{grid-area:a}.om-b{grid-area:b}.om-res{grid-area:r}#omDetails{grid-area:d;min-width:0}#omDetails:empty{display:none}
  @media (max-width:900px){.om-grid{grid-template-columns:minmax(0,1fr);grid-template-areas:"a" "r" "d" "b"}}
  .om-card{background:rgba(255,255,255,.86);backdrop-filter:blur(14px);border:1px solid rgba(255,255,255,.95);border-radius:22px;box-shadow:0 1px 0 #fff inset,0 14px 34px rgba(16,40,70,.09),0 2px 6px rgba(16,40,70,.05);padding:24px}
  .om-step{display:flex;align-items:center;gap:12px;margin:0 0 14px}
  .om-step b{flex:none;width:34px;height:34px;border-radius:50%;display:grid;place-items:center;background:linear-gradient(180deg,#14a6ea,#0a7cc0);color:#fff;font:700 17px/1 "Barlow Condensed",sans-serif;box-shadow:0 4px 10px rgba(10,110,166,.3)}
  .om-step h3{margin:0;font-size:20px;line-height:1.2}
  .om-step small{display:block;color:var(--om-muted);font-size:14px;font-weight:400}
  .om-block+.om-block{margin-top:22px;padding-top:22px;border-top:1px solid var(--om-line)}
  .om-fields{display:grid;grid-template-columns:1fr 1fr;gap:12px 14px}
  @media (max-width:560px){.om-fields{grid-template-columns:1fr}}
  .om-f label{display:block;font-weight:600;font-size:15px;margin-bottom:6px}
  .om-f select,.om-f input{width:100%;font:400 17px/1.4 inherit;font-family:inherit;color:var(--om-ink);background:#fff;border:1.5px solid var(--om-line);border-radius:12px;padding:12px}
  .om-f select:focus,.om-f input:focus{outline:none;border-color:var(--om-brand);box-shadow:0 0 0 4px rgba(11,155,224,.18)}
  .om-f select:disabled{background:#f1f4f7;color:#9aa5b1}
  .om-row2{display:grid;grid-template-columns:1fr 1.3fr;gap:8px}
  .om-seg{display:flex;flex-wrap:wrap;gap:6px}
  .om-seg button{font:600 15px/1 inherit;font-family:inherit;padding:11px 14px;border-radius:11px;border:1.5px solid var(--om-line);background:#fff;color:var(--om-ink);cursor:pointer;min-width:44px}
  .om-seg button[aria-pressed="true"]{background:var(--om-ink);border-color:var(--om-ink);color:#fff}
  .om-seg button:focus-visible{outline:3px solid var(--om-strong);outline-offset:2px}
  .om-link{background:none;border:0;color:var(--om-strong);font:500 15px/1.4 inherit;font-family:inherit;text-decoration:underline;cursor:pointer;padding:0;margin-top:12px}
  .om-plabel{display:block;font-weight:600;font-size:15px;margin-bottom:8px}
  .om-plate-row{display:flex;gap:12px;align-items:stretch;flex-wrap:wrap}
  .om-lp{display:flex;direction:ltr;flex:1 1 260px;max-width:380px;height:72px;background:linear-gradient(180deg,#ffd633 0%,#ffcc00 55%,#f2c000 100%);border:3px solid #1b1b1b;border-radius:11px;overflow:hidden;box-shadow:0 1px 0 rgba(255,255,255,.6) inset,0 10px 22px rgba(16,24,35,.18)}
  .om-lp .il{width:42px;background:#1e4fa3;color:#fff;display:flex;align-items:flex-end;justify-content:center;padding-bottom:9px;font:700 13px/1 "Barlow Condensed",sans-serif}
  .om-lp input{flex:1;min-width:0;border:0;background:transparent;font:700 46px/1 "Barlow Condensed",sans-serif;letter-spacing:.05em;text-align:center;color:#111}
  .om-lp input::placeholder{color:rgba(17,17,17,.25)}
  .om-lp input:focus{outline:none}
  .om-lp:focus-within{box-shadow:0 0 0 5px rgba(11,155,224,.35)}
  .om-go{flex:0 1 auto;font-size:17px;padding:0 22px;min-height:56px}
  @media (max-width:560px){.om-go{width:100%}.om-lp{max-width:none}}
  .om-or{display:flex;align-items:center;gap:12px;margin:20px 0 14px;color:var(--om-muted);font-size:14px}
  .om-or::before,.om-or::after{content:"";flex:1;height:1px;background:var(--om-line)}
  /* full vehicle details (after a plate search) */
  .om-details{display:grid;grid-template-columns:minmax(0,1.25fr) minmax(0,.9fr);gap:22px;align-items:start}
  @media (max-width:900px){.om-details{grid-template-columns:minmax(0,1fr)}}
  .om-details h3{margin:0 0 4px;font-size:20px}
  .om-details .sub{color:var(--om-muted);font-size:14px;margin:0 0 12px}
  .om-kv{margin:0;display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:0 20px}
  .om-kv div{padding:9px 0;border-bottom:1px solid var(--om-line)}
  .om-kv dt{color:var(--om-muted);font-size:13px}
  .om-kv dd{margin:2px 0 0;font-weight:600;font-size:16px}
  @media (max-width:480px){.om-kv{grid-template-columns:minmax(0,1fr)}}
  .om-owners{list-style:none;margin:0;padding:0}
  .om-owners li{display:flex;gap:12px;align-items:center;padding:8px 0}
  .om-owners .d{flex:none;width:36px;height:36px;border-radius:50%;display:grid;place-items:center;font:700 17px/1 "Barlow Condensed",sans-serif;background:var(--om-soft);color:var(--om-deep)}
  .om-owners li.ls .d{background:#fff3df;color:#9a5b00}
  .om-owners b{display:block}.om-owners span{color:var(--om-muted);font-size:14px}
  .om-links a{display:flex;justify-content:space-between;padding:11px 0;border-bottom:1px solid var(--om-line);text-decoration:none;color:var(--om-ink);font-weight:600}
  .om-links a span{color:var(--om-muted);font-weight:400;font-size:14px}
  .om-btn{display:inline-flex;align-items:center;justify-content:center;border:0;border-radius:12px;padding:12px 18px;font:600 16px/1 inherit;font-family:inherit;cursor:pointer;color:#fff;background:linear-gradient(180deg,#14a6ea,#0a7cc0);box-shadow:0 6px 16px rgba(10,110,166,.3);text-decoration:none}
  .om-btn.soft{background:#fff;color:var(--om-ink);box-shadow:0 0 0 1.5px var(--om-line) inset}
  .om-note{font-size:14px;color:var(--om-muted);margin-top:8px;min-height:1.2em}
  .om-note.bad{color:#b3261e;font-weight:600}
  .om-chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}
  .om-chip{font-size:14px;font-weight:600;padding:6px 10px;border-radius:10px;background:#e6f5ec;color:#17784a}
  .om-chip.warn{background:#fff3df;color:#9a5b00}.om-chip.bad{background:#fdecea;color:#b3261e}
  /* result */
  .om-res{position:sticky;top:84px;overflow:hidden;padding:0}
  @media (max-width:900px){.om-res{position:static}}
  .om-price{padding:24px;color:#fff;background:radial-gradient(420px 220px at 0% 0%,rgba(255,255,255,.22),transparent 60%),linear-gradient(160deg,#0d8fd4 0%,#075d91 100%)}
  .om-price .l{font-size:16px;opacity:.92}
  .om-price .v{font:700 clamp(46px,6vw,64px)/1 "Barlow Condensed",sans-serif;margin:8px 0 6px;direction:ltr;text-align:right;text-shadow:0 2px 10px rgba(0,0,0,.15)}
  .om-price .r{font-size:15px;opacity:.92}
  .om-price .car{font-weight:600;font-size:17px;margin-bottom:4px}
  .om-empty{padding:28px;color:var(--om-muted);text-align:center}
  .om-empty b{display:block;color:var(--om-ink);font-size:19px;margin-bottom:4px}
  .om-lines{padding:8px 24px 18px}
  .om-lines table{width:100%;border-collapse:collapse;font-size:16px}
  .om-lines td{padding:9px 0;border-bottom:1px solid var(--om-line);vertical-align:top}
  .om-lines td:last-child{text-align:left;direction:ltr;white-space:nowrap;font-weight:600;padding-inline-start:10px;font-variant-numeric:tabular-nums}
  .om-lines small{display:block;color:var(--om-muted);font-size:13px}
  .om-lines tr.t td{border-bottom:0;border-top:2px solid var(--om-ink);font-weight:700;font-size:18px}
  .om-neg{color:#b3261e}.om-pos{color:#17784a}
  .om-dv{margin:0 24px 20px;padding:16px;border-radius:16px;background:#fff7ec;border:1px solid #f5ddb8}
  .om-dv .h{font-weight:700}
  .om-dv .big{font:700 30px/1.1 "Barlow Condensed",sans-serif;direction:ltr;text-align:right;margin-top:4px}
  .om-actions{display:flex;flex-wrap:wrap;gap:8px;padding:0 24px 22px}
  /* parts */
  .om-group{margin-top:14px}
  .om-group h4{margin:0;font-size:16px}
  .om-group p{margin:2px 0 6px;color:var(--om-muted);font-size:14px}
  .om-part{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 0;border-bottom:1px dashed var(--om-line);flex-wrap:wrap}
  .om-part span{font-size:16px}
  .om-part .om-seg button{padding:8px 10px;font-size:14px}
  .om-part .om-seg button[aria-pressed="true"][data-v="fix"]{background:#9a5b00;border-color:#9a5b00}
  .om-part .om-seg button[aria-pressed="true"][data-v="rep"]{background:#b3261e;border-color:#b3261e}
  details.om-adv{margin-top:16px}
  details.om-adv summary{cursor:pointer;color:var(--om-strong);font-weight:600;font-size:15px}
  .om-pgrid{display:grid;grid-template-columns:1fr 1fr;gap:8px 12px;margin-top:10px}
  .om-pgrid .om-f label{font-weight:500;font-size:13px}
  .om-pgrid .om-f input{padding:7px 9px;font-size:15px}
  .om-disc{font-size:13px;color:var(--om-muted);margin-top:12px}
  @media print{.om-card{box-shadow:none;border:1px solid #ccc;backdrop-filter:none}.om-price{color:#000;background:#fff}.om-actions,details.om-adv,.om-link{display:none}}
  `;

  function mount(root) {
    if (!root || root.dataset.omReady) return; root.dataset.omReady = "1";
    if (!document.getElementById("om-css")) { const s = document.createElement("style"); s.id = "om-css"; s.textContent = CSS; document.head.appendChild(s); }
    const nowY = new Date().getFullYear();
    root.classList.add("om");
    root.innerHTML = `
      <div class="om-grid">
        <div class="om-card om-a">
          <div class="om-block">
            <div class="om-step"><b>1</b><h3>איזה רכב?<small>מכניסים מספר רכב, וכל הפרטים מתמלאים לבד.</small></h3></div>
            <div class="om-plate on" id="omPlateBox">
              <label class="om-plabel" for="omPlate">מספר רכב</label>
              <div class="om-plate-row">
                <div class="om-lp"><span class="il" aria-hidden="true">IL</span><input id="omPlate" inputmode="numeric" maxlength="10" placeholder="12-345-67" autocomplete="off"></div>
                <button type="button" class="om-btn om-go" id="omPlateGo">הבא את כל המידע</button>
              </div>
            </div>
            <div class="om-note" id="omNote1"></div>
            <div class="om-chips" id="omChips"></div>
            <div class="om-or"><span>או בחירה מהרשימה, בלי מספר רכב</span></div>
            <div class="om-fields">
              <div class="om-f"><label for="omMake">יצרן</label><select id="omMake"><option value="">טוען רשימה...</option></select></div>
              <div class="om-f"><label for="omModel">דגם</label><select id="omModel" disabled><option value="">קודם בוחרים יצרן</option></select></div>
              <div class="om-f"><label for="omYear">שנת ייצור</label><select id="omYear" disabled><option value="">קודם בוחרים דגם</option></select></div>
              <div class="om-f"><label for="omTrim">גרסה</label><select id="omTrim" disabled><option value="">קודם בוחרים שנה</option></select></div>
            </div>
          </div>
          <div class="om-block">
            <div class="om-step"><b>2</b><h3>מצב הרכב<small>משפיע על המחיר. אפשר לשנות בכל רגע.</small></h3></div>
            <div class="om-fields">
              <div class="om-f"><label>עלה לכביש</label><div class="om-row2">
                <select id="omRoadM" aria-label="חודש">${Array.from({ length: 12 }, (_, i) => `<option value="${i + 1}">${String(i + 1).padStart(2, "0")}</option>`).join("")}</select>
                <select id="omRoadY" aria-label="שנה">${Array.from({ length: 30 }, (_, i) => `<option>${nowY - i}</option>`).join("")}</select></div></div>
              <div class="om-f"><label for="omKm">קילומטראז' (ק"מ)</label><input id="omKm" inputmode="numeric" placeholder="לדוגמה 85,000"></div>
              <div class="om-f"><label>יד</label><div class="om-seg" id="omHand">${[1, 2, 3, 4, 5, 6].map((h) => `<button type="button" data-v="${h}" aria-pressed="${h === 1}">${h}</button>`).join("")}</div></div>
              <div class="om-f"><label>בעלות קודמת</label><div class="om-seg" id="omPrev">${Object.entries(KIND).map(([k, t]) => `<button type="button" data-v="${k}" aria-pressed="${k === "private"}">${t}</button>`).join("")}</div></div>
            </div>
          </div>
        </div>
        <div class="om-card om-res" id="omRes" aria-live="polite"></div>
        <div class="om-card om-b">
          <div class="om-block">
            <div class="om-step"><b>3</b><h3>ירידת ערך אחרי תאונה<small>לא חובה. מסמנים כל חלק שנפגע: תוקן או הוחלף.</small></h3></div>
            <div id="omParts">${PARTS.map(([g, d, items]) => `<div class="om-group"><h4>${g}</h4>${d ? `<p>${d}</p>` : ""}${items.map(([k, n]) => `
              <div class="om-part"><span>${n}</span><div class="om-seg" data-part="${k}" role="group" aria-label="${n}">
                <button type="button" data-v="" aria-pressed="true">לא נפגע</button><button type="button" data-v="fix" aria-pressed="false">תוקן</button><button type="button" data-v="rep" aria-pressed="false">הוחלף</button>
              </div></div>`).join("")}</div>`).join("")}</div>
            <details class="om-adv"><summary>הגדרות לשמאי: אחוזי ירידת הערך וחישוב המחיר</summary><div id="omAdv"></div></details>
          </div>
        </div>
        <div id="omDetails"></div>
      </div>`;

    const $ = (id) => root.querySelector("#" + id);
    const st = { price: null, priceYear: null, priceNote: "", carName: "", hand: 1, prev: "private", parts: {}, plateData: null };
    const opt = (v, t) => `<option value="${esc(v)}">${esc(t)}</option>`;
    let cat = null, trimRows = [];

    // ----- catalog selects -----
    M.loadCatalog().then((c) => {
      cat = c;
      const rest = c.brands.filter((b) => !c.popular.includes(b));
      $("omMake").innerHTML = opt("", "בחרו יצרן") + `<optgroup label="הנפוצים">${c.popular.map((b) => opt(b, b)).join("")}</optgroup><optgroup label="כל היצרנים">${rest.map((b) => opt(b, b)).join("")}</optgroup>`;
    }).catch(() => { $("omMake").innerHTML = opt("", "שגיאה בטעינה. רעננו את הדף."); });
    const lock = (id, t) => { const s = $(id); s.disabled = true; s.innerHTML = opt("", t); };
    function onMake() {
      lock("omYear", "קודם בוחרים דגם"); lock("omTrim", "קודם בוחרים שנה"); clearPrice();
      const b = $("omMake").value; if (!b) return lock("omModel", "קודם בוחרים יצרן");
      $("omModel").innerHTML = opt("", "בחרו דגם") + Object.keys(cat.models(b)).map((m) => opt(m, m)).join(""); $("omModel").disabled = false;
    }
    function onModel() {
      lock("omTrim", "קודם בוחרים שנה"); clearPrice();
      const m = $("omModel").value; if (!m) return lock("omYear", "קודם בוחרים דגם");
      $("omYear").innerHTML = opt("", "בחרו שנה") + Object.keys(cat.models($("omMake").value)[m]).sort((a, b) => b - a).map((y) => opt(y, y)).join(""); $("omYear").disabled = false;
    }
    async function onYear(pickDegem) {
      clearPrice();
      const y = $("omYear").value; if (!y) return lock("omTrim", "קודם בוחרים שנה");
      lock("omTrim", "טוען גרסאות...");
      const cds = cat.models($("omMake").value)[$("omModel").value][y];
      trimRows = await M.trims(cds, $("omModel").value, y);
      if (!trimRows.length) return lock("omTrim", "לא נמצאו גרסאות");
      $("omTrim").innerHTML = trimRows.map((t, i) => opt(i, t.label)).join(""); $("omTrim").disabled = false;
      let idx = 0;
      if (pickDegem) { const f = trimRows.findIndex((t) => t.degem_cd === pickDegem.degem_cd && t.tozeret_cd === pickDegem.tozeret_cd); if (f >= 0) idx = f; }
      $("omTrim").value = String(idx);
      if (!st.plateData) { $("omRoadY").value = String(y); $("omRoadM").value = "6"; }
      onTrim();
    }
    function onTrim() {
      const t = trimRows[+$("omTrim").value]; if (!t) return clearPrice();
      st.price = t.mehir; st.priceYear = t.shnat_yitzur; st.priceNote = `${t.shem_yevuan}, ${t.shnat_yitzur}`;
      st.carName = `${$("omMake").value} ${t.kinuy_mishari || ""} ${t.spec?.ramat_gimur || t.degem_nm} ${t.shnat_yitzur}`.replace(/\s+/g, " ");
      calc();
    }
    $("omMake").addEventListener("change", () => { st.plateData = null; $("omChips").innerHTML = ""; $("omDetails").innerHTML = ""; $("omNote1").textContent = ""; onMake(); });
    $("omModel").addEventListener("change", onModel);
    $("omYear").addEventListener("change", () => onYear());
    $("omTrim").addEventListener("change", onTrim);

    // ----- condition -----
    ["omRoadM", "omRoadY"].forEach((id) => $(id).addEventListener("change", calc));
    $("omKm").addEventListener("input", (e) => { const d = digits(e.target.value); e.target.value = d ? num(+d) : ""; calc(); });
    const seg = (id, key, cast) => $(id).addEventListener("click", (e) => {
      const b = e.target.closest("button"); if (!b) return;
      $(id).querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      st[key] = cast(b.dataset.v); calc();
    });
    seg("omHand", "hand", Number); seg("omPrev", "prev", String);
    const setSeg = (id, v) => $(id).querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.v === String(v))));

    // ----- parts -----
    $("omParts").addEventListener("click", (e) => {
      const b = e.target.closest("button"); const g = b?.closest("[data-part]"); if (!g) return;
      g.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      if (b.dataset.v) st.parts[g.dataset.part] = b.dataset.v; else delete st.parts[g.dataset.part];
      calc();
    });

    // ----- plate shortcut -----
    $("omPlate").addEventListener("input", (e) => { const d = digits(e.target.value).slice(0, 8); e.target.value = d.length >= 7 ? fmtPlate(d) : d; });
    $("omPlate").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); fromPlate(); } });
    $("omPlateGo").addEventListener("click", fromPlate);
    async function fromPlate() {
      const d = digits($("omPlate").value), note = $("omNote1");
      note.classList.remove("bad");
      if (d.length < 7) { note.textContent = "צריך 7 או 8 ספרות."; note.classList.add("bad"); return; }
      note.textContent = "מחפשים במאגר משרד התחבורה...";
      let r;
      try { r = await M.lookupPlate(d); } catch { note.textContent = "אין חיבור למאגר כרגע. אפשר לבחור את הרכב מהרשימה."; note.classList.add("bad"); return; }
      if (!r) { note.textContent = `לא מצאנו את ${fmtPlate(d)}. בחרו את הרכב מהרשימה.`; note.classList.add("bad"); return; }
      st.plateData = r;
      const c = r.car, cat2 = await M.loadCatalog();
      // Find the brand that holds this factory code, then select model/year/trim.
      const model = String(c.kinuy_mishari || "").toUpperCase();
      const brand = cat2.brands.find((b) => cat2.models(b)[model]?.[c.shnat_yitzur]?.includes(c.tozeret_cd));
      $("omRoadY").value = r.road.slice(0, 4); $("omRoadM").value = String(+r.road.slice(5, 7) || 6);
      if (r.km != null) $("omKm").value = num(r.km);
      st.hand = Math.min(6, r.hand); setSeg("omHand", st.hand);
      st.prev = r.prev; setSeg("omPrev", st.prev);
      const chips = [[r.hand === 1 ? "" : "warn", `יד ${r.hand}`], [r.prev === "private" ? "" : "warn", `בעלות קודמת: ${KIND[r.prev]}`]];
      if (r.testKm != null) chips.push(["", `${num(r.testKm)} ק"מ בטסט ${esc(c.mivchan_acharon_dt || "")}`]);
      chips.push([r.recall.length ? "bad" : "", r.recall.length ? `${r.recall.length} ריקול פתוח` : "אין ריקול פתוח"]);
      if (r.hist?.shinui_mivne_ind) chips.push(["warn", "רשום שינוי מבנה"]);
      if (r.hist?.gapam_ind) chips.push(["warn", "הוסב לגז"]);
      if (r.source === "cancelled") chips.push(["bad", "ירד מהכביש"]);
      $("omChips").innerHTML = chips.map(([k, t]) => `<span class="om-chip ${k}">${t}</span>`).join("");
      note.textContent = `${fmtPlate(d)}: ${c.tozeret_nm} ${c.kinuy_mishari || c.degem_nm} ${c.ramat_gimur || ""} ${c.shnat_yitzur}, עלה לכביש ${ym(r.road)}.`;
      renderDetails(r);
      if (brand) {
        $("omMake").value = brand; onMake(); $("omModel").value = model; onModel(); $("omYear").value = String(c.shnat_yitzur);
        await onYear({ degem_cd: c.degem_cd, tozeret_cd: c.tozeret_cd });
      } else if (r.price) {
        // Not in the dropdown catalog: price the exact model code directly.
        st.price = r.price.mehir; st.priceYear = r.price.shnat_yitzur; st.priceNote = `${r.price.shem_yevuan}, ${r.price.shnat_yitzur}`;
        st.carName = `${c.tozeret_nm} ${c.kinuy_mishari || c.degem_nm} ${c.shnat_yitzur}`; calc();
      } else { clearPrice("לדגם הזה אין מחיר יבואן במאגר הממשלתי."); }
    }

    // ----- everything the registry knows about this vehicle -----
    function renderDetails(r) {
      const c = r.car, m = r.model || {};
      const rows = [
        ["יצרן", esc(c.tozeret_nm)], ["דגם", esc(c.kinuy_mishari || c.degem_nm)], ["גרסה", esc(c.ramat_gimur || m.ramat_gimur)],
        ["שנת ייצור", c.shnat_yitzur], ["עלה לכביש", esc(ym(r.road))],
        ["מנוע", m.nefah_manoa ? `${num(m.nefah_manoa)} סמ"ק${m.koah_sus ? ` · ${m.koah_sus} כ"ס` : ""}` : ""],
        ["דלק", esc(c.sug_delek_nm || m.delek_nm)], ["גיר", m.automatic_ind === 1 ? "אוטומטי" : m.automatic_ind === 0 ? "ידני" : ""],
        ["סוג רכב", esc(m.merkav)], ["צבע", esc(c.tzeva_rechev)], ["בעלות היום", esc(c.baalut)],
        ["ק\"מ בטסט האחרון", r.testKm != null ? num(r.testKm) : ""], ["טסט אחרון", esc(c.mivchan_acharon_dt)],
        ["רישיון בתוקף עד", esc(c.tokef_dt)], ["צמיגים", esc(c.zmig_kidmi)], ["כריות אוויר", m.mispar_kariot_avir],
        ["קוד דגם", c.degem_cd ? `${esc(c.degem_nm)} · ${c.degem_cd}` : ""], ["מספר שלדה", c.misgeret ? `<span dir="ltr">${esc(c.misgeret)}</span>` : ""],
        ["רישום ראשון", esc(r.hist?.rishum_rishon_dt)], ["כמה כאלה על הכביש", r.count != null ? num(r.count) : ""],
      ].filter((x) => x[1] !== "" && x[1] != null && x[1] !== undefined);
      $("omDetails").innerHTML = `<div class="om-details">
        <div class="om-card"><h3>כל פרטי הרכב</h3><p class="sub">${fmtPlate(r.plate)} · מתוך רישומי משרד התחבורה</p>
          <dl class="om-kv">${rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("")}</dl></div>
        <div>
          <div class="om-card"><h3>בעלים לאורך השנים</h3><p class="sub">${r.hand === 1 ? "יד ראשונה" : `${r.hand} בעלים`}</p>
            ${r.owners.length ? `<ol class="om-owners">${r.owners.map((o, i) => `<li class="${M.kindOf(o.baalut) !== "private" ? "ls" : ""}"><span class="d">${i + 1}</span><div><b>${esc(o.baalut)}</b><span>מ-${esc(ym(o.baalut_dt))}</span></div></li>`).join("")}</ol>` : `<p class="sub">אין רישום בעלויות במאגר.</p>`}</div>
          ${r.recall.length ? `<div class="om-card" style="margin-top:22px"><h3>ריקול פתוח</h3><p class="sub">תיקון שהיצרן דורש ועוד לא בוצע ברכב</p>${r.recall.map((x) => `<p style="margin:0 0 10px"><b>${esc(x.SUG_TAKALA)}</b><br>${esc(x.TEUR_TAKALA)}</p>`).join("")}</div>` : ""}
          <div class="om-card" style="margin-top:22px"><h3>להשוואה</h3><div class="om-links">
            <a href="https://carlistprice.mot.gov.il/" target="_blank" rel="noopener">מחירון העם <span>משרד התחבורה ↗</span></a>
            <a href="https://levi-itzhak.co.il/" target="_blank" rel="noopener">לוי יצחק <span>האתר הרשמי ↗</span></a>
            <a href="https://www.yad2.co.il/vehicles/cars" target="_blank" rel="noopener">יד2 <span>מודעות מכירה ↗</span></a></div></div>
        </div></div>`;
    }

    // ----- result -----
    function clearPrice(msg) {
      st.price = null;
      $("omRes").innerHTML = `<div class="om-empty"><b>${msg ? esc(msg) : "המחיר יופיע כאן"}</b>${msg ? "" : "בוחרים יצרן, דגם, שנה וגרסה."}</div>`;
    }
    function calc() {
      if (!st.price) return;
      const road = `${$("omRoadY").value}-${String($("omRoadM").value).padStart(2, "0")}`;
      const km = digits($("omKm").value);
      const v = M.valuate({ newPrice: st.price, priceYear: st.priceYear, road, km: km ? +km : null, hand: st.hand, prev: st.prev, priceNote: st.priceNote });
      // depreciation after accident
      const chosen = Object.entries(st.parts);
      let dvPct = chosen.reduce((s, [k, kind]) => s + pct(k, kind), 0) * ageShare(v.ageMonths);
      dvPct = Math.min(dvPct, DV.cap);
      const dv = Math.round(v.value * dvPct / 100 / 10) * 10;
      const plate = st.plateData?.plate;
      $("omRes").innerHTML = `
        <div class="om-price"><div class="car">${esc(st.carName)}</div><div class="l">מחירון עוגן · שווי מוערך היום</div>
          <div class="v">${nis(v.value)}</div><div class="r">בין ${nis(v.low)} ל-${nis(v.high)}</div></div>
        <div class="om-lines"><table>
          ${v.lines.map((l) => `<tr><td>${esc(l.t)}<small>${esc(l.sub)}</small></td><td class="${l.base ? "" : l.amt < 0 ? "om-neg" : "om-pos"}">${l.base ? nis(l.amt) : (l.amt < 0 ? "−" : "+") + nis(Math.abs(l.amt))}</td></tr>`).join("")}
          <tr class="t"><td>שווי מוערך</td><td>${nis(v.value)}</td></tr></table></div>
        ${chosen.length ? `<div class="om-dv"><div class="h">ירידת ערך אחרי תאונה: ${dvPct.toFixed(1)}%</div><div class="big">−${nis(dv)}</div>
          <div class="om-note">${chosen.length} חלקים · לפי גיל הרכב חלה ${Math.round(ageShare(v.ageMonths) * 100)}% מהטבלה${dvPct >= DV.cap ? ` · הגיע לתקרה (${DV.cap}%)` : ""}</div>
          <div style="margin-top:8px">שווי אחרי התיקון: <b>${nis(v.value - dv)}</b></div></div>` : ""}
        <div class="om-actions">
          <button type="button" class="om-btn soft" id="omPrint">הדפסה / PDF</button>
          <a class="om-btn" href="index.html${plate ? `?plate=${plate}` : ""}#intake">פתיחת תיק שמאות</a>
        </div>
        <p class="om-disc" style="padding:0 24px 18px;margin:0">הערכה לפי מאגרי משרד התחבורה, נכון ל-${new Date().toLocaleDateString("he-IL")}. מחירון עוגן לא קשור למחירון אחר, והוא לא מחליף שומה.</p>`;
      $("omPrint").addEventListener("click", () => window.print());
    }

    // ----- appraiser settings -----
    function renderAdv() {
      const P = M.P;
      $("omAdv").innerHTML = `
        <p class="om-disc">השינויים נשמרים רק בדפדפן שלכם.</p>
        <div class="om-pgrid">${Object.keys(M.DEF).map((k) => `<div class="om-f"><label for="op_${k}">${M.LABELS[k]}</label><input id="op_${k}" data-p="${k}" inputmode="decimal" value="${P[k]}"></div>`).join("")}</div>
        <h4 style="margin:16px 0 6px">ירידת ערך לפי חלק (% תוקן / % הוחלף)</h4>
        <div class="om-pgrid">${PARTS.flatMap((g) => g[2]).map(([k, n]) => `<div class="om-f"><label>${n}</label><div class="om-row2"><input data-d="${k}" data-k="fix" inputmode="decimal" value="${pct(k, "fix")}" aria-label="${n} תוקן"><input data-d="${k}" data-k="rep" inputmode="decimal" value="${pct(k, "rep")}" aria-label="${n} הוחלף"></div></div>`).join("")}</div>
        <h4 style="margin:16px 0 6px">חלק מהטבלה לפי גיל הרכב (%)</h4>
        <div class="om-pgrid">${[["ageA", "עד 3 שנים"], ["ageB", "3–5 שנים"], ["ageC", "5–7 שנים"], ["ageD", "7–10 שנים"], ["ageE", "מעל 10 שנים"], ["cap", "תקרת ירידת ערך (%)"]].map(([k, t]) => `<div class="om-f"><label>${t}</label><input data-a="${k}" inputmode="decimal" value="${DV[k]}"></div>`).join("")}</div>
        <button type="button" class="om-btn soft" id="omReset" style="margin-top:12px">חזרה לברירת המחדל</button>`;
      $("omAdv").querySelectorAll("input").forEach((inp) => inp.addEventListener("change", () => {
        const x = parseFloat(inp.value); if (isNaN(x) || x < 0) return;
        if (inp.dataset.p) { M.P[inp.dataset.p] = x; M.saveP(); }
        if (inp.dataset.d) { DV.parts[inp.dataset.d] = { ...(DV.parts[inp.dataset.d] || {}), [inp.dataset.k]: x }; saveDV(); }
        if (inp.dataset.a) { DV[inp.dataset.a] = x; saveDV(); }
        calc();
      }));
      $("omReset").addEventListener("click", () => { M.resetP(); Object.assign(DV, DV_DEF, { parts: {} }); saveDV(); renderAdv(); calc(); });
    }
    renderAdv();
    clearPrice();

    // Open with ?plate= (e.g. a link from elsewhere on the site)
    const qp = new URLSearchParams(location.search).get("plate");
    if (qp && /^\d{7,8}$/.test(qp) && root.dataset.readPlate === "1") { $("omPlate").value = fmtPlate(qp); fromPlate(); }
  }

  window.OgenMehironWidget = { mount };
  document.querySelectorAll("[data-ogen-mehiron]").forEach(mount);
})();
