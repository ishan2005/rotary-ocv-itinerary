/* ============================================
   ROTARY OCV ITINERARY — APP LOGIC
   Password Auth + CRUD + Render + Share
   ============================================ */

// ── Helpers ──
const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const esc = (s) => { if (!s) return ''; const d = document.createElement('div'); d.textContent = s; return d.innerHTML; };

// ── Storage Keys ──
const KEY_DATA     = 'rotary_ocv_data';
const KEY_PASSWORD = 'rotary_ocv_pwd';
const KEY_SETUP    = 'rotary_ocv_setup';

// ── State ──
let state = {
  isAdmin: false,
  isSetup: false,         // password has been set before
  governor: {
    name: 'Governor Name',
    designation: 'District Governor',
    district: 'District',
    year: 'RI Year 2025-26',
    theme: 'Service Above Self',
    photo: null,
    contact: '',
  },
  items: [],              // mixed array: {type:'visit'|'travel', ...data}
  editingId: null,
  currentFilter: 'all',
  agendaCounter: 0,
};

// ── Load / Save ──
function loadData() {
  try {
    const raw = localStorage.getItem(KEY_DATA);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.governor) state.governor = { ...state.governor, ...parsed.governor };
      if (parsed.items)    state.items    = parsed.items;
    }
    state.isSetup = !!localStorage.getItem(KEY_SETUP);
  } catch(e) { console.warn('Load error', e); }
}
function saveData() {
  localStorage.setItem(KEY_DATA, JSON.stringify({ governor: state.governor, items: state.items }));
}

// ── Password Helpers ──
function hashPassword(pwd) {
  // Simple hash (not cryptographic, but sufficient for localStorage protection)
  let hash = 0;
  for (let i = 0; i < pwd.length; i++) {
    const chr = pwd.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0;
  }
  return 'rotary_' + Math.abs(hash).toString(36) + '_' + pwd.length;
}
function getStoredHash() { return localStorage.getItem(KEY_PASSWORD) || ''; }
function setPassword(pwd) {
  localStorage.setItem(KEY_PASSWORD, hashPassword(pwd));
  localStorage.setItem(KEY_SETUP, '1');
  state.isSetup = true;
}
function verifyPassword(pwd) { return hashPassword(pwd) === getStoredHash(); }

// ── Toast ──
function toast(msg, type = '') {
  const el = $('#toast');
  el.textContent = msg;
  el.className = 'toast show ' + type;
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.className = 'toast'; }, 2800);
}

// ── Modal helpers ──
function openModal(id) { document.getElementById(id)?.classList.add('open'); }
function closeModal(id) { document.getElementById(id)?.classList.remove('open'); }

// ── Format helpers ──
function formatDate(d) {
  if (!d) return '';
  const dt = new Date(d + 'T00:00:00');
  return dt.toLocaleDateString('en-IN', { weekday:'short', day:'numeric', month:'short', year:'numeric' });
}
function formatDateShort(d) {
  if (!d) return '';
  const dt = new Date(d + 'T00:00:00');
  return dt.toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' });
}
function formatTime(t) {
  if (!t) return '';
  const [h, m] = t.split(':');
  const hr = parseInt(h); const ap = hr >= 12 ? 'PM' : 'AM';
  return `${hr % 12 || 12}:${m} ${ap}`;
}
function getMonthKey(dateStr) {
  if (!dateStr) return 'Undated';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}
function travelModeIcon(mode) {
  const m = { car:'🚗', train:'🚂', flight:'✈️', bus:'🚌', other:'🚐' };
  return m[mode] || '🚐';
}

// ============================================
// RENDER
// ============================================

function renderGovernorProfile() {
  const g = state.governor;
  $('#governor-name').textContent = g.name || 'Governor Name';
  $('#governor-designation').textContent = g.designation || 'District Governor';
  $('#governor-district').innerHTML = `<i data-lucide="map"></i> ${esc(g.district || 'District')}`;
  $('#governor-year').innerHTML = `<i data-lucide="calendar"></i> ${esc(g.year || 'RI Year')}`;
  $('#header-subtitle').textContent = g.district ? `${g.district} — Governor's Itinerary` : 'District Governor\'s Itinerary';
  $('#footer-prepared').textContent = `Prepared by the Office of ${g.designation || 'District Governor'}, ${g.district || ''}`;

  const photoEl = $('#governor-photo');
  if (g.photo) {
    photoEl.innerHTML = `<img src="${g.photo}" alt="${esc(g.name)}" />`;
  } else {
    photoEl.innerHTML = `<i data-lucide="user" class="governor-photo-placeholder"></i>`;
  }
  lucide.createIcons();
}

