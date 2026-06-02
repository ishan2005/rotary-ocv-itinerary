/* ============================================
   ROTARY OCV ITINERARY — FINAL v4
   Firebase Firestore Compat SDK + SHA-256 Auth
   Regular script (no ES modules) - works everywhere
   ============================================ */

// ── Firebase Config (already loaded via <script> in HTML) ──
const firebaseConfig = {
  apiKey:            "AIzaSyAxUxxKWkK6tO0_seooRcskjeE4B3y4--U",
  authDomain:        "rotary-ocv-itinerary.firebaseapp.com",
  projectId:         "rotary-ocv-itinerary",
  storageBucket:     "rotary-ocv-itinerary.firebasestorage.app",
  messagingSenderId: "623135126705",
  appId:             "1:623135126705:web:ae743059c40fbf5e101e90"
};
firebase.initializeApp(firebaseConfig);
const db  = firebase.firestore();
const DOC = db.collection('ocv').doc('main');

// ── SHA-256 (built-in browser crypto) ──
async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
}

// ── Helpers ──
const $  = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2,7);
const esc = s => { if (!s) return ''; const d = document.createElement('div'); d.textContent = s; return d.innerHTML; };

// ── State ──
let S = {
  isAdmin: false,
  isSetup: false,
  governor: { name:'Governor Name', designation:'District Governor', district:'District', year:'RI Year 2025-26', theme:'Service Above Self', photo:null, contact:'' },
  items: [],
  editingId: null,
  filter: 'all',
  agendaIdx: 0,
};

// ── Toast ──
function toast(msg, type='') {
  const el = $('#toast');
  el.textContent = msg; el.className = 'toast show ' + type;
  clearTimeout(el._t); el._t = setTimeout(() => el.className = 'toast', 3000);
}
const openModal  = id => document.getElementById(id)?.classList.add('open');
const closeModal = id => document.getElementById(id)?.classList.remove('open');

// ── Format helpers ──
const fmtDate  = d => d ? new Date(d+'T00:00:00').toLocaleDateString('en-IN',{weekday:'short',day:'numeric',month:'short',year:'numeric'}) : '';
const fmtDateS = d => d ? new Date(d+'T00:00:00').toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'}) : '';
const fmtTime  = t => { if(!t) return ''; const [h,m]=t.split(':'), hr=+h; return `${hr%12||12}:${m} ${hr>=12?'PM':'AM'}`; };
const monthKey = d => d ? new Date(d+'T00:00:00').toLocaleDateString('en-IN',{month:'long',year:'numeric'}) : 'Undated';
const modeIcon = m => ({car:'🚗',train:'🚂',flight:'✈️',bus:'🚌',other:'🚐'})[m]||'🚐';

// ============================================================
// FIRESTORE READ / WRITE
// ============================================================
async function loadData() {
  showLoading(true);
  try {
    const snap = await DOC.get();
    if (snap.exists) {
      const d = snap.data();
      if (d.governor) S.governor = Object.assign({}, S.governor, d.governor);
      if (d.items)    S.items    = d.items;
      S.isSetup = !!d.pwdHash;
    }
  } catch(e) {
    console.error('Firestore error:', e);
    // Fallback to localStorage if offline
    try {
      const raw = localStorage.getItem('rotary_ocv_data');
      if (raw) { const d=JSON.parse(raw); if(d.governor) Object.assign(S.governor,d.governor); if(d.items) S.items=d.items; }
    } catch {}
    toast('Offline mode — showing cached data','error');
  }
  showLoading(false);
  renderAll();
}

async function saveData(payload) {
  await DOC.set(payload, { merge: true });
}

function showLoading(on) {
  let el = $('#page-loader');
  if (!el) return;
  el.style.display = on ? 'flex' : 'none';
}

// ============================================================
// AUTH
// ============================================================
async function setupPassword(pwd) {
  const hash = await sha256('rotary2025_' + pwd);
  await saveData({ pwdHash: hash, isSetup: true });
  S.isSetup = true;
}

async function verifyPassword(pwd) {
  try {
    const snap = await DOC.get();
    if (!snap.exists) return false;
    const stored = snap.data().pwdHash;
    if (!stored) return false;
    const entered = await sha256('rotary2025_' + pwd);
    return stored === entered;
  } catch { return false; }
}

