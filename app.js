// ══════════════════════════════════════════════════════════════
//  Verdi Recycling Admin — app.js
//  Data is fetched LIVE from Firebase Firestore.
//  Your Flutter app writes to the same Firestore project,
//  so any change in the app appears here in real-time.
// ══════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────────────────────
//  🔥 STEP 1 — PASTE YOUR FIREBASE CONFIG HERE
//  Go to: Firebase Console → Project Settings → Your Apps → SDK setup
//  Copy the firebaseConfig object and replace the values below.
// ─────────────────────────────────────────────────────────────
const firebaseConfig = {
  apiKey:            "YOUR_API_KEY",
  authDomain:        "YOUR_PROJECT_ID.firebaseapp.com",
  projectId:         "YOUR_PROJECT_ID",
  storageBucket:     "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId:             "YOUR_APP_ID"
};

// ─────────────────────────────────────────────────────────────
//  🔥 STEP 2 — COLLECTION NAMES
//  These must match the Firestore collection names your Flutter
//  app writes to. Change them here if your app uses different names.
// ─────────────────────────────────────────────────────────────
const COLLECTIONS = {
  users:     'users',       // e.g. Flutter writes: FirebaseFirestore.instance.collection('users')
  pickups:   'pickups',     // e.g. Flutter writes: FirebaseFirestore.instance.collection('pickups')
  materials: 'materials',   // e.g. Flutter writes: FirebaseFirestore.instance.collection('materials')
  rewards:   'rewards',     // e.g. Flutter writes: FirebaseFirestore.instance.collection('rewards')
};

// ─────────────────────────────────────────────────────────────
//  Firebase initialisation
// ─────────────────────────────────────────────────────────────
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// ─────────────────────────────────────────────────────────────
//  In-memory cache — populated from Firestore
// ─────────────────────────────────────────────────────────────
let cache = { users: [], pickups: [], materials: [], rewards: [] };
let isDark = false;
let modalCtx = { type: null, editId: null };
const charts = {};

// ══════════════════════════════════════════════════════════════
//  DATA LAYER — Firestore read / write helpers
// ══════════════════════════════════════════════════════════════

function showLoading(show) {
  document.getElementById('loadingBar').style.display = show ? 'flex' : 'none';
}