function renderStats() {
  const visits = state.items.filter(i => i.type === 'visit');
  $('#stat-clubs').textContent     = visits.length;
  $('#stat-confirmed').textContent = visits.filter(v => v.status === 'confirmed').length;
  $('#stat-tentative').textContent = visits.filter(v => v.status === 'tentative').length;
  $('#stat-completed').textContent = visits.filter(v => v.status === 'completed').length;
}

function renderTimeline() {
  const timeline = $('#timeline');
  const sortedItems = [...state.items].sort((a, b) => {
    const da = a.date || '9999-99-99';
    const db = b.date || '9999-99-99';
    if (da !== db) return da.localeCompare(db);
    const ta = a.time || a.departureTime || '00:00';
    const tb = b.time || b.departureTime || '00:00';
    return ta.localeCompare(tb);
  });

  if (sortedItems.length === 0) {
    timeline.innerHTML = `
      <div class="empty-state" id="empty-itinerary">
        <div class="empty-icon">📋</div>
        <h4>No club visits scheduled yet</h4>
        <p>The itinerary will appear here once visits are added.</p>
      </div>`;
    lucide.createIcons();
    return;
  }

  // Group by month
  const groups = {};
  sortedItems.forEach(item => {
    const mk = getMonthKey(item.date);
    if (!groups[mk]) groups[mk] = [];
    groups[mk].push(item);
  });

  let html = '';
  Object.entries(groups).forEach(([month, items]) => {
    html += `<div class="month-group">
      <div class="month-label"><i data-lucide="calendar-range"></i> ${esc(month)}</div>
    `;
    items.forEach(item => {
      if (item.type === 'visit') {
        html += renderVisitCard(item);
      } else if (item.type === 'travel') {
        html += renderTravelCard(item);
      }
    });
    html += `</div>`;
  });

  timeline.innerHTML = html;
  lucide.createIcons();
  applyFilter(state.currentFilter);
}

function renderVisitCard(v) {
  const agendaHtml = (v.agenda && v.agenda.length > 0) ? `
    <div class="visit-agenda">
      <div class="agenda-title">Program / Agenda</div>
      <div class="agenda-list">
        ${v.agenda.map(a => `
          <div class="agenda-row">
            <span class="agenda-time-slot">${esc(a.time ? formatTime(a.time) : '')}</span>
            <span class="agenda-desc">${esc(a.desc)}</span>
          </div>
        `).join('')}
      </div>
    </div>` : '';

  const officialsHtml = (v.president || v.secretary) ? `
    <div class="visit-officials">
      ${v.president ? `
        <div class="official-item">
          <span class="official-role">President</span>
          <strong>${esc(v.president)}</strong>
          ${v.presidentPhone ? `<span class="official-phone">📞 ${esc(v.presidentPhone)}</span>` : ''}
        </div>` : ''}
      ${v.secretary ? `
        <div class="official-item">
          <span class="official-role">Secretary</span>
          <strong>${esc(v.secretary)}</strong>
          ${v.secretaryPhone ? `<span class="official-phone">📞 ${esc(v.secretaryPhone)}</span>` : ''}
        </div>` : ''}
    </div>` : '';

  const adminActions = state.isAdmin ? `
    <div class="admin-card-actions">
      <button class="card-action-btn edit-visit-btn" data-id="${v.id}" title="Edit">
        <i data-lucide="pencil"></i>
      </button>
      <button class="card-action-btn del delete-visit-btn" data-id="${v.id}" title="Delete">
        <i data-lucide="trash-2"></i>
      </button>
    </div>` : '';

  const notesHtml = v.notes ? `<div class="visit-notes">📝 ${esc(v.notes)}</div>` : '';

  return `
    <div class="visit-entry" data-id="${v.id}" data-status="${v.status}">
      <div class="timeline-dot-col">
        <div class="timeline-dot ${v.status}"></div>
      </div>
      <div class="visit-card ${v.status}">
        <div class="visit-card-header">
          <div class="visit-header-left">
            <div class="visit-date-time">
              <span class="visit-date"><i data-lucide="calendar"></i> ${esc(formatDate(v.date))}</span>
              ${v.time ? `<span class="visit-time"><i data-lucide="clock"></i> ${esc(formatTime(v.time))}</span>` : ''}
            </div>
            <div class="visit-club-name">${esc(v.clubName)}</div>
            ${v.venue ? `<div class="visit-venue"><i data-lucide="map-pin"></i> ${esc(v.venue)}${v.city ? `, ${esc(v.city)}` : ''}</div>` : (v.city ? `<div class="visit-venue"><i data-lucide="map-pin"></i> ${esc(v.city)}</div>` : '')}
          </div>
          <div class="visit-header-right">
            <span class="status-badge status-${v.status}">${v.status}</span>
            ${adminActions}
          </div>
        </div>
        ${officialsHtml}
        ${agendaHtml}
        ${notesHtml}
      </div>
    </div>`;
}