// ============================================================
// ADMIN MODE
// ============================================================
function setAdmin(on) {
  S.isAdmin = on;
  $('#admin-toolbar').classList.toggle('hidden', !on);
  $('#btn-admin-toggle').classList.toggle('active', on);
  $('#admin-label').textContent = on ? 'Admin ✓' : 'Admin';
  if (on) { toast('Admin mode enabled! ✓','success'); offerMigration(); }
  else    { toast('Logged out.'); }
  renderTimeline();
}

async function offerMigration() {
  try {
    const raw = localStorage.getItem('rotary_ocv_data');
    if (!raw) return;
    const d = JSON.parse(raw);
    if (!d.items || !d.items.length) return;
    if (S.items.length > 0) return; // cloud already has data

    const go = confirm(`Found ${d.items.length} visit(s) saved on this device.\n\nMove them to the cloud so ALL devices can see them?`);
    if (!go) return;

    const snap = await DOC.get();
    const existing = snap.exists ? (snap.data().items || []) : [];
    const ids = new Set(existing.map(i=>i.id));
    const merged = [...existing, ...d.items.filter(i=>!ids.has(i.id))];

    const govUpdate = d.governor || S.governor;
    await saveData({ governor: govUpdate, items: merged });
    localStorage.removeItem('rotary_ocv_data');
    await loadData();
    toast(`✅ Migrated ${d.items.length} item(s) to cloud!`,'success');
  } catch(e) { console.error('Migration error',e); }
}

// ============================================================
// RENDER
// ============================================================
function renderAll() { renderProfile(); renderStats(); renderTimeline(); }

function renderProfile() {
  const g = S.governor;
  if($('#governor-name'))        $('#governor-name').textContent        = g.name||'Governor Name';
  if($('#governor-designation')) $('#governor-designation').textContent = g.designation||'District Governor';
  if($('#governor-district'))    $('#governor-district').innerHTML      = `<i data-lucide="map"></i> ${esc(g.district||'District')}`;
  if($('#governor-year'))        $('#governor-year').innerHTML          = `<i data-lucide="calendar"></i> ${esc(g.year||'RI Year')}`;
  if($('#header-subtitle'))      $('#header-subtitle').textContent      = g.district ? `${g.district} — Governor's Itinerary` : "District Governor's Itinerary";
  if($('#governor-photo'))       $('#governor-photo').innerHTML         = g.photo ? `<img src="${g.photo}" alt="${esc(g.name)}" />` : `<i data-lucide="user" class="governor-photo-placeholder"></i>`;
  lucide.createIcons();
}

function renderStats() {
  const v = S.items.filter(i=>i.type==='visit');
  if($('#stat-clubs'))     $('#stat-clubs').textContent     = v.length;
  if($('#stat-confirmed')) $('#stat-confirmed').textContent = v.filter(x=>x.status==='confirmed').length;
  if($('#stat-tentative')) $('#stat-tentative').textContent = v.filter(x=>x.status==='tentative').length;
  if($('#stat-completed')) $('#stat-completed').textContent = v.filter(x=>x.status==='completed').length;
}

function renderTimeline() {
  const tl = $('#timeline'); if (!tl) return;
  const sorted = [...S.items].sort((a,b)=>{
    const da=a.date||'9999', db2=b.date||'9999';
    return da!==db2 ? da.localeCompare(db2) : (a.time||'').localeCompare(b.time||'');
  });

  if (!sorted.length) {
    tl.innerHTML = `<div class="empty-state"><div class="empty-icon">📋</div><h4>No club visits scheduled yet</h4><p>Itinerary will appear here once visits are added.</p></div>`;
    lucide.createIcons(); return;
  }
  const groups = {};
  sorted.forEach(i => { const k=monthKey(i.date); (groups[k]=groups[k]||[]).push(i); });
  tl.innerHTML = Object.entries(groups).map(([m,items]) => `
    <div class="month-group">
      <div class="month-label"><i data-lucide="calendar-range"></i> ${esc(m)}</div>
      ${items.map(i => i.type==='visit' ? visitCard(i) : travelCard(i)).join('')}
    </div>`).join('');
  lucide.createIcons();
  applyFilter(S.filter);
}

