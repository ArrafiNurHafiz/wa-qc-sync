// public/app.js — Client UI Web Command Center & Mobile QC Form (wa-qc-sync)
const state = {
  master: { products: [], vendorsPre: [], vendorsFin: [], criteria: [] },
  help: { helpText: "", criteriaText: "", templateText: "" },
  reports: [],
  summary: null,
  gasConnected: false,
  dataVersion: 0,
  protoMode: "empty",
  items: []
};

const EXAMPLES = {
  empty: () => state.help.templateText || "",
  example: () => `FORM QC
Vendor   : CV Sumber Kayu
PO       : PO-2026-112

[ITEM 1]
Barang   : Meja Jati Custom
Tahap    : Unfinish
Periksa  : 1000
MC %     : 13.5

[Isi angka rusak, kosong = aman, "-" = T/B]
Bluestain   : 30
Cutter Mark : 20
Crack       : 10
Warna       : -

Catatan  : 60 pcs disortir untuk rework vendor
Keputusan: Bersyarat`,
  multi: () => `[ITEM 2]
Barang   : Kursi Kayu Custom
Tahap    : Unfinish
Periksa  : 500
MC %     : 14.0

[Isi angka rusak, kosong = aman, "-" = T/B]
Crack       : 5

Catatan  : 5 pcs retak ringan
Keputusan: Bersyarat`
};

// --- Utilities ---
function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getTodayIso() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function isoToIdDate(iso) {
  const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso || "";
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function formatDisplayDate(raw) {
  const str = String(raw || "").trim();
  if (!str) return "-";
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(str)) return str;
  const parsed = new Date(str);
  if (!Number.isNaN(parsed.getTime())) {
    const d = String(parsed.getDate()).padStart(2, "0");
    const m = String(parsed.getMonth() + 1).padStart(2, "0");
    const y = parsed.getFullYear();
    return `${d}/${m}/${y}`;
  }
  return str;
}

function showToast(message, type = "success") {
  const stack = document.getElementById("toastStack");
  if (!stack) return;
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.title = "Klik untuk menutup";
  toast.innerHTML = `<span class="mono">[${escapeHtml(type.toUpperCase())}]</span><span>${escapeHtml(message)}</span>`;
  toast.addEventListener("click", () => toast.remove());
  stack.appendChild(toast);
  setTimeout(() => {
    toast.remove();
  }, 4000);
}

async function copyText(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      showToast("Disalin ke clipboard.", "success");
      return;
    }
  } catch (_) {}
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand("copy");
    showToast("Disalin ke clipboard.", "success");
  } catch (_) {
    showToast("Gagal menyalin otomatis.", "error");
  }
  ta.remove();
}

function openModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add("show");
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove("show");
}

function showConfirmDialog({
  title = "Konfirmasi",
  message = "",
  tag = "KONFIRMASI",
  confirmText = "Lanjutkan",
  destruct = true,
  requireInput = false,
  inputLabel = "ALASAN *"
}) {
  return new Promise((resolve) => {
    const modal = document.getElementById("modalConfirm");
    const titleEl = document.getElementById("confirmTitle");
    const msgEl = document.getElementById("confirmMessage");
    const tagEl = document.getElementById("confirmTag");
    const okBtn = document.getElementById("confirmOkBtn");
    const cancelBtn = document.getElementById("confirmCancelBtn");
    const closeBtn = document.getElementById("confirmCloseBtn");
    const inputGroup = document.getElementById("confirmInputGroup");
    const inputEl = document.getElementById("confirmReasonInput");
    const inputLabelEl = document.getElementById("confirmInputLabel");
    const errEl = document.getElementById("errConfirmInput");

    titleEl.textContent = title;
    msgEl.textContent = message;
    tagEl.textContent = tag;
    okBtn.textContent = confirmText;
    okBtn.className = destruct ? "btn btn-destruct" : "btn btn-primary";

    if (requireInput) {
      inputGroup.classList.remove("hidden");
      inputLabelEl.textContent = inputLabel;
      inputEl.value = "";
      errEl.classList.add("hidden");
    } else {
      inputGroup.classList.add("hidden");
    }

    openModal("modalConfirm");
    if (requireInput) inputEl.focus();

    function finish(result) {
      closeModal("modalConfirm");
      okBtn.removeEventListener("click", onOk);
      cancelBtn.removeEventListener("click", onCancel);
      closeBtn.removeEventListener("click", onCancel);
      resolve(result);
    }

    function onOk() {
      if (requireInput) {
        const val = inputEl.value.trim();
        if (!val) {
          errEl.textContent = "Alasan pembatalan wajib diisi.";
          errEl.classList.remove("hidden");
          inputEl.focus();
          return;
        }
        finish({ confirmed: true, value: val });
      } else {
        finish({ confirmed: true, value: "" });
      }
    }

    function onCancel() {
      finish({ confirmed: false, value: "" });
    }

    okBtn.addEventListener("click", onOk);
    cancelBtn.addEventListener("click", onCancel);
    closeBtn.addEventListener("click", onCancel);
  });
}

// --- Navigation & Global Modals ---
function switchTab(tabId) {
  document.querySelectorAll(".nav-pill").forEach((b) => {
    b.classList.toggle("active", b.dataset.tab === tabId);
  });
  document.querySelectorAll(".view-panel").forEach((p) => {
    p.classList.toggle("active", p.id === tabId);
  });

  if (tabId === "tab-history") {
    loadReports();
  } else if (tabId === "tab-settings") {
    loadSettings();
    loadQueueStatus();
  }
}

document.querySelectorAll(".nav-pill").forEach((btn) => {
  btn.addEventListener("click", () => switchTab(btn.dataset.tab));
});

document.querySelectorAll("[data-close-modal]").forEach((btn) => {
  btn.addEventListener("click", () => closeModal(btn.dataset.closeModal));
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    document.querySelectorAll(".dialog-backdrop.show").forEach((m) => m.classList.remove("show"));
  }
});

// --- Gateway WA & Protocol Guide ---
async function pollWaStatus() {
  try {
    const res = await fetch("/api/wa/status");
    const data = await res.json();
    state.gasConnected = Boolean(data.gasConnected);

    if (data.dataVersion !== undefined && state.dataVersion !== data.dataVersion) {
      const prev = state.dataVersion;
      state.dataVersion = data.dataVersion;
      if (prev !== 0) {
        if (state.gasConnected) loadReports(true);
        renderQueueStatus(data.queue);
      }
    }

    const beacon = document.getElementById("pulseBeacon");
    const statusText = document.getElementById("statusText");
    const qrImg = document.getElementById("qrImage");
    const pendingChamber = document.getElementById("chamberPending");
    const connectedChamber = document.getElementById("chamberConnected");
    const waUserDetail = document.getElementById("waUserDetail");

    statusText.textContent = String(data.status || "DISCONNECTED").toUpperCase();

    if (data.status === "Connected") {
      beacon.className = "pulse-beacon online";
      qrImg.classList.add("hidden");
      pendingChamber.classList.add("hidden");
      connectedChamber.classList.remove("hidden");
      const userId = data.user?.id ? data.user.id.split(":")[0] : "Terhubung";
      const pendingCount = data.queue?.pending || 0;
      waUserDetail.textContent = `${userId} • Antrean: ${pendingCount} pending`;
    } else if (data.status === "Scan QR" && data.qrImage) {
      beacon.className = "pulse-beacon waiting";
      pendingChamber.classList.add("hidden");
      connectedChamber.classList.add("hidden");
      qrImg.src = data.qrImage;
      qrImg.classList.remove("hidden");
    } else {
      beacon.className = "pulse-beacon offline";
      qrImg.classList.add("hidden");
      connectedChamber.classList.add("hidden");
      pendingChamber.classList.remove("hidden");
    }
  } catch (_) {}
}