function renderTravelCard(t) {
  const adminActions = state.isAdmin ? `
    <div class="admin-card-actions" style="margin-left:auto;flex-shrink:0">
      <button class="card-action-btn edit-travel-btn" data-id="${t.id}" title="Edit">
        <i data-lucide="pencil"></i>
      </button>
      <button class="card-action-btn del delete-travel-btn" data-id="${t.id}" title="Delete">
        <i data-lucide="trash-2"></i>
      </button>
    </div>` : '';

  return `
    <div class="travel-entry" data-id="${t.id}">
      <div class="timeline-dot-col">
        <div class="travel-dot"></div>
      </div>
      <div class="travel-card">
        <div class="travel-route">
          <span class="travel-city">${esc(t.from)}</span>
          <div class="travel-arrow"><i data-lucide="arrow-right"></i></div>
          <span class="travel-city">${esc(t.to)}</span>
        </div>
        <div class="travel-meta">
          <span class="travel-mode-badge">${travelModeIcon(t.mode)} ${esc(t.mode || 'car')}</span>
          ${t.date ? `<span class="travel-meta-item"><i data-lucide="calendar"></i> ${esc(formatDateShort(t.date))}</span>` : ''}
          ${t.time ? `<span class="travel-meta-item"><i data-lucide="clock"></i> ${esc(formatTime(t.time))}</span>` : ''}
          ${t.duration ? `<span class="travel-meta-item"><i data-lucide="timer"></i> ${esc(t.duration)}</span>` : ''}
          ${t.distance ? `<span class="travel-meta-item"><i data-lucide="milestone"></i> ${esc(t.distance)}</span>` : ''}
          ${t.contact ? `<span class="travel-meta-item"><i data-lucide="phone"></i> ${esc(t.contact)}</span>` : ''}
        </div>
        ${adminActions}
      </div>
    </div>`;
}

function applyFilter(filter) {
  state.currentFilter = filter;
  $$('.filter-btn').forEach(b => b.classList.toggle('active', b.dataset.filter === filter));
  $$('.visit-entry').forEach(el => {
    const status = el.dataset.status;
    const show = filter === 'all' || status === filter;
    el.classList.toggle('hidden-by-filter', !show);
  });
}

function renderAll() {
  renderGovernorProfile();
  renderStats();
  renderTimeline();
}

// ============================================
// ADMIN UI TOGGLE
// ============================================
function setAdminMode(on) {
  state.isAdmin = on;
  const toolbar = $('#admin-toolbar');
  const btn = $('#btn-admin-toggle');
  const label = $('#admin-label');
  if (on) {
    toolbar.classList.remove('hidden');
    btn.classList.add('active');
    label.textContent = 'Admin ✓';
    toast('Admin mode enabled. You can now edit the itinerary.', 'success');
  } else {
    toolbar.classList.add('hidden');
    btn.classList.remove('active');
    label.textContent = 'Admin';
    toast('Logged out of admin mode.');
  }
  renderTimeline(); // Re-render to show/hide edit buttons
}

// ============================================
// GOVERNOR MODAL
// ============================================
function openGovernorModal() {
  const g = state.governor;
  $('#gov-name').value        = g.name || '';
  $('#gov-designation').value = g.designation || '';
  $('#gov-district').value    = g.district || '';
  $('#gov-year').value        = g.year || '';
  $('#gov-theme').value       = g.theme || '';
  $('#gov-contact').value     = g.contact || '';
  openModal('modal-governor');
}

function saveGovernor() {
  const name = $('#gov-name').value.trim();
  if (!name) { toast('Please enter Governor\'s name', 'error'); return; }
  state.governor = {
    ...state.governor,
    name,
    designation: $('#gov-designation').value.trim() || 'District Governor',
    district:    $('#gov-district').value.trim(),
    year:        $('#gov-year').value.trim(),
    theme:       $('#gov-theme').value.trim(),
    contact:     $('#gov-contact').value.trim(),
  };
  saveData();
  closeModal('modal-governor');
  renderGovernorProfile();
  toast('Governor profile saved!', 'success');
}