function visitCard(v) {
  const agenda = v.agenda&&v.agenda.length ? `
    <div class="visit-agenda"><div class="agenda-title">Program / Agenda</div><div class="agenda-list">
      ${v.agenda.map(a=>`<div class="agenda-row"><span class="agenda-time-slot">${esc(a.time?fmtTime(a.time):'')}</span><span class="agenda-desc">${esc(a.desc)}</span></div>`).join('')}
    </div></div>` : '';
  const officials = (v.president||v.secretary) ? `
    <div class="visit-officials">
      ${v.president?`<div class="official-item"><span class="official-role">President</span><strong>${esc(v.president)}</strong>${v.presidentPhone?`<span class="official-phone">📞 ${esc(v.presidentPhone)}</span>`:''}</div>`:''}
      ${v.secretary?`<div class="official-item"><span class="official-role">Secretary</span><strong>${esc(v.secretary)}</strong>${v.secretaryPhone?`<span class="official-phone">📞 ${esc(v.secretaryPhone)}</span>`:''}</div>`:''}
    </div>` : '';
  const adminBtns = S.isAdmin ? `<div class="admin-card-actions"><button class="card-action-btn edit-visit-btn" data-id="${v.id}"><i data-lucide="pencil"></i></button><button class="card-action-btn del delete-item-btn" data-id="${v.id}"><i data-lucide="trash-2"></i></button></div>` : '';
  return `<div class="visit-entry" data-id="${v.id}" data-status="${v.status}">
    <div class="timeline-dot-col"><div class="timeline-dot ${v.status}"></div></div>
    <div class="visit-card ${v.status}">
      <div class="visit-card-header">
        <div class="visit-header-left">
          <div class="visit-date-time"><span class="visit-date"><i data-lucide="calendar"></i> ${esc(fmtDate(v.date))}</span>${v.time?`<span class="visit-time"><i data-lucide="clock"></i> ${esc(fmtTime(v.time))}</span>`:''}</div>
          <div class="visit-club-name">${esc(v.clubName)}</div>
          ${(v.venue||v.city)?`<div class="visit-venue"><i data-lucide="map-pin"></i> ${esc([v.venue,v.city].filter(Boolean).join(', '))}</div>`:''}
        </div>
        <div class="visit-header-right"><span class="status-badge status-${v.status}">${v.status}</span>${adminBtns}</div>
      </div>
      ${officials}${agenda}
      ${v.notes?`<div class="visit-notes">📝 ${esc(v.notes)}</div>`:''}
    </div>
  </div>`;
}

function travelCard(t) {
  const adminBtns = S.isAdmin ? `<div class="admin-card-actions" style="margin-left:auto;flex-shrink:0"><button class="card-action-btn edit-travel-btn" data-id="${t.id}"><i data-lucide="pencil"></i></button><button class="card-action-btn del delete-item-btn" data-id="${t.id}"><i data-lucide="trash-2"></i></button></div>` : '';
  return `<div class="travel-entry" data-id="${t.id}">
    <div class="timeline-dot-col"><div class="travel-dot"></div></div>
    <div class="travel-card">
      <div class="travel-route"><span class="travel-city">${esc(t.from)}</span><div class="travel-arrow"><i data-lucide="arrow-right"></i></div><span class="travel-city">${esc(t.to)}</span></div>
      <div class="travel-meta">
        <span class="travel-mode-badge">${modeIcon(t.mode)} ${esc(t.mode||'car')}</span>
        ${t.date?`<span class="travel-meta-item"><i data-lucide="calendar"></i> ${esc(fmtDateS(t.date))}</span>`:''}
        ${t.time?`<span class="travel-meta-item"><i data-lucide="clock"></i> ${esc(fmtTime(t.time))}</span>`:''}
        ${t.duration?`<span class="travel-meta-item"><i data-lucide="timer"></i> ${esc(t.duration)}</span>`:''}
        ${t.distance?`<span class="travel-meta-item"><i data-lucide="milestone"></i> ${esc(t.distance)}</span>`:''}
        ${t.contact?`<span class="travel-meta-item"><i data-lucide="phone"></i> ${esc(t.contact)}</span>`:''}
      </div>${adminBtns}
    </div>
  </div>`;
}

function applyFilter(f) {
  S.filter = f;
  $$('.filter-btn').forEach(b => b.classList.toggle('active', b.dataset.filter===f));
  $$('.visit-entry').forEach(el => el.classList.toggle('hidden-by-filter', f!=='all' && el.dataset.status!==f));
}

