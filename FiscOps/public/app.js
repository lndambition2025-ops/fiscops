/* FiscOps — UI v2 (single-file) + Supabase Auth (phase test)
   - Vercel deployment: Next.js serves /public assets.
   - Env injected by /env (NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY)
*/

const KEY = "fiscops_data_v2";
const SETTINGS_KEY = "fiscops_settings_v2";
let saveTimer = null;

const DEFAULT_SETTINGS = {
  centerName: "Centre des impôts d'Owendo",
  monthLabel: "Exercice 2026",
  objectiveAnnual: 120_000_000_000,
  ifuNames: ["IFU 1","IFU 2","IFU 3","IFU 4","IFU 5"],
  ifuDefinitions: {
    "IFU 1": { label:"BTP", sectors:["BTP","Construction","Travaux publics"] },
    "IFU 2": { label:"Commerce / Restauration", sectors:["Restaurant","Hôtel","Tourisme","Décoration","Commerce","Boulangerie"] },
    "IFU 3": { label:"Industrie / Ressources", sectors:["Forêt","Bois","Logistique","Industrie","Pétrole","Mine","Transport"] },
    "IFU 4": { label:"Réglementé / Santé / Éducation", sectors:["Notaire","Avocat","École","Immobilier","Établissement privé","Pharmacie","Clinique"] },
    "IFU 5": { label:"Services divers", sectors:["Communication","Laverie","Pressing","Télécommunication","Pompes funèbres","Gardiennage","Sécurité","Placement","Location d'engins","Nettoyage"] },
  },
  reference2025: {
    total: 82_022_587_928,
    ifuTotals: {
      "IFU 1": 7_818_798_832,
      "IFU 2": 6_435_389_081,
      "IFU 3": 36_545_071_977,
      "IFU 4": 21_079_669_793,
      "IFU 5": 10_143_658_245
    },
    spontaneous: 78_204_558_091,
    amr: 3_818_992_397
  },
  thresholds: { criticalDebt: 50_000_000, criticalAgeDays: 90, immediateIndex: 80 },
  ui: { pageSize: 25 }
};

const state = {
  settings: loadSettings(),
  data: { taxpayers: [], actionsLog: [], weekPlan: {} },
  view: "portefeuille",
  selectedId: null,
  q: "",
  filterIFU: "Tous",
  filterStatus: "Tous",
  page: 1,
};

// ---- Supabase bridge ----
const ENV = window.__FISCOPS_ENV__ || {};
const SUPABASE_URL = ENV.SUPABASE_URL || "";
const SUPABASE_ANON_KEY = ENV.SUPABASE_ANON_KEY || "";
const supabase = (SUPABASE_URL && SUPABASE_ANON_KEY) ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;
const STORAGE_MODE = supabase ? "supabase" : "local";
const CENTER_KEY = "fiscops_center_id";
function getCenterId(){ return localStorage.getItem(CENTER_KEY) || "OWENDO"; }
function setCenterId(id){ localStorage.setItem(CENTER_KEY, id); }

// ---- Helpers ----
const fmt = new Intl.NumberFormat("fr-FR");
function fmtFCFA(n){ return `${fmt.format(Math.round(n||0))} FCFA`; }
function pctObjective(amount){
  const obj = state.settings.objectiveAnnual || 0;
  if (!obj) return 0;
  return Math.round((Math.max(0, amount||0) / obj) * 10000) / 100;
}
function escapeHtml(s){ return String(s ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c])); }
function safeParse(s){ try { return JSON.parse(s); } catch { return null; } }
function uid(){ return Math.random().toString(16).slice(2) + Date.now().toString(16); }

// ---- Auth (phase test) ----
async function ensureAuth(){
  if (!supabase) return true; // local demo
  const { data } = await supabase.auth.getSession();
  if (data.session) return true;
  renderLogin();
  return false;
}