// ============================================
// VISIT MODAL
// ============================================
function openVisitModal(id) {
  state.editingId = id || null;
  clearAgendaItems();

  if (id) {
    const v = state.items.find(i => i.id === id);
    if (!v) return;
    $('#modal-visit-title').textContent = 'Edit Club Visit';
    $('#visit-club-name').value    = v.clubName || '';
    $('#visit-city').value         = v.city || '';
    $('#visit-venue').value        = v.venue || '';
    $('#visit-date').value         = v.date || '';
    $('#visit-time').value         = v.time || '';
    $('#visit-status').value       = v.status || 'confirmed';
    $('#visit-president').value    = v.president || '';
    $('#visit-president-phone').value = v.presidentPhone || '';
    $('#visit-secretary').value    = v.secretary || '';
    $('#visit-secretary-phone').value = v.secretaryPhone || '';
    $('#visit-notes').value        = v.notes || '';
    (v.agenda || []).forEach(a => addAgendaItem(a.time, a.desc));
  } else {
    $('#modal-visit-title').textContent = 'Add Club Visit';
    $('#visit-club-name').value = '';
    $('#visit-city').value = '';
    $('#visit-venue').value = '';
    $('#visit-date').value = '';
    $('#visit-time').value = '';
    $('#visit-status').value = 'confirmed';
    $('#visit-president').value = '';
    $('#visit-president-phone').value = '';
    $('#visit-secretary').value = '';
    $('#visit-secretary-phone').value = '';
    $('#visit-notes').value = '';
    addAgendaItem('', '');
  }
  openModal('modal-visit');
}

function clearAgendaItems() {
  $('#agenda-items-container').innerHTML = '';
  state.agendaCounter = 0;
}

function addAgendaItem(time = '', desc = '') {
  const idx = ++state.agendaCounter;
  const container = $('#agenda-items-container');
  const row = document.createElement('div');
  row.className = 'agenda-item-row';
  row.dataset.agendaIdx = idx;
  row.innerHTML = `
    <input type="time" class="agenda-time-input" id="agenda-time-${idx}" value="${esc(time)}" placeholder="Time" />
    <input type="text" id="agenda-desc-${idx}" value="${esc(desc)}" placeholder="e.g. Governor's Address" style="flex:1" />
    <button class="remove-agenda-btn" data-agenda-idx="${idx}" type="button">
      <i data-lucide="x"></i>
    </button>
  `;
  row.querySelector('.remove-agenda-btn').addEventListener('click', () => { row.remove(); });
  container.appendChild(row);
  lucide.createIcons();
}

function collectAgendaItems() {
  const rows = $$('#agenda-items-container .agenda-item-row');
  const result = [];
  rows.forEach(row => {
    const idx = row.dataset.agendaIdx;
    const time = document.getElementById(`agenda-time-${idx}`)?.value || '';
    const desc = document.getElementById(`agenda-desc-${idx}`)?.value.trim() || '';
    if (desc) result.push({ time, desc });
  });
  return result;
}

function saveVisit() {
  const clubName = $('#visit-club-name').value.trim();
  const date     = $('#visit-date').value;
  const time     = $('#visit-time').value;
  if (!clubName) { toast('Club name is required', 'error'); return; }
  if (!date)     { toast('Please select a date', 'error'); return; }
  if (!time)     { toast('Please enter a time', 'error'); return; }

  const visitData = {
    type:           'visit',
    id:             state.editingId || uid(),
    clubName,
    city:           $('#visit-city').value.trim(),
    venue:          $('#visit-venue').value.trim(),
    date,
    time,
    status:         $('#visit-status').value,
    president:      $('#visit-president').value.trim(),
    presidentPhone: $('#visit-president-phone').value.trim(),
    secretary:      $('#visit-secretary').value.trim(),
    secretaryPhone: $('#visit-secretary-phone').value.trim(),
    notes:          $('#visit-notes').value.trim(),
    agenda:         collectAgendaItems(),
  };

  if (state.editingId) {
    const idx = state.items.findIndex(i => i.id === state.editingId);
    if (idx !== -1) state.items[idx] = visitData;
    toast('Club visit updated!', 'success');
  } else {
    state.items.push(visitData);
    toast('Club visit added!', 'success');
  }

  saveData();
  closeModal('modal-visit');
  renderTimeline();
  renderStats();
  state.editingId = null;
}