function renderProtoSnippet() {
  const codeEl = document.getElementById("protoSnippetCode");
  if (!codeEl) return;
  const fn = EXAMPLES[state.protoMode] || EXAMPLES.empty;
  codeEl.textContent = fn();
}

document.querySelectorAll(".proto-pill").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".proto-pill").forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    state.protoMode = btn.dataset.protoMode;
    renderProtoSnippet();
  });
});

document.getElementById("btnCopyTemplate")?.addEventListener("click", () => {
  const codeEl = document.getElementById("protoSnippetCode");
  copyText(codeEl?.textContent || "");
});

document.querySelectorAll(".pch-chip").forEach((chip) => {
  chip.addEventListener("click", () => copyText(chip.dataset.copyCmd || ""));
});

document.getElementById("btnOpenHelp")?.addEventListener("click", () => {
  document.getElementById("modalHelpTitle").textContent = "Panduan WhatsApp (#HELP)";
  document.getElementById("helpGuideText").textContent = state.help.helpText || "Memuat...";
  openModal("modalHelp");
});

document.getElementById("btnOpenCriteria")?.addEventListener("click", () => {
  document.getElementById("modalHelpTitle").textContent = "15 Kriteria QC & Batas MC (#KRITERIA)";
  document.getElementById("helpGuideText").textContent = state.help.criteriaText || "Memuat...";
  openModal("modalHelp");
});

document.getElementById("btnCopyModalHelp")?.addEventListener("click", () => {
  copyText(document.getElementById("helpGuideText")?.textContent || "");
});

document.getElementById("btnRestartWa")?.addEventListener("click", async () => {
  const resConfirm = await showConfirmDialog({
    title: "Restart Socket WhatsApp",
    message: "Muat ulang soket Baileys? Koneksi WhatsApp akan terputus sebentar.",
    confirmText: "Restart Sekarang",
    destruct: false
  });
  if (!resConfirm.confirmed) return;
  const resp = await fetch("/api/wa/restart", { method: "POST" }).then((r) => r.json());
  showToast(resp.message, resp.success ? "success" : "warn");
});

document.getElementById("btnLogoutWa")?.addEventListener("click", async () => {
  const resConfirm = await showConfirmDialog({
    title: "Putus Sesi WhatsApp",
    message: "Hapus sesi autentikasi lokal dan buat QR pairing baru?",
    confirmText: "Putus Sesi",
    destruct: true
  });
  if (!resConfirm.confirmed) return;
  const resp = await fetch("/api/wa/logout", { method: "POST" }).then((r) => r.json());
  showToast(resp.message, resp.success ? "success" : "warn");
  pollWaStatus();
});

// --- Input QC Form Builder ---
function createEmptyItemState() {
  const kriteriaStatus = {};
  state.master.criteria.forEach((c) => {
    kriteriaStatus[c.id] = "OK";
  });
  return {
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    productInput: "",
    kodeRawBody: "",
    namaItem: "",
    tahapBarang: "Unfinish",
    qtyDiperiksa: "",
    mcPercent: "",
    rusak: [],
    kriteriaStatus,
    qtyLolosManual: "",
    keputusanManual: "",
    catatanSingkat: ""
  };
}

function resolveProductSelection(rawInput) {
  const trimmed = String(rawInput || "").trim();
  if (!trimmed) return { kodeRawBody: "", namaItem: "" };
  const byFormatted = state.master.products.find(
    (p) => `${p.sku} — ${p.nama}`.toLowerCase() === trimmed.toLowerCase()
  );
  if (byFormatted) return { kodeRawBody: byFormatted.sku, namaItem: byFormatted.nama };

  const bySku = state.master.products.find((p) => p.sku.toLowerCase() === trimmed.toLowerCase());
  if (bySku) return { kodeRawBody: bySku.sku, namaItem: bySku.nama };

  const byName = state.master.products.find((p) => p.nama.toLowerCase() === trimmed.toLowerCase());
  if (byName) return { kodeRawBody: byName.sku, namaItem: byName.nama };

  return { kodeRawBody: "", namaItem: trimmed };
}

function computeItemMetrics(item) {
  const qtyPeriksa = parseInt(item.qtyDiperiksa, 10) || 0;
  const totalRusak = item.rusak.reduce((sum, r) => sum + (parseInt(r.qty, 10) || 0), 0);
  const maxLolos = Math.max(0, qtyPeriksa - totalRusak);
  const qtyLolos = item.qtyLolosManual !== "" && item.qtyLolosManual !== null
    ? parseInt(item.qtyLolosManual, 10)
    : maxLolos;

  const mcNum = item.mcPercent !== "" && item.mcPercent !== null ? parseFloat(item.mcPercent) : null;
  const mcLimit = item.tahapBarang === "Finish" ? 17 : 15;
  const mcViolation = mcNum !== null && !Number.isNaN(mcNum) && mcNum > mcLimit;

  const hasNok = totalRusak > 0 || Object.values(item.kriteriaStatus).some((v) => v === "NOK");
  let suggestedDecision = "Lolos";
  if (qtyPeriksa > 0 && qtyLolos === 0) {
    suggestedDecision = "Tolak";
  } else if (hasNok || mcViolation) {
    suggestedDecision = "Bersyarat";
  }

  return { qtyPeriksa, totalRusak, maxLolos, qtyLolos, mcNum, mcLimit, mcViolation, suggestedDecision };
}

