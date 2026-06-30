'use strict';

/**
 * Test suite for RFRO XII Routing Slip Generator (src/app.js)
 *
 * Coverage areas:
 *  1. Month letter mapping (ML)
 *  2. Sequence counter — nextSeq / peekSeq
 *  3. Reference code generation — generateRefCode
 *  4. Light-color detection — isLightColor
 *  5. Transaction type change — onTxnChange
 *  6. Form validation — createTransaction
 *  7. Cashier row visibility — createTransaction
 *  8. Folder color box — createTransaction
 *  9. Unit management — addUnit / removeUnit
 * 10. Admin counter reset — adminResetCounter
 * 11. Form reset — resetForm
 */

const {
  ML,
  SEQ_KEY,
  SEQ_YEAR,
  LIGHT_COLORS,
  nextSeq,
  peekSeq,
  isLightColor,
  generateRefCode,
  onTxnChange,
  createTransaction,
  addUnit,
  removeUnit,
  adminResetCounter,
  resetForm,
  _getUnitCount,
  _resetUnitCount,
  _resetCurrentParts,
  _getCurrentParts,
} = require('../src/app');

// ─── Helpers ───────────────────────────────────────────────────────────────

/**
 * Exact option values used across tests — must match what's in the <select>
 * so that jsdom's select.value assignment actually sticks.
 */
const OPT = {
  CN:       'CN|CN|RFRO|Pale Yellow|#FFFFDD|PHP 240|4 Working Days',
  WA:       'WA|WA|MC2017|Pale Yellow|#FFFFDD|No fee|3 Working Days',
  WA_LC:    'WA-LC|WA|MC2017|Pale Yellow|#FFFFDD|no fee|3 Working Days',
  WA_UC:    'WA-UC|WA|MC2017|Pale Yellow|#FFFFDD|NO FEE|3 Working Days',
  NC:       'NC|NC|MC2017|Orange|#FF8C00|Per order|30 Working Days',
  VIS:      'VIS-RD|VIS|VIS|Pale Yellow|#FFFFDD|No fee|Same day',
  SHORT:    'SHORT|X|RFRO|Folder|#FFF',              // only 5 pipe parts
  CLR_PALE: 'CLR-PALE|CN|RFRO|Pale Yellow|#FFFFDD|PHP 240|4 Working Days',
  CLR_WHT:  'CLR-WHT|CN|RFRO|White|#FFFFFF|PHP 240|4 Working Days',
  CLR_ORG:  'CLR-ORG|CN|MC2017|Orange|#FF8C00|PHP 480|15 Working Days',
  CLR_DKBL: 'CLR-DKBL|CN|MC2017|Dark Blue|#003087|PHP 480|15 Working Days',
};