function renderLogin(){
  document.getElementById("app").innerHTML = `
    <div class="min-h-screen flex items-center justify-center bg-slate-50">
      <div class="bg-white shadow rounded-xl p-6 w-full max-w-sm">
        <div class="text-lg font-semibold text-slate-900">Connexion FiscOps</div>
        <div class="text-sm text-slate-500 mt-1">Phase test — Auth email</div>
        <div class="mt-4 space-y-3">
          <input id="lg_email" class="w-full border rounded-lg p-2" placeholder="Email" />
          <input id="lg_pass" type="password" class="w-full border rounded-lg p-2" placeholder="Mot de passe" />
          <button id="lg_btn" class="w-full bg-dgi-600 hover:bg-dgi-700 text-white rounded-lg p-2">Se connecter</button>
          <button id="su_btn" class="w-full bg-slate-900 text-white rounded-lg p-2">Créer un compte</button>
        </div>
        <div id="lg_msg" class="text-sm text-red-600 mt-3"></div>
      </div>
    </div>
  `;
  document.getElementById("lg_btn").onclick = login;
  document.getElementById("su_btn").onclick = signup;
}

async function login(){
  const email = document.getElementById("lg_email").value.trim();
  const password = document.getElementById("lg_pass").value;
  const msg = document.getElementById("lg_msg");
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) { msg.textContent = error.message; return; }
  location.reload();
}
async function signup(){
  const email = document.getElementById("lg_email").value.trim();
  const password = document.getElementById("lg_pass").value;
  const msg = document.getElementById("lg_msg");
  const { error } = await supabase.auth.signUp({ email, password });
  if (error) { msg.textContent = error.message; return; }
  msg.textContent = "Compte créé. Connecte-toi.";
}

// ---- Data IO ----
async function loadData(){
  if (STORAGE_MODE === "local") {
    const data = safeParse(localStorage.getItem(KEY));
    if (data && data.taxpayers) return data;
    const seeded = seedData();
    localStorage.setItem(KEY, JSON.stringify(seeded));
    return seeded;
  }
  const center_id = getCenterId();

  const { data: taxpayers, error: e1 } = await supabase
    .from("taxpayers").select("*")
    .eq("center_id", center_id)
    .order("updated_at", { ascending:false })
    .limit(2000);
  if (e1) throw e1;

  const { data: actionsLog, error: e2 } = await supabase
    .from("actions").select("*")
    .eq("center_id", center_id)
    .order("at", { ascending:false })
    .limit(5000);
  if (e2) throw e2;

  const { data: wp } = await supabase
    .from("week_plans").select("*")
    .eq("center_id", center_id)
    .maybeSingle();

  return {
    taxpayers: (taxpayers||[]).map(mapTaxpayerFromDb),
    actionsLog: (actionsLog||[]).map(a => ({ id:a.id, type:a.type, taxpayerId:a.taxpayer_external_id, at:a.at, meta:a.meta||{} })),
    weekPlan: wp?.payload || {}
  };
}

function saveDataDebounced(){
  if (STORAGE_MODE === "local") {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try { localStorage.setItem(KEY, JSON.stringify(state.data)); } catch {}
    }, 600);
    return;
  }
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try {
      const center_id = getCenterId();
      const payload = (state.data.taxpayers||[]).map(tp => mapTaxpayerToDb(tp, center_id));
      for (let i=0;i<payload.length;i+=200){
        const chunk = payload.slice(i,i+200);
        const { error } = await supabase.from("taxpayers").upsert(chunk, { onConflict:"center_id,external_id" });
        if (error) console.error(error);
      }
      const wp = { center_id, payload: state.data.weekPlan || {}, updated_at: new Date().toISOString() };
      await supabase.from("week_plans").upsert(wp, { onConflict:"center_id" });
    } catch(e){ console.error(e); }
  }, 800);
}

function mapTaxpayerFromDb(r){
  return {
    id: r.external_id,
    name: r.name,
    sector: r.sector,
    type: r.company_type,
    ca: r.ca,
    debt: r.debt,
    ageDays: r.age_days,
    status: r.status,
    ifu: r.ifu,
    notes: r.notes || "",
    lastActionAt: r.last_action_at || null,
  };
}
function mapTaxpayerToDb(tp, center_id){
  return {
    center_id,
    external_id: tp.id,
    name: tp.name,
    sector: tp.sector,
    company_type: tp.type,
    ca: tp.ca,
    debt: tp.debt,
    age_days: tp.ageDays,
    status: tp.status,
    ifu: tp.ifu,
    notes: tp.notes || "",
    last_action_at: tp.lastActionAt,
    updated_at: new Date().toISOString(),
  };
}