// ============================================================
// GOVERNOR MODAL
// ============================================================
function openGovernorModal() {
  const g=S.governor;
  $('#gov-name').value=g.name||''; $('#gov-designation').value=g.designation||'';
  $('#gov-district').value=g.district||''; $('#gov-year').value=g.year||'';
  $('#gov-theme').value=g.theme||''; $('#gov-contact').value=g.contact||'';
  openModal('modal-governor');
}
async function saveGovernor() {
  const name=$('#gov-name').value.trim();
  if(!name){toast("Enter Governor's name",'error');return;}
  Object.assign(S.governor,{name,designation:$('#gov-designation').value.trim()||'District Governor',district:$('#gov-district').value.trim(),year:$('#gov-year').value.trim(),theme:$('#gov-theme').value.trim(),contact:$('#gov-contact').value.trim()});
  try{await saveData({governor:S.governor});closeModal('modal-governor');renderProfile();toast('Profile saved!','success');}
  catch(e){toast('Save failed','error');}
}

// ============================================================
// VISIT MODAL
// ============================================================
function openVisitModal(id) {
  S.editingId=id||null;
  $('#agenda-items-container').innerHTML=''; S.agendaIdx=0;
  if(id){
    const v=S.items.find(i=>i.id===id); if(!v) return;
    $('#modal-visit-title').textContent='Edit Club Visit';
    $('#visit-club-name').value=v.clubName||'';$('#visit-city').value=v.city||'';$('#visit-venue').value=v.venue||'';
    $('#visit-date').value=v.date||'';$('#visit-time').value=v.time||'';$('#visit-status').value=v.status||'confirmed';
    $('#visit-president').value=v.president||'';$('#visit-president-phone').value=v.presidentPhone||'';
    $('#visit-secretary').value=v.secretary||'';$('#visit-secretary-phone').value=v.secretaryPhone||'';
    $('#visit-notes').value=v.notes||'';
    (v.agenda||[]).forEach(a=>addAgenda(a.time,a.desc));
  } else {
    $('#modal-visit-title').textContent='Add Club Visit';
    ['#visit-club-name','#visit-city','#visit-venue','#visit-date','#visit-time',
     '#visit-president','#visit-president-phone','#visit-secretary','#visit-secretary-phone','#visit-notes']
      .forEach(s=>{const el=$(s);if(el)el.value='';});
    $('#visit-status').value='confirmed'; addAgenda('','');
  }
  openModal('modal-visit');
}

function addAgenda(time='',desc='') {
  const i=++S.agendaIdx, r=document.createElement('div');
  r.className='agenda-item-row'; r.dataset.agendaIdx=i;
  r.innerHTML=`<input type="time" id="at-${i}" value="${esc(time)}" /><input type="text" id="ad-${i}" value="${esc(desc)}" placeholder="e.g. Governor's Address" style="flex:1" /><button class="remove-agenda-btn" type="button"><i data-lucide="x"></i></button>`;
  r.querySelector('.remove-agenda-btn').addEventListener('click',()=>r.remove());
  $('#agenda-items-container').appendChild(r); lucide.createIcons();
}

function collectAgenda() {
  return [...$$('#agenda-items-container .agenda-item-row')].reduce((acc,r)=>{
    const i=r.dataset.agendaIdx, time=document.getElementById(`at-${i}`)?.value||'', desc=document.getElementById(`ad-${i}`)?.value.trim()||'';
    if(desc) acc.push({time,desc}); return acc;
  },[]);
}

async function saveVisit() {
  const clubName=$('#visit-club-name').value.trim(), date=$('#visit-date').value, time=$('#visit-time').value;
  if(!clubName){toast('Club name required','error');return;}
  if(!date){toast('Select a date','error');return;}
  if(!time){toast('Enter a time','error');return;}
  const v={type:'visit',id:S.editingId||uid(),clubName,city:$('#visit-city').value.trim(),venue:$('#visit-venue').value.trim(),date,time,status:$('#visit-status').value,president:$('#visit-president').value.trim(),presidentPhone:$('#visit-president-phone').value.trim(),secretary:$('#visit-secretary').value.trim(),secretaryPhone:$('#visit-secretary-phone').value.trim(),notes:$('#visit-notes').value.trim(),agenda:collectAgenda()};
  if(S.editingId){const i=S.items.findIndex(x=>x.id===S.editingId);if(i!==-1)S.items[i]=v;else S.items.push(v);}
  else S.items.push(v);
  try{await saveData({items:S.items});closeModal('modal-visit');renderTimeline();renderStats();toast(S.editingId?'Visit updated!':'Visit added!','success');S.editingId=null;}
  catch(e){toast('Save failed: '+e.message,'error');}
}

