// ─── MONTH LETTERS (MC 2017-002) ──────────────────────────────────────────
const ML = ['a','b','c','d','e','f','g','h','i','j','k','l'];

// ─── GLOBAL SEQUENCE COUNTER ───────────────────────────────────────────────
// Single running counter across ALL transaction types, denominations, and TSEs.
// Resets to 0001 every calendar year. Format: YYYY-e-NNNN
const SEQ_KEY  = 'rfro12_seq_v6';       // counter value
const SEQ_YEAR = 'rfro12_seq_v6_year';  // year the counter belongs to

function nextSeq() {
  const now    = new Date();
  const currYr = now.getFullYear();
  const storedYr = parseInt(localStorage.getItem(SEQ_YEAR)||'0', 10);

  // Year rollover — reset counter when year changes
  if (storedYr !== currYr) {
    localStorage.setItem(SEQ_YEAR, String(currYr));
    localStorage.setItem(SEQ_KEY, '0');
  }

  const n = parseInt(localStorage.getItem(SEQ_KEY)||'0', 10) + 1;
  localStorage.setItem(SEQ_KEY, String(n));
  updateSeqDisplay(n);
  return String(n).padStart(4,'0');
}

function peekSeq() {
  // Returns the NEXT sequence number without incrementing
  const now    = new Date();
  const currYr = now.getFullYear();
  const storedYr = parseInt(localStorage.getItem(SEQ_YEAR)||'0', 10);
  if (storedYr !== currYr) return 1;
  return parseInt(localStorage.getItem(SEQ_KEY)||'0', 10) + 1;
}

function updateSeqDisplay(n) {
  const el = document.getElementById('seqPreview');
  if (el) {
    el.textContent = 'Next docket sequence: #' + String(n||peekSeq()).padStart(4,'0');
  }
}

// Colors considered "light" — require dark text/border for readability
const LIGHT_COLORS = ['#FFFFFF','#FFFFDD','#FFFF00','#FFD700','#F5F5DC','#E6E6FA','#98FF98','#FFB3D9','#64B5F6'];

function isLightColor(hex) {
  return LIGHT_COLORS.includes(hex);
}

// ─── GENERATE REFERENCE CODE ───────────────────────────────────────────────
function generateRefCode(regime, mc2017, denom, seq, now) {
  if (!now) now = new Date();
  const yyyy = now.getFullYear();
  const mL   = ML[now.getMonth()];

  if (regime === 'VIS') {
    const mm   = String(now.getMonth() + 1).padStart(2, '0');
    const dd   = String(now.getDate()).padStart(2, '0');
    return `VIS-RFRO12-${yyyy}${mm}${dd}-${seq}`;
  }
  return `R12-${mc2017}-${denom}-${yyyy}-${mL}-${seq}`;
}

// ─── SET TODAY's DATE ──────────────────────────────────────────────────────
if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => {
    const d = document.getElementById('dateReceived');
    if (d) d.value = new Date().toISOString().split('T')[0];
    updateSeqDisplay();
  });
}

// ─── TRANSACTION TYPE CHANGE ───────────────────────────────────────────────
let _currentParts = null;

function onTxnChange() {
  const sel = document.getElementById('requestType');
  const val = sel.value;
  if (!val) { document.getElementById('infoBox').classList.remove('show'); _currentParts=null; return; }
  const p = val.split('|');
  _currentParts = p;
  // fee / time
  document.getElementById('infoFee').textContent  = p[5]||'—';
  document.getElementById('infoTime').textContent = p[6]||'—';
  document.getElementById('infoBox').classList.add('show');
}

function onFormChange() { /* placeholder for denom change hooks */ }