function renderQcItems() {
  const container = document.getElementById("qcItemsContainer");
  if (!container) return;

  const criteriaOptions = [
    ...state.master.criteria.map((c) => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.shortLabel)} — ${escapeHtml(c.label)}</option>`),
    `<option value="LAINNYA">Lainnya (catatan bebas)</option>`
  ].join("");

  container.innerHTML = state.items.map((item, idx) => {
    const m = computeItemMetrics(item);
    const defectOverflow = m.qtyPeriksa > 0 && m.totalRusak > m.qtyPeriksa;

    const defectRowsHtml = item.rusak.length === 0
      ? `<p class="field-hint">Belum ada baris kerusakan ditambahkan (100% mulus jika dibiarkan kosong).</p>`
      : item.rusak.map((d, dIdx) => `
          <div class="defect-row" data-item-idx="${idx}" data-defect-idx="${dIdx}">
            <select class="field-input defect-crit-select" aria-label="Jenis kerusakan item ${idx + 1} baris ${dIdx + 1}">
              ${state.master.criteria.map((c) =>
                `<option value="${escapeHtml(c.id)}" ${d.kriteriaId === c.id ? "selected" : ""}>${escapeHtml(c.shortLabel)} — ${escapeHtml(c.label)}</option>`
              ).join("")}
              <option value="LAINNYA" ${d.kriteriaId === "LAINNYA" ? "selected" : ""}>Lainnya (di luar 15 kriteria)</option>
            </select>
            <input type="number" class="field-input mono defect-qty-input ${defectOverflow ? "is-error" : ""}" min="1" step="1" placeholder="Qty" value="${escapeHtml(d.qty)}" aria-label="Jumlah rusak">
            <input type="text" class="field-input defect-label-input ${d.kriteriaId === "LAINNYA" ? "" : "hidden"}" placeholder="Keterangan cacat lainnya..." value="${escapeHtml(d.label || "")}" aria-label="Detail cacat lainnya">
            <button type="button" class="btn btn-destruct btn-icon-square btn-remove-defect" aria-label="Hapus baris kerusakan">&times;</button>
          </div>
        `).join("");

    const criteriaGridHtml = state.master.criteria.map((c) => {
      const currentVal = item.kriteriaStatus[c.id] || "OK";
      return `
        <div class="criterion-item">
          <span class="criterion-name">${escapeHtml(c.label)}</span>
          <div class="crit-toggle-group" role="group" aria-label="${escapeHtml(c.label)}">
            <button type="button" class="crit-toggle ${currentVal === "OK" ? "active" : ""}" data-item-idx="${idx}" data-crit-id="${escapeHtml(c.id)}" data-state="OK" aria-pressed="${currentVal === "OK"}">✓</button>
            <button type="button" class="crit-toggle ${currentVal === "NOK" ? "active" : ""}" data-item-idx="${idx}" data-crit-id="${escapeHtml(c.id)}" data-state="NOK" aria-pressed="${currentVal === "NOK"}">✗</button>
            <button type="button" class="crit-toggle ${currentVal === "NA" ? "active" : ""}" data-item-idx="${idx}" data-crit-id="${escapeHtml(c.id)}" data-state="NA" aria-pressed="${currentVal === "NA"}">–</button>
          </div>
        </div>
      `;
    }).join("");

    const mcBadgeHtml = m.mcNum === null || Number.isNaN(m.mcNum)
      ? ""
      : m.mcViolation
        ? `<span class="mc-badge warn">Melebihi standar ≤ ${m.mcLimit}% (tidak boleh Lolos penuh)</span>`
        : `<span class="mc-badge ok">MC Sesuai Standar (≤ ${m.mcLimit}%)</span>`;

    return `
      <div class="card item-qc-card" data-item-idx="${idx}">
        <div class="item-card-header">
          <div>
            <span class="card-tag">ITEM PEMERIKSAAN #${idx + 1}</span>
            <h3 class="card-title">${escapeHtml(item.namaItem || "Nama Produk / Barang")}</h3>
          </div>
          ${state.items.length > 1 ? `<button type="button" class="btn btn-destruct btn-sm btn-remove-item" data-item-idx="${idx}">Hapus Item</button>` : ""}
        </div>

        <div class="form-grid-4">
          <div class="field-item">
            <label class="field-label" for="itemProd-${idx}">NAMA PRODUK / BARANG *</label>
            <input type="text" id="itemProd-${idx}" class="field-input item-product-input" list="productDatalist" value="${escapeHtml(item.productInput)}" placeholder="Ketik nama barang bebas (cth: Meja Jati)" required autocomplete="off">
          </div>
          <div class="field-item">
            <label class="field-label" for="itemTahap-${idx}">TAHAP BARANG</label>
            <select id="itemTahap-${idx}" class="field-input item-tahap-select">
              <option value="Unfinish" ${item.tahapBarang === "Unfinish" ? "selected" : ""}>Unfinish / Mentah (MC ≤ 15%)</option>
              <option value="Finish" ${item.tahapBarang === "Finish" ? "selected" : ""}>Finish / Jadi (MC ≤ 17%)</option>
            </select>
          </div>
          <div class="field-item">
            <label class="field-label" for="itemQty-${idx}">JUMLAH DIPERIKSA (PCS) *</label>
            <input type="number" id="itemQty-${idx}" class="field-input mono item-qty-input ${defectOverflow ? "is-error" : ""}" min="1" step="1" value="${escapeHtml(item.qtyDiperiksa)}" placeholder="1000" required>
          </div>
          <div class="field-item">
            <label class="field-label" for="itemMc-${idx}">KADAR AIR / MC (%)</label>
            <input type="number" id="itemMc-${idx}" class="field-input mono item-mc-input" min="0" max="100" step="0.1" value="${escapeHtml(item.mcPercent)}" placeholder="13.5">
            <div class="mc-badge-slot">${mcBadgeHtml}</div>
          </div>
        </div>

        <div class="sub-block">
          <div class="sub-block-head">
            <div>
              <span class="field-label">2. RINCIAN KERUSAKAN (JENIS &amp; QTY PCS)</span>
            </div>
            <button type="button" class="btn btn-neutral btn-sm btn-add-defect" data-item-idx="${idx}">+ Tambah Kerusakan</button>
          </div>
          <div class="defect-rows">${defectRowsHtml}</div>
          <span class="field-error defect-overflow-err ${defectOverflow ? "" : "hidden"}">${defectOverflow ? `Total kerusakan (${m.totalRusak} pcs) melebihi jumlah diperiksa (${m.qtyPeriksa} pcs).` : ""}</span>
        </div>

        <div class="sub-block">
          <div class="sub-block-head">
            <span class="field-label">3. STATUS 15 KRITERIA DOK. QC-WOOD-01 (✓ Aman / ✗ Rusak / – T/B)</span>
          </div>
          <div class="criteria-grid">${criteriaGridHtml}</div>
        </div>

        <div class="item-summary-strip" data-summary-idx="${idx}">
          <div class="summary-stat">
            <span class="field-label">DIPERIKSA</span>
            <span class="summary-stat-val mono" data-role="sum-periksa">${m.qtyPeriksa.toLocaleString("id-ID")} pcs</span>
          </div>
          <div class="summary-stat">
            <span class="field-label">TOTAL RUSAK</span>
            <span class="summary-stat-val mono stat-err" data-role="sum-rusak">${m.totalRusak.toLocaleString("id-ID")} pcs</span>
          </div>
          <div class="summary-stat">
            <span class="field-label">LOLOS / DITERIMA</span>
            <span class="summary-stat-val mono stat-ok" data-role="sum-lolos">${m.qtyLolos.toLocaleString("id-ID")} pcs</span>
          </div>
          <div class="summary-stat">
            <span class="field-label">SARAN KEPUTUSAN</span>
            <span class="summary-stat-val" data-role="sum-decision">${escapeHtml(item.keputusanManual || m.suggestedDecision)}</span>
          </div>
        </div>

        <div class="form-grid-3 sub-block">
          <div class="field-item">
            <label class="field-label" for="itemLolos-${idx}">LOLOS MANUAL (OPSIONAL)</label>
            <input type="number" id="itemLolos-${idx}" class="field-input mono item-lolos-input" min="0" step="1" value="${escapeHtml(item.qtyLolosManual)}" placeholder="Otomatis: ${m.maxLolos}">
          </div>
          <div class="field-item">
            <label class="field-label" for="itemDec-${idx}">KEPUTUSAN ITEM</label>
            <select id="itemDec-${idx}" class="field-input item-decision-select">
              <option value="" ${!item.keputusanManual ? "selected" : ""}>Otomatis (${m.suggestedDecision})</option>
              <option value="Lolos" ${item.keputusanManual === "Lolos" ? "selected" : ""}>Lolos</option>
              <option value="Bersyarat" ${item.keputusanManual === "Bersyarat" ? "selected" : ""}>Bersyarat</option>
              <option value="Tolak" ${item.keputusanManual === "Tolak" ? "selected" : ""}>Tolak</option>
            </select>
          </div>
          <div class="field-item">
            <label class="field-label" for="itemNote-${idx}">CATATAN SINGKAT ITEM</label>
            <input type="text" id="itemNote-${idx}" class="field-input item-note-input" value="${escapeHtml(item.catatanSingkat)}" placeholder="Catatan sortir / rework...">
          </div>
        </div>
      </div>
    `;
  }).join("");

  // Simpan opsi kriteria ke variabel agar tidak unused warning
  void criteriaOptions;
}

function updateItemLiveDisplay(idx) {
  const item = state.items[idx];
  const card = document.querySelector(`.item-qc-card[data-item-idx="${idx}"]`);
  if (!item || !card) return;

  const m = computeItemMetrics(item);
  const periksaEl = card.querySelector('[data-role="sum-periksa"]');
  const rusakEl = card.querySelector('[data-role="sum-rusak"]');
  const lolosEl = card.querySelector('[data-role="sum-lolos"]');
  const decEl = card.querySelector('[data-role="sum-decision"]');
  const lolosInput = card.querySelector(".item-lolos-input");
  const autoOpt = card.querySelector('.item-decision-select option[value=""]');
  const badgeSlot = card.querySelector(".mc-badge-slot");

  if (periksaEl) periksaEl.textContent = `${m.qtyPeriksa.toLocaleString("id-ID")} pcs`;
  if (rusakEl) rusakEl.textContent = `${m.totalRusak.toLocaleString("id-ID")} pcs`;
  if (lolosEl) lolosEl.textContent = `${m.qtyLolos.toLocaleString("id-ID")} pcs`;
  if (decEl) decEl.textContent = item.keputusanManual || m.suggestedDecision;
  if (lolosInput) lolosInput.placeholder = `Otomatis: ${m.maxLolos}`;
  if (autoOpt) autoOpt.textContent = `Otomatis (${m.suggestedDecision})`;

  if (badgeSlot) {
    if (m.mcNum === null || Number.isNaN(m.mcNum)) {
      badgeSlot.innerHTML = "";
    } else if (m.mcViolation) {
      badgeSlot.innerHTML = `<span class="mc-badge warn">Melebihi standar ≤ ${m.mcLimit}% (tidak boleh Lolos penuh)</span>`;
    } else {
      badgeSlot.innerHTML = `<span class="mc-badge ok">MC Sesuai Standar (≤ ${m.mcLimit}%)</span>`;
    }
  }

  const defectOverflow = m.qtyPeriksa > 0 && m.totalRusak > m.qtyPeriksa;
  const overflowEl = card.querySelector(".defect-overflow-err");
  if (overflowEl) {
    overflowEl.textContent = defectOverflow
      ? `Total kerusakan (${m.totalRusak} pcs) melebihi jumlah diperiksa (${m.qtyPeriksa} pcs).`
      : "";
    overflowEl.classList.toggle("hidden", !defectOverflow);
  }
  card.querySelector(".item-qty-input")?.classList.toggle("is-error", defectOverflow);
  card.querySelectorAll(".defect-qty-input").forEach((inp) => inp.classList.toggle("is-error", defectOverflow));
}

function syncCriterionToggleDom(card, critId, val) {
  if (!card || !critId || critId === "LAINNYA") return;
  card.querySelectorAll(`.crit-toggle[data-crit-id="${critId}"]`).forEach((btn) => {
    const isActive = btn.dataset.state === val;
    btn.classList.toggle("active", isActive);
    btn.setAttribute("aria-pressed", String(isActive));
  });
}

// Event delegation untuk form item dinamis (stabil tanpa kehilangan fokus input!)
const itemsContainer = document.getElementById("qcItemsContainer");

itemsContainer?.addEventListener("input", (e) => {
  const card = e.target.closest(".item-qc-card");
  if (!card) return;
  const idx = Number(card.dataset.itemIdx);
  const item = state.items[idx];
  if (!item) return;

  if (e.target.classList.contains("item-product-input")) {
    item.productInput = e.target.value;
    const resolved = resolveProductSelection(e.target.value);
    item.kodeRawBody = resolved.kodeRawBody;
    item.namaItem = resolved.namaItem;
    const h3 = card.querySelector(".item-card-header .card-title");
    if (h3) h3.textContent = item.namaItem || "Nama Produk / Barang";
  } else if (e.target.classList.contains("item-qty-input")) {
    item.qtyDiperiksa = e.target.value;
    updateItemLiveDisplay(idx);
  } else if (e.target.classList.contains("item-mc-input")) {
    item.mcPercent = e.target.value;
    updateItemLiveDisplay(idx);
  } else if (e.target.classList.contains("item-lolos-input")) {
    item.qtyLolosManual = e.target.value;
    updateItemLiveDisplay(idx);
  } else if (e.target.classList.contains("item-note-input")) {
    item.catatanSingkat = e.target.value;
  } else if (e.target.classList.contains("defect-qty-input")) {
    const row = e.target.closest(".defect-row");
    const dIdx = Number(row.dataset.defectIdx);
    item.rusak[dIdx].qty = e.target.value;
    const cId = item.rusak[dIdx].kriteriaId;
    if (cId && cId !== "LAINNYA" && parseInt(e.target.value, 10) > 0) {
      item.kriteriaStatus[cId] = "NOK";
      card.querySelectorAll(`.crit-toggle[data-crit-id="${cId}"]`).forEach((btn) => {
        const isActive = btn.dataset.state === "NOK";
        btn.classList.toggle("active", isActive);
        btn.setAttribute("aria-pressed", String(isActive));
      });
    }
    updateItemLiveDisplay(idx);
  } else if (e.target.classList.contains("defect-label-input")) {
    const row = e.target.closest(".defect-row");
    const dIdx = Number(row.dataset.defectIdx);
    item.rusak[dIdx].label = e.target.value;
  }
});

itemsContainer?.addEventListener("change", (e) => {
  const card = e.target.closest(".item-qc-card");
  if (!card) return;
  const idx = Number(card.dataset.itemIdx);
  const item = state.items[idx];
  if (!item) return;

  if (e.target.classList.contains("item-tahap-select")) {
    item.tahapBarang = e.target.value;
    updateItemLiveDisplay(idx);
  } else if (e.target.classList.contains("item-decision-select")) {
    item.keputusanManual = e.target.value;
    updateItemLiveDisplay(idx);
  } else if (e.target.classList.contains("defect-crit-select")) {
    const row = e.target.closest(".defect-row");
    const dIdx = Number(row.dataset.defectIdx);
    const oldCrit = item.rusak[dIdx].kriteriaId;
    const newCrit = e.target.value;
    item.rusak[dIdx].kriteriaId = newCrit;
    row.querySelector(".defect-label-input")?.classList.toggle("hidden", newCrit !== "LAINNYA");

    if (oldCrit && oldCrit !== "LAINNYA") {
      const stillHasOld = item.rusak.some((r) => r.kriteriaId === oldCrit && parseInt(r.qty, 10) > 0);
      if (!stillHasOld) {
        item.kriteriaStatus[oldCrit] = "OK";
        syncCriterionToggleDom(card, oldCrit, "OK");
      }
    }
    if (newCrit && newCrit !== "LAINNYA" && parseInt(item.rusak[dIdx].qty, 10) > 0) {
      item.kriteriaStatus[newCrit] = "NOK";
      syncCriterionToggleDom(card, newCrit, "NOK");
    }
    updateItemLiveDisplay(idx);
  }
});

itemsContainer?.addEventListener("click", (e) => {
  const addDefectBtn = e.target.closest(".btn-add-defect");
  if (addDefectBtn) {
    const idx = Number(addDefectBtn.dataset.itemIdx);
    const defaultCrit = state.master.criteria[4]?.id || state.master.criteria[0]?.id || "BLUESTAIN";
    state.items[idx].rusak.push({ kriteriaId: defaultCrit, qty: "", label: "" });
    renderQcItems();
    return;
  }

  const removeDefectBtn = e.target.closest(".btn-remove-defect");
  if (removeDefectBtn) {
    const row = removeDefectBtn.closest(".defect-row");
    const idx = Number(row.dataset.itemIdx);
    const dIdx = Number(row.dataset.defectIdx);
    const removed = state.items[idx].rusak.splice(dIdx, 1)[0];
    if (removed?.kriteriaId && removed.kriteriaId !== "LAINNYA") {
      const stillHas = state.items[idx].rusak.some((r) => r.kriteriaId === removed.kriteriaId);
      if (!stillHas) state.items[idx].kriteriaStatus[removed.kriteriaId] = "OK";
    }
    renderQcItems();
    return;
  }

  const removeItemBtn = e.target.closest(".btn-remove-item");
  if (removeItemBtn) {
    const idx = Number(removeItemBtn.dataset.itemIdx);
    if (state.items.length > 1) {
      state.items.splice(idx, 1);
      renderQcItems();
    }
    return;
  }

  const critBtn = e.target.closest(".crit-toggle");
  if (critBtn) {
    const card = critBtn.closest(".item-qc-card");
    const idx = Number(critBtn.dataset.itemIdx);
    const critId = critBtn.dataset.critId;
    const nextState = critBtn.dataset.state;
    state.items[idx].kriteriaStatus[critId] = nextState;
    syncCriterionToggleDom(card, critId, nextState);
    updateItemLiveDisplay(idx);
    if (nextState === "NOK") {
      document.getElementById(`itemNote-${idx}`)?.focus();
    }
  }
});

document.getElementById("btnAddQcItem")?.addEventListener("click", () => {
  state.items.push(createEmptyItemState());
  renderQcItems();
});

document.getElementById("btnResetQcForm")?.addEventListener("click", () => {
  document.getElementById("qcReportForm")?.reset();
  document.getElementById("qcTanggal").value = getTodayIso();
  document.getElementById("submitResultBanner").classList.add("hidden");
  state.items = [createEmptyItemState()];
  renderQcItems();
});

document.getElementById("qcVendor")?.addEventListener("input", (e) => {
  if (e.target.value.trim()) {
    e.target.classList.remove("is-error");
    document.getElementById("errQcVendor")?.classList.add("hidden");
  }
});

document.getElementById("qcReportForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const errVendorEl = document.getElementById("errQcVendor");
  const vendorEl = document.getElementById("qcVendor");
  const vendor = vendorEl.value.trim();

  errVendorEl.classList.add("hidden");
  vendorEl.classList.remove("is-error");

  if (!vendor) {
    errVendorEl.textContent = "Nama vendor wajib diisi.";
    errVendorEl.classList.remove("hidden");
    vendorEl.classList.add("is-error");
    vendorEl.focus();
    return;
  }

  const payload = {
    sumber: "WEB",
    vendor,
    noDokumenPo: document.getElementById("qcPo").value.trim(),
    tanggalPemeriksaan: isoToIdDate(document.getElementById("qcTanggal").value),
    petugasQc: document.getElementById("qcPetugas").value.trim() || "Admin Web",
    diketahuiVendor: document.getElementById("qcDiketahui").value.trim(),
    catatanUmum: document.getElementById("qcCatatanUmum").value.trim(),
    items: state.items.map((it) => {
      const resolved = resolveProductSelection(it.productInput);
      return {
        kodeRawBody: it.kodeRawBody || resolved.kodeRawBody,
        namaItem: it.namaItem || resolved.namaItem,
        tahapBarang: it.tahapBarang,
        qtyDiperiksa: it.qtyDiperiksa === "" ? "" : Number(it.qtyDiperiksa),
        mcPercent: it.mcPercent === "" ? null : Number(it.mcPercent),
        qtyLolos: it.qtyLolosManual === "" ? null : Number(it.qtyLolosManual),
        keputusan: it.keputusanManual || null,
        catatanSingkat: it.catatanSingkat,
        kriteriaStatus: it.kriteriaStatus,
        rusak: it.rusak.map((r) => ({
          kriteriaId: r.kriteriaId,
          label: r.kriteriaId === "LAINNYA" ? (r.label || "Lainnya") : "",
          qty: r.qty === "" ? 0 : Number(r.qty)
        }))
      };
    })
  };

  const btn = document.getElementById("btnSubmitQc");
  const spinner = document.getElementById("submitSpinner");
  const label = document.getElementById("submitBtnLabel");
  const banner = document.getElementById("submitResultBanner");

  btn.disabled = true;
  spinner.classList.remove("hidden");
  label.textContent = "Menyimpan...";

  try {
    const resp = await fetch("/api/qc/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const json = await resp.json();

    if (!resp.ok || !json.success) {
      showToast(json.message || "Gagal menyimpan laporan QC.", "error");
      return;
    }

    if (json.queued) {
      banner.className = "result-banner warn";
      banner.innerHTML = `
        <div>
          <strong>Masuk Antrean Offline (${escapeHtml(json.noLaporan)})</strong>
          <p class="field-hint">${escapeHtml(json.message)}</p>
        </div>
        <button type="button" class="btn btn-neutral btn-sm" id="btnBannerToQueue">Lihat Antrean</button>
      `;
      banner.classList.remove("hidden");
      document.getElementById("btnBannerToQueue")?.addEventListener("click", () => switchTab("tab-settings"));
      showToast("Laporan disimpan ke antrean offline lokal.", "warn");
    } else {
      const sheetLink = json.sheetUrl
        ? `<a href="${escapeHtml(json.sheetUrl)}" target="_blank" rel="noopener" class="btn btn-primary btn-sm">Buka Google Sheet Drive</a>`
        : "";
      const pdfLink = json.pdfUrl
        ? `<a href="${escapeHtml(json.pdfUrl)}" target="_blank" rel="noopener" class="btn btn-neutral btn-sm">Buka PDF Drive</a>`
        : "";
      banner.className = "result-banner success";
      banner.innerHTML = `
        <div>
          <strong>Laporan QC Tersimpan (${escapeHtml(json.noLaporan)})</strong>
          <p class="field-hint">Form DOK. QC-WOOD-01 berhasil dibuat di Google Drive dan dicatat ke Spreadsheet Rekap.</p>
        </div>
        <div class="result-banner-links">${sheetLink}${pdfLink}</div>
      `;
      banner.classList.remove("hidden");
      showToast(`Laporan ${json.noLaporan} berhasil disimpan ke Google Drive!`, "success");
    }

    loadReports(true);
  } catch (err) {
    showToast(`Gagal mengirim laporan: ${err.message}`, "error");
  } finally {
    btn.disabled = false;
    spinner.classList.add("hidden");
    label.textContent = "Simpan ke Google Drive";
  }
});

// --- Riwayat & Rekap ---
function updateSummaryMetrics(summary) {
  const s = summary || { totalReports: 0, activeReports: 0, totalInspected: 0, totalDefect: 0, passRate: 100 };
  document.getElementById("heroReportCount").textContent = String(s.activeReports ?? s.totalReports ?? 0);
  document.getElementById("heroPassRate").textContent = `${s.passRate ?? 100}%`;
  document.getElementById("kpiTotalReports").textContent = String(s.totalReports ?? 0);
  document.getElementById("kpiTotalInspected").textContent = `${(s.totalInspected || 0).toLocaleString("id-ID")} pcs`;
  document.getElementById("kpiTotalDefect").textContent = `${(s.totalDefect || 0).toLocaleString("id-ID")} pcs`;
  document.getElementById("kpiPassRate").textContent = `${s.passRate ?? 100}%`;
}

function decisionPillClass(decision) {
  if (decision === "Lolos") return "ok";
  if (decision === "Tolak") return "err";
  return "warn";
}

function toComparableIsoDate(rawDate) {
  const formatted = formatDisplayDate(rawDate);
  const m = formatted.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return "";
  return `${m[3]}-${m[2]}-${m[1]}`;
}

function renderReportsTable() {
  const tbody = document.getElementById("historyTableBody");
  if (!tbody) return;

  const q = String(document.getElementById("historySearch")?.value || "").trim().toLowerCase();
  const decFilter = document.getElementById("historyFilterDecision")?.value || "";
  const fromDate = document.getElementById("historyDateFrom")?.value || "";
  const toDate = document.getElementById("historyDateTo")?.value || "";

  const filtered = state.reports.filter((r) => {
    if (decFilter && r.keputusanUmum !== decFilter) return false;
    if (fromDate || toDate) {
      const iso = toComparableIsoDate(r.tanggal);
      if (!iso) return false;
      if (fromDate && iso < fromDate) return false;
      if (toDate && iso > toDate) return false;
    }
    if (!q) return true;
    return [r.noLaporan, r.vendor, r.noDokumenPo, r.petugasQc].some((v) =>
      String(v || "").toLowerCase().includes(q)
    );
  });

  if (q || decFilter || fromDate || toDate) {
    let totalInspected = 0;
    let totalDefect = 0;
    let totalPassed = 0;
    let activeReports = 0;
    for (const r of filtered) {
      if (r.status === "VOID") continue;
      activeReports++;
      totalInspected += Number(r.totalDiperiksa) || 0;
      totalDefect += Number(r.totalRusak) || 0;
      totalPassed += Number(r.totalLolos) || 0;
    }
    const passRate = totalInspected > 0 ? Math.round((totalPassed / totalInspected) * 1000) / 10 : 100;
    updateSummaryMetrics({
      totalReports: filtered.length,
      activeReports,
      totalInspected,
      totalDefect,
      passRate
    });
  } else if (state.summary) {
    updateSummaryMetrics(state.summary);
  }

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="11" class="empty-state">Belum ada laporan QC yang cocok.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map((r) => {
    const isVoid = r.status === "VOID";
    const sheetBtn = r.sheetUrl
      ? `<a href="${escapeHtml(r.sheetUrl)}" target="_blank" rel="noopener" class="btn btn-neutral btn-sm">Sheet</a>`
      : "";
    const pdfBtn = r.pdfUrl
      ? `<a href="${escapeHtml(r.pdfUrl)}" target="_blank" rel="noopener" class="btn btn-neutral btn-sm">PDF</a>`
      : "";

    return `
      <tr class="${isVoid ? "row-void" : ""}">
        <td class="mono">${escapeHtml(formatDisplayDate(r.tanggal))}</td>
        <td class="mono"><strong>${escapeHtml(r.noLaporan)}</strong></td>
        <td><strong>${escapeHtml(r.vendor)}</strong><br><span class="field-hint mono">${escapeHtml(r.noDokumenPo || "-")}</span></td>
        <td class="num-col">${Number(r.totalItem) || 0}</td>
        <td class="num-col">${(Number(r.totalDiperiksa) || 0).toLocaleString("id-ID")}</td>
        <td class="num-col stat-err">${(Number(r.totalRusak) || 0).toLocaleString("id-ID")}</td>
        <td class="num-col stat-ok"><strong>${(Number(r.totalLolos) || 0).toLocaleString("id-ID")}</strong></td>
        <td><span class="status-pill ${decisionPillClass(r.keputusanUmum)}">${escapeHtml(r.keputusanUmum)}</span></td>
        <td><span class="status-pill ${isVoid ? "err" : "ok"}">${isVoid ? "VOID" : "AKTIF"}</span></td>
        <td><div class="drive-links">${sheetBtn}${pdfBtn || (!sheetBtn ? "–" : "")}</div></td>
        <td class="text-right">
          <div class="table-actions">
            <button type="button" class="btn btn-neutral btn-sm btn-view-detail" data-no="${escapeHtml(r.noLaporan)}">Detail</button>
            ${isVoid ? "" : `<button type="button" class="btn btn-destruct btn-sm btn-void-report" data-no="${escapeHtml(r.noLaporan)}">Void</button>`}
          </div>
        </td>
      </tr>
    `;
  }).join("");
}

async function loadReports(fresh = false) {
  const notice = document.getElementById("historyNotice");
  const tbody = document.getElementById("historyTableBody");
  if (!state.gasConnected && !fresh) {
    notice.innerHTML = `<span>GAS_QC_WEBHOOK_URL belum dikonfigurasi. Buka Pengaturan untuk menghubungkan Google Apps Script.</span><button type="button" class="btn btn-neutral btn-sm" id="btnGoSettingsNotice">Buka Pengaturan</button>`;
    notice.classList.remove("hidden");
    document.getElementById("btnGoSettingsNotice")?.addEventListener("click", () => switchTab("tab-settings"));
    if (tbody) tbody.innerHTML = `<tr><td colspan="11" class="empty-state">Hubungkan GAS_QC_WEBHOOK_URL di Pengaturan untuk memuat rekap dari Google Sheets.</td></tr>`;
    return;
  }
  try {
    const res = await fetch(`/api/qc/reports${fresh ? "?fresh=1" : ""}`);
    const json = await res.json();
    if (!json.success) {
      notice.innerHTML = `<span>${escapeHtml(json.message || "Belum terhubung ke Google Apps Script.")}</span><button type="button" class="btn btn-neutral btn-sm" id="btnGoSettingsNotice">Buka Pengaturan</button>`;
      notice.classList.remove("hidden");
      document.getElementById("btnGoSettingsNotice")?.addEventListener("click", () => switchTab("tab-settings"));
      if (tbody) tbody.innerHTML = `<tr><td colspan="11" class="empty-state">Hubungkan GAS_QC_WEBHOOK_URL di Pengaturan untuk memuat rekap dari Google Sheets.</td></tr>`;
      return;
    }

    notice.classList.add("hidden");
    state.summary = json.data.summary;
    state.reports = json.data.reports || [];
    state.reportItems = json.data.items || [];
    updateSummaryMetrics(state.summary);
    renderReportsTable();
  } catch (err) {
    if (tbody) tbody.innerHTML = `<tr><td colspan="11" class="empty-state">Gagal memuat riwayat: ${escapeHtml(err.message)}</td></tr>`;
  }
}

document.getElementById("historySearch")?.addEventListener("input", renderReportsTable);
document.getElementById("historyDateFrom")?.addEventListener("change", renderReportsTable);
document.getElementById("historyDateTo")?.addEventListener("change", renderReportsTable);
document.getElementById("historyFilterDecision")?.addEventListener("change", renderReportsTable);
document.getElementById("btnResetHistoryFilter")?.addEventListener("click", () => {
  const searchEl = document.getElementById("historySearch");
  const fromEl = document.getElementById("historyDateFrom");
  const toEl = document.getElementById("historyDateTo");
  const decEl = document.getElementById("historyFilterDecision");
  if (searchEl) searchEl.value = "";
  if (fromEl) fromEl.value = "";
  if (toEl) toEl.value = "";
  if (decEl) decEl.value = "";
  renderReportsTable();
});
document.getElementById("btnRefreshHistory")?.addEventListener("click", () => loadReports(true));

document.getElementById("historyTableBody")?.addEventListener("click", async (e) => {
  const detailBtn = e.target.closest(".btn-view-detail");
  if (detailBtn) {
    const no = detailBtn.dataset.no;
    const report = state.reports.find((r) => r.noLaporan === no);
    if (!report) return;
    const items = (state.reportItems || []).filter((it) => it.noLaporan === no);

    const body = document.getElementById("modalDetailBody");
    body.innerHTML = `
      <div class="wood-sheet-preview">
        <div class="wood-sheet-header">
          <div>
            <div class="wood-sheet-title">FORM LAPORAN QC LAPANGAN &middot; DOK. QC-WOOD-01</div>
            <div class="mono">${escapeHtml(report.noLaporan)} (${escapeHtml(report.status)})</div>
          </div>
          <div class="drive-links">
            ${report.sheetUrl ? `<a href="${escapeHtml(report.sheetUrl)}" target="_blank" rel="noopener" class="btn btn-primary btn-sm">Buka Sheet Drive</a>` : ""}
            ${report.pdfUrl ? `<a href="${escapeHtml(report.pdfUrl)}" target="_blank" rel="noopener" class="btn btn-neutral btn-sm">Buka PDF Drive</a>` : ""}
          </div>
        </div>
        <div class="wood-sheet-meta">
          <div><strong>Vendor:</strong> ${escapeHtml(report.vendor)}</div>
          <div><strong>No. PO:</strong> ${escapeHtml(report.noDokumenPo || "-")}</div>
          <div><strong>Tanggal:</strong> ${escapeHtml(formatDisplayDate(report.tanggal))}</div>
          <div><strong>Petugas QC:</strong> ${escapeHtml(report.petugasQc || "-")}</div>
          <div><strong>Total Diperiksa:</strong> ${Number(report.totalDiperiksa).toLocaleString("id-ID")} pcs</div>
          <div><strong>Total Lolos:</strong> ${Number(report.totalLolos).toLocaleString("id-ID")} pcs (Rusak: ${Number(report.totalRusak).toLocaleString("id-ID")} pcs)</div>
        </div>
        ${items.length === 0 ? `<p class="field-hint">Rincian item tersedia pada file Google Sheet Drive di atas.</p>` : items.map((it, idx) => `
          <div class="wood-item-box">
            <strong>Item #${idx + 1}: ${it.kodeRawBody ? `${escapeHtml(it.kodeRawBody)} — ${escapeHtml(it.namaItem)}` : escapeHtml(it.namaItem)}</strong>
            <p class="field-hint">Tahap: ${escapeHtml(it.tahapBarang)} | Diperiksa: ${it.qtyDiperiksa} | Rusak: ${it.totalRusak} | Lolos: ${it.qtyLolos} | Keputusan: <strong>${escapeHtml(it.keputusan)}</strong></p>
            <p class="field-hint">Rincian Kerusakan: ${escapeHtml(it.rincianKerusakan || "-")}</p>
            <p class="field-hint">Catatan: ${escapeHtml(it.catatanSingkat || "-")}</p>
          </div>
        `).join("")}
        ${report.catatanUmum ? `<p><strong>Catatan Umum:</strong> ${escapeHtml(report.catatanUmum)}</p>` : ""}
        ${report.alasanVoid ? `<p class="stat-err"><strong>Alasan Void:</strong> ${escapeHtml(report.alasanVoid)}</p>` : ""}
      </div>
    `;
    openModal("modalDetail");
    return;
  }

  const voidBtn = e.target.closest(".btn-void-report");
  if (voidBtn) {
    const noLaporan = voidBtn.dataset.no;
    const resConfirm = await showConfirmDialog({
      title: `Void Laporan ${noLaporan}`,
      tag: "PEMBATALAN LAPORAN",
      message: `Tandai laporan ${noLaporan} sebagai VOID di rekap Google Sheets dan beri prefiks [VOID] pada file Google Drive?`,
      confirmText: "Konfirmasi Void",
      destruct: true,
      requireInput: true,
      inputLabel: "ALASAN VOID *"
    });
    if (!resConfirm.confirmed) return;

    try {
      const resp = await fetch("/api/qc/reports/void", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          noLaporan,
          alasanVoid: resConfirm.value,
          oleh: "Admin Web"
        })
      });
      const json = await resp.json();
      showToast(json.message, json.success ? "success" : "error");
      if (json.success) loadReports(true);
    } catch (err) {
      showToast(`Gagal membatalkan laporan: ${err.message}`, "error");
    }
  }
});

// --- Pengaturan & Queue ---
async function loadSettings() {
  try {
    const json = await fetch("/api/config").then((r) => r.json());
    if (json.success && json.config) {
      document.getElementById("settingGasUrl").value = json.config.gasWebhookUrl || "";
      document.getElementById("settingAllowedGroups").value = json.config.allowedGroups || "";
      document.getElementById("settingApiSecret").value = "";
      document.getElementById("apiSecretBadge").classList.toggle("hidden", !json.config.hasApiSecret);
    }
  } catch (_) {}
}

function renderQueueStatus(q) {
  if (!q) return;
  document.getElementById("queuePendingCount").textContent = String(q.pending ?? q.pendingCount ?? 0);
  document.getElementById("queueProcessedCount").textContent = String(q.processed ?? 0);
  document.getElementById("queueFailedCount").textContent = String(q.failed ?? 0);

  const listEl = document.getElementById("queueListContainer");
  if (!listEl) return;
  const items = q.items || [];
  if (items.length === 0) {
    listEl.innerHTML = `<p class="field-hint">Antrean offline kosong.</p>`;
    return;
  }
  listEl.innerHTML = items.slice().reverse().slice(0, 10).map((it) => `
    <div class="queue-entry">
      <div>
        <strong class="mono">${escapeHtml(it.payload?.data?.noLaporan || it.id)}</strong>
        <div class="field-hint">${escapeHtml(it.payload?.data?.vendor || it.chat || "-")} &middot; Attempt ${it.attempts || 0}</div>
      </div>
      <span class="status-pill ${it.status === "processed" ? "ok" : it.status === "failed" ? "err" : "warn"}">${escapeHtml(String(it.status).toUpperCase())}</span>
    </div>
  `).join("");
}

async function loadQueueStatus() {
  try {
    const json = await fetch("/api/queue/status").then((r) => r.json());
    if (json.success) renderQueueStatus(json);
  } catch (_) {}
}

document.getElementById("btnTestGas")?.addEventListener("click", async () => {
  const gasWebhookUrl = document.getElementById("settingGasUrl").value.trim();
  const apiSecret = document.getElementById("settingApiSecret").value.trim();
  const btn = document.getElementById("btnTestGas");
  btn.disabled = true;
  try {
    const resp = await fetch("/api/config/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gasWebhookUrl, ...(apiSecret ? { apiSecret } : {}) })
    });
    const json = await resp.json();
    showToast(json.message, json.success ? "success" : "error");
  } catch (err) {
    showToast(`Gagal menguji koneksi: ${err.message}`, "error");
  } finally {
    btn.disabled = false;
  }
});

document.getElementById("formSettings")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const gasWebhookUrl = document.getElementById("settingGasUrl").value.trim();
  const allowedGroups = document.getElementById("settingAllowedGroups").value.trim();
  const apiSecret = document.getElementById("settingApiSecret").value.trim();
  const btn = document.getElementById("btnSaveSettings");
  btn.disabled = true;

  try {
    const resp = await fetch("/api/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gasWebhookUrl, allowedGroups, ...(apiSecret ? { apiSecret } : {}) })
    });
    const json = await resp.json();
    showToast(json.message, json.success ? "success" : "error");
    if (json.success) {
      state.gasConnected = Boolean(gasWebhookUrl);
      loadSettings();
      if (state.gasConnected) loadReports(true);
    }
  } catch (err) {
    showToast(`Gagal menyimpan pengaturan: ${err.message}`, "error");
  } finally {
    btn.disabled = false;
  }
});

document.getElementById("btnRetryQueue")?.addEventListener("click", async () => {
  const btn = document.getElementById("btnRetryQueue");
  btn.disabled = true;
  try {
    const resp = await fetch("/api/queue/retry", { method: "POST" });
    const json = await resp.json();
    if (json.success) {
      showToast(`Antrean diproses: ${json.processed} berhasil, ${json.remaining} tersisa.`, "success");
      loadQueueStatus();
      loadReports(true);
    } else {
      showToast(json.message, "error");
    }
  } catch (err) {
    showToast(`Gagal memproses antrean: ${err.message}`, "error");
  } finally {
    btn.disabled = false;
  }
});

document.getElementById("btnRefreshQueue")?.addEventListener("click", loadQueueStatus);

// --- Bootstrap ---
async function init() {
  document.getElementById("qcTanggal").value = getTodayIso();

  try {
    const [masterRes, helpRes] = await Promise.all([
      fetch("/api/master").then((r) => r.json()),
      fetch("/api/help").then((r) => r.json())
    ]);

    if (masterRes.success) {
      state.master = {
        products: masterRes.products || [],
        vendorsPre: masterRes.vendorsPre || [],
        vendorsFin: masterRes.vendorsFin || [],
        criteria: masterRes.criteria || []
      };

      const vendorDl = document.getElementById("vendorDatalist");
      const allVendors = [...new Set([...state.master.vendorsPre, ...state.master.vendorsFin])];
      if (vendorDl) {
        vendorDl.innerHTML = allVendors.map((v) => `<option value="${escapeHtml(v)}"></option>`).join("");
      }

      const prodDl = document.getElementById("productDatalist");
      if (prodDl) {
        prodDl.innerHTML = state.master.products
          .map((p) => `<option value="${escapeHtml(`${p.sku} — ${p.nama}`)}"></option>`)
          .join("");
      }
    }

    state.help = helpRes || {};
    renderProtoSnippet();
  } catch (err) {
    showToast(`Gagal memuat master data: ${err.message}`, "error");
  }

  state.items = [createEmptyItemState()];
  renderQcItems();
  await pollWaStatus();
  await loadSettings();
  await loadQueueStatus();
  loadReports();

  setInterval(pollWaStatus, 3000);
}

init();