// ============================================================
// TRAVEL MODAL
// ============================================================
function openTravelModal(id) {
  S.editingId=id||null;
  if(id){
    const t=S.items.find(i=>i.id===id);if(!t)return;
    $('#modal-travel-title').textContent='Edit Travel';
    $('#travel-from').value=t.from||'';$('#travel-to').value=t.to||'';$('#travel-date').value=t.date||'';$('#travel-time').value=t.time||'';$('#travel-mode').value=t.mode||'car';$('#travel-duration').value=t.duration||'';$('#travel-distance').value=t.distance||'';$('#travel-contact').value=t.contact||'';$('#travel-notes').value=t.notes||'';
  } else {
    $('#modal-travel-title').textContent='Add Travel Plan';
    ['#travel-from','#travel-to','#travel-date','#travel-time','#travel-duration','#travel-distance','#travel-contact','#travel-notes'].forEach(s=>{const el=$(s);if(el)el.value='';});
    $('#travel-mode').value='car';
  }
  openModal('modal-travel');
}

async function saveTravel() {
  const from=$('#travel-from').value.trim(),to=$('#travel-to').value.trim(),date=$('#travel-date').value;
  if(!from||!to){toast('Enter From and To','error');return;}
  if(!date){toast('Select a date','error');return;}
  const t={type:'travel',id:S.editingId||uid(),from,to,date,time:$('#travel-time').value,mode:$('#travel-mode').value,duration:$('#travel-duration').value.trim(),distance:$('#travel-distance').value.trim(),contact:$('#travel-contact').value.trim(),notes:$('#travel-notes').value.trim()};
  if(S.editingId){const i=S.items.findIndex(x=>x.id===S.editingId);if(i!==-1)S.items[i]=t;else S.items.push(t);}
  else S.items.push(t);
  try{await saveData({items:S.items});closeModal('modal-travel');renderTimeline();toast(S.editingId?'Travel updated!':'Travel added!','success');S.editingId=null;}
  catch(e){toast('Save failed','error');}
}

// ============================================================
// DELETE
// ============================================================
async function deleteItem(id) {
  if(!confirm('Delete this entry?'))return;
  S.items=S.items.filter(i=>i.id!==id);
  try{await saveData({items:S.items});renderTimeline();renderStats();toast('Deleted!','success');}
  catch(e){toast('Delete failed','error');}
}

// ============================================================
// PHOTO
// ============================================================
function handlePhoto(file) {
  if(!file||!file.type.startsWith('image/')){toast('Select an image','error');return;}
  const r=new FileReader();
  r.onload=async e=>{S.governor.photo=e.target.result;try{await saveData({governor:S.governor});renderProfile();toast('Photo saved!','success');}catch{toast('Failed to save photo','error');}};
  r.readAsDataURL(file);
}

// ============================================================
// EXPORT / IMPORT / SHARE
// ============================================================
function exportData() {
  const a=Object.assign(document.createElement('a'),{href:URL.createObjectURL(new Blob([JSON.stringify({governor:S.governor,items:S.items},null,2)],{type:'application/json'})),download:`Rotary_OCV_${S.governor.district||'District'}_Backup.json`});
  a.click();URL.revokeObjectURL(a.href);toast('Exported!','success');
}
async function importData(file) {
  const r=new FileReader();
  r.onload=async e=>{try{const d=JSON.parse(e.target.result);if(!d.items){toast('Invalid file','error');return;}if(d.governor)Object.assign(S.governor,d.governor);const ids=new Set(S.items.map(i=>i.id));d.items.filter(i=>!ids.has(i.id)).forEach(i=>S.items.push(i));await saveData({governor:S.governor,items:S.items});renderAll();toast('Imported!','success');}catch(err){toast('Import failed','error');}};
  r.readAsText(file);
}