// ─── CREATE TRANSACTION ────────────────────────────────────────────────────
function createTransaction() {
  const applicant = document.getElementById('applicantName').value.trim();
  const entity    = document.getElementById('entityName').value.trim();
  const dSel      = document.getElementById('denomination');
  const rSel      = document.getElementById('requestType');

  if (!applicant) { alert('⚠️ Applicant Name is required.'); return; }
  if (!dSel.value) { alert('⚠️ Please select a Denomination.'); return; }
  if (!rSel.value) { alert('⚠️ Please select a Request Type.'); return; }

  const p        = rSel.value.split('|');
  const dispCode = p[0];
  const mc2017   = p[1];
  const regime   = p[2];
  const folder   = p[3];
  const folderHex= p[4];
  const fee      = p[5]||'—';
  const procTime = p[6]||'—';
  const denom    = dSel.value;
  const txnLabel   = rSel.options[rSel.selectedIndex].text;
  const denomLabel = dSel.options[dSel.selectedIndex].text;

  const now    = new Date();
  const seq    = nextSeq();
  const dateStr = document.getElementById('dateReceived').value;

  const refCode = generateRefCode(regime, mc2017, denom, seq, now);

  // ── Populate Screen 2 ────────────────────────────────────────────────────
  document.getElementById('regRefCode').textContent   = refCode;
  document.getElementById('regApplicant').textContent = applicant;
  document.getElementById('regEntity').textContent    = entity||'(Not registered / Walk-in)';
  document.getElementById('regTxn').textContent       = txnLabel;
  document.getElementById('regDenom').textContent     = denomLabel;
  document.getElementById('regDate').textContent      = dateStr;
  document.getElementById('regFee').textContent       = fee;
  document.getElementById('regTime').textContent      = procTime;

  // Routing Slip fields
  document.getElementById('slipApplicant').textContent = applicant;
  document.getElementById('slipEntity').textContent    = entity||'(Walk-in)';
  document.getElementById('slipTxn').textContent       = txnLabel;
  document.getElementById('slipRef').textContent       = refCode;
  document.getElementById('slipDate').textContent      = now.toLocaleDateString('en-PH',{year:'numeric',month:'long',day:'numeric'})+' '+now.toLocaleTimeString('en-PH',{hour:'2-digit',minute:'2-digit'});
  document.getElementById('slipFolder').textContent    = folder;

  // Folder color box — cssText ensures background prints correctly
  const colorBox   = document.getElementById('folderColorBox');
  const colorLabel = document.getElementById('folderColorLabel');
  if (colorBox && folderHex) {
    const light     = isLightColor(folderHex);
    const borderCol = light ? '#999' : 'rgba(0,0,0,.25)';
    const labelCol  = light ? 'rgba(0,0,0,.75)' : 'rgba(255,255,255,.95)';
    colorBox.setAttribute('style',
      'width:80px;min-width:80px;height:40px;border-radius:5px;' +
      'border:1.5px solid ' + borderCol + ';' +
      'background:' + folderHex + ';' +
      'flex-shrink:0;display:flex;align-items:center;justify-content:center;' +
      '-webkit-print-color-adjust:exact;print-color-adjust:exact;'
    );
    colorLabel.setAttribute('style',
      'font-size:9px;font-weight:700;color:' + labelCol + ';' +
      'text-align:center;line-height:1.2;padding:2px;'
    );
    colorLabel.textContent = folder;
  }

  // Hide cashier row if fee is "No fee"
  const cashierRow = document.getElementById('cashierRow');
  if (cashierRow) {
    const noFee = (fee.toLowerCase().trim() === 'no fee');
    cashierRow.style.display = noFee ? 'none' : '';
  }

  // Show screen 2
  document.getElementById('screen-form').style.display       = 'none';
  document.getElementById('screen-registered').style.display = 'block';
  window.scrollTo({top:0,behavior:'smooth'});
}

// ─── UNITS ─────────────────────────────────────────────────────────────────
let unitCount = 0;
function addUnit() {
  unitCount++;
  document.getElementById('noUnitsMsg').style.display='none';
  const div = document.createElement('div');
  div.className='unit-card';
  div.id=`unit-${unitCount}`;
  div.innerHTML=`
    <div class="unit-title">UNIT ${unitCount}</div>
    <button class="btn-remove" onclick="removeUnit(${unitCount})" title="Remove">×</button>
    <div class="unit-grid">
      <div class="fg"><label>Plate Number</label><input type="text" placeholder="e.g., NMO554"></div>
      <div class="fg"><label>Make / Year</label><input type="text" placeholder="e.g., TOYOTA 2009"></div>
      <div class="fg"><label>Engine No.</label><input type="text" placeholder="Engine number"></div>
      <div class="fg span2"><label>Chassis No.</label><input type="text" placeholder="Chassis number"></div>
      <div class="fg"><label>LTO OR No.</label><input type="text" placeholder="OR Number"></div>
      <div class="fg"><label>LTO OR Expiry</label><input type="date"></div>
      <div class="fg"><label>Last Confirmed</label><input type="date"></div>
    </div>`;
  document.getElementById('unitsList').appendChild(div);
}
function removeUnit(id) {
  const el=document.getElementById(`unit-${id}`);
  if(el) el.remove();
  if(!document.querySelectorAll('.unit-card').length)
    document.getElementById('noUnitsMsg').style.display='block';
}