/** Fetch all documents from a collection, return array with id field */
async function fetchCol(name) {
  const snap = await db.collection(name).get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/** Load all collections from Firestore into local cache */
async function loadAll() {
  showLoading(true);
  try {
    const [users, pickups, materials, rewards] = await Promise.all([
      fetchCol(COLLECTIONS.users),
      fetchCol(COLLECTIONS.pickups),
      fetchCol(COLLECTIONS.materials),
      fetchCol(COLLECTIONS.rewards),
    ]);
    cache = { users, pickups, materials, rewards };
    toast('Data loaded from Firebase ✓');
  } catch (err) {
    console.error('Firestore error:', err);
    toast('Firebase error — check console', 'error');
  } finally {
    showLoading(false);
  }
}

/** Save (add or update) a document */
async function saveDoc(collection, id, data) {
  if (id) {
    await db.collection(collection).doc(id).update(data);
  } else {
    await db.collection(collection).add({ ...data, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
  }
}

/** Delete a document */
async function deleteDoc(collection, id) {
  await db.collection(collection).doc(id).delete();
}

/** Refresh everything */
async function refreshAll() {
  await loadAll();
  const active = document.querySelector('.page.active');
  if (active) {
    const page = active.id.replace('page-', '');
    navigate(page);
  }
}

// ══════════════════════════════════════════════════════════════
//  NAVIGATION
// ══════════════════════════════════════════════════════════════

function navigate(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('#sidebar li[data-page]').forEach(l => l.classList.remove('active'));
  document.getElementById('page-' + page).classList.add('active');
  const li = document.querySelector(`#sidebar li[data-page="${page}"]`);
  if (li) li.classList.add('active');

  if (page === 'dashboard') renderDashboard();
  if (page === 'users')     renderUsers();
  if (page === 'pickups')   renderPickups();
  if (page === 'recycling') renderMats();
  if (page === 'analytics') renderAnalytics();
  if (page === 'rewards')   renderRewards();
}

document.querySelectorAll('#sidebar li[data-page]').forEach(li => {
  li.querySelector('a').addEventListener('click', e => {
    e.preventDefault();
    navigate(li.dataset.page);
    if (window.innerWidth <= 900) document.getElementById('sidebar').classList.remove('open');
  });
});

document.getElementById('menuToggle').addEventListener('click', () => {
  if (window.innerWidth <= 900) document.getElementById('sidebar').classList.toggle('open');
  else {
    document.getElementById('sidebar').classList.toggle('collapsed');
    document.getElementById('content').classList.toggle('expanded');
  }
});

document.getElementById('darkToggle').addEventListener('click', () => {
  isDark = !isDark;
  document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
  renderDashboardCharts();
  if (document.getElementById('page-analytics').classList.contains('active')) renderAnalytics();
});

// ══════════════════════════════════════════════════════════════
//  CHART HELPERS
// ══════════════════════════════════════════════════════════════

function cc() {
  return isDark
    ? { text: '#bbbbdd', grid: '#1e1e3a' }
    : { text: '#555059', grid: '#d8d8d8' };
}
function dChart(id) { if (charts[id]) { charts[id].destroy(); delete charts[id]; } }

// ══════════════════════════════════════════════════════════════
//  DASHBOARD
// ══════════════════════════════════════════════════════════════

function renderDashboard() {
  const { users, pickups } = cache;

  // Update header avatar count
  document.getElementById('s-users').textContent = users.length;

  // Stat cards — computed from live Firestore data
  animN('s-users-count', users.length);
  animN('s-pickups', pickups.length);

  const totalKg = pickups.reduce((s, p) => s + (parseFloat(p.weight) || 0), 0);
  animT('s-kg', totalKg, ' kg');

  const totalPts = pickups.reduce((s, p) => s + (parseInt(p.points) || 0), 0);
  animN('s-pts', totalPts);

  // Recent pickups table (last 5, newest first)
  const sorted = [...pickups].sort((a, b) => {
    const da = a.date || a.createdAt?.seconds || 0;
    const db_ = b.date || b.createdAt?.seconds || 0;
    return da > db_ ? -1 : 1;
  }).slice(0, 5);

  document.querySelector('#recentTbl tbody').innerHTML = sorted.map(p => `
    <tr>
      <td><span class="pid">${p.id}</span></td>
      <td>${p.user || p.userName || '—'}</td>
      <td>${p.material || '—'}</td>
      <td>${p.weight || 0} kg</td>
      <td><span class="bs ${sClass(p.status)}">${p.status || 'pending'}</span></td>
      <td>${p.date || '—'}</td>
    </tr>`).join('');

  renderDashboardCharts();
}

function renderDashboardCharts() {
  const c = cc();
  dChart('area'); dChart('donut');

  // ── Area chart: build monthly pickup counts from real data ──
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const pickupsByMonth = Array(12).fill(0);
  const kgByMonth      = Array(12).fill(0);
  cache.pickups.forEach(p => {
    if (p.date) {
      const m = new Date(p.date).getMonth();
      if (!isNaN(m)) {
        pickupsByMonth[m]++;
        kgByMonth[m] += parseFloat(p.weight) || 0;
      }
    }
  });

  charts['area'] = new ApexCharts(document.getElementById('areaChart'), {
    chart: { type: 'area', height: 240, toolbar: { show: false }, background: 'transparent', fontFamily: 'Satoshi,sans-serif' },
    series: [
      { name: 'Pickups', data: pickupsByMonth },
      { name: 'Kg Recycled', data: kgByMonth.map(v => +v.toFixed(1)) }
    ],
    colors: ['#3C91E6', '#FD7238'],
    fill: { type: 'gradient', gradient: { shadeIntensity: 1, opacityFrom: 0.4, opacityTo: 0.04 } },
    stroke: { curve: 'smooth', width: 2.5 },
    xaxis: { categories: months, labels: { style: { colors: c.text, fontSize: '11px' } }, axisBorder: { show: false }, axisTicks: { show: false } },
    yaxis: { labels: { style: { colors: c.text } } },
    grid: { borderColor: c.grid, strokeDashArray: 4 },
    legend: { labels: { colors: c.text } },
    tooltip: { theme: isDark ? 'dark' : 'light' },
    dataLabels: { enabled: false }
  });
  charts['area'].render();

  // ── Donut chart: material category distribution from real data ──
  const matCount = {};
  cache.pickups.forEach(p => { if (p.material) matCount[p.material] = (matCount[p.material] || 0) + 1; });
  const matLabels  = Object.keys(matCount).length ? Object.keys(matCount)  : ['Plastic','Paper','Glass','Metal','E-Waste'];
  const matSeries  = Object.keys(matCount).length ? Object.values(matCount): [34, 28, 18, 12, 8];

  charts['donut'] = new ApexCharts(document.getElementById('donutChart'), {
    chart: { type: 'donut', height: 240, background: 'transparent', fontFamily: 'Satoshi,sans-serif' },
    series: matSeries, labels: matLabels,
    colors: ['#3C91E6', '#FD7238', '#FFCE26', '#6FAFEE', '#CFE8FF'],
    legend: { position: 'bottom', labels: { colors: c.text } },
    plotOptions: { pie: { donut: { size: '65%', labels: { show: true, total: { show: true, label: 'Total', color: c.text } } } } },
    stroke: { show: false }, tooltip: { theme: isDark ? 'dark' : 'light' }, dataLabels: { enabled: false }
  });
  charts['donut'].render();
}

// ══════════════════════════════════════════════════════════════
//  ANALYTICS (static Egypt stats + live material volumes)
// ══════════════════════════════════════════════════════════════

function renderAnalytics() {
  const c = cc();
  setTimeout(() => {
    ['growth','bar','eng'].forEach(dChart);

    charts['growth'] = new ApexCharts(document.getElementById('growthChart'), {
      chart: { type: 'line', height: 250, toolbar: { show: false }, background: 'transparent', fontFamily: 'Satoshi,sans-serif' },
      series: [{ name: 'Rate (%)', data: [10,14,18,22,27,33,37,null,null,60] }],
      annotations: { yaxis: [{ y: 60, borderColor: '#FD7238', label: { text: 'Target 60%', style: { color: '#fff', background: '#FD7238' } } }] },
      colors: ['#3C91E6'], stroke: { curve: 'smooth', width: 3 }, markers: { size: 5, colors: ['#3C91E6'], strokeWidth: 0 },
      xaxis: { categories: ['2018','2019','2020','2021','2022','2023','2024','2025','2026','2027'], labels: { style: { colors: c.text } }, axisBorder: { show: false } },
      yaxis: { min: 0, max: 70, labels: { style: { colors: c.text }, formatter: v => v + '%' } },
      grid: { borderColor: c.grid, strokeDashArray: 4 },
      tooltip: { theme: isDark ? 'dark' : 'light', y: { formatter: v => v + '%' } },
      dataLabels: { enabled: false }
    });
    charts['growth'].render();

    // ── Bar chart: material stock from live Firestore materials collection ──
    const mats    = cache.materials.length ? cache.materials : [];
    const barCats = mats.length ? mats.map(m => m.name || m.cat) : ['Plastic','Paper','Glass','Metal','E-Waste','Textiles'];
    const barData = mats.length ? mats.map(m => parseInt(m.stock) || 0) : [420,810,190,340,65,120];

    charts['bar'] = new ApexCharts(document.getElementById('barChart'), {
      chart: { type: 'bar', height: 250, toolbar: { show: false }, background: 'transparent', fontFamily: 'Satoshi,sans-serif' },
      series: [{ name: 'Stock (kg)', data: barData }],
      colors: ['#3C91E6'],
      plotOptions: { bar: { borderRadius: 7, columnWidth: '55%' } },
      xaxis: { categories: barCats, labels: { style: { colors: c.text } }, axisBorder: { show: false } },
      yaxis: { labels: { style: { colors: c.text } } },
      grid: { borderColor: c.grid, strokeDashArray: 4 },
      tooltip: { theme: isDark ? 'dark' : 'light' },
      dataLabels: { enabled: false }
    });
    charts['bar'].render();

    // ── Engagement: points earned per month from live pickups ──
    const ptsByMonth = Array(12).fill(0);
    cache.pickups.forEach(p => {
      if (p.date) {
        const m = new Date(p.date).getMonth();
        if (!isNaN(m)) ptsByMonth[m] += parseInt(p.points) || 0;
      }
    });

    charts['eng'] = new ApexCharts(document.getElementById('engChart'), {
      chart: { type: 'bar', height: 190, toolbar: { show: false }, background: 'transparent', fontFamily: 'Satoshi,sans-serif' },
      series: [{ name: 'Points', data: ptsByMonth }],
      colors: ['#6FAFEE'],
      plotOptions: { bar: { borderRadius: 5, columnWidth: '60%' } },
      xaxis: { categories: ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'], labels: { style: { colors: c.text } }, axisBorder: { show: false } },
      yaxis: { labels: { style: { colors: c.text } } },
      grid: { borderColor: c.grid, strokeDashArray: 4 },
      tooltip: { theme: isDark ? 'dark' : 'light' },
      dataLabels: { enabled: false }
    });
    charts['eng'].render();
  }, 100);
}

// ══════════════════════════════════════════════════════════════
//  USERS
// ══════════════════════════════════════════════════════════════

function renderUsers(data) {
  data = data || cache.users;
  const tb = document.querySelector('#usersTbl tbody');
  if (!data.length) {
    tb.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--text3)"><i class='bx bx-user-x' style="font-size:2rem;display:block;margin-bottom:8px"></i>No users found</td></tr>`;
    return;
  }
  tb.innerHTML = data.map(u => `<tr>
    <td><span class="td-av">${ini(u.name || 'U')}</span><span class="td-name">${u.name || '—'}</span></td>
    <td>${u.email || '—'}</td>
    <td>${u.phone || u.phoneNumber || '—'}</td>
    <td>${u.role || 'User'}</td>
    <td><strong>${(u.points || 0).toLocaleString()}</strong></td>
    <td><span class="bs ${u.status || 'active'}">${u.status || 'active'}</span></td>
    <td><div class="action-btns">
      <button class="btn btn-ghost btn-sm" onclick="editUser('${u.id}')"><i class='bx bx-edit'></i></button>
      <button class="btn btn-danger btn-sm" onclick="delUser('${u.id}')"><i class='bx bx-trash'></i></button>
    </div></td>
  </tr>`).join('');
}

function filterUsers(q) {
  renderUsers(cache.users.filter(u =>
    (u.name  || '').toLowerCase().includes(q.toLowerCase()) ||
    (u.email || '').toLowerCase().includes(q.toLowerCase())
  ));
}

function editUser(id) {
  const u = cache.users.find(x => x.id === id);
  modalCtx = { type: 'user', editId: id };
  document.getElementById('mTitle').textContent = 'Edit User';
  document.getElementById('mBody').innerHTML = userForm(u);
  document.getElementById('mSave').onclick = saveUser;
  openM();
}

async function delUser(id) {
  if (!confirm('Delete this user?')) return;
  try {
    await deleteDoc(COLLECTIONS.users, id);
    cache.users = cache.users.filter(u => u.id !== id);
    renderUsers();
    document.getElementById('s-users').textContent = cache.users.length;
    toast('User deleted', 'error');
  } catch (e) { toast('Delete failed', 'error'); }
}

function userForm(u = {}) {
  return `<div class="form-grid">
  <div class="fg"><label>Full Name</label><input class="fc" id="f_n" value="${u.name||''}" placeholder="Ahmed Karim"/></div>
  <div class="fg"><label>Email</label><input class="fc" id="f_e" type="email" value="${u.email||''}" placeholder="user@email.com"/></div>
  <div class="fg" style="flex-direction:row;align-items:flex-end;gap:8px">
    <div class="fg" style="flex:1"><label>Phone</label><input class="fc" id="f_ph" value="${u.phone||u.phoneNumber||''}" placeholder="010X-XXXXXXX"/></div>
    <button type="button" class="btn btn-ghost btn-scan" onclick="openScanner('f_ph')" title="Scan ID/barcode"><i class='bx bx-barcode-reader'></i></button>
  </div>
  <div class="fg"><label>Role</label><select class="fc" id="f_r">${['User','Driver','Admin'].map(r=>`<option ${(u.role||'')=== r?'selected':''}>${r}</option>`).join('')}</select></div>
  <div class="fg"><label>Points</label><input class="fc" id="f_p" type="number" value="${u.points||0}"/></div>
  <div class="fg"><label>Status</label><select class="fc" id="f_s">${['active','pending','inactive'].map(s=>`<option ${(u.status||'')=== s?'selected':''}>${s}</option>`).join('')}</select></div>
</div>`;
}

async function saveUser() {
  const name  = document.getElementById('f_n').value.trim();
  const email = document.getElementById('f_e').value.trim();
  if (!name || !email) { toast('Name and email required', 'error'); return; }
  const obj = {
    name, email,
    phone:  document.getElementById('f_ph').value.trim(),
    role:   document.getElementById('f_r').value,
    points: parseInt(document.getElementById('f_p').value) || 0,
    status: document.getElementById('f_s').value
  };
  try {
    await saveDoc(COLLECTIONS.users, modalCtx.editId, obj);
    toast(modalCtx.editId ? 'User updated' : 'User added');
    closeModal();
    await loadAll();
    renderUsers();
    document.getElementById('s-users').textContent = cache.users.length;
  } catch (e) { toast('Save failed', 'error'); }
}

// ══════════════════════════════════════════════════════════════
//  PICKUPS
// ══════════════════════════════════════════════════════════════

function renderPickups(data) {
  data = data || cache.pickups;
  const tb = document.querySelector('#pickupsTbl tbody');
  if (!data.length) {
    tb.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:40px;color:var(--text3)">No pickups found</td></tr>`;
    return;
  }
  tb.innerHTML = data.map(p => `<tr>
    <td><span class="pid">${p.id}</span></td>
    <td>${p.user || p.userName || '—'}</td>
    <td style="max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${p.address || '—'}</td>
    <td>${p.material || '—'}</td>
    <td>${p.weight || 0}</td>
    <td><strong>${p.points || 0}</strong></td>
    <td><span class="bs ${pClass(p.status)}">${p.status || 'pending'}</span></td>
    <td>${p.date || '—'}</td>
    <td><div class="action-btns">
      <button class="btn btn-ghost btn-sm" onclick="editPickup('${p.id}')"><i class='bx bx-edit'></i></button>
      <button class="btn btn-danger btn-sm" onclick="delPickup('${p.id}')"><i class='bx bx-trash'></i></button>
    </div></td>
  </tr>`).join('');
}

function filterPickups(q) {
  renderPickups(cache.pickups.filter(p =>
    (p.user     || '').toLowerCase().includes(q.toLowerCase()) ||
    (p.id       || '').toLowerCase().includes(q.toLowerCase()) ||
    (p.material || '').toLowerCase().includes(q.toLowerCase())
  ));
}

function editPickup(id) {
  const p = cache.pickups.find(x => x.id === id);
  modalCtx = { type: 'pickup', editId: id };
  document.getElementById('mTitle').textContent = 'Edit Pickup';
  document.getElementById('mBody').innerHTML = pickupForm(p);
  document.getElementById('mSave').onclick = savePickup;
  openM();
}

async function delPickup(id) {
  if (!confirm('Delete this pickup?')) return;
  try {
    await deleteDoc(COLLECTIONS.pickups, id);
    cache.pickups = cache.pickups.filter(p => p.id !== id);
    renderPickups(); renderDashboard();
    toast('Pickup deleted', 'error');
  } catch (e) { toast('Delete failed', 'error'); }
}

function pickupForm(p = {}) {
  const uOpts = cache.users.map(u => `<option ${(p.user||p.userName||'') === u.name ? 'selected' : ''}>${u.name}</option>`).join('');
  return `<div class="form-grid">
  <div class="fg"><label>User</label><select class="fc" id="fp_u">${uOpts}</select></div>
  <div class="fg"><label>Material</label><select class="fc" id="fp_m">${['Plastic','Paper','Glass','Metal','E-Waste','Textiles'].map(m=>`<option ${(p.material||'')=== m?'selected':''}>${m}</option>`).join('')}</select></div>
  <div class="fg full"><label>Address</label><input class="fc" id="fp_a" value="${p.address||''}" placeholder="Street, City"/></div>
  <div class="fg"><label>Weight (kg)</label><input class="fc" id="fp_w" type="number" step="0.1" value="${p.weight||''}"/></div>
  <div class="fg"><label>Points</label><input class="fc" id="fp_p" type="number" value="${p.points||''}"/></div>
  <div class="fg"><label>Status</label><select class="fc" id="fp_s">${['pending','in-transit','completed','cancelled'].map(s=>`<option ${(p.status||'')=== s?'selected':''}>${s}</option>`).join('')}</select></div>
  <div class="fg"><label>Date</label><input class="fc" id="fp_d" type="date" value="${p.date||''}"/></div>
</div>`;
}

async function savePickup() {
  const address = document.getElementById('fp_a').value.trim();
  if (!address) { toast('Address required', 'error'); return; }
  const obj = {
    user:     document.getElementById('fp_u').value,
    material: document.getElementById('fp_m').value,
    address,
    weight:   parseFloat(document.getElementById('fp_w').value) || 0,
    points:   parseInt(document.getElementById('fp_p').value)   || 0,
    status:   document.getElementById('fp_s').value,
    date:     document.getElementById('fp_d').value
  };
  try {
    await saveDoc(COLLECTIONS.pickups, modalCtx.editId, obj);
    toast(modalCtx.editId ? 'Pickup updated' : 'Pickup added');
    closeModal();
    await loadAll();
    renderPickups(); renderDashboard();
  } catch (e) { toast('Save failed', 'error'); }
}

// ══════════════════════════════════════════════════════════════
//  MATERIALS
// ══════════════════════════════════════════════════════════════

function renderMats() {
  document.getElementById('matGrid').innerHTML = cache.materials.map(m => `
  <div class="rec-card">
    <div class="rec-icon">${m.icon || '♻️'}</div>
    <h4>${m.name || '—'}</h4>
    <p>${m.desc || ''}</p>
    <div class="rec-meta">
      <span class="bs active">${m.cat || '—'}</span>
      <span class="rec-pts">${m.ptsKg || 0} pts/kg</span>
    </div>
    <div>
      <div style="display:flex;justify-content:space-between;font-size:.78rem;color:var(--text3);margin-bottom:5px">
        <span>Stock</span><span>${m.stock || 0} kg</span>
      </div>
      <div class="prog-wrap"><div class="prog-fill" style="width:${Math.min(100,(m.stock||0)/10)}%"></div></div>
    </div>
    <div class="action-btns">
      <button class="btn btn-ghost btn-sm" onclick="editMat('${m.id}')"><i class='bx bx-edit'></i> Edit</button>
      <button class="btn btn-danger btn-sm" onclick="delMat('${m.id}')"><i class='bx bx-trash'></i> Delete</button>
    </div>
  </div>`).join('');
}

function editMat(id) {
  const m = cache.materials.find(x => x.id === id);
  modalCtx = { type: 'material', editId: id };
  document.getElementById('mTitle').textContent = 'Edit Material';
  document.getElementById('mBody').innerHTML = matForm(m);
  document.getElementById('mSave').onclick = saveMat;
  openM();
}

async function delMat(id) {
  if (!confirm('Delete this material?')) return;
  try {
    await deleteDoc(COLLECTIONS.materials, id);
    cache.materials = cache.materials.filter(m => m.id !== id);
    renderMats();
    toast('Material deleted', 'error');
  } 
  catch (e) { 
    toast('Delete failed', 'error'); 

  }
}

function matForm(m = {}) {
  return `<div class="form-grid">
  <div class="fg full" style="flex-direction:row;align-items:flex-end;gap:8px">
    <div class="fg" style="flex:1"><label>Name</label><input class="fc" id="fm_n" value="${m.name||''}" placeholder="Plastic Bottles"/></div>
    <button type="button" class="btn btn-ghost btn-scan" onclick="openScanner('fm_n')" title="Scan barcode"><i class='bx bx-barcode-reader'></i> Scan</button>
  </div>
  <div class="fg"><label>Icon (emoji)</label><input class="fc" id="fm_i" value="${m.icon||'♻️'}" style="font-size:1.3rem;text-align:center"/></div>
  <div class="fg"><label>Category</label><select class="fc" id="fm_c">${['Plastic','Paper','Glass','Metal','E-Waste','Textiles'].map(c=>`<option ${(m.cat||'')=== c?'selected':''}>${c}</option>`).join('')}</select></div>
  <div class="fg"><label>Points per kg</label><input class="fc" id="fm_p" type="number" value="${m.ptsKg||100}"/></div>
  <div class="fg full"><label>Description</label><textarea class="fc" id="fm_d" rows="2">${m.desc||''}</textarea></div>
  <div class="fg"><label>Stock (kg)</label><input class="fc" id="fm_s" type="number" value="${m.stock||0}"/></div>
</div>`;
}

async function saveMat() {
  const name = document.getElementById('fm_n').value.trim();
  if (!name) { toast('Name required', 'error'); return; }
  const obj = {
    name,
    icon:  document.getElementById('fm_i').value.trim() || '♻️',
    cat:   document.getElementById('fm_c').value,
    ptsKg: parseInt(document.getElementById('fm_p').value) || 0,
    desc:  document.getElementById('fm_d').value.trim(),
    stock: parseInt(document.getElementById('fm_s').value) || 0
  };
  try {
    await saveDoc(COLLECTIONS.materials, modalCtx.editId, obj);
    toast(modalCtx.editId ? 'Material updated' : 'Material added');
    closeModal();
    await loadAll();
    renderMats();
  } catch (e) { toast('Save failed', 'error'); }
}

// ══════════════════════════════════════════════════════════════
//  REWARDS
// ══════════════════════════════════════════════════════════════

function renderRewards() {
  document.querySelector('#rewardsTbl tbody').innerHTML = cache.rewards.map(r => `<tr>
    <td class="td-name">${r.name || '—'}</td>
    <td>${r.partner || '—'}</td>
    <td><strong>${(r.cost || 0).toLocaleString()} pts</strong></td>
    <td>${r.stock || 0}</td>
    <td><span class="bs ${r.status || 'active'}">${r.status || 'active'}</span></td>
    <td><div class="action-btns">
      <button class="btn btn-ghost btn-sm" onclick="editRew('${r.id}')"><i class='bx bx-edit'></i></button>
      <button class="btn btn-danger btn-sm" onclick="delRew('${r.id}')"><i class='bx bx-trash'></i></button>
    </div></td>
  </tr>`).join('');
}

function editRew(id) {
  const r = cache.rewards.find(x => x.id === id);
  modalCtx = { type: 'reward', editId: id };
  document.getElementById('mTitle').textContent = 'Edit Reward';
  document.getElementById('mBody').innerHTML = rewForm(r);
  document.getElementById('mSave').onclick = saveRew;
  openM();
}

async function delRew(id) {
  if (!confirm('Delete this reward?')) return;
  try {
    await deleteDoc(COLLECTIONS.rewards, id);
    cache.rewards = cache.rewards.filter(r => r.id !== id);
    renderRewards();
    toast('Reward deleted', 'error');
  } catch (e) { toast('Delete failed', 'error'); }
}

function rewForm(r = {}) {
  return `<div class="form-grid">
  <div class="fg full" style="flex-direction:row;align-items:flex-end;gap:8px">
    <div class="fg" style="flex:1"><label>Reward Name</label><input class="fc" id="fr_n" value="${r.name||''}" placeholder="20 EGP Voucher"/></div>
    <button type="button" class="btn btn-ghost btn-scan" onclick="openScanner('fr_n')" title="Scan barcode"><i class='bx bx-barcode-reader'></i> Scan</button>
  </div>
  <div class="fg"><label>Partner</label><input class="fc" id="fr_pa" value="${r.partner||''}" placeholder="Carrefour"/></div>
  <div class="fg"><label>Points Cost</label><input class="fc" id="fr_c" type="number" value="${r.cost||500}"/></div>
  <div class="fg"><label>Stock</label><input class="fc" id="fr_s" type="number" value="${r.stock||100}"/></div>
  <div class="fg"><label>Status</label><select class="fc" id="fr_st">${['active','pending','inactive'].map(s=>`<option ${(r.status||'')=== s?'selected':''}>${s}</option>`).join('')}</select></div>
</div>`;
}

async function saveRew() {
  const name = document.getElementById('fr_n').value.trim();
  if (!name) { toast('Name required', 'error'); return; }
  const obj = {
    name,
    partner: document.getElementById('fr_pa').value.trim(),
    cost:    parseInt(document.getElementById('fr_c').value)  || 0,
    stock:   parseInt(document.getElementById('fr_s').value)  || 0,
    status:  document.getElementById('fr_st').value
  };
  try {
    await saveDoc(COLLECTIONS.rewards, modalCtx.editId, obj);
    toast(modalCtx.editId ? 'Reward updated' : 'Reward added');
    closeModal();
    await loadAll();
    renderRewards();
  } catch (e) { toast('Save failed', 'error'); }
}

// ══════════════════════════════════════════════════════════════
//  MODAL
// ══════════════════════════════════════════════════════════════

function openModal(type) {
  modalCtx = { type, editId: null };
  const T = { user: 'Add User', pickup: 'Add Pickup', material: 'Add Material', reward: 'Add Reward' };
  const F = { user: userForm,   pickup: pickupForm,   material: matForm,         reward: rewForm       };
  const S = { user: saveUser,   pickup: savePickup,   material: saveMat,         reward: saveRew       };
  document.getElementById('mTitle').textContent = T[type];
  document.getElementById('mBody').innerHTML    = F[type]();
  document.getElementById('mSave').onclick      = S[type];
  openM();
}
function openM()       { document.getElementById('modalOverlay').classList.add('open'); }
function closeModal()  { document.getElementById('modalOverlay').classList.remove('open'); }
function closeOutside(e) { if (e.target === document.getElementById('modalOverlay')) closeModal(); }

// ══════════════════════════════════════════════════════════════
//  HELPERS
// ══════════════════════════════════════════════════════════════

function ini(n) { return (n||'U').split(' ').slice(0,2).map(w => w[0]).join('').toUpperCase(); }
function sClass(s) { return { completed:'active', pending:'pending', 'in-transit':'pending', cancelled:'inactive', active:'active', inactive:'inactive' }[s] || 'pending'; }
function pClass(s) { return { completed:'active', pending:'pending', 'in-transit':'pending', cancelled:'inactive' }[s] || 'pending'; }

function animN(id, target) {
  const el = document.getElementById(id); if (!el) return;
  let v = 0; const step = Math.ceil(target / 40);
  const t = setInterval(() => { v = Math.min(v + step, target); el.textContent = v.toLocaleString(); if (v >= target) clearInterval(t); }, 25);
}
function animT(id, target, suffix) {
  const el = document.getElementById(id); if (!el) return;
  let v = 0; const step = Math.ceil(target / 40);
  const t = setInterval(() => { v = Math.min(v + step, target); el.textContent = v.toFixed(1) + suffix; if (v >= target) clearInterval(t); }, 25);
}

function toast(msg, type = 'success') {
  const c = document.getElementById('toasts');
  const t = document.createElement('div');
  t.className = `toast ${type === 'error' ? 'error' : ''}`;
  t.innerHTML = `<i class='bx ${type === 'error' ? 'bx-error-circle' : 'bx-check-circle'}'></i>${msg}`;
  c.appendChild(t);
  setTimeout(() => t.remove(), 3100);
}

// ══════════════════════════════════════════════════════════════
//  INIT — fetch from Firestore then render dashboard
// ══════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', async () => {
  await loadAll();
  renderDashboard();
});

// ══════════════════════════════════════════════════════════════
//  BARCODE SCANNER  (canvas frame-grab → ZXing + BarcodeDetector)
// ══════════════════════════════════════════════════════════════

let scanTargetId  = null;
let scanStream    = null;
let scannerActive = false;
let scanAnimFrame = null;
let _scanCanvas   = null;
let _scanCtx      = null;

function setStatus(html) {
  document.getElementById('scanStatus').innerHTML = html;
}

async function openScanner(targetInputId) {
  scanTargetId = targetInputId;
  document.getElementById('scanResult').style.display = 'none';
  setStatus("<i class='bx bx-loader-alt bx-spin'></i> Requesting camera…");
  document.getElementById('scannerOverlay').classList.add('open');
  stopStream();

  try {
    scanStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false
    });
    const video = document.getElementById('scanVideo');
    video.srcObject = scanStream;
    video.setAttribute('playsinline', true);
    await video.play();
    scannerActive = true;
    setStatus("<i class='bx bx-camera'></i> Camera active — hold barcode steady…");
    populateCameras();
    startScanLoop(video);
  } catch (err) {
    console.error('Camera error:', err);
    if (err.name === 'NotAllowedError') {
      setStatus("⚠ Camera permission denied — click the 🔒 icon in your address bar, allow camera, then refresh.");
    } else if (err.name === 'NotFoundError') {
      setStatus("⚠ No camera found on this device.");
    } else {
      setStatus("⚠ " + err.message);
    }
  }
}