function generateSharePage() {
  const g=S.governor;
  const sorted=[...S.items].sort((a,b)=>(a.date||'9999').localeCompare(b.date||'9999')||(a.time||'').localeCompare(b.time||''));
  const visits=sorted.filter(i=>i.type==='visit');
  const vHtml=visits.map(v=>`<div style="background:rgba(0,59,113,0.3);border:1px solid rgba(0,77,150,0.5);border-left:4px solid ${v.status==='confirmed'?'#10b981':v.status==='completed'?'#6366f1':v.status==='cancelled'?'#ef4444':'#f59e0b'};border-radius:12px;padding:1.25rem;margin-bottom:1rem;break-inside:avoid"><div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:0.5rem;margin-bottom:0.75rem"><div><div style="font-size:0.7rem;color:#F7A81B;font-weight:700;text-transform:uppercase;margin-bottom:0.2rem">${esc(fmtDate(v.date))} ${v.time?'· '+fmtTime(v.time):''}</div><div style="font-size:1.05rem;font-weight:700;color:#f0f4f8">${esc(v.clubName)}</div>${v.venue?`<div style="font-size:0.78rem;color:#94a3b8;margin-top:0.2rem">📍 ${esc([v.venue,v.city].filter(Boolean).join(', '))}</div>`:''}</div><span style="font-size:0.65rem;font-weight:700;padding:0.2rem 0.7rem;border-radius:99px;background:rgba(16,185,129,0.12);color:${v.status==='confirmed'?'#10b981':v.status==='completed'?'#818cf8':v.status==='cancelled'?'#ef4444':'#f59e0b'};text-transform:uppercase;white-space:nowrap">${v.status}</span></div>${(v.president||v.secretary)?`<div style="font-size:0.78rem;color:#94a3b8;margin-bottom:0.75rem;display:flex;flex-wrap:wrap;gap:1rem">${v.president?`<span><b style="color:#F7A81B">President:</b> ${esc(v.president)} ${v.presidentPhone?'📞'+esc(v.presidentPhone):''}</span>`:''}${v.secretary?`<span><b style="color:#F7A81B">Secretary:</b> ${esc(v.secretary)} ${v.secretaryPhone?'📞'+esc(v.secretaryPhone):''}</span>`:''}</div>`:''}${v.agenda&&v.agenda.length?`<div style="font-size:0.68rem;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:0.4rem">Programme</div>${v.agenda.map(a=>`<div style="display:flex;gap:0.75rem;font-size:0.8rem;margin-bottom:0.2rem"><span style="color:#F7A81B;font-weight:700;min-width:70px;flex-shrink:0">${esc(a.time?fmtTime(a.time):'')}</span><span style="color:#cbd5e1">${esc(a.desc)}</span></div>`).join('')}`:''}${v.notes?`<div style="margin-top:0.75rem;font-size:0.75rem;color:#94a3b8;font-style:italic;border-top:1px solid rgba(255,255,255,0.06);padding-top:0.5rem">📝 ${esc(v.notes)}</div>`:''}</div>`).join('');
  const html=`<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Rotary OCV — ${esc(g.district||'District')}</title><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&family=Playfair+Display:wght@700&display=swap" rel="stylesheet"><style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Inter',sans-serif;background:#080e18;color:#f0f4f8}body::before{content:'';position:fixed;top:0;left:50%;transform:translateX(-50%);width:100vw;height:50vh;background:radial-gradient(ellipse at top,rgba(0,59,113,0.5),transparent 70%);pointer-events:none;z-index:0}.w{max-width:720px;margin:0 auto;padding:0 1rem 3rem;position:relative;z-index:1}header{background:rgba(8,14,24,0.95);border-bottom:1px solid rgba(0,77,150,0.5);padding:1rem;text-align:center;position:sticky;top:0;backdrop-filter:blur(20px)}.sub{font-size:0.68rem;color:#F7A81B;font-weight:700;text-transform:uppercase;letter-spacing:0.1em}h1{font-family:'Playfair Display',serif;font-size:1.15rem;font-weight:700;color:#f0f4f8}.gc{background:linear-gradient(135deg,rgba(0,59,113,0.7),rgba(0,40,79,0.9));border:1px solid rgba(0,77,150,0.6);border-radius:14px;padding:1.5rem;display:flex;align-items:center;gap:1.25rem;margin:1.25rem 0;flex-wrap:wrap}.gp{width:72px;height:72px;border-radius:50%;border:3px solid #F7A81B;object-fit:cover;flex-shrink:0;background:rgba(0,59,113,0.5);display:flex;align-items:center;justify-content:center;font-size:2rem}.stats{display:grid;grid-template-columns:repeat(2,1fr);gap:0.6rem;margin-bottom:1.25rem}@media(min-width:420px){.stats{grid-template-columns:repeat(4,1fr)}}.stat{background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:.75rem;text-align:center}.sn{font-size:1.4rem;font-weight:800;color:#F7A81B;display:block}.sl{font-size:.65rem;color:#94a3b8}.st{font-family:'Playfair Display',serif;font-size:1.1rem;font-weight:700;color:#f0f4f8;margin:1.75rem 0 1rem;padding-bottom:.5rem;border-bottom:1px solid rgba(247,168,27,0.3)}.pb{display:inline-flex;align-items:center;gap:6px;padding:.5rem 1.2rem;background:#F7A81B;color:#080e18;border:none;border-radius:8px;font-size:.85rem;font-weight:700;cursor:pointer;margin-top:1rem}.fc{text-align:center;margin-top:2rem;padding:1.5rem;border-top:1px solid rgba(255,255,255,0.06)}.motto{font-family:'Playfair Display',serif;color:#F7A81B;font-style:italic;display:block;margin-bottom:1rem;font-size:1rem}.pby{background:rgba(0,59,113,0.3);border:1px solid rgba(0,77,150,0.5);border-radius:12px;padding:1rem 1.5rem;display:inline-block}.pname{font-family:'Playfair Display',serif;font-size:1rem;font-weight:700;color:#f0f4f8}.prole{font-size:.8rem;color:#F7A81B;font-weight:600;margin-top:.2rem}.pclub{font-size:.75rem;color:#94a3b8;margin-top:.1rem}@media print{body{background:white;color:#000}.pb{display:none}}</style></head><body>
<header><div class="sub">Rotary International — Official</div><h1>Governor's Club Visit Itinerary</h1><div style="font-size:.7rem;color:#94a3b8;margin-top:.2rem">${esc(g.district||'')} · ${esc(g.year||'')}</div></header>
<div class="w"><div class="gc">${g.photo?`<img class="gp" src="${g.photo}" alt="${esc(g.name)}">`:'<div class="gp">👤</div>'}<div><div style="font-size:.65rem;color:#F7A81B;font-weight:700;text-transform:uppercase;letter-spacing:.1em;margin-bottom:.2rem">${esc(g.designation||'District Governor')}</div><div style="font-family:\'Playfair Display\',serif;font-size:1.2rem;font-weight:700;color:#f0f4f8">${esc(g.name)}</div><div style="font-size:.75rem;color:rgba(255,255,255,.6)">${esc(g.district||'')} · ${esc(g.year||'')}${g.theme?'<br>Theme: '+esc(g.theme):''}</div></div></div>
<div class="stats"><div class="stat"><span class="sn">${visits.length}</span><span class="sl">Club Visits</span></div><div class="stat"><span class="sn">${visits.filter(v=>v.status==='confirmed').length}</span><span class="sl">Confirmed</span></div><div class="stat"><span class="sn">${visits.filter(v=>v.status==='tentative').length}</span><span class="sl">Tentative</span></div><div class="stat"><span class="sn">${visits.filter(v=>v.status==='completed').length}</span><span class="sl">Completed</span></div></div>
<button class="pb" onclick="window.print()">🖨️ Print Itinerary</button>
<div class="st">📅 Club Visit Schedule</div>${vHtml||'<p style="color:#64748b;font-size:.85rem">No visits scheduled yet.</p>'}
<div class="fc"><span class="motto">"Service Above Self"</span><div class="pby"><div class="pname">Rtn. Mukesh Agrawal</div><div class="prole">District OCV Chairman</div><div class="pclub">Rotary Club Mirzapur</div></div><div style="font-size:.7rem;color:#64748b;margin-top:.75rem">Generated: ${new Date().toLocaleDateString('en-IN',{day:'numeric',month:'long',year:'numeric'})}</div></div>
</div></body></html>`;
  const a=Object.assign(document.createElement('a'),{href:URL.createObjectURL(new Blob([html],{type:'text/html'})),download:`Rotary_OCV_${g.district||'District'}_Itinerary.html`});
  a.click();URL.revokeObjectURL(a.href);toast('Shareable page downloaded!','success');
}