function loadSettings(){
  const s = safeParse(localStorage.getItem(SETTINGS_KEY));
  return s ? { ...DEFAULT_SETTINGS, ...s } : { ...DEFAULT_SETTINGS };
}

// ---- Logic ----
function computeTotals(){
  const tps = state.data.taxpayers || [];
  const recovered = 0;
  const debtTotal = tps.reduce((a,t)=>a+(t.debt||0),0);
  const caTotal = tps.reduce((a,t)=>a+(t.ca||0),0);
  const ratio = caTotal ? (debtTotal/caTotal)*100 : 0;
  const crit = tps.filter(t => (t.debt||0) >= state.settings.thresholds.criticalDebt || (t.ageDays||0) >= state.settings.thresholds.criticalAgeDays).length;
  return { recovered, debtTotal, caTotal, ratio, crit };
}
function decisionIndex(tp){
  const debt = tp.debt||0;
  const age = tp.ageDays||0;
  const d = Math.min(100, (debt / 50_000_000) * 60);
  const a = Math.min(40, (age / 90) * 40);
  return Math.round(Math.min(100, d + a));
}
function topPriorities(){
  const list = [...(state.data.taxpayers||[])];
  list.sort((x,y)=> (decisionIndex(y)-decisionIndex(x)) || ((y.debt||0)-(x.debt||0)));
  const top = list.slice(0, 10);
  const impact = top.reduce((a,t)=>a+(t.debt||0),0);
  return { top, impact };
}

// ---- UI ----
function navButton(id, label){
  const active = state.view === id;
  return `<button data-view="${id}" class="px-3 py-2 rounded-lg text-sm ${active?'bg-dgi-600 text-white':'bg-white border text-slate-700 hover:bg-slate-50'}">${label}</button>`;
}
function kpi(label, value){
  return `<div class="bg-white border rounded-xl p-3">
    <div class="text-xs text-slate-500">${escapeHtml(label)}</div>
    <div class="text-lg font-semibold mt-1">${escapeHtml(value)}</div>
  </div>`;
}