function startScanLoop(video) {
  if (!_scanCanvas) {
    _scanCanvas = document.createElement('canvas');
    _scanCtx    = _scanCanvas.getContext('2d');
  }

  const tick = () => {
    if (!scannerActive) return;
    if (video.readyState < 2 || video.videoWidth === 0) {
      scanAnimFrame = requestAnimationFrame(tick); return;
    }
    _scanCanvas.width  = video.videoWidth;
    _scanCanvas.height = video.videoHeight;
    _scanCtx.drawImage(video, 0, 0);

    // Engine 1: Chrome built-in BarcodeDetector (fastest)
    if (window.BarcodeDetector) {
      new BarcodeDetector().detect(_scanCanvas).then(codes => {
        if (!scannerActive) return;
        if (codes.length > 0) onScanResult(codes[0].rawValue);
        else scanAnimFrame = requestAnimationFrame(tick);
      }).catch(() => { scanAnimFrame = requestAnimationFrame(tick); });
      return;
    }

    // Engine 2: ZXing luminance decode
    if (window.ZXing) {
      try {
        const imgData = _scanCtx.getImageData(0, 0, _scanCanvas.width, _scanCanvas.height);
        const lum     = new ZXing.RGBLuminanceSource(imgData.data, _scanCanvas.width, _scanCanvas.height);
        const bmp     = new ZXing.BinaryBitmap(new ZXing.HybridBinarizer(lum));
        const result  = new ZXing.MultiFormatReader().decode(bmp);
        if (result) { onScanResult(result.getText()); return; }
      } catch (_) {}
      scanAnimFrame = requestAnimationFrame(tick);
      return;
    }

    setStatus("⚠ No decode engine found — reload the page.");
  };

  scanAnimFrame = requestAnimationFrame(tick);
}