// ============================================================
// INIT
// ============================================================
window.addEventListener('DOMContentLoaded', async function() {
  // Show loader
  showLoading(true);

  // Load data from Firestore
  await loadData();

  // ── Admin button ──
  $('#btn-admin-toggle').addEventListener('click', function() {
    if (S.isAdmin) { setAdmin(false); return; }
    if (!S.isSetup) {
      $('#setup-password').value=''; $('#setup-password-confirm').value='';
      openModal('modal-password-setup');
    } else {
      $('#login-password').value='';
      openModal('modal-admin-login');
      setTimeout(()=>$('#login-password').focus(), 300);
    }
  });

  // ── Password setup ──
  $('#btn-set-password').addEventListener('click', async function() {
    const p1=$('#setup-password').value, p2=$('#setup-password-confirm').value;
    if(p1.length<4){toast('Min 4 characters','error');return;}
    if(p1!==p2){toast('Passwords do not match','error');return;}
    try{ await setupPassword(p1); closeModal('modal-password-setup'); setAdmin(true); openGovernorModal(); }
    catch(e){ toast('Setup failed: '+e.message,'error'); }
  });

  // ── Login ──
  async function doLogin() {
    const pwd=$('#login-password').value;
    if(!pwd){toast('Enter password','error');return;}
    const ok = await verifyPassword(pwd);
    if(ok){ closeModal('modal-admin-login'); setAdmin(true); }
    else  { toast('Wrong password ❌','error'); $('#login-password').value=''; $('#login-password').focus(); }
  }
  $('#btn-login-submit').addEventListener('click', doLogin);
  $('#login-password').addEventListener('keydown', e=>{ if(e.key==='Enter') doLogin(); });
  $('#btn-login-cancel').addEventListener('click', ()=>closeModal('modal-admin-login'));
  $('#btn-admin-logout').addEventListener('click', ()=>setAdmin(false));

  // ── Toolbar ──
  $('#btn-edit-governor').addEventListener('click', openGovernorModal);
  $('#btn-add-visit').addEventListener('click', ()=>openVisitModal());
  $('#btn-add-travel').addEventListener('click', ()=>openTravelModal());
  $('#btn-export-json').addEventListener('click', exportData);
  $('#btn-share-page').addEventListener('click', generateSharePage);
  $('#btn-import-json').addEventListener('click', ()=>$('#import-file-input').click());
  $('#import-file-input').addEventListener('change', e=>{ if(e.target.files[0]) importData(e.target.files[0]); e.target.value=''; });

  // ── Governor modal ──
  $('#btn-save-governor').addEventListener('click', saveGovernor);
  $('#gov-photo-upload').addEventListener('click', ()=>$('#gov-photo-input').click());
  $('#gov-photo-input').addEventListener('change', e=>{ if(e.target.files[0]) handlePhoto(e.target.files[0]); });

  // ── Visit / Travel ──
  $('#btn-save-visit').addEventListener('click', saveVisit);
  $('#btn-add-agenda-item').addEventListener('click', ()=>addAgenda());
  $('#btn-save-travel').addEventListener('click', saveTravel);
  $('#btn-print').addEventListener('click', ()=>window.print());

  // ── Delegated card clicks ──
  document.addEventListener('click', function(e) {
    const ev=e.target.closest('.edit-visit-btn');   if(ev){openVisitModal(ev.dataset.id);return;}
    const dv=e.target.closest('.delete-item-btn');  if(dv){deleteItem(dv.dataset.id);return;}
    const et=e.target.closest('.edit-travel-btn');  if(et){openTravelModal(et.dataset.id);return;}
  });

  // ── Close modals ──
  $$('[data-close]').forEach(b=>b.addEventListener('click',()=>closeModal(b.dataset.close)));
  $$('.modal-overlay').forEach(o=>o.addEventListener('click',e=>{if(e.target===o)o.classList.remove('open');}));

  // ── Filter ──
  $$('.filter-btn').forEach(b=>b.addEventListener('click',()=>applyFilter(b.dataset.filter)));

  // ── Auto-refresh every 45s ──
  setInterval(async function() {
    if (!S.isAdmin) {
      try {
        const snap = await DOC.get();
        if (snap.exists) {
          const d = snap.data();
          if(d.governor) Object.assign(S.governor, d.governor);
          if(d.items) S.items = d.items;
          renderAll();
        }
      } catch {}
    }
  }, 45000);
});