// ============================================
// TRAVEL MODAL
// ============================================
function openTravelModal(id) {
  state.editingId = id || null;
  if (id) {
    const t = state.items.find(i => i.id === id);
    if (!t) return;
    $('#modal-travel-title').textContent = 'Edit Travel';
    $('#travel-from').value     = t.from || '';
    $('#travel-to').value       = t.to || '';
    $('#travel-date').value     = t.date || '';
    $('#travel-time').value     = t.time || '';
    $('#travel-mode').value     = t.mode || 'car';
    $('#travel-duration').value = t.duration || '';
    $('#travel-distance').value = t.distance || '';
    $('#travel-contact').value  = t.contact || '';
    $('#travel-notes').value    = t.notes || '';
  } else {
    $('#modal-travel-title').textContent = 'Add Travel Plan';
    $('#travel-from').value = '';
    $('#travel-to').value = '';
    $('#travel-date').value = '';
    $('#travel-time').value = '';
    $('#travel-mode').value = 'car';
    $('#travel-duration').value = '';
    $('#travel-distance').value = '';
    $('#travel-contact').value = '';
    $('#travel-notes').value = '';
  }
  openModal('modal-travel');
}

function saveTravel() {
  const from = $('#travel-from').value.trim();
  const to   = $('#travel-to').value.trim();
  const date = $('#travel-date').value;
  if (!from || !to) { toast('Please enter both From and To locations', 'error'); return; }
  if (!date)         { toast('Please select a date', 'error'); return; }

  const travelData = {
    type:     'travel',
    id:       state.editingId || uid(),
    from, to, date,
    time:     $('#travel-time').value,
    mode:     $('#travel-mode').value,
    duration: $('#travel-duration').value.trim(),
    distance: $('#travel-distance').value.trim(),
    contact:  $('#travel-contact').value.trim(),
    notes:    $('#travel-notes').value.trim(),
  };

  if (state.editingId) {
    const idx = state.items.findIndex(i => i.id === state.editingId);
    if (idx !== -1) state.items[idx] = travelData;
    toast('Travel plan updated!', 'success');
  } else {
    state.items.push(travelData);
    toast('Travel plan added!', 'success');
  }

  saveData();
  closeModal('modal-travel');
  renderTimeline();
  state.editingId = null;
}

// ============================================
// DELETE
// ============================================
function deleteItem(id) {
  if (!confirm('Are you sure you want to delete this entry?')) return;
  state.items = state.items.filter(i => i.id !== id);
  saveData();
  renderTimeline();
  renderStats();
  toast('Entry deleted', 'success');
}