/** Minimal DOM that mirrors the real HTML for a given test area. */
function setupFormDOM() {
  document.body.innerHTML = `
    <div id="screen-form" style="display:block">
      <span id="seqPreview"></span>
      <input id="dateReceived" type="date" value="2026-06-30">
      <input id="applicantName" type="text">
      <input id="entityName"    type="text">
      <select id="denomination">
        <option value="">-- Select --</option>
        <option value="PJ">PJ — Public Utility Jeepney</option>
        <option value="UV">UV — UV Express</option>
      </select>
      <select id="requestType">
        <option value="">Select…</option>
        <option value="${OPT.CN}">CONFIRMATION OF UNITS (CN)</option>
        <option value="${OPT.WA}">WAIVER (WA)</option>
        <option value="${OPT.WA_LC}">WAIVER — lowercase fee</option>
        <option value="${OPT.WA_UC}">WAIVER — uppercase fee</option>
        <option value="${OPT.NC}">NEW CPC (NC)</option>
        <option value="${OPT.VIS}">WALK-IN VISIT (VIS)</option>
        <option value="${OPT.SHORT}">SHORT VALUE — 5 parts only</option>
        <option value="${OPT.CLR_PALE}">COLOR TEST — Pale Yellow</option>
        <option value="${OPT.CLR_WHT}">COLOR TEST — White</option>
        <option value="${OPT.CLR_ORG}">COLOR TEST — Orange</option>
        <option value="${OPT.CLR_DKBL}">COLOR TEST — Dark Blue</option>
      </select>
      <div id="infoBox"><span id="infoFee"></span><span id="infoTime"></span></div>
      <div id="unitsList">
        <p id="noUnitsMsg">No units added yet.</p>
      </div>
    </div>
    <div id="screen-registered" style="display:none">
      <span id="regRefCode"></span>
      <span id="regApplicant"></span>
      <span id="regEntity"></span>
      <span id="regTxn"></span>
      <span id="regDenom"></span>
      <span id="regDate"></span>
      <span id="regFee"></span>
      <span id="regTime"></span>
      <span id="slipApplicant"></span>
      <span id="slipEntity"></span>
      <span id="slipTxn"></span>
      <span id="slipRef"></span>
      <span id="slipDate"></span>
      <span id="slipFolder"></span>
      <div id="folderColorBox"></div>
      <span id="folderColorLabel"></span>
      <table class="rtable">
        <tbody>
          <tr><td><div class="stn">1. PACD</div></td><td></td><td></td><td></td></tr>
          <tr><td><div class="stn">2. ASSESSMENT</div></td><td></td><td></td><td></td></tr>
          <tr id="cashierRow"><td><div class="stn">3. CASHIER</div></td><td></td><td></td><td></td></tr>
          <tr><td><div class="stn">4. TECH/LEGAL/ADMIN</div></td><td></td><td></td><td></td></tr>
          <tr><td><div class="stn">5. RECORDS</div></td><td></td><td></td><td></td></tr>
          <tr><td><div class="stn">6. COMPLETION &amp; RELEASE</div></td><td></td><td></td><td></td></tr>
        </tbody>
      </table>
    </div>`;
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. MONTH LETTER MAPPING
// ═══════════════════════════════════════════════════════════════════════════
describe('Month letter mapping (ML)', () => {
  test('has exactly 12 entries', () => {
    expect(ML).toHaveLength(12);
  });

  test('maps each month index to the correct lowercase letter', () => {
    const expected = ['a','b','c','d','e','f','g','h','i','j','k','l'];
    expect(ML).toEqual(expected);
  });

  test('January is "a" and December is "l"', () => {
    expect(ML[0]).toBe('a');
    expect(ML[11]).toBe('l');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. SEQUENCE COUNTER — nextSeq / peekSeq
// ═══════════════════════════════════════════════════════════════════════════
describe('Sequence counter', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('nextSeq()', () => {
    test('returns "0001" on first call with empty localStorage', () => {
      expect(nextSeq()).toBe('0001');
    });

    test('increments on subsequent calls', () => {
      expect(nextSeq()).toBe('0001');
      expect(nextSeq()).toBe('0002');
      expect(nextSeq()).toBe('0003');
    });

    test('zero-pads to 4 digits', () => {
      expect(nextSeq()).toBe('0001');
      // Fast-forward counter to 99
      localStorage.setItem(SEQ_KEY, '98');
      localStorage.setItem(SEQ_YEAR, String(new Date().getFullYear()));
      expect(nextSeq()).toBe('0099');
    });

    test('returns 5-digit string when counter exceeds 9999', () => {
      // Documents current behavior: no upper-bound guard
      localStorage.setItem(SEQ_KEY, '9999');
      localStorage.setItem(SEQ_YEAR, String(new Date().getFullYear()));
      expect(nextSeq()).toBe('10000');
    });

    test('persists incremented value to localStorage', () => {
      nextSeq();
      expect(localStorage.getItem(SEQ_KEY)).toBe('1');
    });

    test('resets counter to "0001" on year rollover', () => {
      // Simulate a stored counter from a previous year
      localStorage.setItem(SEQ_KEY, '42');
      localStorage.setItem(SEQ_YEAR, '2020');

      const result = nextSeq();
      expect(result).toBe('0001');
      expect(localStorage.getItem(SEQ_YEAR)).toBe(String(new Date().getFullYear()));
    });

    test('stores the current year after year rollover reset', () => {
      localStorage.setItem(SEQ_KEY, '5');
      localStorage.setItem(SEQ_YEAR, '1999');
      nextSeq();
      expect(localStorage.getItem(SEQ_YEAR)).toBe(String(new Date().getFullYear()));
    });
  });

  describe('peekSeq()', () => {
    test('returns 1 when no localStorage data exists', () => {
      expect(peekSeq()).toBe(1);
    });

    test('returns next value without incrementing', () => {
      localStorage.setItem(SEQ_KEY, '5');
      localStorage.setItem(SEQ_YEAR, String(new Date().getFullYear()));
      expect(peekSeq()).toBe(6);
      expect(peekSeq()).toBe(6); // still 6 — not incremented
      expect(localStorage.getItem(SEQ_KEY)).toBe('5');
    });

    test('returns 1 when stored year differs from current year', () => {
      localStorage.setItem(SEQ_KEY, '999');
      localStorage.setItem(SEQ_YEAR, '2000');
      expect(peekSeq()).toBe(1);
    });

    test('peekSeq matches nextSeq value before the call', () => {
      localStorage.setItem(SEQ_KEY, '10');
      localStorage.setItem(SEQ_YEAR, String(new Date().getFullYear()));
      const peeked  = peekSeq();
      const actual  = parseInt(nextSeq(), 10);
      expect(actual).toBe(peeked);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. REFERENCE CODE GENERATION
// ═══════════════════════════════════════════════════════════════════════════
describe('generateRefCode()', () => {
  const fixedDate = new Date('2026-06-30T08:00:00');

  test('generates correct MC2017 format', () => {
    // June → month index 5 → ML[5] = 'f'
    const code = generateRefCode('MC2017', 'CN', 'PJ', '0001', fixedDate);
    expect(code).toBe('R12-CN-PJ-2026-f-0001');
  });

  test('generates correct RFRO format', () => {
    const code = generateRefCode('RFRO', 'CN', 'UV', '0042', fixedDate);
    expect(code).toBe('R12-CN-UV-2026-f-0042');
  });

  test('generates VIS format with full date stamp', () => {
    const code = generateRefCode('VIS', 'VIS', 'VIS', '0003', fixedDate);
    expect(code).toBe('VIS-RFRO12-20260630-0003');
  });

  test('VIS format zero-pads single-digit months and days', () => {
    const jan5 = new Date('2026-01-05T10:00:00');
    const code  = generateRefCode('VIS', 'VIS', 'VIS', '0001', jan5);
    expect(code).toBe('VIS-RFRO12-20260105-0001');
  });

  test('month letter is correct for January (index 0 → "a")', () => {
    const jan = new Date('2026-01-15T12:00:00');
    const code = generateRefCode('RFRO', 'YVC', 'PJ', '0001', jan);
    expect(code).toBe('R12-YVC-PJ-2026-a-0001');
  });

  test('month letter is correct for December (index 11 → "l")', () => {
    const dec = new Date('2026-12-01T12:00:00');
    const code = generateRefCode('MC2017', 'TN', 'UV', '0100', dec);
    expect(code).toBe('R12-TN-UV-2026-l-0100');
  });

  test('uses current date when no date argument is provided', () => {
    const now  = new Date();
    const yyyy = now.getFullYear();
    const mL   = ML[now.getMonth()];
    const code = generateRefCode('RFRO', 'CN', 'PJ', '0001');
    expect(code).toBe(`R12-CN-PJ-${yyyy}-${mL}-0001`);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. LIGHT COLOR DETECTION
// ═══════════════════════════════════════════════════════════════════════════
describe('isLightColor()', () => {
  test.each([
    '#FFFFFF', '#FFFFDD', '#FFFF00', '#FFD700',
    '#F5F5DC', '#E6E6FA', '#98FF98', '#FFB3D9', '#64B5F6',
  ])('returns true for light color %s', (hex) => {
    expect(isLightColor(hex)).toBe(true);
  });

  test.each([
    '#FF8C00', '#003087', '#FF0000', '#654321',
    '#800000', '#000000', '#008080', '#4169E1', '#1B5E20',
  ])('returns false for dark color %s', (hex) => {
    expect(isLightColor(hex)).toBe(false);
  });

  test('returns false for unknown/unlisted color', () => {
    expect(isLightColor('#123456')).toBe(false);
    expect(isLightColor('')).toBe(false);
  });

  test('LIGHT_COLORS array matches what isLightColor considers light', () => {
    LIGHT_COLORS.forEach(hex => {
      expect(isLightColor(hex)).toBe(true);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. TRANSACTION TYPE CHANGE — onTxnChange
// ═══════════════════════════════════════════════════════════════════════════
describe('onTxnChange()', () => {
  beforeEach(() => {
    setupFormDOM();
    _resetCurrentParts();
  });

  test('hides info box when no value is selected', () => {
    document.getElementById('requestType').value = '';
    onTxnChange();
    expect(document.getElementById('infoBox').classList.contains('show')).toBe(false);
  });

  test('resets _currentParts to null when no value is selected', () => {
    document.getElementById('requestType').value = '';
    onTxnChange();
    expect(_getCurrentParts()).toBeNull();
  });

  test('shows info box when a transaction type is selected', () => {
    document.getElementById('requestType').value = OPT.CN;
    onTxnChange();
    expect(document.getElementById('infoBox').classList.contains('show')).toBe(true);
  });

  test('populates fee display with the correct value', () => {
    document.getElementById('requestType').value = OPT.CN;
    onTxnChange();
    expect(document.getElementById('infoFee').textContent).toBe('PHP 240');
  });

  test('populates processing time with the correct value', () => {
    document.getElementById('requestType').value = OPT.CN;
    onTxnChange();
    expect(document.getElementById('infoTime').textContent).toBe('4 Working Days');
  });

  test('shows "—" for fee when the pipe-delimited value has fewer than 6 parts', () => {
    // OPT.SHORT = 'SHORT|X|RFRO|Folder|#FFF' — only 5 parts, so p[5] is undefined
    document.getElementById('requestType').value = OPT.SHORT;
    onTxnChange();
    expect(document.getElementById('infoFee').textContent).toBe('—');
  });

  test('stores parsed parts in _currentParts', () => {
    document.getElementById('requestType').value = OPT.CN;
    onTxnChange();
    const parts = _getCurrentParts();
    expect(parts).not.toBeNull();
    expect(parts[0]).toBe('CN');
    expect(parts[2]).toBe('RFRO');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 6. FORM VALIDATION — createTransaction
// ═══════════════════════════════════════════════════════════════════════════
describe('createTransaction() — validation', () => {
  beforeEach(() => {
    setupFormDOM();
    localStorage.clear();
    localStorage.setItem(SEQ_YEAR, String(new Date().getFullYear()));
    jest.spyOn(window, 'alert').mockImplementation(() => {});
    jest.spyOn(window, 'scrollTo').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('alerts and returns early when applicant name is empty', () => {
    document.getElementById('applicantName').value = '';
    document.getElementById('denomination').value  = 'PJ';
    document.getElementById('requestType').value   = OPT.CN;

    createTransaction();
    expect(window.alert).toHaveBeenCalledWith(expect.stringContaining('Applicant Name is required'));
    expect(document.getElementById('screen-registered').style.display).not.toBe('block');
  });

  test('alerts and returns early when applicant name is only whitespace', () => {
    document.getElementById('applicantName').value = '   ';
    document.getElementById('denomination').value  = 'PJ';
    document.getElementById('requestType').value   = OPT.CN;

    createTransaction();
    expect(window.alert).toHaveBeenCalledWith(expect.stringContaining('Applicant Name is required'));
  });

  test('alerts and returns early when denomination is not selected', () => {
    document.getElementById('applicantName').value = 'Juan dela Cruz';
    document.getElementById('denomination').value  = '';
    document.getElementById('requestType').value   = OPT.CN;

    createTransaction();
    expect(window.alert).toHaveBeenCalledWith(expect.stringContaining('select a Denomination'));
  });

  test('alerts and returns early when request type is not selected', () => {
    document.getElementById('applicantName').value = 'Juan dela Cruz';
    document.getElementById('denomination').value  = 'PJ';
    document.getElementById('requestType').value   = '';

    createTransaction();
    expect(window.alert).toHaveBeenCalledWith(expect.stringContaining('select a Request Type'));
  });

  test('does not alert and proceeds to screen 2 when all required fields are filled', () => {
    document.getElementById('applicantName').value = 'Juan dela Cruz';
    document.getElementById('denomination').value  = 'PJ';
    document.getElementById('requestType').value   = OPT.CN;

    createTransaction();
    expect(window.alert).not.toHaveBeenCalled();
    expect(document.getElementById('screen-registered').style.display).toBe('block');
  });

  test('hides screen-form after successful submission', () => {
    document.getElementById('applicantName').value = 'Test Applicant';
    document.getElementById('denomination').value  = 'UV';
    document.getElementById('requestType').value   = OPT.NC;

    createTransaction();
    expect(document.getElementById('screen-form').style.display).toBe('none');
  });

  test('populates applicant name on screen 2', () => {
    document.getElementById('applicantName').value = 'Maria Santos';
    document.getElementById('denomination').value  = 'PJ';
    document.getElementById('requestType').value   = OPT.CN;

    createTransaction();
    expect(document.getElementById('regApplicant').textContent).toBe('Maria Santos');
  });

  test('populates "(Not registered / Walk-in)" when entity name is blank', () => {
    document.getElementById('applicantName').value = 'Pedro Reyes';
    document.getElementById('entityName').value    = '';
    document.getElementById('denomination').value  = 'PJ';
    document.getElementById('requestType').value   = OPT.CN;

    createTransaction();
    expect(document.getElementById('regEntity').textContent).toBe('(Not registered / Walk-in)');
  });

  test('populates entity name on screen 2 when provided', () => {
    document.getElementById('applicantName').value = 'Pedro Reyes';
    document.getElementById('entityName').value    = 'KCORTRANSCO';
    document.getElementById('denomination').value  = 'PJ';
    document.getElementById('requestType').value   = OPT.CN;

    createTransaction();
    expect(document.getElementById('regEntity').textContent).toBe('KCORTRANSCO');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 7. CASHIER ROW VISIBILITY
// ═══════════════════════════════════════════════════════════════════════════
describe('createTransaction() — cashier row visibility', () => {
  beforeEach(() => {
    setupFormDOM();
    localStorage.clear();
    localStorage.setItem(SEQ_YEAR, String(new Date().getFullYear()));
    jest.spyOn(window, 'alert').mockImplementation(() => {});
    jest.spyOn(window, 'scrollTo').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function submitWith(optValue) {
    document.getElementById('applicantName').value = 'Test User';
    document.getElementById('denomination').value  = 'PJ';
    document.getElementById('requestType').value   = optValue;
    createTransaction();
  }

  test('hides cashier row when fee is "No fee" (exact case)', () => {
    submitWith(OPT.WA);
    expect(document.getElementById('cashierRow').style.display).toBe('none');
  });

  test('hides cashier row when fee is "no fee" (lowercase)', () => {
    submitWith(OPT.WA_LC);
    expect(document.getElementById('cashierRow').style.display).toBe('none');
  });

  test('hides cashier row when fee is "NO FEE" (uppercase)', () => {
    submitWith(OPT.WA_UC);
    expect(document.getElementById('cashierRow').style.display).toBe('none');
  });

  test('shows cashier row when fee is a monetary amount', () => {
    submitWith(OPT.CN);
    expect(document.getElementById('cashierRow').style.display).toBe('');
  });

  test('shows cashier row when fee is "Per order"', () => {
    submitWith(OPT.NC);
    expect(document.getElementById('cashierRow').style.display).toBe('');
  });

  test('shows cashier row when fee falls back to "—" (missing part)', () => {
    // OPT.SHORT has only 5 pipe parts — fee index is undefined → defaults to '—'
    submitWith(OPT.SHORT);
    expect(document.getElementById('cashierRow').style.display).toBe('');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 8. FOLDER COLOR BOX
// ═══════════════════════════════════════════════════════════════════════════
describe('createTransaction() — folder color box', () => {
  beforeEach(() => {
    setupFormDOM();
    localStorage.clear();
    localStorage.setItem(SEQ_YEAR, String(new Date().getFullYear()));
    jest.spyOn(window, 'alert').mockImplementation(() => {});
    jest.spyOn(window, 'scrollTo').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function submitWithOpt(optValue) {
    document.getElementById('applicantName').value = 'Test User';
    document.getElementById('denomination').value  = 'PJ';
    document.getElementById('requestType').value   = optValue;
    createTransaction();
  }

  test('sets background to the transaction folder color', () => {
    submitWithOpt(OPT.CLR_ORG); // Orange → #FF8C00
    const style = document.getElementById('folderColorBox').getAttribute('style');
    expect(style).toContain('background:#FF8C00');
  });

  test('uses dark border for light-colored folders', () => {
    submitWithOpt(OPT.CLR_PALE); // Pale Yellow → #FFFFDD (light)
    const style = document.getElementById('folderColorBox').getAttribute('style');
    expect(style).toContain('border:1.5px solid #999');
  });

  test('uses light border for dark-colored folders', () => {
    submitWithOpt(OPT.CLR_ORG); // Orange → #FF8C00 (dark)
    const style = document.getElementById('folderColorBox').getAttribute('style');
    expect(style).toContain('border:1.5px solid rgba(0,0,0,.25)');
  });

  test('sets label text to folder name', () => {
    submitWithOpt(OPT.CLR_PALE); // Pale Yellow folder
    expect(document.getElementById('folderColorLabel').textContent).toBe('Pale Yellow');
  });

  test('uses dark label text for light folders', () => {
    submitWithOpt(OPT.CLR_WHT); // White → #FFFFFF (light)
    const labelStyle = document.getElementById('folderColorLabel').getAttribute('style');
    expect(labelStyle).toContain('color:rgba(0,0,0,.75)');
  });

  test('uses light label text for dark folders', () => {
    submitWithOpt(OPT.CLR_DKBL); // Dark Blue → #003087 (dark)
    const labelStyle = document.getElementById('folderColorLabel').getAttribute('style');
    expect(labelStyle).toContain('color:rgba(255,255,255,.95)');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 9. UNIT MANAGEMENT — addUnit / removeUnit
// ═══════════════════════════════════════════════════════════════════════════
describe('Unit management', () => {
  beforeEach(() => {
    setupFormDOM();
    _resetUnitCount();
  });

  describe('addUnit()', () => {
    test('hides the "no units" message when first unit is added', () => {
      addUnit();
      expect(document.getElementById('noUnitsMsg').style.display).toBe('none');
    });

    test('appends a unit card to the units list', () => {
      addUnit();
      expect(document.querySelectorAll('.unit-card')).toHaveLength(1);
    });

    test('creates unit with correct id attribute', () => {
      addUnit();
      expect(document.getElementById('unit-1')).not.toBeNull();
    });

    test('displays correct unit number in card title', () => {
      addUnit();
      const title = document.querySelector('.unit-card .unit-title');
      expect(title.textContent).toBe('UNIT 1');
    });

    test('increments unit count on each call', () => {
      addUnit();
      addUnit();
      addUnit();
      expect(_getUnitCount()).toBe(3);
      expect(document.querySelectorAll('.unit-card')).toHaveLength(3);
    });

    test('each unit has the required input fields', () => {
      addUnit();
      const card = document.getElementById('unit-1');
      const inputs = card.querySelectorAll('input');
      expect(inputs.length).toBeGreaterThanOrEqual(5);
    });
  });

  describe('removeUnit()', () => {
    test('removes the unit card from the DOM', () => {
      addUnit();
      expect(document.getElementById('unit-1')).not.toBeNull();
      removeUnit(1);
      expect(document.getElementById('unit-1')).toBeNull();
    });

    test('shows "no units" message when last unit is removed', () => {
      addUnit();
      removeUnit(1);
      expect(document.getElementById('noUnitsMsg').style.display).toBe('block');
    });

    test('does not show "no units" message when other units still exist', () => {
      addUnit();
      addUnit();
      removeUnit(1);
      expect(document.getElementById('noUnitsMsg').style.display).not.toBe('block');
    });

    test('does not throw when removing a non-existent unit id', () => {
      expect(() => removeUnit(999)).not.toThrow();
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 10. ADMIN COUNTER RESET — adminResetCounter
// ═══════════════════════════════════════════════════════════════════════════
describe('adminResetCounter()', () => {
  beforeEach(() => {
    setupFormDOM();
    localStorage.clear();
    localStorage.setItem(SEQ_KEY, '42');
    localStorage.setItem(SEQ_YEAR, String(new Date().getFullYear()));
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('does nothing when PIN prompt is cancelled (null)', () => {
    jest.spyOn(window, 'prompt').mockReturnValueOnce(null);
    jest.spyOn(window, 'alert').mockImplementation(() => {});
    adminResetCounter();
    expect(localStorage.getItem(SEQ_KEY)).toBe('42');
  });

  test('alerts error and does not reset when wrong PIN is entered', () => {
    jest.spyOn(window, 'prompt').mockReturnValueOnce('0000');
    const alertSpy = jest.spyOn(window, 'alert').mockImplementation(() => {});
    adminResetCounter();
    expect(alertSpy).toHaveBeenCalledWith(expect.stringContaining('Incorrect PIN'));
    expect(localStorage.getItem(SEQ_KEY)).toBe('42');
  });

  test('does not reset when confirmation is not "YES"', () => {
    jest.spyOn(window, 'prompt')
      .mockReturnValueOnce('1217')   // correct PIN
      .mockReturnValueOnce('yes');   // wrong confirmation (lowercase)
    jest.spyOn(window, 'alert').mockImplementation(() => {});
    adminResetCounter();
    expect(localStorage.getItem(SEQ_KEY)).toBe('42');
  });

  test('does not reset when confirmation prompt is cancelled', () => {
    jest.spyOn(window, 'prompt')
      .mockReturnValueOnce('1217')
      .mockReturnValueOnce(null);
    jest.spyOn(window, 'alert').mockImplementation(() => {});
    adminResetCounter();
    expect(localStorage.getItem(SEQ_KEY)).toBe('42');
  });

  test('resets counter to 0 when correct PIN and "YES" confirmation', () => {
    jest.spyOn(window, 'prompt')
      .mockReturnValueOnce('1217')
      .mockReturnValueOnce('YES');
    jest.spyOn(window, 'alert').mockImplementation(() => {});
    adminResetCounter();
    expect(localStorage.getItem(SEQ_KEY)).toBe('0');
  });

  test('stores current year after reset', () => {
    jest.spyOn(window, 'prompt')
      .mockReturnValueOnce('1217')
      .mockReturnValueOnce('YES');
    jest.spyOn(window, 'alert').mockImplementation(() => {});
    adminResetCounter();
    expect(localStorage.getItem(SEQ_YEAR)).toBe(String(new Date().getFullYear()));
  });

  test('shows success alert after reset', () => {
    jest.spyOn(window, 'prompt')
      .mockReturnValueOnce('1217')
      .mockReturnValueOnce('YES');
    const alertSpy = jest.spyOn(window, 'alert').mockImplementation(() => {});
    adminResetCounter();
    expect(alertSpy).toHaveBeenCalledWith(expect.stringContaining('Counter reset'));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 11. FORM RESET — resetForm
// ═══════════════════════════════════════════════════════════════════════════
describe('resetForm()', () => {
  beforeEach(() => {
    setupFormDOM();
    _resetUnitCount();
    _resetCurrentParts();
    jest.spyOn(window, 'scrollTo').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('clears applicant name', () => {
    document.getElementById('applicantName').value = 'Juan dela Cruz';
    resetForm();
    expect(document.getElementById('applicantName').value).toBe('');
  });

  test('clears entity name', () => {
    document.getElementById('entityName').value = 'KCORTRANSCO';
    resetForm();
    expect(document.getElementById('entityName').value).toBe('');
  });

  test('resets denomination select to empty', () => {
    document.getElementById('denomination').value = 'PJ';
    resetForm();
    expect(document.getElementById('denomination').value).toBe('');
  });

  test('resets request type select to empty', () => {
    document.getElementById('requestType').value = OPT.CN;
    resetForm();
    expect(document.getElementById('requestType').value).toBe('');
  });

  test('removes "show" class from info box', () => {
    document.getElementById('infoBox').classList.add('show');
    resetForm();
    expect(document.getElementById('infoBox').classList.contains('show')).toBe(false);
  });

  test('makes screen-form visible', () => {
    document.getElementById('screen-form').style.display = 'none';
    resetForm();
    expect(document.getElementById('screen-form').style.display).toBe('block');
  });

  test('hides screen-registered', () => {
    document.getElementById('screen-registered').style.display = 'block';
    resetForm();
    expect(document.getElementById('screen-registered').style.display).toBe('none');
  });

  test('resets unitCount to 0', () => {
    // Simulate having added units
    addUnit();
    addUnit();
    expect(_getUnitCount()).toBe(2);
    resetForm();
    expect(_getUnitCount()).toBe(0);
  });

  test('resets _currentParts to null', () => {
    document.getElementById('requestType').value = OPT.CN;
    onTxnChange();
    expect(_getCurrentParts()).not.toBeNull();
    resetForm();
    expect(_getCurrentParts()).toBeNull();
  });

  test('restores units list to show "no units" placeholder', () => {
    addUnit();
    resetForm();
    expect(document.getElementById('noUnitsMsg')).not.toBeNull();
  });

  test('sets date received to today', () => {
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('dateReceived').value = '2020-01-01';
    resetForm();
    expect(document.getElementById('dateReceived').value).toBe(today);
  });
});