function onScanResult(val) {
  if (!scannerActive) return;
  scannerActive = false;
  if (scanAnimFrame) { cancelAnimationFrame(scanAnimFrame); scanAnimFrame = null; }
  document.getElementById('srValue').textContent = val;
  document.getElementById('scanResult').style.display = 'flex';
  setStatus("<i class='bx bx-check-circle' style=\"color:#3C91E6\"></i> Barcode detected!");
  try {
    const ac = new (window.AudioContext || window.webkitAudioContext)();
    const o = ac.createOscillator(), g = ac.createGain();
    o.connect(g); g.connect(ac.destination);
    o.frequency.value = 880;
    g.gain.setValueAtTime(0.3, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.25);
    o.start(); o.stop(ac.currentTime + 0.25);
  } catch (_) {}
}

async function populateCameras() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const sel = document.getElementById('camSelect');
    sel.innerHTML = '';
    devices.filter(d => d.kind === 'videoinput').forEach((d, i) => {
      const o = document.createElement('option');
      o.value = d.deviceId; o.textContent = d.label || `Camera ${i + 1}`;
      sel.appendChild(o);
    });
    const tid = scanStream && scanStream.getVideoTracks()[0] && scanStream.getVideoTracks()[0].getSettings().deviceId;
    if (tid) sel.value = tid;
  } catch (_) {}
}