// ============================================
// EXPORT / IMPORT / SHARE
// ============================================
function exportData() {
  const data = JSON.stringify({ governor: state.governor, items: state.items }, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Rotary_OCV_${state.governor.district || 'District'}_Backup.json`;
  a.click();
  URL.revokeObjectURL(url);
  toast('Data exported successfully!', 'success');
}

function importData(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const d = JSON.parse(e.target.result);
      if (d.items) {
        if (d.governor) state.governor = { ...state.governor, ...d.governor };
        state.items = d.items;
        saveData();
        renderAll();
        toast('Data imported successfully!', 'success');
      } else {
        toast('Invalid file format', 'error');
      }
    } catch { toast('Failed to import: invalid file', 'error'); }
  };
  reader.readAsText(file);
}

function generateShareablePage() {
  const g = state.governor;
  const sortedItems = [...state.items].sort((a, b) => {
    const da = a.date || '9999'; const db = b.date || '9999';
    return da !== db ? da.localeCompare(db) : (a.time || '').localeCompare(b.time || '');
  });

  const visitsHtml = sortedItems.filter(i => i.type === 'visit').map(v => `
    <div style="background:rgba(0,59,113,0.3);border:1px solid rgba(0,77,150,0.5);border-left:4px solid ${v.status==='confirmed'?'#10b981':v.status==='completed'?'#6366f1':v.status==='cancelled'?'#ef4444':'#f59e0b'};border-radius:12px;padding:1.25rem;margin-bottom:1rem;break-inside:avoid">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:0.5rem;margin-bottom:0.75rem">
        <div>
          <div style="font-size:0.7rem;color:#F7A81B;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:0.2rem">${esc(formatDate(v.date))} ${v.time ? '· ' + formatTime(v.time) : ''}</div>
          <div style="font-size:1.1rem;font-weight:700;color:#f0f4f8">${esc(v.clubName)}</div>
          ${v.venue ? `<div style="font-size:0.78rem;color:#94a3b8;margin-top:0.2rem">📍 ${esc(v.venue)}${v.city?', '+esc(v.city):''}</div>` : ''}
        </div>
        <span style="font-size:0.65rem;font-weight:700;padding:0.2rem 0.6rem;border-radius:99px;background:rgba(16,185,129,0.15);color:${v.status==='confirmed'?'#10b981':v.status==='completed'?'#818cf8':v.status==='cancelled'?'#ef4444':'#f59e0b'};text-transform:uppercase">${v.status}</span>
      </div>
      ${v.president||v.secretary ? `<div style="display:flex;flex-wrap:wrap;gap:1rem;margin-bottom:0.75rem;font-size:0.78rem;color:#94a3b8">
        ${v.president ? `<span><span style="color:#F7A81B;font-weight:700">President:</span> ${esc(v.president)} ${v.presidentPhone?'· 📞'+esc(v.presidentPhone):''}</span>` : ''}
        ${v.secretary ? `<span><span style="color:#F7A81B;font-weight:700">Secretary:</span> ${esc(v.secretary)} ${v.secretaryPhone?'· 📞'+esc(v.secretaryPhone):''}</span>` : ''}
      </div>` : ''}
      ${v.agenda && v.agenda.length>0 ? `
        <div style="font-size:0.68rem;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:0.4rem">Programme</div>
        ${v.agenda.map(a=>`<div style="display:flex;gap:0.75rem;font-size:0.8rem;margin-bottom:0.2rem"><span style="color:#F7A81B;font-weight:700;min-width:65px">${esc(a.time?formatTime(a.time):'')}</span><span style="color:#cbd5e1">${esc(a.desc)}</span></div>`).join('')}
      ` : ''}
      ${v.notes ? `<div style="margin-top:0.75rem;font-size:0.75rem;color:#94a3b8;font-style:italic;border-top:1px solid rgba(255,255,255,0.06);padding-top:0.5rem">📝 ${esc(v.notes)}</div>` : ''}
    </div>`).join('');

  const travelHtml = sortedItems.filter(i => i.type === 'travel').map(t => `
    <div style="background:rgba(255,255,255,0.02);border:1px dashed rgba(255,255,255,0.1);border-radius:10px;padding:0.875rem 1rem;margin-bottom:0.75rem;display:flex;align-items:center;gap:1rem;flex-wrap:wrap">
      <span style="font-size:1.2rem">${travelModeIcon(t.mode)}</span>
      <span style="font-weight:700;color:#f0f4f8">${esc(t.from)}</span>
      <span style="color:#64748b">→</span>
      <span style="font-weight:700;color:#f0f4f8">${esc(t.to)}</span>
      <span style="color:#94a3b8;font-size:0.78rem">${t.date?formatDateShort(t.date):''}${t.time?' · '+formatTime(t.time):''}${t.duration?' · '+esc(t.duration):''}${t.distance?' · '+esc(t.distance):''}</span>
    </div>`).join('');

  const html = `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Rotary OCV — ${esc(g.designation||'Governor')}'s Itinerary · ${esc(g.district||'District')}</title>
<meta name="description" content="Official Club Visit itinerary for ${esc(g.name)}, ${esc(g.designation||'District Governor')}, ${esc(g.district||'')}">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&family=Playfair+Display:wght@700&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Inter',sans-serif;background:#080e18;color:#f0f4f8;min-height:100vh;padding:0}
body::before{content:'';position:fixed;top:0;left:50%;transform:translateX(-50%);width:100vw;height:50vh;background:radial-gradient(ellipse at top,rgba(0,59,113,0.5) 0%,transparent 70%);pointer-events:none;z-index:0}
.container{max-width:780px;margin:0 auto;padding:0 1.25rem 3rem;position:relative;z-index:1}
header{background:rgba(8,14,24,0.95);border-bottom:1px solid rgba(0,77,150,0.5);padding:1rem 1.25rem;text-align:center;position:sticky;top:0;z-index:100;backdrop-filter:blur(20px)}
.header-inner{max-width:780px;margin:0 auto;display:flex;align-items:center;justify-content:center;gap:1rem}
h1{font-family:'Playfair Display',serif;font-size:1.2rem;font-weight:700;color:#f0f4f8}
.subtitle{font-size:0.72rem;color:#F7A81B;font-weight:700;text-transform:uppercase;letter-spacing:0.1em}
.gov-card{background:linear-gradient(135deg,rgba(0,59,113,0.7) 0%,rgba(0,40,79,0.9) 100%);border:1px solid rgba(0,77,150,0.6);border-radius:16px;padding:1.75rem;display:flex;align-items:center;gap:1.5rem;margin:1.5rem 0;position:relative;overflow:hidden}
.gov-card::after{content:'';position:absolute;bottom:0;left:0;right:0;height:2px;background:linear-gradient(90deg,transparent,#F7A81B,transparent)}
.gov-photo{width:80px;height:80px;border-radius:50%;border:3px solid #F7A81B;object-fit:cover;flex-shrink:0;background:rgba(0,59,113,0.5);display:flex;align-items:center;justify-content:center;font-size:2rem;box-shadow:0 0 20px rgba(247,168,27,0.3)}
.gov-designation{font-size:0.68rem;color:#F7A81B;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:0.2rem}
.gov-name{font-family:'Playfair Display',serif;font-size:1.4rem;font-weight:700;color:#f0f4f8;margin-bottom:0.4rem}
.gov-meta{font-size:0.78rem;color:rgba(255,255,255,0.6)}
.section-title{font-family:'Playfair Display',serif;font-size:1.2rem;font-weight:700;color:#f0f4f8;margin:2rem 0 1rem;display:flex;align-items:center;gap:0.5rem;padding-bottom:0.5rem;border-bottom:1px solid rgba(247,168,27,0.3)}
.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:0.75rem;margin:1.25rem 0}
.stat{background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:0.875rem;text-align:center}
.stat-n{font-size:1.5rem;font-weight:800;color:#F7A81B;display:block}
.stat-l{font-size:0.68rem;color:#94a3b8;font-weight:500}
.print-btn{display:inline-flex;align-items:center;gap:6px;padding:0.5rem 1.25rem;background:#F7A81B;color:#080e18;border:none;border-radius:8px;font-size:0.85rem;font-weight:700;cursor:pointer;margin-top:1rem}
.print-btn:hover{background:#ffc14d}
footer{text-align:center;padding:2rem;border-top:1px solid rgba(255,255,255,0.06);color:#4a5568;font-size:0.78rem}
.motto{font-family:'Playfair Display',serif;color:#F7A81B;font-style:italic;font-size:1rem;display:block;margin-bottom:0.5rem}
@media print{body{background:white;color:#000}.gov-card{background:#003B71;color:white}header{background:white;border-bottom:2px solid #003B71}.print-btn{display:none}}
@media(max-width:600px){.stats{grid-template-columns:repeat(2,1fr)}.gov-card{flex-direction:column;text-align:center}}
</style></head><body>
<header>
  <div class="header-inner">
    <div>
      <div class="subtitle">Rotary International — Official</div>
      <h1>Governor's Club Visit Itinerary</h1>
      <div style="font-size:0.72rem;color:#94a3b8;margin-top:0.2rem">${esc(g.district||'')} · ${esc(g.year||'')}</div>
    </div>
  </div>
</header>
<div class="container">
  <div class="gov-card">
    ${g.photo ? `<img class="gov-photo" src="${g.photo}" alt="${esc(g.name)}">` : `<div class="gov-photo">👤</div>`}
    <div>
      <div class="gov-designation">${esc(g.designation||'District Governor')}</div>
      <div class="gov-name">${esc(g.name)}</div>
      <div class="gov-meta">${esc(g.district||'')} · ${esc(g.year||'')}${g.theme?'<br>Theme: '+esc(g.theme):''}</div>
    </div>
  </div>

  <div class="stats">
    <div class="stat"><span class="stat-n">${sortedItems.filter(i=>i.type==='visit').length}</span><span class="stat-l">Club Visits</span></div>
    <div class="stat"><span class="stat-n">${sortedItems.filter(i=>i.type==='visit'&&i.status==='confirmed').length}</span><span class="stat-l">Confirmed</span></div>
    <div class="stat"><span class="stat-n">${sortedItems.filter(i=>i.type==='visit'&&i.status==='tentative').length}</span><span class="stat-l">Tentative</span></div>
    <div class="stat"><span class="stat-n">${sortedItems.filter(i=>i.type==='visit'&&i.status==='completed').length}</span><span class="stat-l">Completed</span></div>
  </div>

  <button class="print-btn" onclick="window.print()">🖨️ Print This Itinerary</button>

  <div class="section-title">📅 Club Visit Schedule</div>
  ${visitsHtml || '<p style="color:#64748b;font-size:0.85rem">No visits scheduled yet.</p>'}

  ${travelHtml ? `<div class="section-title">🗺️ Travel Plan</div>${travelHtml}` : ''}

  <footer>
    <span class="motto">"Service Above Self"</span>
    Generated by Rotary OCV Itinerary Manager · ${new Date().toLocaleDateString('en-IN',{day:'numeric',month:'long',year:'numeric'})}
  </footer>
</div></body></html>`;

  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Rotary_OCV_Itinerary_${g.district||'District'}.html`;
  a.click();
  URL.revokeObjectURL(url);
  toast('Shareable itinerary downloaded! Share the HTML file.', 'success');
}

// ============================================
// PHOTO UPLOAD
// ============================================
function handlePhotoUpload(file) {
  if (!file || !file.type.startsWith('image/')) { toast('Please select an image file', 'error'); return; }
  const reader = new FileReader();
  reader.onload = (e) => {
    state.governor.photo = e.target.result;
    saveData();
    renderGovernorProfile();
    toast('Photo updated!', 'success');
  };
  reader.readAsDataURL(file);
}

// ============================================
// EVENT LISTENERS
// ============================================
function init() {
  loadData();

  // ── No auto-popup on load: password only shown when Admin button is clicked ──

  $('#btn-set-password').addEventListener('click', () => {
    const p1 = $('#setup-password').value;
    const p2 = $('#setup-password-confirm').value;
    if (p1.length < 4) { toast('Password must be at least 4 characters', 'error'); return; }
    if (p1 !== p2)     { toast('Passwords do not match', 'error'); return; }
    setPassword(p1);
    closeModal('modal-password-setup');
    toast('Password set! You are now in admin mode.', 'success');
    setAdminMode(true);
    openGovernorModal();
  });

  // ── Admin Login / Logout ──
  $('#btn-admin-toggle').addEventListener('click', () => {
    if (state.isAdmin) {
      setAdminMode(false);
    } else if (!state.isSetup) {
      // First time: show password setup modal
      $('#setup-password').value = '';
      $('#setup-password-confirm').value = '';
      openModal('modal-password-setup');
    } else {
      // Already set up: show login modal
      $('#login-password').value = '';
      openModal('modal-admin-login');
      setTimeout(() => $('#login-password').focus(), 300);
    }
  });

  $('#btn-login-submit').addEventListener('click', () => {
    const pwd = $('#login-password').value;
    if (verifyPassword(pwd)) {
      closeModal('modal-admin-login');
      setAdminMode(true);
    } else {
      toast('Incorrect password', 'error');
      $('#login-password').value = '';
      $('#login-password').focus();
    }
  });
  $('#login-password').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') $('#btn-login-submit').click();
  });
  $('#btn-login-cancel').addEventListener('click', () => closeModal('modal-admin-login'));

  $('#btn-admin-logout').addEventListener('click', () => setAdminMode(false));

  // ── Admin Toolbar ──
  $('#btn-edit-governor').addEventListener('click', openGovernorModal);
  $('#btn-add-visit').addEventListener('click', () => openVisitModal());
  $('#btn-add-travel').addEventListener('click', () => openTravelModal());
  $('#btn-export-json').addEventListener('click', exportData);
  $('#btn-share-page').addEventListener('click', generateShareablePage);
  $('#btn-import-json').addEventListener('click', () => $('#import-file-input').click());
  $('#import-file-input').addEventListener('change', (e) => {
    if (e.target.files[0]) importData(e.target.files[0]);
    e.target.value = '';
  });

  // ── Governor Modal ──
  $('#btn-save-governor').addEventListener('click', saveGovernor);
  $('#gov-photo-upload').addEventListener('click', () => $('#gov-photo-input').click());
  $('#gov-photo-input').addEventListener('change', (e) => {
    if (e.target.files[0]) handlePhotoUpload(e.target.files[0]);
  });

  // ── Visit Modal ──
  $('#btn-save-visit').addEventListener('click', saveVisit);
  $('#btn-add-agenda-item').addEventListener('click', () => addAgendaItem());

  // ── Travel Modal ──
  $('#btn-save-travel').addEventListener('click', saveTravel);

  // ── Print button ──
  $('#btn-print').addEventListener('click', () => window.print());

  // ── Delegated clicks (edit/delete on cards) ──
  document.addEventListener('click', (e) => {
    const editVisit = e.target.closest('.edit-visit-btn');
    if (editVisit) { openVisitModal(editVisit.dataset.id); return; }

    const delVisit = e.target.closest('.delete-visit-btn');
    if (delVisit) { deleteItem(delVisit.dataset.id); return; }

    const editTravel = e.target.closest('.edit-travel-btn');
    if (editTravel) { openTravelModal(editTravel.dataset.id); return; }

    const delTravel = e.target.closest('.delete-travel-btn');
    if (delTravel) { deleteItem(delTravel.dataset.id); return; }
  });

  // ── Modal close buttons ──
  $$('[data-close]').forEach(btn => {
    btn.addEventListener('click', () => closeModal(btn.dataset.close));
  });
  $$('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.classList.remove('open');
    });
  });

  // ── Filter bar ──
  $$('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => applyFilter(btn.dataset.filter));
  });

  // ── Initial render ──
  renderAll();
  lucide.createIcons();
}

document.addEventListener('DOMContentLoaded', init);