// ─── ADMIN: RESET COUNTER ──────────────────────────────────────────────────
function adminResetCounter() {
  const PIN = '1217'; // MC 2017-002 PIN — change as needed
  const entered = prompt('Enter Admin PIN to reset the docket counter:');
  if (entered === null) return; // cancelled
  if (entered !== PIN) { alert('⛔ Incorrect PIN. Counter not reset.'); return; }

  const curr = parseInt(localStorage.getItem(SEQ_KEY)||'0', 10);
  const confirmMsg = `⚠️ RESET DOCKET COUNTER?\n\nCurrent value: ${String(curr).padStart(4,'0')}\nThis will reset to 0000 (next issued: 0001).\n\nThis action is IRREVERSIBLE and should only be done at year-start or after a system migration.\n\nType YES to confirm:`;
  const confirmed = prompt(confirmMsg);
  if (confirmed !== 'YES') { alert('Reset cancelled.'); return; }

  localStorage.setItem(SEQ_KEY, '0');
  localStorage.setItem(SEQ_YEAR, String(new Date().getFullYear()));
  updateSeqDisplay(1);
  alert('✅ Counter reset. Next docket will be 0001.');
}

function resetForm() {
  ['applicantName','entityName','contactNum','emailAddr'].forEach(id=>{
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  ['denomination','requestType'].forEach(id=>{
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const infoBox = document.getElementById('infoBox');
  if (infoBox) infoBox.classList.remove('show');
  const unitsList = document.getElementById('unitsList');
  if (unitsList) unitsList.innerHTML='<p id="noUnitsMsg" style="font-size:12px;color:var(--muted);margin-top:8px">No units added yet. Click &quot;+ Add Unit&quot; to include unit details.</p>';
  unitCount=0; _currentParts=null;
  const dr = document.getElementById('dateReceived');
  if (dr) dr.value = new Date().toISOString().split('T')[0];
  const sf = document.getElementById('screen-form');
  if (sf) sf.style.display = 'block';
  const sr = document.getElementById('screen-registered');
  if (sr) sr.style.display = 'none';
  window.scrollTo({top:0,behavior:'smooth'});
}

// ── Safe Print: swap visibility so registered screen prints correctly ──
function safePrint() {
  const formEl = document.getElementById('screen-form');
  const regEl  = document.getElementById('screen-registered');
  const appBar = document.querySelector('.app-bar');
  const card   = document.querySelector('.card');

  // Save current states
  const formDisplay = formEl ? formEl.style.display : '';
  const regDisplay  = regEl  ? regEl.style.display  : '';

  // Force registered screen visible, hide form
  if (formEl) formEl.style.display = 'none';
  if (regEl)  regEl.style.display  = 'block';
  if (appBar) appBar.style.display = 'none';
  if (card)   card.style.boxShadow = 'none';

  // Small delay to let browser repaint before print dialog
  setTimeout(function() {
    window.print();

    // Restore after print dialog closes
    setTimeout(function() {
      if (formEl) formEl.style.display = formDisplay;
      if (regEl)  regEl.style.display  = regDisplay;
      if (appBar) appBar.style.display = '';
      if (card)   card.style.boxShadow = '';
    }, 500);
  }, 100);
}

// ─── MODULE EXPORTS (for testing) ─────────────────────────────────────────
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    ML,
    SEQ_KEY,
    SEQ_YEAR,
    LIGHT_COLORS,
    nextSeq,
    peekSeq,
    updateSeqDisplay,
    isLightColor,
    generateRefCode,
    onTxnChange,
    onFormChange,
    createTransaction,
    addUnit,
    removeUnit,
    adminResetCounter,
    resetForm,
    safePrint,
    // Test helpers for resetting module-level state
    _getUnitCount: () => unitCount,
    _resetUnitCount: () => { unitCount = 0; },
    _getCurrentParts: () => _currentParts,
    _resetCurrentParts: () => { _currentParts = null; },
  };
}