async function switchCamera(deviceId) {
  stopStream(); scannerActive = false;
  document.getElementById('scanResult').style.display = 'none';
  setStatus("<i class='bx bx-loader-alt bx-spin'></i> Switching camera…");
  try {
    scanStream = await navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: deviceId } }, audio: false });
    const video = document.getElementById('scanVideo');
    video.srcObject = scanStream; await video.play();
    scannerActive = true;
    setStatus("<i class='bx bx-camera'></i> Camera active — hold barcode steady…");
    startScanLoop(video);
  } catch (e) { setStatus("⚠ Could not switch camera."); }
}

function stopStream() {
  if (scanAnimFrame) { cancelAnimationFrame(scanAnimFrame); scanAnimFrame = null; }
  if (scanStream)    { scanStream.getTracks().forEach(t => t.stop()); scanStream = null; }
  const v = document.getElementById('scanVideo');
  if (v) v.srcObject = null;
}

function applyScan() {
  const val = document.getElementById('srValue').textContent;
  if (scanTargetId) {
    const el = document.getElementById(scanTargetId);
    if (el) { el.value = val; el.dispatchEvent(new Event('input')); el.focus(); }
  }
  closeScanner();
  toast('Barcode applied: ' + (val.length > 30 ? val.slice(0,30)+'…' : val));
}

function closeScanner() {
  scannerActive = false;
  stopStream();
  document.getElementById('scannerOverlay').classList.remove('open');
}

document.getElementById('scannerOverlay').addEventListener('click', e => {
  if (e.target === document.getElementById('scannerOverlay')) closeScanner();
});