function render(){
  const totals = computeTotals();
  const { top, impact } = topPriorities();

  const html = `
  <div class="max-w-7xl mx-auto p-4">
    <div class="flex items-start justify-between gap-4 flex-wrap">
      <div>
        <div class="text-xs text-slate-500">▲ FiscOps</div>
        <div class="text-2xl font-semibold">Ce mois</div>
        <div class="text-sm text-slate-600 mt-1">${escapeHtml(state.settings.centerName)} • ${escapeHtml(state.settings.monthLabel)}</div>
      </div>
      <div class="flex gap-2 flex-wrap">
        ${navButton("portefeuille","📁 Portefeuille")}
        ${navButton("segments","🧩 Segments")}
        ${navButton("plan","🗓️ Plan semaine")}
        ${navButton("ifu","👥 IFU")}
        ${navButton("rapport","📄 Rapport")}
        ${STORAGE_MODE==="supabase" ? `<button id="btnLogout" class="px-3 py-2 rounded-lg text-sm bg-white border hover:bg-slate-50">Se déconnecter</button>` : ""}
      </div>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4">
      ${kpi("Recouvrement total (obj 2026: 120 Md)", fmtFCFA(totals.recovered))}
      ${kpi("Dette totale", fmtFCFA(totals.debtTotal))}
      ${kpi("Dettes critiques", String(totals.crit))}
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-3 mt-3">
      <div class="lg:col-span-2 bg-white border rounded-xl p-4">
        <div class="flex items-center justify-between">
          <div class="font-semibold">📌 PRIORITÉS DU JOUR</div>
          <div class="text-xs text-slate-500">Impact : +${fmtFCFA(impact)} (${pctObjective(impact)}%)</div>
        </div>
        <div class="text-sm text-slate-600 mt-1">${top.length} dossiers à traiter immédiatement</div>
        <div class="mt-3 overflow-auto">
          <table class="w-full text-sm">
            <thead class="text-xs text-slate-500">
              <tr class="border-b">
                <th class="py-2 text-left">Contribuable</th>
                <th class="py-2 text-left">IFU</th>
                <th class="py-2 text-right">Dette</th>
                <th class="py-2 text-right">Indice</th>
              </tr>
            </thead>
            <tbody>
              ${top.map(tp => `
                <tr class="border-b hover:bg-slate-50 cursor-pointer" data-open="${escapeHtml(tp.id)}">
                  <td class="py-2">${escapeHtml(tp.name)}</td>
                  <td class="py-2">${escapeHtml(tp.ifu)}</td>
                  <td class="py-2 text-right">${escapeHtml(fmtFCFA(tp.debt))}</td>
                  <td class="py-2 text-right">${decisionIndex(tp)} / 100</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      </div>

      <div class="bg-white border rounded-xl p-4">
        <div class="font-semibold">Portefeuille des contribuables</div>
        <div class="mt-3">
          <input id="q" value="${escapeHtml(state.q)}" placeholder="Rechercher (nom, secteur, type)" class="w-full border rounded-lg p-2 text-sm"/>
          <div class="grid grid-cols-2 gap-2 mt-2">
            <select id="fIFU" class="border rounded-lg p-2 text-sm">
              <option ${state.filterIFU==="Tous"?"selected":""}>Tous</option>
              ${state.settings.ifuNames.map(n=>`<option ${state.filterIFU===n?"selected":""}>${n}</option>`).join("")}
            </select>
            <select id="fStatus" class="border rounded-lg p-2 text-sm">
              ${["Tous","Normal","Critique","En cours","Payé"].map(s=>`<option ${state.filterStatus===s?"selected":""}>${s}</option>`).join("")}
            </select>
          </div>
          <div class="mt-2 flex gap-2">
            <button id="btnNew" class="px-3 py-2 rounded-lg bg-dgi-600 text-white text-sm">➕ Nouveau</button>
            <button id="btnSave" class="px-3 py-2 rounded-lg bg-white border text-sm">💾 Enregistrer</button>
          </div>
        </div>
      </div>
    </div>

    <div class="mt-4">${renderView()}</div>
  </div>
  `;

  document.getElementById("app").innerHTML = html;
  wireCommon();

  if (STORAGE_MODE==="supabase"){
    document.getElementById("btnLogout")?.addEventListener("click", async ()=>{
      await supabase.auth.signOut();
      location.reload();
    });
  }
}

function renderView(){
  if (state.view === "portefeuille") return renderPortefeuille();
  if (state.view === "ifu") return renderIFU();
  if (state.view === "rapport") return renderRapport();
  if (state.view === "segments") return `<div class="bg-white border rounded-xl p-4 text-sm text-slate-600">Segments (phase test) — à activer lorsque les données réelles sont intégrées.</div>`;
  if (state.view === "plan") return `<div class="bg-white border rounded-xl p-4 text-sm text-slate-600">Plan semaine (phase test) — à activer avec le module actions.</div>`;
  return "";
}

function filteredTaxpayers(){
  let list = [...(state.data.taxpayers||[])];
  const q = state.q.trim().toLowerCase();
  if (q) list = list.filter(t => (t.name||"").toLowerCase().includes(q) || (t.sector||"").toLowerCase().includes(q) || (t.type||"").toLowerCase().includes(q));
  if (state.filterIFU !== "Tous") list = list.filter(t => t.ifu === state.filterIFU);
  if (state.filterStatus !== "Tous") list = list.filter(t => (t.status||"Normal") === state.filterStatus);
  return list;
}

function renderPortefeuille(){
  const list = filteredTaxpayers();
  const pageSize = state.settings.ui.pageSize || 25;
  const pages = Math.max(1, Math.ceil(list.length / pageSize));
  const page = Math.min(state.page, pages);
  const slice = list.slice((page-1)*pageSize, page*pageSize);

  return `
  <div class="bg-white border rounded-xl p-4">
    <div class="flex items-center justify-between flex-wrap gap-2">
      <div class="font-semibold">Portefeuille</div>
      <div class="text-xs text-slate-500">${list.length} dossiers • page ${page}/${pages}</div>
    </div>
    <div class="mt-3 overflow-auto">
      <table class="w-full text-sm">
        <thead class="text-xs text-slate-500">
          <tr class="border-b">
            <th class="py-2 text-left">Contribuable</th>
            <th class="py-2 text-left">Secteur</th>
            <th class="py-2 text-left">IFU</th>
            <th class="py-2 text-right">CA</th>
            <th class="py-2 text-right">Montant dû</th>
            <th class="py-2 text-right">Ancienneté</th>
            <th class="py-2 text-right">Indice</th>
            <th class="py-2 text-left">Statut</th>
          </tr>
        </thead>
        <tbody>
          ${slice.map(t=>`
            <tr class="border-b hover:bg-slate-50 cursor-pointer" data-open="${escapeHtml(t.id)}">
              <td class="py-2">${escapeHtml(t.name)}</td>
              <td class="py-2">${escapeHtml(t.sector)}</td>
              <td class="py-2">${escapeHtml(t.ifu)}</td>
              <td class="py-2 text-right">${escapeHtml(fmtFCFA(t.ca))}</td>
              <td class="py-2 text-right">${escapeHtml(fmtFCFA(t.debt))}</td>
              <td class="py-2 text-right">${escapeHtml(String(t.ageDays||0))} j</td>
              <td class="py-2 text-right">${decisionIndex(t)} / 100</td>
              <td class="py-2">${escapeHtml(t.status||"Normal")}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>

    <div class="mt-3 flex items-center justify-between">
      <div class="flex gap-2">
        <button class="px-3 py-2 rounded-lg bg-white border text-sm" id="prevPage">◀</button>
        <button class="px-3 py-2 rounded-lg bg-white border text-sm" id="nextPage">▶</button>
      </div>
      <div class="text-xs text-slate-500">Objectif 2026: 120 Md • réf. 2025: ${fmtFCFA(DEFAULT_SETTINGS.reference2025.total)}</div>
    </div>
  </div>
  `;
}

function renderIFU(){
  const tps = state.data.taxpayers||[];
  const rows = state.settings.ifuNames.map(ifu => {
    const list = tps.filter(t=>t.ifu===ifu);
    const debt = list.reduce((a,t)=>a+(t.debt||0),0);
    const crit = list.filter(t => (t.debt||0)>=state.settings.thresholds.criticalDebt || (t.ageDays||0)>=state.settings.thresholds.criticalAgeDays).length;
    return { ifu, dossiers:list.length, debt, crit };
  });

  return `
  <div class="bg-white border rounded-xl p-4">
    <div class="font-semibold">IFU</div>
    <div class="mt-2 text-xs text-slate-500">Périmètres sectoriels Owendo intégrés (phase test).</div>
    <div class="mt-3 overflow-auto">
      <table class="w-full text-sm">
        <thead class="text-xs text-slate-500">
          <tr class="border-b">
            <th class="py-2 text-left">IFU</th>
            <th class="py-2 text-right">Dossiers</th>
            <th class="py-2 text-right">Dette</th>
            <th class="py-2 text-right">Critiques</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(r=>`
            <tr class="border-b">
              <td class="py-2">
                <div class="font-medium">${escapeHtml(r.ifu)}</div>
                <div class="text-xs text-slate-500">${escapeHtml(state.settings.ifuDefinitions?.[r.ifu]?.label || "")}</div>
              </td>
              <td class="py-2 text-right">${r.dossiers}</td>
              <td class="py-2 text-right">${escapeHtml(fmtFCFA(r.debt))} <span class="text-xs text-slate-500">(${pctObjective(r.debt)}%)</span></td>
              <td class="py-2 text-right">${r.crit}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  </div>
  `;
}

function renderRapport(){
  return `
  <div class="bg-white border rounded-xl p-4">
    <div class="flex items-center justify-between">
      <div class="font-semibold">Rapport 1 page</div>
      <button id="btnPdf" class="px-3 py-2 rounded-lg bg-dgi-600 text-white text-sm">🖨️ Générer PDF</button>
    </div>
    <div class="text-sm text-slate-600 mt-2">
      Objectif annuel 2026 : <span class="font-semibold">${escapeHtml(fmtFCFA(state.settings.objectiveAnnual))}</span>
      <span class="text-xs text-slate-500"> (réf. 2025 : ${escapeHtml(fmtFCFA(state.settings.reference2025.total))})</span>
    </div>
  </div>
  `;
}

function wireCommon(){
  document.querySelectorAll("[data-view]").forEach(b=>{
    b.addEventListener("click", ()=>{
      state.view = b.getAttribute("data-view");
      render();
    });
  });

  document.getElementById("q")?.addEventListener("input", (e)=>{ state.q = e.target.value; state.page = 1; render(); });
  document.getElementById("fIFU")?.addEventListener("change", (e)=>{ state.filterIFU = e.target.value; state.page = 1; render(); });
  document.getElementById("fStatus")?.addEventListener("change", (e)=>{ state.filterStatus = e.target.value; state.page = 1; render(); });

  document.getElementById("btnNew")?.addEventListener("click", ()=>{
    const t = { id: "T"+uid().slice(0,8).toUpperCase(), name:"Nouveau contribuable", sector:"Commerce", type:"PME", ca:0, debt:0, ageDays:0, status:"Normal", ifu:"IFU 5", notes:"" };
    state.data.taxpayers.unshift(t);
    saveDataDebounced();
    render();
  });

  document.getElementById("btnSave")?.addEventListener("click", ()=>{
    saveDataDebounced();
    document.title = "FiscOps (enregistré)";
    setTimeout(()=>document.title="FiscOps — DGI", 800);
  });

  document.querySelectorAll("[data-open]").forEach(r=>{
    r.addEventListener("click", ()=> openDossier(r.getAttribute("data-open")));
  });

  document.getElementById("prevPage")?.addEventListener("click", ()=>{ state.page = Math.max(1, state.page-1); render(); });
  document.getElementById("nextPage")?.addEventListener("click", ()=>{
    const pages = Math.max(1, Math.ceil(filteredTaxpayers().length / (state.settings.ui.pageSize||25)));
    state.page = Math.min(pages, state.page+1); render();
  });

  document.getElementById("btnPdf")?.addEventListener("click", generatePDF);
}

function openDossier(id){
  const tp = (state.data.taxpayers||[]).find(t=>t.id===id);
  if (!tp) return;
  const idx = decisionIndex(tp);
  const recommended = idx >= state.settings.thresholds.immediateIndex ? "Action immédiate requise" : "Suivi standard";
  const panel = `
    <div class="fixed inset-0 bg-black/30 flex items-center justify-center p-4">
      <div class="bg-white w-full max-w-2xl rounded-xl shadow-lg p-4">
        <div class="flex items-start justify-between">
          <div>
            <div class="text-lg font-semibold">${escapeHtml(tp.name)}</div>
            <div class="text-sm text-slate-500">${escapeHtml(tp.sector)} • ${escapeHtml(tp.type)} • ${escapeHtml(tp.ifu)}</div>
          </div>
          <button id="closePanel" class="px-3 py-1 rounded-lg bg-white border text-sm">Fermer</button>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4">
          ${kpi("CA", fmtFCFA(tp.ca))}
          ${kpi("Montant dû", fmtFCFA(tp.debt))}
          ${kpi("Ancienneté", `${tp.ageDays||0} jours`)}
        </div>

        <div class="mt-4 bg-slate-50 border rounded-xl p-3">
          <div class="text-sm font-semibold">Indice de décision : ${idx} / 100</div>
          <div class="mt-2 text-xs text-slate-500">Recommandation : <span class="font-medium text-slate-800">${escapeHtml(recommended)}</span></div>
          <div class="mt-1 text-xs text-slate-500">Contribution à l’objectif (120 Md) : <span class="font-medium text-slate-800">${pctObjective(tp.debt)}%</span></div>
        </div>

        <div class="mt-4">
          <label class="text-xs text-slate-500">Notes</label>
          <textarea id="tpNotes" class="w-full border rounded-lg p-2 text-sm" rows="3">${escapeHtml(tp.notes||"")}</textarea>
          <div class="mt-2 flex gap-2">
            <button id="saveNotes" class="px-3 py-2 rounded-lg bg-dgi-600 text-white text-sm">Enregistrer</button>
            <select id="tpIFU" class="border rounded-lg p-2 text-sm">
              ${state.settings.ifuNames.map(n=>`<option ${tp.ifu===n?"selected":""}>${n}</option>`).join("")}
            </select>
            <select id="tpStatus" class="border rounded-lg p-2 text-sm">
              ${["Normal","Critique","En cours","Payé"].map(s=>`<option ${tp.status===s?"selected":""}>${s}</option>`).join("")}
            </select>
          </div>
        </div>
      </div>
    </div>
  `;
  const wrap = document.createElement("div");
  wrap.id = "panelWrap";
  wrap.innerHTML = panel;
  document.body.appendChild(wrap);

  document.getElementById("closePanel").onclick = ()=> wrap.remove();
  document.getElementById("saveNotes").onclick = ()=>{
    tp.notes = document.getElementById("tpNotes").value;
    tp.ifu = document.getElementById("tpIFU").value;
    tp.status = document.getElementById("tpStatus").value;
    tp.lastActionAt = new Date().toISOString();
    saveDataDebounced();
    wrap.remove();
    render();
  };
}

function generatePDF(){
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit:"pt", format:"a4" });
  let y = 48;
  doc.setFont("helvetica","bold"); doc.setFontSize(14);
  doc.text("FiscOps — Rapport 1 page", 40, y); y += 18;
  doc.setFont("helvetica","normal"); doc.setFontSize(10);
  doc.text(`${state.settings.centerName} • ${state.settings.monthLabel}`, 40, y); y += 14;
  doc.text(`Objectif annuel 2026 : ${fmtFCFA(state.settings.objectiveAnnual)} (réf. 2025 : ${fmtFCFA(state.settings.reference2025.total)})`, 40, y); y += 14;

  const totals = computeTotals();
  doc.text(`Dette totale : ${fmtFCFA(totals.debtTotal)} • Dettes critiques : ${totals.crit}`, 40, y); y += 14;

  const { top, impact } = topPriorities();
  doc.setFont("helvetica","bold"); doc.text("Priorités", 40, y); y += 12;
  doc.setFont("helvetica","normal");
  doc.text(`Impact potentiel estimé : +${fmtFCFA(impact)} (${pctObjective(impact)}%)`, 40, y); y += 12;

  top.slice(0, 8).forEach(tp=>{
    doc.text(`• ${tp.name} — ${tp.ifu} — ${fmtFCFA(tp.debt)} — Indice ${decisionIndex(tp)}/100`, 48, y);
    y += 12;
  });

  y += 8;
  doc.setFont("helvetica","italic");
  doc.text("Les décisions présentées dans ce rapport sont basées sur des indicateurs objectifs calculés automatiquement par le système.", 40, y);

  doc.save("FiscOps_Rapport_Owendo.pdf");
}

// ---- Seed (demo) ----
function inferIFUFromSector(sector){
  const defs = state.settings.ifuDefinitions || {};
  const s = String(sector||"").toLowerCase();
  for (const [ifu, def] of Object.entries(defs)){
    const keys = (def.sectors||[]).map(x=>String(x).toLowerCase());
    if (keys.some(k=>s.includes(k) || k.includes(s))) return ifu;
  }
  return "IFU 5";
}
function seedData(){
  const sectors = ["BTP","Commerce","Restaurant","Hôtel","Logistique","Industrie","Transport","Pharmacie","Clinique","Notaire","Communication","Nettoyage"];
  const types = ["PME","TPE","GE"];
  const statuses = ["Normal","Normal","Normal","Critique","En cours"];
  const taxpayers = Array.from({length: 120}).map((_,i)=>{
    const sector = sectors[i % sectors.length];
    const ca = (Math.random()<0.2? 1_200_000_000 : Math.random()<0.5? 180_000_000 : 25_000_000) * (0.6 + Math.random());
    const debt = Math.max(0, (ca * (0.02 + Math.random()*0.12)));
    const ageDays = Math.floor(10 + Math.random()*220);
    const ifu = inferIFUFromSector(sector);
    return {
      id: "T"+String(i+1).padStart(4,"0"),
      name: `Contribuable ${i+1}`,
      sector,
      type: types[i % types.length],
      ca: Math.round(ca),
      debt: Math.round(debt),
      ageDays,
      status: statuses[i % statuses.length],
      ifu,
      notes: ""
    };
  });
  return { taxpayers, actionsLog: [], weekPlan: {} };
}

// ---- Boot ----
(async function boot(){
  const ok = await ensureAuth();
  if (!ok) return;
  try {
    state.data = await loadData();
  } catch(e){
    console.error(e);
    state.data = seedData();
  }
  render();
})();
