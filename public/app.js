// Lentokerho - Finnish Paragliding Training Club Management System
// Main Frontend Application

// ============================================================================
// GLOBAL STATE
// ============================================================================

let currentUser = null;
let currentView = 'dashboard';
let currentStudentId = null;
let currentLessonId = null;
let isLoading = false;
let csrfToken = null;

async function refreshCsrfToken() {
  try {
    const res = await fetch('/api/csrf', { method: 'GET' });
    if (res.ok) {
      const data = await res.json();
      csrfToken = data.csrfToken || null;
    }
  } catch (e) { /* non-fatal; next mutation will error and prompt reload */ }
}

// ============================================================================
// THEORY TOPICS — loaded dynamically from database
// ============================================================================

let theoryStructureCache = null; // { pp1: [...], pp2: [...] }

async function getTheoryStructure(forceRefresh = false) {
  if (theoryStructureCache && !forceRefresh) return theoryStructureCache;
  const data = await api('GET', '/api/theory/structure');
  if (data) {
    theoryStructureCache = data;
  }
  return theoryStructureCache || { pp1: [], pp2: [] };
}

function getTheoryTotals(structure) {
  const pp1 = (structure.pp1 || []).reduce((sum, s) => sum + s.topics.length, 0);
  const pp2 = (structure.pp2 || []).reduce((sum, s) => sum + s.topics.length, 0);
  return { PP1_TOTAL: pp1, PP2_TOTAL: pp2 };
}

function formatDuration(minutes) {
  if (!minutes) return '0 min';
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h} h ${m} min` : `${h} h`;
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function $(id) {
  return document.getElementById(id);
}

async function api(method, url, body = null) {
  const options = {
    method,
    headers: { 'Content-Type': 'application/json' }
  };

  if (method !== 'GET' && csrfToken) {
    options.headers['X-CSRF-Token'] = csrfToken;
  }

  if (body) {
    options.body = JSON.stringify(body);
  }

  try {
    const response = await fetch(url, options);

    if (response.status === 401) {
      currentUser = null;
      showLoginView();
      return null;
    }

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || `HTTP ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('API Error:', error);
    showError(error.message || 'Yhteysvirhe');
    return null;
  }
}

function showLoginView() {
  $('login-view').style.display = 'block';
  $('app-view').style.display = 'none';
  $('loading-view').style.display = 'none';
  $('forgot-password-view').style.display = 'none';
  $('reset-password-view').style.display = 'none';
  $('header-right').hidden = true;
}

function showAppView() {
  $('login-view').style.display = 'none';
  $('app-view').style.display = 'block';
  $('loading-view').style.display = 'none';
  $('forgot-password-view').style.display = 'none';
  $('reset-password-view').style.display = 'none';
  $('header-right').hidden = false;
  if (currentUser) {
    const roleLabels = { admin: 'Pääkäyttäjä', instructor: 'Ohjaaja', student: 'Oppilas' };
    const roleLabel = roleLabels[currentUser.role] || currentUser.role;
    $('user-display').textContent = currentUser.name + ' (' + roleLabel + ')';
    // Show club name for non-admin users
    loadClubNameToHeader();
  }
}

async function loadClubNameToHeader() {
  if (!currentUser || currentUser.role === 'admin') {
    const el = $('club-display');
    if (el) el.style.display = 'none';
    return;
  }
  try {
    const data = await api('GET', '/api/clubs');
    if (data && data.clubs && data.clubs.length > 0) {
      const club = data.clubs[0];
      let el = $('club-display');
      if (!el) {
        el = document.createElement('span');
        el.id = 'club-display';
        el.style.cssText = 'color: #8bb8e8; font-size: 0.85em; margin-right: 8px; padding: 2px 10px; border: 1px solid rgba(139,184,232,0.3); border-radius: 12px;';
        $('header-right').insertBefore(el, $('header-right').firstChild);
      }
      el.textContent = club.name;
      el.style.display = '';
    }
  } catch(e) { /* ignore */ }
}

function showError(msg) {
  const alertEl = $('alert-container');
  if (!alertEl) { alert(msg); return; }

  const div = document.createElement('div');
  div.className = 'alert alert-error';
  div.textContent = msg;
  div.style.cssText = 'background: #f8d7da; color: #721c24; border: 1px solid #f5c6cb; padding: 12px 16px; border-radius: 4px; margin-bottom: 8px; cursor: pointer;';
  div.onclick = () => div.remove();
  alertEl.appendChild(div);
  setTimeout(() => { if (div.parentNode) div.remove(); }, 5000);
}

function showSuccess(msg) {
  const alertEl = $('alert-container');
  if (!alertEl) return;

  const div = document.createElement('div');
  div.className = 'alert alert-success';
  div.textContent = msg;
  div.style.cssText = 'background: #d4edda; color: #155724; border: 1px solid #c3e6cb; padding: 12px 16px; border-radius: 4px; margin-bottom: 8px; cursor: pointer;';
  div.onclick = () => div.remove();
  alertEl.appendChild(div);
  setTimeout(() => { if (div.parentNode) div.remove(); }, 4000);
}

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  str = String(str);
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
  return str.replace(/[&<>"']/g, c => map[c]);
}

function showModal(title, contentHtml) {
  let modal = $('modal-overlay');
  modal.innerHTML = `
    <div class="modal-content" style="background: #fff; border-radius: 8px; max-width: 700px; width: 90%; max-height: 85vh; overflow-y: auto; margin: auto; padding: 0;">
      <div class="modal-header" style="display: flex; justify-content: space-between; align-items: center; padding: 16px 20px; border-bottom: 1px solid #ddd;">
        <h2 style="margin: 0;">${escapeHtml(title)}</h2>
        <button style="background: none; border: none; font-size: 24px; cursor: pointer; padding: 0 4px;" onclick="hideModal()">&times;</button>
      </div>
      <div class="modal-body" style="padding: 20px;">
        ${contentHtml}
      </div>
    </div>
  `;
  modal.style.display = 'flex';
  modal.style.justifyContent = 'center';
  modal.style.alignItems = 'center';
  modal.onclick = (e) => { if (e.target === modal) hideModal(); };
}

function hideModal() {
  const modal = $('modal-overlay');
  if (modal) modal.style.display = 'none';
}

function showConfirm(message, onConfirm) {
  const html = `
    <p>${escapeHtml(message)}</p>
    <div style="margin-top: 20px; text-align: right;">
      <button class="btn btn-secondary" onclick="hideModal()">Peruuta</button>
      <button class="btn btn-danger" onclick="window._confirmAction()">Kyllä, poista</button>
    </div>
  `;
  showModal('Vahvistus', html);
  window._confirmAction = () => { hideModal(); onConfirm(); };
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length === 3) return `${parts[2]}.${parts[1]}.${parts[0]}`;
  return dateStr;
}

function formatDateTime(dateStr) {
  if (!dateStr) return '';
  // Handle ISO format and plain date
  if (dateStr.includes('T') || dateStr.includes(' ')) {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    const hours = String(d.getHours()).padStart(2, '0');
    const mins = String(d.getMinutes()).padStart(2, '0');
    return `${day}.${month}.${year} ${hours}:${mins}`;
  }
  return formatDate(dateStr);
}

function getMonthYear(date) {
  const months = ['Tammikuu', 'Helmikuu', 'Maaliskuu', 'Huhtikuu', 'Toukokuu',
                  'Kesäkuu', 'Heinäkuu', 'Elokuu', 'Syyskuu', 'Lokakuu',
                  'Marraskuu', 'Joulukuu'];
  return `${months[date.getMonth()]} ${date.getFullYear()}`;
}

function createProgressBar(current, max, label) {
  const percent = max > 0 ? Math.round((current / max) * 100) : 0;
  const color = percent >= 100 ? '#28a745' : (percent >= 50 ? '#ffc107' : '#dc3545');
  return `
    <div class="progress-item" style="margin-bottom: 10px;">
      <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
        <span>${label}</span>
        <span>${current}/${max}</span>
      </div>
      <div style="background: #e9ecef; border-radius: 4px; height: 12px; overflow: hidden;">
        <div style="width: ${Math.min(percent, 100)}%; height: 100%; background: ${color}; border-radius: 4px; transition: width 0.3s;"></div>
      </div>
    </div>
  `;
}

function getStatusBadge(status) {
  const statusMap = {
    'ongoing': { bg: '#2E6DA4', text: 'Kesken' },
    'completed': { bg: '#28a745', text: 'Valmis' },
    'inactive': { bg: '#6c757d', text: 'Inaktiivinen' }
  };
  const info = statusMap[status] || { bg: '#6c757d', text: status || 'Tuntematon' };
  return `<span style="background: ${info.bg}; color: #fff; padding: 2px 8px; border-radius: 4px; font-size: 0.85em;">${info.text}</span>`;
}

// ============================================================================
// AUTHENTICATION
// ============================================================================

async function init() {
  $('loading-view').style.display = 'block';
  $('login-view').style.display = 'none';
  $('app-view').style.display = 'none';

  const user = await api('GET', '/api/me');

  if (user && user.id) {
    currentUser = user;
    await refreshCsrfToken();
    setupNavigation();
    showAppView();
    if (currentUser.must_change_password) {
      renderForcePasswordChange();
    } else {
      navigate();
    }
  } else {
    showLoginView();
  }
}

function renderForcePasswordChange() {
  // Hide sidebar, block navigation until password is changed
  const sidebar = document.getElementById('sidebar');
  if (sidebar) sidebar.style.display = 'none';
  const mainContent = $('main-content');
  mainContent.innerHTML = `
    <div style="max-width: 440px; margin: 40px auto; background: #fff; border: 1px solid #dee2e6; border-radius: 10px; padding: 28px; box-shadow: 0 4px 12px rgba(0,0,0,0.08);">
      <h2 style="margin-top: 0;">Salasana on vaihdettava</h2>
      <p style="color: #555;">Tämä tili käyttää oletussalasanaa. Aseta uusi vahva salasana (vähintään 8 merkkiä) ennen kuin voit jatkaa.</p>
      <form onsubmit="handleForcePasswordChange(event)">
        <div class="form-group" style="margin-bottom: 12px;">
          <label>Nykyinen salasana *</label>
          <input type="password" id="force-pw-current" required autocomplete="current-password" style="width: 100%; padding: 10px; box-sizing: border-box;">
        </div>
        <div class="form-group" style="margin-bottom: 12px;">
          <label>Uusi salasana (vähintään 8 merkkiä) *</label>
          <input type="password" id="force-pw-new" required minlength="8" autocomplete="new-password" style="width: 100%; padding: 10px; box-sizing: border-box;">
        </div>
        <div class="form-group" style="margin-bottom: 12px;">
          <label>Vahvista uusi salasana *</label>
          <input type="password" id="force-pw-confirm" required minlength="8" autocomplete="new-password" style="width: 100%; padding: 10px; box-sizing: border-box;">
        </div>
        <div style="display: flex; gap: 10px; justify-content: flex-end; margin-top: 20px;">
          <button type="button" class="btn btn-secondary" onclick="handleLogout()">Kirjaudu ulos</button>
          <button type="submit" class="btn btn-primary">Tallenna salasana</button>
        </div>
      </form>
    </div>
  `;
}

async function handleForcePasswordChange(event) {
  event.preventDefault();
  const currentPassword = $('force-pw-current').value;
  const newPassword = $('force-pw-new').value;
  const confirm = $('force-pw-confirm').value;
  if (newPassword !== confirm) {
    showError('Uudet salasanat eivät täsmää');
    return;
  }
  const result = await api('POST', '/api/change-password', { currentPassword, newPassword });
  if (result && result.success) {
    showSuccess('Salasana vaihdettu');
    const sidebar = document.getElementById('sidebar');
    if (sidebar) sidebar.style.display = '';
    currentUser = await api('GET', '/api/me');
    if (currentUser.role === 'student') {
      window.location.hash = '#student/' + currentUser.id;
    } else {
      window.location.hash = '#dashboard';
    }
    navigate();
  }
}

async function handleLogin() {
  const username = $('login-username').value.trim();
  const password = $('login-password').value.trim();

  if (!username || !password) {
    showError('Käyttäjänimi ja salasana vaaditaan');
    return;
  }

  const result = await api('POST', '/api/login', { username, password });
  if (result && result.id) {
    currentUser = result;
    await refreshCsrfToken();
    showSuccess('Kirjautuminen onnistui');
    setupNavigation();
    showAppView();
    if (currentUser.must_change_password) {
      renderForcePasswordChange();
      return;
    }
    if (currentUser.role === 'student') {
      window.location.hash = '#student/' + currentUser.id;
    } else {
      window.location.hash = '#dashboard';
    }
    navigate();
  }
}

async function handleLogout() {
  await api('POST', '/api/logout');
  currentUser = null;
  window.location.hash = '';
  showLoginView();
}

async function handleResetRequest() {
  const email = $('reset-email').value.trim();
  if (!email) { showError('Sähköpostiosoite vaaditaan'); return; }

  const result = await api('POST', '/api/forgot-password', { email });
  if (result) {
    showSuccess('Palautusohje lähetetty sähköpostiin');
    showLoginView();
  }
}

// ============================================================================
// NAVIGATION
// ============================================================================

function toggleSidebar(forceState) {
  const sidebar = document.getElementById('sidebar');
  const backdrop = document.getElementById('sidebar-backdrop');
  const btn = document.getElementById('menu-toggle-btn');
  if (!sidebar) return;
  const willOpen = forceState !== undefined ? forceState : !sidebar.classList.contains('visible');
  sidebar.classList.toggle('visible', willOpen);
  if (backdrop) backdrop.classList.toggle('visible', willOpen);
  if (btn) btn.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
}

function setupNavigation() {
  // Hash change listener (only set once)
  if (!window._hashListenerSet) {
    window.addEventListener('hashchange', navigate);
    window._hashListenerSet = true;
  }

  // Mobile menu toggle (only bind once)
  if (!window._menuToggleSet) {
    const btn = document.getElementById('menu-toggle-btn');
    const backdrop = document.getElementById('sidebar-backdrop');
    if (btn) btn.addEventListener('click', () => toggleSidebar());
    if (backdrop) backdrop.addEventListener('click', () => toggleSidebar(false));
    document.getElementById('sidebar-menu')?.addEventListener('click', (e) => {
      if (e.target.closest('.nav-link')) toggleSidebar(false);
    });
    window._menuToggleSet = true;
  }

  const sidebarMenu = document.getElementById('sidebar-menu');

  if (currentUser && currentUser.role === 'student') {
    // Student sidebar: only own profile, sites, and theory
    sidebarMenu.innerHTML = `
      <li><a href="#student/${currentUser.id}" class="nav-link" data-nav-link="student">Omat tiedot</a></li>
      <li><a href="#sites" class="nav-link" data-nav-link="sites">Lentopaikat</a></li>
      <li><a href="#theory-management" class="nav-link" data-nav-link="theory-management">Teoria</a></li>
      <li><a href="/docs/oppilas.html" class="nav-link" target="_blank" rel="noopener">Ohje</a></li>
    `;
  } else {
    // Add clubs link for admin users
    if (currentUser && currentUser.role === 'admin') {
      if (sidebarMenu.querySelector('[data-nav-link="clubs"]')) return;
      const clubsLi = document.createElement('li');
      clubsLi.innerHTML = '<a href="#clubs" class="nav-link" data-nav-link="clubs">Kerhot</a>';

      // Insert before audit-log
      const auditLogLi = sidebarMenu.querySelector('[data-nav-link="audit-log"]').parentElement;
      sidebarMenu.insertBefore(clubsLi, auditLogLi);
    }
  }
}

function navigate() {
  const hash = window.location.hash.slice(1) || 'dashboard';
  const [view, ...params] = hash.split('/');

  // Guard: redirect students away from instructor/admin-only views
  if (currentUser && currentUser.role === 'student') {
    const studentAllowed = ['student', 'sites', 'theory-management'];
    if (!studentAllowed.includes(view)) {
      window.location.hash = '#student/' + currentUser.id;
      return;
    }
  }

  // Update active nav link
  document.querySelectorAll('[data-nav-link]').forEach(link => {
    link.classList.remove('active');
    if (link.getAttribute('data-nav-link') === view) {
      link.classList.add('active');
    }
  });

  switch (view) {
    case 'dashboard':
      renderDashboard();
      break;
    case 'students':
      renderStudentList();
      break;
    case 'club-students':
      renderClubStudentsProgress();
      break;
    case 'student':
      currentStudentId = params[0];
      renderStudentDetail(params[0]);
      break;
    case 'instructors':
      renderInstructors();
      break;
    case 'lessons':
      renderLessons();
      break;
    case 'lesson':
      currentLessonId = params[0];
      renderLessonDetail(params[0]);
      break;
    case 'sites':
      renderSites();
      break;
    case 'theory-management':
      renderTheoryManagement();
      break;
    case 'audit-log':
      renderAuditLog();
      break;
    case 'clubs':
      renderClubs();
      break;
    default:
      renderDashboard();
  }
}

// ============================================================================
// DASHBOARD VIEW
// ============================================================================

async function renderDashboard() {
  const mainContent = $('main-content');
  mainContent.innerHTML = '<p style="text-align: center; padding: 40px;">Ladataan...</p>';

  const data = await api('GET', '/api/dashboard');
  if (!data) return;

  const stats = data.stats || {};
  const students = data.students || [];
  const structure = await getTheoryStructure();
  const { PP1_TOTAL, PP2_TOTAL } = getTheoryTotals(structure);
  const recentEvents = data.recent_events || [];

  let html = `
    <div style="padding: 20px;">
      <h1>Kojelauta</h1>

      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px; margin: 20px 0;">
        <div style="background: #1A3A5C; color: #fff; padding: 20px; border-radius: 8px; text-align: center;">
          <div style="font-size: 2em; font-weight: bold;">${stats.active_students || 0}</div>
          <div>Aktiivisia oppilaita</div>
        </div>
        <div style="background: #28a745; color: #fff; padding: 20px; border-radius: 8px; text-align: center;">
          <div style="font-size: 2em; font-weight: bold;">${stats.graduated_students || 0}</div>
          <div>Valmistuneita</div>
        </div>
        <div style="background: #2E6DA4; color: #fff; padding: 20px; border-radius: 8px; text-align: center;">
          <div style="font-size: 2em; font-weight: bold;">${stats.total_flights || 0}</div>
          <div>Lentoja yhteensä</div>
        </div>
        <div style="background: #6c757d; color: #fff; padding: 20px; border-radius: 8px; text-align: center;">
          <div style="font-size: 2em; font-weight: bold;">${stats.total_lessons || 0}</div>
          <div>Oppitunteja</div>
        </div>
      </div>

      <h2 style="margin-top: 30px;">Aktiiviset oppilaat</h2>
      <div style="overflow-x: auto;">
        <table style="width: 100%; border-collapse: collapse;">
          <thead>
            <tr style="background: #f8f9fa; text-align: left;">
              <th style="padding: 10px;">Nimi</th>
              <th style="padding: 10px;">Status</th>
              <th style="padding: 10px;">Aloitettu</th>
              <th style="padding: 10px;">Matalia</th>
              <th style="padding: 10px;">Korkeita</th>
              <th style="padding: 10px;">Teoria PP1</th>
              <th style="padding: 10px;">Teoria PP2</th>
            </tr>
          </thead>
          <tbody>
  `;

  if (students.length > 0) {
    students.forEach(s => {
      // Count theory per level from student stats
      const pp1 = s.theory_pp1 || 0;
      const pp2 = s.theory_pp2 || 0;
      html += `
        <tr style="border-bottom: 1px solid #dee2e6; cursor: pointer;" onclick="window.location.hash='#student/${s.id}'">
          <td style="padding: 10px;"><strong>${escapeHtml(s.name)}</strong></td>
          <td style="padding: 10px;">${getStatusBadge(s.status)}</td>
          <td style="padding: 10px;">${formatDate(s.course_started)}</td>
          <td style="padding: 10px;">${s.low_flights || 0}/5</td>
          <td style="padding: 10px;">${s.high_flights || 0}/40</td>
          <td style="padding: 10px;">${pp1}/${PP1_TOTAL}</td>
          <td style="padding: 10px;">${pp2}/${PP2_TOTAL}</td>
        </tr>
      `;
    });
  } else {
    html += '<tr><td colspan="7" style="text-align: center; padding: 20px;">Ei oppilaita</td></tr>';
  }

  html += '</tbody></table></div>';

  // Recent events
  html += `
    <h2 style="margin-top: 30px;">Viimeisimmät tapahtumat</h2>
    <div style="overflow-x: auto;">
      <table style="width: 100%; border-collapse: collapse;">
        <thead>
          <tr style="background: #f8f9fa; text-align: left;">
            <th style="padding: 10px;">Aika</th>
            <th style="padding: 10px;">Käyttäjä</th>
            <th style="padding: 10px;">Toiminto</th>
            <th style="padding: 10px;">Kohde</th>
            <th style="padding: 10px;">Tiedot</th>
          </tr>
        </thead>
        <tbody>
  `;

  if (recentEvents.length > 0) {
    recentEvents.forEach(event => {
      html += `
        <tr style="border-bottom: 1px solid #dee2e6;">
          <td style="padding: 10px;">${formatDateTime(event.timestamp)}</td>
          <td style="padding: 10px;">${escapeHtml(event.user_name || 'Järjestelmä')}</td>
          <td style="padding: 10px;">${escapeHtml(event.action)}</td>
          <td style="padding: 10px;">${escapeHtml(event.entity_type)}</td>
          <td style="padding: 10px;">${escapeHtml(event.details || '')}</td>
        </tr>
      `;
    });
  } else {
    html += '<tr><td colspan="5" style="text-align: center; padding: 20px;">Ei tapahtumia</td></tr>';
  }

  html += '</tbody></table></div></div>';

  mainContent.innerHTML = html;
}

// ============================================================================
// STUDENT LIST VIEW
// ============================================================================

let studentListFilter = 'ongoing';

async function renderStudentList() {
  const mainContent = $('main-content');
  mainContent.innerHTML = '<p style="text-align: center; padding: 40px;">Ladataan...</p>';

  const filterParam = studentListFilter || 'all';
  const data = await api('GET', `/api/students?status=${filterParam}`);
  if (!data) return;

  const students = data.students || [];

  let html = `
    <div style="padding: 20px;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; flex-wrap: wrap; gap: 10px;">
        <h1 style="margin: 0;">Oppilaat</h1>
        <button class="btn btn-primary" onclick="showAddStudentModal()">+ Lisää oppilas</button>
      </div>

      <div style="margin-bottom: 20px; display: flex; gap: 8px; flex-wrap: wrap;">
        <button class="btn ${studentListFilter === 'ongoing' ? 'btn-primary' : 'btn-secondary'}" onclick="setStudentFilter('ongoing')">Kesken</button>
        <button class="btn ${studentListFilter === '' ? 'btn-primary' : 'btn-secondary'}" onclick="setStudentFilter('')">Kaikki</button>
        <button class="btn ${studentListFilter === 'completed' ? 'btn-primary' : 'btn-secondary'}" onclick="setStudentFilter('completed')">Valmis</button>
      </div>

      <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 16px;">
  `;

  if (students.length > 0) {
    students.forEach(student => {
      html += `
        <div style="border: 1px solid #dee2e6; border-radius: 8px; padding: 16px; cursor: pointer; transition: box-shadow 0.2s;" onclick="window.location.hash='#student/${student.id}'" onmouseover="this.style.boxShadow='0 2px 8px rgba(0,0,0,0.15)'" onmouseout="this.style.boxShadow='none'">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
            <h3 style="margin: 0;">${escapeHtml(student.name)}</h3>
            ${getStatusBadge(student.status)}
          </div>
          <p style="margin: 4px 0; color: #666;"><strong>Aloitettu:</strong> ${formatDate(student.course_started)}</p>
          <p style="margin: 4px 0; color: #666;"><strong>Sähköposti:</strong> ${escapeHtml(student.email || '')}</p>
          <div style="margin-top: 10px; font-size: 0.9em; color: #555;">
            <span>Matalia: ${student.low_flights || 0}/5</span> |
            <span>Korkeita: ${student.high_flights || 0}/40</span>
          </div>
        </div>
      `;
    });
  } else {
    html += '<p style="grid-column: 1/-1; text-align: center; color: #666;">Ei oppilaita</p>';
  }

  html += '</div></div>';
  mainContent.innerHTML = html;
}

function setStudentFilter(filter) {
  studentListFilter = filter;
  renderStudentList();
}

// ============================================================================
// CLUB STUDENTS PROGRESS VIEW
// ============================================================================

let clubStudentsFilter = 'ongoing';

function setClubStudentsFilter(value) {
  clubStudentsFilter = value;
  renderClubStudentsProgress();
}

function progressColor(done, total) {
  if (!total) return '#6c757d';
  const pct = done / total;
  if (pct >= 1) return '#28a745';
  if (pct >= 0.5) return '#F59E0B';
  if (pct > 0) return '#2E6DA4';
  return '#dc3545';
}

function progressBar(done, total, label) {
  const pct = total ? Math.min(100, Math.round((done / total) * 100)) : 0;
  const color = progressColor(done, total);
  return `
    <div style="margin: 6px 0;">
      <div style="display: flex; justify-content: space-between; font-size: 0.85em; color: #555; margin-bottom: 2px;">
        <span>${label}</span>
        <span>${done}/${total} (${pct}%)</span>
      </div>
      <div style="height: 8px; background: #e9ecef; border-radius: 4px; overflow: hidden;">
        <div style="width: ${pct}%; height: 100%; background: ${color}; transition: width 0.3s;"></div>
      </div>
    </div>
  `;
}

async function renderClubStudentsProgress() {
  const mainContent = $('main-content');
  mainContent.innerHTML = '<p style="text-align: center; padding: 40px;">Ladataan...</p>';

  const structure = await getTheoryStructure();
  const { PP1_TOTAL, PP2_TOTAL } = getTheoryTotals(structure);
  const LOW_TOTAL = 5;
  const HIGH_TOTAL = 40;

  const filter = clubStudentsFilter || 'ongoing';
  const data = await api('GET', '/api/students?status=' + filter);
  if (!data) return;
  const students = data.students || [];

  const statusOptions = [
    { value: 'ongoing',   label: 'Kesken' },
    { value: 'completed', label: 'Valmis' },
    { value: 'inactive',  label: 'Inaktiivinen' },
    { value: 'all',       label: 'Kaikki' }
  ];
  const selectOptions = statusOptions.map(o =>
    `<option value="${o.value}" ${filter === o.value ? 'selected' : ''}>${o.label}</option>`
  ).join('');

  let html = `
    <div style="padding: 20px;">
      <h1 style="margin: 0 0 8px 0;">Oppilaat</h1>
      <p style="color: #666; margin-bottom: 16px;">Teorian ja lentojen edistyminen. Vihreä piste = kaikki valmista.</p>
      <div style="margin-bottom: 20px; display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
        <label for="club-students-status" style="color: #555;">Näytä status:</label>
        <select id="club-students-status" onchange="setClubStudentsFilter(this.value)" style="padding: 8px 12px; border: 1px solid #ced4da; border-radius: 6px; background: #fff; min-width: 160px;">
          ${selectOptions}
        </select>
        <span style="color: #888; font-size: 0.9em;">${students.length} oppilasta</span>
      </div>
      <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 16px;">
  `;

  if (students.length === 0) {
    html += '<p style="grid-column: 1/-1; text-align: center; color: #666;">Ei oppilaita</p>';
  } else {
    students.forEach(s => {
      const theoryPp1 = s.theory_pp1 || 0;
      const theoryPp2 = s.theory_pp2 || 0;
      const low = s.low_flights || 0;
      const high = s.high_flights || 0;
      const approval = !!s.has_approval;
      const pp2Exam = !!s.pp2_exam_passed;

      const allDone =
        theoryPp1 >= PP1_TOTAL && PP1_TOTAL > 0 &&
        theoryPp2 >= PP2_TOTAL && PP2_TOTAL > 0 &&
        low >= LOW_TOTAL &&
        high >= HIGH_TOTAL &&
        approval &&
        pp2Exam;

      const dot = `<span title="${allDone ? 'Kaikki valmista' : 'Kesken'}" style="display: inline-block; width: 14px; height: 14px; border-radius: 50%; background: ${allDone ? '#28a745' : '#adb5bd'}; border: 2px solid #fff; box-shadow: 0 0 0 1px #adb5bd;"></span>`;

      const checkMark = (ok) => ok
        ? '<span style="color: #28a745; font-weight: bold;">✓</span>'
        : '<span style="color: #adb5bd;">–</span>';

      html += `
        <div style="position: relative; border: 1px solid #dee2e6; border-radius: 8px; padding: 16px; cursor: pointer; background: #fff; transition: box-shadow 0.2s;" onclick="window.location.hash='#student/${s.id}'" onmouseover="this.style.boxShadow='0 2px 8px rgba(0,0,0,0.15)'" onmouseout="this.style.boxShadow='none'">
          <div style="position: absolute; top: 12px; right: 12px;">${dot}</div>
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px; padding-right: 24px;">
            <h3 style="margin: 0;">${escapeHtml(s.name)}</h3>
            ${getStatusBadge(s.status)}
          </div>
          <div style="font-size: 0.8em; color: #888; margin-bottom: 10px;">${escapeHtml(s.email || '')}</div>
          <div style="font-size: 0.85em; color: #333; font-weight: 600; margin-top: 8px;">Teoria</div>
          ${progressBar(theoryPp1, PP1_TOTAL, 'PP1')}
          ${progressBar(theoryPp2, PP2_TOTAL, 'PP2')}
          <div style="font-size: 0.85em; color: #333; font-weight: 600; margin-top: 10px;">Lennot</div>
          ${progressBar(low, LOW_TOTAL, 'Matalat')}
          ${progressBar(high, HIGH_TOTAL, 'Korkeat')}
          <div style="display: flex; gap: 14px; margin-top: 10px; font-size: 0.85em; color: #555;">
            <span>${checkMark(approval)} Tarkistuslento${approval && s.approval_flight_date ? ' (' + formatDate(s.approval_flight_date) + ')' : ''}</span>
            <span>${checkMark(pp2Exam)} PP2-tentti${pp2Exam && s.pp2_exam_date ? ' (' + formatDate(s.pp2_exam_date) + ')' : ''}</span>
          </div>
        </div>
      `;
    });
  }

  html += '</div></div>';
  mainContent.innerHTML = html;
}

function showAddStudentModal() {
  const html = `
    <form onsubmit="handleAddStudent(event)">
      <div class="form-group" style="margin-bottom: 12px;">
        <label>Nimi *</label>
        <input type="text" id="add-student-name" required style="width: 100%; padding: 8px; box-sizing: border-box;">
      </div>
      <div class="form-group" style="margin-bottom: 12px;">
        <label>Sähköposti *</label>
        <input type="email" id="add-student-email" required style="width: 100%; padding: 8px; box-sizing: border-box;">
      </div>
      <div class="form-group" style="margin-bottom: 12px;">
        <label>Puhelin</label>
        <input type="tel" id="add-student-phone" style="width: 100%; padding: 8px; box-sizing: border-box;">
      </div>
      <div class="form-group" style="margin-bottom: 12px;">
        <label>Käyttäjänimi *</label>
        <input type="text" id="add-student-username" required style="width: 100%; padding: 8px; box-sizing: border-box;">
      </div>
      <div class="form-group" style="margin-bottom: 12px;">
        <label>Salasana (vähintään 8 merkkiä) *</label>
        <input type="password" id="add-student-password" required minlength="8" style="width: 100%; padding: 8px; box-sizing: border-box;">
      </div>
      <div class="form-group" style="margin-bottom: 12px;">
        <label>Kurssin aloituspäivä *</label>
        <input type="date" id="add-student-course-started" required style="width: 100%; padding: 8px; box-sizing: border-box;">
      </div>
      <div class="form-group" style="margin-bottom: 12px;">
        <label>Status</label>
        <select id="add-student-status" style="width: 100%; padding: 8px; box-sizing: border-box;">
          <option value="ongoing">Kesken</option>
        </select>
      </div>
      <div style="margin-top: 20px; text-align: right;">
        <button type="button" class="btn btn-secondary" onclick="hideModal()">Peruuta</button>
        <button type="submit" class="btn btn-primary">Lisää oppilas</button>
      </div>
    </form>
  `;
  showModal('Lisää oppilas', html);
}

async function handleAddStudent(event) {
  event.preventDefault();
  const name = $('add-student-name').value.trim();
  const email = $('add-student-email').value.trim();
  const phone = $('add-student-phone').value.trim();
  const username = $('add-student-username').value.trim();
  const password = $('add-student-password').value;
  const course_started = $('add-student-course-started').value;
  const status = $('add-student-status').value;

  if (!name || !email || !username || !password || !course_started) {
    showError('Kaikki pakolliset kentät vaaditaan');
    return;
  }
  if (password.length < 8) {
    showError('Salasanan on oltava vähintään 8 merkkiä');
    return;
  }

  const result = await api('POST', '/api/students', { name, email, phone, username, password, course_started, status });
  if (result) {
    hideModal();
    showSuccess('Oppilas lisätty');
    renderStudentList();
  }
}

// ============================================================================
// STUDENT DETAIL VIEW
// ============================================================================

async function renderStudentDetail(id) {
  const mainContent = $('main-content');
  mainContent.innerHTML = '<p style="text-align: center; padding: 40px;">Ladataan...</p>';

  const student = await api('GET', `/api/students/${id}`);
  if (!student) return;

  const isInstructor = currentUser && (currentUser.role === 'instructor' || currentUser.role === 'admin');
  const isStudent = currentUser && currentUser.role === 'student';

  let html = `
    <div style="padding: 20px;">
      ${!isStudent ? `<div style="margin-bottom: 10px;">
        <button class="btn btn-secondary" onclick="window.location.hash='#students'">← Takaisin</button>
      </div>` : ''}

      <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 16px; margin-bottom: 20px;">
        <div>
          <h1 style="margin: 0 0 8px 0;">${escapeHtml(student.name)}</h1>
          ${getStatusBadge(student.status)}
        </div>
        <div style="text-align: right; color: #555;">
          <p style="margin: 2px 0;"><strong>Aloitettu:</strong> ${formatDate(student.course_started)}</p>
          <p style="margin: 2px 0;"><strong>Sähköposti:</strong> ${escapeHtml(student.email)}</p>
          <p style="margin: 2px 0;"><strong>Puhelin:</strong> ${escapeHtml(student.phone || '-')}</p>
        </div>
        ${isInstructor ? `
          <div style="display: flex; gap: 8px;">
            <button class="btn btn-secondary" onclick="showEditStudentModal(${id})">Muokkaa</button>
            <button class="btn btn-secondary" onclick="showResetPasswordModal(${id}, '${escapeHtml(student.name)}')">Nollaa salasana</button>
          </div>
        ` : ''}
      </div>

      <div class="tabs">
        <div style="display: flex; gap: 0; border-bottom: 2px solid #dee2e6; margin-bottom: 20px; flex-wrap: wrap;">
          <button class="tab-btn active" data-tab="flights-tab" style="padding: 10px 20px; border: none; background: none; cursor: pointer; border-bottom: 2px solid #2E6DA4; margin-bottom: -2px; font-weight: bold;">Lennot</button>
          <button class="tab-btn" data-tab="theory-tab" style="padding: 10px 20px; border: none; background: none; cursor: pointer; margin-bottom: -2px;">Teoria</button>
          <button class="tab-btn" data-tab="equipment-tab" style="padding: 10px 20px; border: none; background: none; cursor: pointer; margin-bottom: -2px;">Kalusto</button>
          <button class="tab-btn" data-tab="attachments-tab" style="padding: 10px 20px; border: none; background: none; cursor: pointer; margin-bottom: -2px;">Liitteet</button>
          ${isInstructor ? `
            <button class="tab-btn" data-tab="notes-tab" style="padding: 10px 20px; border: none; background: none; cursor: pointer; margin-bottom: -2px;">Muistiinpanot</button>
          ` : ''}
        </div>

        <div id="flights-tab" class="tab-content" style="display: block;">
          <div id="flights-content">Ladataan...</div>
        </div>
        <div id="theory-tab" class="tab-content" style="display: none;">
          <div id="theory-content">Ladataan...</div>
        </div>
        <div id="equipment-tab" class="tab-content" style="display: none;">
          <div id="equipment-content">Ladataan...</div>
        </div>
        <div id="attachments-tab" class="tab-content" style="display: none;">
          <div id="attachments-content">Ladataan...</div>
        </div>
        ${isInstructor ? `
          <div id="notes-tab" class="tab-content" style="display: none;">
            <div id="notes-content">Ladataan...</div>
          </div>
        ` : ''}
      </div>
    </div>
  `;

  mainContent.innerHTML = html;

  // Tab switching
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => {
        b.classList.remove('active');
        b.style.borderBottom = 'none';
        b.style.fontWeight = 'normal';
      });
      document.querySelectorAll('.tab-content').forEach(t => t.style.display = 'none');
      btn.classList.add('active');
      btn.style.borderBottom = '2px solid #2E6DA4';
      btn.style.fontWeight = 'bold';
      const tabId = btn.getAttribute('data-tab');
      $(tabId).style.display = 'block';
    });
  });

  // Load tab contents
  loadFlightsTab(id);
  loadTheoryTab(id);
  loadEquipmentTab(id);
  loadAttachmentsTab(id);
  if (isInstructor) {
    loadNotesTab(id, student);
  }
}

async function loadFlightsTab(studentId) {
  const data = await api('GET', `/api/students/${studentId}/flights`);
  if (!data) return;

  const stats = data.student || {};
  const flights = data.flights || [];
  const isInstructor = currentUser && (currentUser.role === 'instructor' || currentUser.role === 'admin');
  const isStudent = currentUser && currentUser.role === 'student';

  let html = `
    <h2>Edistyminen</h2>
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 20px;">
      <div>${createProgressBar(stats.low_flights || 0, 5, 'Matalia lentoja')}</div>
      <div>${createProgressBar(stats.high_flights || 0, 40, 'Korkeita lentoja')}</div>
      <div>${createProgressBar(stats.high_days || 0, 7, 'Korkeita päiviä')}</div>
      <div style="display: flex; align-items: center;">
        ${stats.has_approval ? `<span style="background: #28a745; color: #fff; padding: 6px 12px; border-radius: 4px;">Tarkistuslento suoritettu${stats.approval_flight_date ? ' ' + formatDate(stats.approval_flight_date) : ''}</span>` : '<span style="background: #6c757d; color: #fff; padding: 6px 12px; border-radius: 4px;">Tarkistuslento vaaditaan</span>'}
      </div>
      <div style="display: flex; align-items: center;">
        ${stats.pp2_exam_passed ? `<span style="background: #28a745; color: #fff; padding: 6px 12px; border-radius: 4px;">PP2-koe suoritettu${stats.pp2_exam_date ? ' ' + formatDate(stats.pp2_exam_date) : ''}</span>` : '<span style="background: #6c757d; color: #fff; padding: 6px 12px; border-radius: 4px;">PP2-koe suorittamatta</span>'}
      </div>
    </div>

    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
      <h2>Lennot</h2>
      ${(isInstructor || (isStudent && currentUser.id == studentId)) ? `<button class="btn btn-primary" onclick="showFlightModal(${studentId})">+ Lisää lento</button>` : ''}
    </div>

    <div style="overflow-x: auto;">
      <table class="mobile-stack" style="width: 100%; border-collapse: collapse;">
        <thead>
          <tr style="background: #f8f9fa; text-align: left;">
            <th style="padding: 10px;">Päivä</th>
            <th style="padding: 10px;">Paikka</th>
            <th style="padding: 10px;">Tyyppi</th>
            <th style="padding: 10px;">Lentoja</th>
            <th style="padding: 10px;">Harjoitukset</th>
            <th style="padding: 10px;">Muistiinpanot</th>
            ${isInstructor ? '<th style="padding: 10px;">Toiminnot</th>' : ''}
          </tr>
        </thead>
        <tbody>
  `;

  if (flights.length > 0) {
    flights.forEach(flight => {
      const typeLabel = flight.flight_type === 'low' ? 'Matala' : 'Korkea';
      const typeBg = flight.flight_type === 'low' ? '#6c757d' : '#2E6DA4';
      const approvalTag = flight.is_approval_flight ? ' <span style="background: #28a745; color: #fff; padding: 1px 6px; border-radius: 3px; font-size: 0.8em;">Tarkistus</span>' : '';
      html += `
        <tr style="border-bottom: 1px solid #dee2e6;">
          <td data-label="Päivä" style="padding: 10px;">${formatDate(flight.date)}</td>
          <td data-label="Paikka" style="padding: 10px;">${escapeHtml(flight.site_name || '-')}</td>
          <td data-label="Tyyppi" style="padding: 10px;"><span style="background: ${typeBg}; color: #fff; padding: 2px 8px; border-radius: 4px; font-size: 0.85em;">${typeLabel}</span>${approvalTag}</td>
          <td data-label="Lentoja" style="padding: 10px;">${flight.flight_count}</td>
          <td data-label="Harjoitukset" style="padding: 10px;">${escapeHtml(flight.exercises || '-')}</td>
          <td data-label="Muistiinpanot" style="padding: 10px;">${escapeHtml(flight.notes || '-')}</td>
          ${isInstructor ? `
            <td data-label="Toiminnot" style="padding: 10px;">
              <button class="btn btn-small btn-danger" onclick="deleteFlightConfirm(${flight.id})">Poista</button>
            </td>
          ` : ''}
        </tr>
      `;
    });
  } else {
    html += `<tr><td colspan="${isInstructor ? 7 : 6}" style="text-align: center; padding: 20px;">Ei lentoja</td></tr>`;
  }

  html += '</tbody></table></div>';
  $('flights-content').innerHTML = html;
}

async function loadTheoryTab(studentId) {
  const [data, structure] = await Promise.all([
    api('GET', `/api/students/${studentId}/theory`),
    getTheoryStructure()
  ]);
  if (!data) return;

  const completedKeys = data.completions || [];
  const completedSet = new Set(completedKeys);
  const isInstructor = currentUser && (currentUser.role === 'instructor' || currentUser.role === 'admin');

  let html = '';

  ['pp1', 'pp2'].forEach(level => {
    const levelText = level.toUpperCase();
    const sections = structure[level] || [];
    const totalForLevel = sections.reduce((sum, s) => sum + s.topics.length, 0);
    const completedForLevel = sections.reduce((sum, s) => sum + s.topics.filter(t => completedSet.has(t.key)).length, 0);

    html += `<h2>${levelText} (${completedForLevel}/${totalForLevel})</h2>`;

    sections.forEach(section => {
      const completedInSection = section.topics.filter(t => completedSet.has(t.key)).length;
      const totalInSection = section.topics.length;
      const percent = totalInSection > 0 ? Math.round((completedInSection / totalInSection) * 100) : 0;

      html += `
        <div style="border: 1px solid #dee2e6; border-radius: 8px; padding: 16px; margin-bottom: 12px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
            <h3 style="margin: 0;">${escapeHtml(section.title)}</h3>
            <div style="display: flex; gap: 8px; align-items: center;">
              <span style="color: #666; font-size: 0.8em;">${formatDuration(section.total_duration)}</span>
              <span style="background: ${percent === 100 ? '#28a745' : '#2E6DA4'}; color: #fff; padding: 2px 8px; border-radius: 4px; font-size: 0.85em;">${completedInSection}/${totalInSection} (${percent}%)</span>
            </div>
          </div>
      `;

      section.topics.forEach(topic => {
        const isCompleted = completedSet.has(topic.key);
        html += `
          <div style="margin: 6px 0; display: flex; align-items: center; gap: 8px;">
            ${isInstructor ? `
              <input type="checkbox" ${isCompleted ? 'checked' : ''}
                onchange="toggleTopic(${studentId}, '${topic.key}', this.checked)">
            ` : `
              <input type="checkbox" ${isCompleted ? 'checked' : ''} disabled>
            `}
            <span style="${isCompleted ? 'color: #28a745;' : ''}">${escapeHtml(topic.title)}</span>
            ${topic.duration_minutes ? `<span style="color: #999; font-size: 0.8em;">(${topic.duration_minutes} min)</span>` : ''}
            ${topic.comment ? `<span style="color: #999; font-size: 0.8em;" title="${escapeHtml(topic.comment)}">&#128712;</span>` : ''}
          </div>
        `;
      });

      html += '</div>';
    });
  });

  $('theory-content').innerHTML = html;
}

async function loadEquipmentTab(studentId) {
  const equipment = await api('GET', `/api/students/${studentId}/equipment`);
  if (!equipment) return;

  const isInstructor = currentUser && currentUser.role === 'instructor';
  const isStudent = currentUser && currentUser.role === 'student';
  const canEdit = isInstructor || (isStudent && currentUser.id == studentId);

  // Check if reserve pack date is older than 12 months
  let reserveWarning = '';
  if (equipment.reserve_pack_date) {
    const packDate = new Date(equipment.reserve_pack_date);
    const today = new Date();
    const monthsAgo = (today.getFullYear() - packDate.getFullYear()) * 12 + (today.getMonth() - packDate.getMonth());
    if (monthsAgo > 12) {
      reserveWarning = `<div style="background: #fff3cd; border: 1px solid #ffc107; color: #856404; padding: 12px; border-radius: 4px; margin-bottom: 16px;"><strong style="color: #dc3545;">⚠ Pakkaus yli 12 kk sitten!</strong> Varjon uudelleen pakkaus vaaditaan.</div>`;
    }
  }

  let html = `
    <h2>Kalusto</h2>
    ${reserveWarning}

    <form id="equipment-form" style="display: ${canEdit ? 'block' : 'none'};">
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px;">
        <!-- Wing -->
        <div style="border: 1px solid #dee2e6; border-radius: 8px; padding: 16px;">
          <h3 style="margin-top: 0;">Siipi</h3>
          <div style="margin-bottom: 12px;">
            <label>Valmistaja</label>
            <input type="text" class="equipment-field" data-field="wing_manufacturer" value="${escapeHtml(equipment.wing_manufacturer || '')}" style="width: 100%; padding: 8px; box-sizing: border-box; margin-top: 4px;">
          </div>
          <div style="margin-bottom: 12px;">
            <label>Malli</label>
            <input type="text" class="equipment-field" data-field="wing_model" value="${escapeHtml(equipment.wing_model || '')}" style="width: 100%; padding: 8px; box-sizing: border-box; margin-top: 4px;">
          </div>
          <div style="margin-bottom: 12px;">
            <label>Koko</label>
            <input type="text" class="equipment-field" data-field="wing_size" value="${escapeHtml(equipment.wing_size || '')}" style="width: 100%; padding: 8px; box-sizing: border-box; margin-top: 4px;">
          </div>
          <div style="margin-bottom: 12px;">
            <label>Valmistusvuosi</label>
            <input type="number" class="equipment-field" data-field="wing_year" value="${equipment.wing_year || ''}" style="width: 100%; padding: 8px; box-sizing: border-box; margin-top: 4px;">
          </div>
          <div style="margin-bottom: 0;">
            <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
              <input type="checkbox" class="equipment-field" data-field="wing_club_owned" ${equipment.wing_club_owned ? 'checked' : ''}>
              <span>Kerhon kalusto</span>
            </label>
          </div>
        </div>

        <!-- Harness -->
        <div style="border: 1px solid #dee2e6; border-radius: 8px; padding: 16px;">
          <h3 style="margin-top: 0;">Valjaat</h3>
          <div style="margin-bottom: 12px;">
            <label>Valmistaja</label>
            <input type="text" class="equipment-field" data-field="harness_manufacturer" value="${escapeHtml(equipment.harness_manufacturer || '')}" style="width: 100%; padding: 8px; box-sizing: border-box; margin-top: 4px;">
          </div>
          <div style="margin-bottom: 12px;">
            <label>Malli</label>
            <input type="text" class="equipment-field" data-field="harness_model" value="${escapeHtml(equipment.harness_model || '')}" style="width: 100%; padding: 8px; box-sizing: border-box; margin-top: 4px;">
          </div>
          <div style="margin-bottom: 0;">
            <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
              <input type="checkbox" class="equipment-field" data-field="harness_club_owned" ${equipment.harness_club_owned ? 'checked' : ''}>
              <span>Kerhon kalusto</span>
            </label>
          </div>
        </div>
      </div>

      <!-- Reserve Parachute -->
      <div style="border: 1px solid #dee2e6; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
        <h3 style="margin-top: 0;">Pelastusvarjo</h3>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
          <div>
            <label>Valmistaja</label>
            <input type="text" class="equipment-field" data-field="reserve_manufacturer" value="${escapeHtml(equipment.reserve_manufacturer || '')}" style="width: 100%; padding: 8px; box-sizing: border-box; margin-top: 4px;">
          </div>
          <div>
            <label>Malli</label>
            <input type="text" class="equipment-field" data-field="reserve_model" value="${escapeHtml(equipment.reserve_model || '')}" style="width: 100%; padding: 8px; box-sizing: border-box; margin-top: 4px;">
          </div>
          <div>
            <label>Koko</label>
            <input type="text" class="equipment-field" data-field="reserve_size" value="${escapeHtml(equipment.reserve_size || '')}" style="width: 100%; padding: 8px; box-sizing: border-box; margin-top: 4px;">
          </div>
          <div>
            <label>Pakkauspvm</label>
            <input type="date" class="equipment-field" data-field="reserve_pack_date" value="${equipment.reserve_pack_date || ''}" style="width: 100%; padding: 8px; box-sizing: border-box; margin-top: 4px;">
          </div>
          <div style="grid-column: 1 / -1;">
            <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
              <input type="checkbox" class="equipment-field" data-field="reserve_club_owned" ${equipment.reserve_club_owned ? 'checked' : ''}>
              <span>Kerhon kalusto</span>
            </label>
          </div>
        </div>
      </div>

      <div style="text-align: right;">
        <button type="submit" class="btn btn-primary">Tallenna kalusto</button>
      </div>
    </form>

    <div id="equipment-view" style="display: ${canEdit ? 'none' : 'block'};">
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px;">
        <div style="border: 1px solid #dee2e6; border-radius: 8px; padding: 16px;">
          <h3>Siipi</h3>
          <p><strong>Valmistaja:</strong> ${escapeHtml(equipment.wing_manufacturer || '-')}</p>
          <p><strong>Malli:</strong> ${escapeHtml(equipment.wing_model || '-')}</p>
          <p><strong>Koko:</strong> ${escapeHtml(equipment.wing_size || '-')}</p>
          <p><strong>Vuosi:</strong> ${equipment.wing_year || '-'}</p>
          <p><strong>Omistus:</strong> ${equipment.wing_club_owned ? 'Kerhon' : 'Henkilökohtainen'}</p>
        </div>
        <div style="border: 1px solid #dee2e6; border-radius: 8px; padding: 16px;">
          <h3>Valjaat</h3>
          <p><strong>Valmistaja:</strong> ${escapeHtml(equipment.harness_manufacturer || '-')}</p>
          <p><strong>Malli:</strong> ${escapeHtml(equipment.harness_model || '-')}</p>
          <p><strong>Omistus:</strong> ${equipment.harness_club_owned ? 'Kerhon' : 'Henkilökohtainen'}</p>
        </div>
      </div>
      <div style="border: 1px solid #dee2e6; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
        <h3>Pelastusvarjo</h3>
        <p><strong>Valmistaja:</strong> ${escapeHtml(equipment.reserve_manufacturer || '-')}</p>
        <p><strong>Malli:</strong> ${escapeHtml(equipment.reserve_model || '-')}</p>
        <p><strong>Koko:</strong> ${escapeHtml(equipment.reserve_size || '-')}</p>
        <p><strong>Pakkauspvm:</strong> ${formatDate(equipment.reserve_pack_date) || '-'}</p>
        <p><strong>Omistus:</strong> ${equipment.reserve_club_owned ? 'Kerhon' : 'Henkilökohtainen'}</p>
      </div>
    </div>
  `;

  $('equipment-content').innerHTML = html;

  // Attach form handler if editable
  if (canEdit) {
    const form = document.getElementById('equipment-form');
    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        await saveEquipment(studentId);
      });
    }
  }
}

async function saveEquipment(studentId) {
  const fields = document.querySelectorAll('.equipment-field');
  const data = {};

  fields.forEach(field => {
    const fieldName = field.getAttribute('data-field');
    if (field.type === 'checkbox') {
      data[fieldName] = field.checked;
    } else {
      data[fieldName] = field.value;
    }
  });

  const result = await api('PUT', `/api/students/${studentId}/equipment`, data);
  if (result) {
    showSuccess('Kalusto tallennettu');
    loadEquipmentTab(studentId);
  }
}

async function loadAttachmentsTab(studentId) {
  const data = await api('GET', `/api/students/${studentId}/attachments`);
  if (!data) return;

  const attachments = data.attachments || [];
  const isInstructor = currentUser && (currentUser.role === 'instructor' || currentUser.role === 'admin');
  const isStudent = currentUser && currentUser.role === 'student';

  let html = '';
  if (isInstructor || (isStudent && currentUser.id == studentId)) {
    html += `<button class="btn btn-primary" onclick="showUploadAttachmentModal(${studentId})" style="margin-bottom: 15px;">+ Lisää liite</button>`;
  }

  html += `
    <div style="overflow-x: auto;">
      <table style="width: 100%; border-collapse: collapse;">
        <thead>
          <tr style="background: #f8f9fa; text-align: left;">
            <th style="padding: 10px;">Tiedostonimi</th>
            <th style="padding: 10px;">Koko</th>
            <th style="padding: 10px;">Päivä</th>
            <th style="padding: 10px;">Toiminnot</th>
          </tr>
        </thead>
        <tbody>
  `;

  if (attachments.length > 0) {
    attachments.forEach(att => {
      const sizeKb = att.size_bytes ? (att.size_bytes / 1024).toFixed(1) : '?';
      html += `
        <tr style="border-bottom: 1px solid #dee2e6;">
          <td style="padding: 10px;">${escapeHtml(att.filename)}</td>
          <td style="padding: 10px;">${sizeKb} KB</td>
          <td style="padding: 10px;">${formatDate(att.created_at)}</td>
          <td style="padding: 10px;">
            <a href="/api/attachments/${att.id}/download" class="btn btn-small btn-primary">Lataa</a>
            ${isInstructor ? `<button class="btn btn-small btn-danger" onclick="deleteAttachmentConfirm(${att.id})">Poista</button>` : ''}
          </td>
        </tr>
      `;
    });
  } else {
    html += '<tr><td colspan="4" style="text-align: center; padding: 20px;">Ei liitteitä</td></tr>';
  }

  html += '</tbody></table></div>';
  $('attachments-content').innerHTML = html;
}

function loadNotesTab(studentId, student) {
  let html = `
    <h2>Oppilaan muistiinpanot</h2>
    <textarea id="student-notes" style="width: 100%; min-height: 200px; padding: 12px; border: 1px solid #dee2e6; border-radius: 4px; font-family: inherit; box-sizing: border-box;" placeholder="Kirjoita muistiinpanot tähän...">${escapeHtml(student.student_notes || '')}</textarea>
    <button class="btn btn-primary" style="margin-top: 10px;" onclick="saveStudentNotes(${studentId})">Tallenna</button>
  `;
  $('notes-content').innerHTML = html;
}

async function saveStudentNotes(studentId) {
  const notes = $('student-notes').value;
  const result = await api('PUT', `/api/students/${studentId}`, { student_notes: notes });
  if (result) showSuccess('Muistiinpanot tallennettu');
}

function showFlightModal(studentId) {
  const today = new Date().toISOString().split('T')[0];
  const html = `
    <form onsubmit="handleAddFlight(event, ${studentId})">
      <div class="form-group" style="margin-bottom: 12px;">
        <label>Päivä *</label>
        <input type="date" id="flight-date" value="${today}" required style="width: 100%; padding: 8px; box-sizing: border-box;">
      </div>
      <div class="form-group" style="margin-bottom: 12px;">
        <label>Paikka *</label>
        <select id="flight-site" required style="width: 100%; padding: 8px; box-sizing: border-box;">
          <option value="">Valitse paikka...</option>
        </select>
      </div>
      <div class="form-group" style="margin-bottom: 12px;">
        <label>Lentotyyppi *</label>
        <div style="display: flex; gap: 20px; margin-top: 4px;">
          <label><input type="radio" name="flight_type" value="low"> Matala</label>
          <label><input type="radio" name="flight_type" value="high" checked> Korkea</label>
        </div>
      </div>
      <div class="form-group" style="margin-bottom: 12px;">
        <label>Lentojen määrä *</label>
        <input type="number" id="flight-count" min="1" value="1" required style="width: 100%; padding: 8px; box-sizing: border-box;">
      </div>
      <div class="form-group" style="margin-bottom: 12px;">
        <label>Sää</label>
        <input type="text" id="flight-weather" placeholder="esim. Tuuli 15 km/h, selkeä" style="width: 100%; padding: 8px; box-sizing: border-box;">
      </div>
      <div class="form-group" style="margin-bottom: 12px;">
        <label>Harjoitukset</label>
        <input type="text" id="flight-exercises" placeholder="esim. Käännökset, kiivet" style="width: 100%; padding: 8px; box-sizing: border-box;">
      </div>
      <div class="form-group" style="margin-bottom: 12px;">
        <label>Muistiinpanot</label>
        <textarea id="flight-notes" placeholder="Vapaat muistiinpanot" style="width: 100%; padding: 8px; box-sizing: border-box; min-height: 60px;"></textarea>
      </div>
      <div class="form-group" style="margin-bottom: 12px;">
        <label><input type="checkbox" id="flight-approval"> Tarkistuslento</label>
      </div>
      <div style="margin-top: 20px; text-align: right;">
        <button type="button" class="btn btn-secondary" onclick="hideModal()">Peruuta</button>
        <button type="submit" class="btn btn-primary">Lisää lento</button>
      </div>
    </form>
  `;
  showModal('Lisää lento', html);
  loadSitesForSelect();
}

async function loadSitesForSelect() {
  const data = await api('GET', '/api/sites');
  if (!data) return;
  const select = $('flight-site');
  if (select) {
    (data.sites || []).forEach(site => {
      const option = document.createElement('option');
      option.value = site.id;
      option.textContent = site.name;
      select.appendChild(option);
    });
  }
}

async function handleAddFlight(event, studentId) {
  event.preventDefault();

  const date = $('flight-date').value;
  const site_id = parseInt($('flight-site').value);
  const flight_type = document.querySelector('input[name="flight_type"]:checked').value;
  const flight_count = parseInt($('flight-count').value);
  const weather = $('flight-weather').value.trim();
  const exercises = $('flight-exercises').value.trim();
  const notes = $('flight-notes').value.trim();
  const is_approval_flight = $('flight-approval').checked;

  if (!date || !site_id || !flight_type || flight_count < 1) {
    showError('Pakolliset kentät puuttuvat');
    return;
  }

  const result = await api('POST', `/api/students/${studentId}/flights`, {
    date, site_id, flight_type, flight_count, weather, exercises, notes, is_approval_flight
  });

  if (result) {
    hideModal();
    showSuccess('Lento lisätty');
    loadFlightsTab(studentId);
  }
}

function deleteFlightConfirm(flightId) {
  showConfirm('Haluatko varmasti poistaa tämän lennon?', () => deleteFlight(flightId));
}

async function deleteFlight(flightId) {
  const result = await api('DELETE', `/api/flights/${flightId}`);
  if (result) {
    showSuccess('Lento poistettu');
    if (currentStudentId) loadFlightsTab(currentStudentId);
  }
}

async function toggleTopic(studentId, topicKey, isChecked) {
  if (isChecked) {
    await api('POST', `/api/students/${studentId}/theory`, { topic_key: topicKey });
  } else {
    await api('DELETE', `/api/students/${studentId}/theory/${topicKey}`);
  }
}

function showUploadAttachmentModal(studentId) {
  const html = `
    <form onsubmit="handleUploadAttachment(event, ${studentId})">
      <div class="form-group" style="margin-bottom: 12px;">
        <label>Tiedosto * (PDF, JPG tai PNG, max 10 MB)</label>
        <input type="file" id="attachment-file" required accept=".pdf,.jpg,.jpeg,.png" style="margin-top: 4px;">
      </div>
      <div style="margin-top: 20px; text-align: right;">
        <button type="button" class="btn btn-secondary" onclick="hideModal()">Peruuta</button>
        <button type="submit" class="btn btn-primary">Lähetä</button>
      </div>
    </form>
  `;
  showModal('Lisää liite', html);
}

async function handleUploadAttachment(event, studentId) {
  event.preventDefault();
  const fileInput = $('attachment-file');
  if (!fileInput.files.length) { showError('Valitse tiedosto'); return; }

  const formData = new FormData();
  formData.append('file', fileInput.files[0]);

  try {
    const response = await fetch(`/api/students/${studentId}/attachments`, {
      method: 'POST',
      headers: csrfToken ? { 'X-CSRF-Token': csrfToken } : {},
      body: formData
    });
    if (response.status === 401) { currentUser = null; showLoginView(); return; }
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${response.status}`);
    }
    hideModal();
    showSuccess('Liite ladattu');
    loadAttachmentsTab(studentId);
  } catch (error) {
    showError('Virhe: ' + error.message);
  }
}

function deleteAttachmentConfirm(attachmentId) {
  showConfirm('Poista liite?', () => deleteAttachment(attachmentId));
}

async function deleteAttachment(attachmentId) {
  const result = await api('DELETE', `/api/attachments/${attachmentId}`);
  if (result) {
    showSuccess('Liite poistettu');
    if (currentStudentId) loadAttachmentsTab(currentStudentId);
  }
}

function showEditStudentModal(studentId) {
  // Load student data and show edit form
  api('GET', `/api/students/${studentId}`).then(student => {
    if (!student) return;
    const html = `
      <form onsubmit="handleEditStudent(event, ${studentId})">
        <div class="form-group" style="margin-bottom: 12px;">
          <label>Nimi *</label>
          <input type="text" id="edit-student-name" value="${escapeHtml(student.name)}" required style="width: 100%; padding: 8px; box-sizing: border-box;">
        </div>
        <div class="form-group" style="margin-bottom: 12px;">
          <label>Sähköposti *</label>
          <input type="email" id="edit-student-email" value="${escapeHtml(student.email)}" required style="width: 100%; padding: 8px; box-sizing: border-box;">
        </div>
        <div class="form-group" style="margin-bottom: 12px;">
          <label>Puhelin</label>
          <input type="tel" id="edit-student-phone" value="${escapeHtml(student.phone || '')}" style="width: 100%; padding: 8px; box-sizing: border-box;">
        </div>
        <div class="form-group" style="margin-bottom: 12px;">
          <label>Status</label>
          <select id="edit-student-status" style="width: 100%; padding: 8px; box-sizing: border-box;">
            <option value="ongoing" ${student.status === 'ongoing' ? 'selected' : ''}>Kesken</option>
            <option value="completed" ${student.status === 'completed' ? 'selected' : ''}>Valmis</option>
          </select>
        </div>
        <div class="form-group" style="margin-bottom: 12px;">
          <label><input type="checkbox" id="edit-student-pp2-exam" ${student.pp2_exam_passed ? 'checked' : ''} onchange="document.getElementById('edit-student-pp2-exam-date').disabled = !this.checked"> PP2-koe suoritettu</label>
        </div>
        <div class="form-group" style="margin-bottom: 12px;">
          <label>PP2-kokeen suorituspäivä</label>
          <input type="date" id="edit-student-pp2-exam-date" value="${student.pp2_exam_date || ''}" ${student.pp2_exam_passed ? '' : 'disabled'} style="width: 100%; padding: 8px; box-sizing: border-box;">
        </div>
        <div class="form-group" style="margin-bottom: 12px;">
          <label>Kurssin aloituspäivä</label>
          <input type="date" id="edit-student-course-started" value="${student.course_started || ''}" style="width: 100%; padding: 8px; box-sizing: border-box;">
        </div>
        <div style="margin-top: 20px; text-align: right;">
          <button type="button" class="btn btn-secondary" onclick="hideModal()">Peruuta</button>
          <button type="submit" class="btn btn-primary">Tallenna</button>
        </div>
      </form>
    `;
    showModal('Muokkaa oppilasta', html);
  });
}

async function handleEditStudent(event, studentId) {
  event.preventDefault();
  const result = await api('PUT', `/api/students/${studentId}`, {
    name: $('edit-student-name').value.trim(),
    email: $('edit-student-email').value.trim(),
    phone: $('edit-student-phone').value.trim(),
    status: $('edit-student-status').value,
    pp2_exam_passed: $('edit-student-pp2-exam').checked,
    pp2_exam_date: $('edit-student-pp2-exam').checked ? ($('edit-student-pp2-exam-date').value || null) : null,
    course_started: $('edit-student-course-started').value
  });
  if (result) {
    hideModal();
    showSuccess('Oppilas päivitetty');
    renderStudentDetail(studentId);
  }
}

// Admin password reset modal
function showResetPasswordModal(userId, userName) {
  const html = `
    <p>Nollaa salasana käyttäjälle <strong>${userName}</strong>.</p>
    <form onsubmit="handleResetPassword(event, ${userId})">
      <div class="form-group" style="margin-bottom: 12px;">
        <label>Uusi salasana *</label>
        <input type="password" id="reset-pw-new" minlength="8" required placeholder="Vähintään 8 merkkiä" style="width: 100%; padding: 8px; box-sizing: border-box;">
      </div>
      <div class="form-group" style="margin-bottom: 12px;">
        <label>Vahvista salasana *</label>
        <input type="password" id="reset-pw-confirm" minlength="8" required style="width: 100%; padding: 8px; box-sizing: border-box;">
      </div>
      <div style="margin-top: 20px; text-align: right;">
        <button type="button" class="btn btn-secondary" onclick="hideModal()">Peruuta</button>
        <button type="submit" class="btn btn-primary">Nollaa salasana</button>
      </div>
    </form>
  `;
  showModal('Nollaa salasana', html);
}

async function handleResetPassword(event, userId) {
  event.preventDefault();
  const newPw = $('reset-pw-new').value;
  const confirmPw = $('reset-pw-confirm').value;

  if (newPw !== confirmPw) {
    showError('Salasanat eivät täsmää');
    return;
  }
  if (newPw.length < 8) {
    showError('Salasanan pitää olla vähintään 8 merkkiä');
    return;
  }

  const result = await api('POST', '/api/admin/reset-password', {
    user_id: userId,
    new_password: newPw
  });

  if (result && result.success) {
    hideModal();
    showSuccess('Salasana nollattu onnistuneesti');
  }
}

// ============================================================================
// INSTRUCTORS VIEW
// ============================================================================

async function renderInstructors() {
  const mainContent = $('main-content');
  mainContent.innerHTML = '<p style="text-align: center; padding: 40px;">Ladataan...</p>';

  const data = await api('GET', '/api/instructors');
  if (!data) return;

  const instructors = data.instructors || [];
  const isAdmin = currentUser && currentUser.role === 'admin';
  const colCount = isAdmin ? 5 : 4;

  let html = `
    <div style="padding: 20px;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
        <h1>Ohjaajat</h1>
        <button class="btn btn-primary" onclick="showAddInstructorModal()">+ Lisää ohjaaja</button>
      </div>

      <div style="overflow-x: auto;">
        <table style="width: 100%; border-collapse: collapse;">
          <thead>
            <tr style="background: #f8f9fa; text-align: left;">
              <th style="padding: 10px;">Nimi</th>
              ${isAdmin ? '<th style="padding: 10px;">Kerho</th>' : ''}
              <th style="padding: 10px;">Sähköposti</th>
              <th style="padding: 10px;">Puhelin</th>
              <th style="padding: 10px;">Toiminnot</th>
            </tr>
          </thead>
          <tbody>
  `;

  instructors.forEach(instructor => {
    const isSelf = currentUser && currentUser.id === instructor.id;
    html += `
      <tr style="border-bottom: 1px solid #dee2e6;">
        <td style="padding: 10px;">${escapeHtml(instructor.name)}</td>
        ${isAdmin ? `<td style="padding: 10px;"><span style="background: #E8F0FE; color: #1a56db; padding: 2px 8px; border-radius: 4px; font-size: 0.85em;">${escapeHtml(instructor.club_name || 'Ei kerhoa')}</span></td>` : ''}
        <td style="padding: 10px;">${escapeHtml(instructor.email)}</td>
        <td style="padding: 10px;">${escapeHtml(instructor.phone || '-')}</td>
        <td style="padding: 10px;">
          ${isSelf ? '<span style="background: #2E6DA4; color: #fff; padding: 2px 8px; border-radius: 4px; font-size: 0.85em;">Sinä</span>' : `<button class="btn btn-small btn-danger" onclick="deleteInstructorConfirm(${instructor.id})">Poista</button>`}
        </td>
      </tr>
    `;
  });

  if (instructors.length === 0) {
    html += `<tr><td colspan="${colCount}" style="text-align: center; padding: 20px;">Ei ohjaajia</td></tr>`;
  }

  html += '</tbody></table></div></div>';
  mainContent.innerHTML = html;
}

async function showAddInstructorModal() {
  const isAdmin = currentUser && currentUser.role === 'admin';

  // Admin needs to pick a club
  let clubSelectHtml = '';
  if (isAdmin) {
    const clubData = await api('GET', '/api/clubs');
    const clubs = (clubData && clubData.clubs) || [];
    if (clubs.length === 0) {
      showError('Luo ensin kerho ennen ohjaajan lisäämistä');
      return;
    }
    clubSelectHtml = `
      <div class="form-group" style="margin-bottom: 12px;">
        <label>Kerho *</label>
        <select id="add-instr-club" required style="width: 100%; padding: 8px; box-sizing: border-box;">
          ${clubs.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('')}
        </select>
      </div>
    `;
  }

  const html = `
    <form onsubmit="handleAddInstructor(event)">
      ${clubSelectHtml}
      <div class="form-group" style="margin-bottom: 12px;">
        <label>Nimi *</label>
        <input type="text" id="add-instr-name" required style="width: 100%; padding: 8px; box-sizing: border-box;">
      </div>
      <div class="form-group" style="margin-bottom: 12px;">
        <label>Sähköposti *</label>
        <input type="email" id="add-instr-email" required style="width: 100%; padding: 8px; box-sizing: border-box;">
      </div>
      <div class="form-group" style="margin-bottom: 12px;">
        <label>Puhelin</label>
        <input type="tel" id="add-instr-phone" style="width: 100%; padding: 8px; box-sizing: border-box;">
      </div>
      <div class="form-group" style="margin-bottom: 12px;">
        <label>Käyttäjänimi *</label>
        <input type="text" id="add-instr-username" required style="width: 100%; padding: 8px; box-sizing: border-box;">
      </div>
      <div class="form-group" style="margin-bottom: 12px;">
        <label>Salasana (vähintään 8 merkkiä) *</label>
        <input type="password" id="add-instr-password" required minlength="8" style="width: 100%; padding: 8px; box-sizing: border-box;">
      </div>
      <div style="margin-top: 20px; text-align: right;">
        <button type="button" class="btn btn-secondary" onclick="hideModal()">Peruuta</button>
        <button type="submit" class="btn btn-primary">Lisää ohjaaja</button>
      </div>
    </form>
  `;
  showModal('Lisää ohjaaja', html);
}

async function handleAddInstructor(event) {
  event.preventDefault();
  const isAdmin = currentUser && currentUser.role === 'admin';
  const name = $('add-instr-name').value.trim();
  const email = $('add-instr-email').value.trim();
  const phone = $('add-instr-phone').value.trim();
  const username = $('add-instr-username').value.trim();
  const password = $('add-instr-password').value;
  const club_id = isAdmin ? $('add-instr-club').value : undefined;

  if (!name || !email || !username || !password) { showError('Pakolliset kentät puuttuvat'); return; }
  if (isAdmin && !club_id) { showError('Valitse kerho'); return; }
  if (password.length < 8) { showError('Salasanan on oltava vähintään 8 merkkiä'); return; }

  const payload = { name, email, phone, username, password };
  if (club_id) payload.club_id = club_id;

  const result = await api('POST', '/api/instructors', payload);
  if (result) {
    hideModal();
    showSuccess('Ohjaaja lisätty');
    renderInstructors();
  }
}

function deleteInstructorConfirm(instructorId) {
  showConfirm('Poista ohjaaja?', () => deleteInstructor(instructorId));
}

async function deleteInstructor(instructorId) {
  const result = await api('DELETE', `/api/instructors/${instructorId}`);
  if (result) {
    showSuccess('Ohjaaja poistettu');
    renderInstructors();
  }
}

// ============================================================================
// LESSONS VIEW
// ============================================================================

async function renderLessons() {
  const mainContent = $('main-content');
  mainContent.innerHTML = '<p style="text-align: center; padding: 40px;">Ladataan...</p>';

  const data = await api('GET', '/api/lessons');
  if (!data) return;

  const lessons = data.lessons || [];

  let html = `
    <div style="padding: 20px;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
        <h1>Oppitunnit</h1>
        <button class="btn btn-primary" onclick="showLessonForm()">+ Uusi oppitunti</button>
      </div>

      <div style="overflow-x: auto;">
        <table style="width: 100%; border-collapse: collapse;">
          <thead>
            <tr style="background: #f8f9fa; text-align: left;">
              <th style="padding: 10px;">Päivä</th>
              <th style="padding: 10px;">Aiheita</th>
              <th style="padding: 10px;">Oppilaita</th>
              <th style="padding: 10px;">Ohjaaja</th>
              <th style="padding: 10px;">Toiminnot</th>
            </tr>
          </thead>
          <tbody>
  `;

  if (lessons.length > 0) {
    lessons.forEach(lesson => {
      html += `
        <tr style="border-bottom: 1px solid #dee2e6; cursor: pointer;" onclick="window.location.hash='#lesson/${lesson.id}'">
          <td style="padding: 10px;">${formatDate(lesson.date)}</td>
          <td style="padding: 10px;">${lesson.topic_count || 0}</td>
          <td style="padding: 10px;">${lesson.student_count || 0}</td>
          <td style="padding: 10px;">${escapeHtml(lesson.instructor_name || '')}</td>
          <td style="padding: 10px;" onclick="event.stopPropagation()">
            <button class="btn btn-small btn-secondary" onclick="window.location.hash='#lesson/${lesson.id}'">Näytä</button>
            <button class="btn btn-small btn-danger" onclick="deleteLessonConfirm(${lesson.id})">Poista</button>
          </td>
        </tr>
      `;
    });
  } else {
    html += '<tr><td colspan="5" style="text-align: center; padding: 20px;">Ei oppitunteja</td></tr>';
  }

  html += '</tbody></table></div></div>';
  mainContent.innerHTML = html;
}

function showLessonForm() {
  const today = new Date().toISOString().split('T')[0];
  const html = `
    <form onsubmit="handleSaveLesson(event)">
      <div class="form-group" style="margin-bottom: 12px;">
        <label>Päivä *</label>
        <input type="date" id="lesson-date" value="${today}" required style="width: 100%; padding: 8px; box-sizing: border-box;">
      </div>

      <div class="form-group" style="margin-bottom: 12px;">
        <label>Muistiinpanot</label>
        <textarea id="lesson-notes" placeholder="Oppitunnin muistiinpanot..." style="width: 100%; padding: 8px; box-sizing: border-box; min-height: 60px;"></textarea>
      </div>

      <div class="form-group" style="margin-bottom: 12px;">
        <label>Aiheet</label>
        <div id="topics-container" style="max-height: 300px; overflow-y: auto; border: 1px solid #ddd; padding: 10px; border-radius: 4px;">
          Ladataan...
        </div>
      </div>

      <div class="form-group" style="margin-bottom: 12px;">
        <label>Oppilaat</label>
        <div id="students-container" style="max-height: 200px; overflow-y: auto; border: 1px solid #ddd; padding: 10px; border-radius: 4px;">
          Ladataan...
        </div>
      </div>

      <div style="margin-top: 20px; text-align: right;">
        <button type="button" class="btn btn-secondary" onclick="hideModal()">Peruuta</button>
        <button type="submit" class="btn btn-primary">Tallenna</button>
      </div>
    </form>
  `;
  showModal('Uusi oppitunti', html);
  populateLessonForm();
}

async function populateLessonForm() {
  // Populate topics from dynamic structure
  const structure = await getTheoryStructure();
  let topicsHtml = '';
  ['pp1', 'pp2'].forEach(level => {
    topicsHtml += `<h4 style="margin: 10px 0 5px 0;">${level.toUpperCase()}</h4>`;
    (structure[level] || []).forEach(section => {
      topicsHtml += `<div style="margin: 8px 0 4px 0;"><strong>${escapeHtml(section.title)}</strong></div>`;
      section.topics.forEach(topic => {
        topicsHtml += `
          <label style="display: block; margin-left: 10px; margin-bottom: 3px; cursor: pointer;">
            <input type="checkbox" class="topic-checkbox" value="${topic.key}">
            ${escapeHtml(topic.title)}
          </label>
        `;
      });
    });
  });
  $('topics-container').innerHTML = topicsHtml;

  // Populate students
  const studentData = await api('GET', '/api/students?status=ongoing');
  let studentsHtml = '';
  if (studentData && studentData.students) {
    studentData.students.forEach(student => {
      studentsHtml += `
        <label style="display: block; margin-bottom: 5px; cursor: pointer;">
          <input type="checkbox" class="student-checkbox" value="${student.id}">
          ${escapeHtml(student.name)}
        </label>
      `;
    });
  }
  if (!studentsHtml) studentsHtml = '<p style="color: #666;">Ei aktiivisia oppilaita</p>';
  $('students-container').innerHTML = studentsHtml;
}

async function handleSaveLesson(event) {
  event.preventDefault();

  const date = $('lesson-date').value;
  const notes = $('lesson-notes') ? $('lesson-notes').value.trim() : '';
  const topic_keys = Array.from(document.querySelectorAll('.topic-checkbox:checked')).map(cb => cb.value);
  const student_ids = Array.from(document.querySelectorAll('.student-checkbox:checked')).map(cb => parseInt(cb.value));

  if (!date) { showError('Päivä vaaditaan'); return; }

  const result = await api('POST', '/api/lessons', { date, notes, topic_keys, student_ids });
  if (result) {
    hideModal();
    showSuccess('Oppitunti tallennettu');
    renderLessons();
  }
}

function deleteLessonConfirm(lessonId) {
  showConfirm('Poista oppitunti?', () => deleteLesson(lessonId));
}

async function deleteLesson(lessonId) {
  const result = await api('DELETE', `/api/lessons/${lessonId}`);
  if (result) {
    showSuccess('Oppitunti poistettu');
    renderLessons();
  }
}

async function renderLessonDetail(id) {
  const mainContent = $('main-content');
  mainContent.innerHTML = '<p style="text-align: center; padding: 40px;">Ladataan...</p>';

  const data = await api('GET', `/api/lessons/${id}`);
  if (!data) return;

  const lesson = data.lesson || {};
  const studentNames = data.student_names || [];
  const topicKeys = data.topic_keys || [];

  const structure = await getTheoryStructure();
  const topicLabels = {};
  ['pp1', 'pp2'].forEach(level => {
    (structure[level] || []).forEach(section => {
      section.topics.forEach(topic => {
        topicLabels[topic.key] = `${level.toUpperCase()} – ${topic.title}`;
      });
    });
  });

  let html = `
    <div style="padding: 20px;">
      <button class="btn btn-secondary" onclick="window.location.hash='#lessons'" style="margin-bottom: 15px;">← Takaisin</button>

      <h1>Oppitunti ${formatDate(lesson.date)}</h1>
      <p><strong>Ohjaaja:</strong> ${escapeHtml(lesson.instructor_name || '')}</p>
      ${lesson.notes ? `<p><strong>Muistiinpanot:</strong> ${escapeHtml(lesson.notes)}</p>` : ''}

      <h2>Oppilaat (${studentNames.length})</h2>
      ${studentNames.length ? `<ul>${studentNames.map(n => `<li>${escapeHtml(n)}</li>`).join('')}</ul>` : '<p style="color:#666;">Ei merkittyjä oppilaita</p>'}

      <h2>Käsitellyt aiheet (${topicKeys.length})</h2>
      ${topicKeys.length ? `<ul>${topicKeys.map(k => `<li>${escapeHtml(topicLabels[k] || k)}</li>`).join('')}</ul>` : '<p style="color:#666;">Ei merkittyjä aiheita</p>'}
    </div>
  `;

  mainContent.innerHTML = html;
}

// ============================================================================
// SITES VIEW
// ============================================================================

async function renderSites() {
  const mainContent = $('main-content');
  mainContent.innerHTML = '<p style="text-align: center; padding: 40px;">Ladataan...</p>';

  const data = await api('GET', '/api/sites');
  if (!data) return;

  const sites = data.sites || [];

  const isStudent = currentUser && currentUser.role === 'student';

  let html = `
    <div style="padding: 20px;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
        <h1>Lentopaikat</h1>
        ${!isStudent ? '<button class="btn btn-primary" onclick="showAddSiteModal()">+ Lisää paikka</button>' : ''}
      </div>

      <div style="overflow-x: auto;">
        <table style="width: 100%; border-collapse: collapse;">
          <thead>
            <tr style="background: #f8f9fa; text-align: left;">
              <th style="padding: 10px;">Nimi</th>
              <th style="padding: 10px;">Kuvaus</th>
              ${!isStudent ? '<th style="padding: 10px;">Toiminnot</th>' : ''}
            </tr>
          </thead>
          <tbody>
  `;

  if (sites.length > 0) {
    sites.forEach(site => {
      html += `
        <tr style="border-bottom: 1px solid #dee2e6;">
          <td style="padding: 10px;">${escapeHtml(site.name)}</td>
          <td style="padding: 10px;">${escapeHtml(site.description || '')}</td>
          ${!isStudent ? `<td style="padding: 10px;">
            <button class="btn btn-small btn-secondary" onclick="showEditSiteModal(${site.id})">Muokkaa</button>
            <button class="btn btn-small btn-danger" onclick="deleteSiteConfirm(${site.id})">Poista</button>
          </td>` : ''}
        </tr>
      `;
    });
  } else {
    html += `<tr><td colspan="${isStudent ? 2 : 3}" style="text-align: center; padding: 20px;">Ei lentopaikkoja</td></tr>`;
  }

  html += '</tbody></table></div></div>';
  mainContent.innerHTML = html;
}

function showAddSiteModal() {
  const html = `
    <form onsubmit="handleAddSite(event)">
      <div class="form-group" style="margin-bottom: 12px;">
        <label>Nimi *</label>
        <input type="text" id="site-name" required style="width: 100%; padding: 8px; box-sizing: border-box;">
      </div>
      <div class="form-group" style="margin-bottom: 12px;">
        <label>Kuvaus</label>
        <textarea id="site-description" style="width: 100%; padding: 8px; box-sizing: border-box; min-height: 60px;"></textarea>
      </div>
      <div style="margin-top: 20px; text-align: right;">
        <button type="button" class="btn btn-secondary" onclick="hideModal()">Peruuta</button>
        <button type="submit" class="btn btn-primary">Lisää paikka</button>
      </div>
    </form>
  `;
  showModal('Lisää lentopaikka', html);
}

async function handleAddSite(event) {
  event.preventDefault();
  const name = $('site-name').value.trim();
  const description = $('site-description').value.trim();
  if (!name) { showError('Nimi vaaditaan'); return; }

  const result = await api('POST', '/api/sites', { name, description });
  if (result) {
    hideModal();
    showSuccess('Paikka lisätty');
    renderSites();
  }
}

function showEditSiteModal(siteId) {
  // Load current site data first
  api('GET', '/api/sites').then(data => {
    if (!data) return;
    const site = (data.sites || []).find(s => s.id === siteId);
    if (!site) { showError('Paikkaa ei löydy'); return; }

    const html = `
      <form onsubmit="handleEditSite(event, ${siteId})">
        <div class="form-group" style="margin-bottom: 12px;">
          <label>Nimi *</label>
          <input type="text" id="edit-site-name" value="${escapeHtml(site.name)}" required style="width: 100%; padding: 8px; box-sizing: border-box;">
        </div>
        <div class="form-group" style="margin-bottom: 12px;">
          <label>Kuvaus</label>
          <textarea id="edit-site-description" style="width: 100%; padding: 8px; box-sizing: border-box; min-height: 60px;">${escapeHtml(site.description || '')}</textarea>
        </div>
        <div style="margin-top: 20px; text-align: right;">
          <button type="button" class="btn btn-secondary" onclick="hideModal()">Peruuta</button>
          <button type="submit" class="btn btn-primary">Tallenna</button>
        </div>
      </form>
    `;
    showModal('Muokkaa lentopaikkaa', html);
  });
}

async function handleEditSite(event, siteId) {
  event.preventDefault();
  const name = $('edit-site-name').value.trim();
  const description = $('edit-site-description').value.trim();
  if (!name) { showError('Nimi vaaditaan'); return; }

  const result = await api('PUT', `/api/sites/${siteId}`, { name, description });
  if (result) {
    hideModal();
    showSuccess('Paikka päivitetty');
    renderSites();
  }
}

function deleteSiteConfirm(siteId) {
  showConfirm('Poista paikka? Paikka voidaan poistaa vain jos sille ei ole kirjattu lentoja.', () => deleteSite(siteId));
}

async function deleteSite(siteId) {
  const result = await api('DELETE', `/api/sites/${siteId}`);
  if (result) {
    showSuccess('Paikka poistettu');
    renderSites();
  }
}

// ============================================================================
// THEORY MANAGEMENT VIEW
// ============================================================================

async function renderTheoryManagement() {
  const mainContent = $('main-content');
  mainContent.innerHTML = '<p style="text-align: center; padding: 40px;">Ladataan...</p>';

  const structure = await getTheoryStructure(true); // force refresh
  if (!structure) return;

  const isAdmin = currentUser && currentUser.role === 'admin';

  let html = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
      <h1 style="margin: 0;">Teoriaopinnot${isAdmin ? ' — hallinta' : ''}</h1>
    </div>
  `;

  ['pp1', 'pp2'].forEach(level => {
    const sections = structure[level] || [];
    const totalTopics = sections.reduce((sum, s) => sum + s.topics.length, 0);
    const totalDuration = sections.reduce((sum, s) => sum + (s.total_duration || 0), 0);

    html += `
      <div style="margin-bottom: 30px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
          <h2 style="margin: 0;">${level.toUpperCase()} <span style="color: #666; font-size: 0.7em; font-weight: normal;">${totalTopics} aihetta, ${formatDuration(totalDuration)}</span></h2>
          ${isAdmin ? `<button class="btn btn-primary" onclick="showAddSectionModal('${level}')" style="font-size: 0.9em;">+ Lisää aihealue</button>` : ''}
        </div>
    `;

    if (sections.length === 0) {
      html += '<p style="color: #666;">Ei aihealueita</p>';
    }

    sections.forEach(section => {
      html += `
        <div style="border: 1px solid #dee2e6; border-radius: 8px; margin-bottom: 12px; overflow: hidden;" id="section-${section.id}">
          <div style="background: #f8f9fa; padding: 12px 16px; display: flex; justify-content: space-between; align-items: center;">
            <div>
              <strong style="font-size: 1.1em;">${escapeHtml(section.title)}</strong>
              <span style="color: #666; margin-left: 10px; font-size: 0.85em;">${section.topics.length} aihetta, ${formatDuration(section.total_duration)}</span>
            </div>
            ${isAdmin ? `<div style="display: flex; gap: 6px;">
              <button class="btn btn-sm" onclick="showEditSectionModal(${section.id}, '${escapeHtml(section.title)}')" style="padding: 4px 10px; font-size: 0.85em; background: #6c757d; color: #fff; border: none; border-radius: 4px; cursor: pointer;">Muokkaa</button>
              <button class="btn btn-sm" onclick="deleteSection(${section.id})" style="padding: 4px 10px; font-size: 0.85em; background: #dc3545; color: #fff; border: none; border-radius: 4px; cursor: pointer;">Poista</button>
              <button class="btn btn-sm" onclick="showAddTopicModal(${section.id}, '${level}')" style="padding: 4px 10px; font-size: 0.85em; background: #2E6DA4; color: #fff; border: none; border-radius: 4px; cursor: pointer;">+ Aihe</button>
            </div>` : ''}
          </div>
          <div style="padding: 8px 16px;">
      `;

      if (section.topics.length === 0) {
        html += '<p style="color: #999; margin: 8px 0;">Ei aiheita</p>';
      }

      section.topics.forEach(topic => {
        html += `
          <div style="display: flex; justify-content: space-between; align-items: center; padding: 6px 0; border-bottom: 1px solid #eee;">
            <div style="flex: 1;">
              <span>${escapeHtml(topic.title)}</span>
              <span style="color: #999; font-size: 0.85em; margin-left: 8px;">${topic.duration_minutes} min</span>
              ${topic.comment ? `<span style="color: #2E6DA4; font-size: 0.85em; margin-left: 8px;" title="${escapeHtml(topic.comment)}">&#128712; ${escapeHtml(topic.comment.length > 40 ? topic.comment.substring(0, 40) + '...' : topic.comment)}</span>` : ''}
            </div>
            ${isAdmin ? `<div style="display: flex; gap: 6px; flex-shrink: 0;">
              <button onclick="showEditTopicModal(${topic.id})" style="padding: 2px 8px; font-size: 0.8em; background: #6c757d; color: #fff; border: none; border-radius: 3px; cursor: pointer;">Muokkaa</button>
              <button onclick="deleteTopic(${topic.id})" style="padding: 2px 8px; font-size: 0.8em; background: #dc3545; color: #fff; border: none; border-radius: 3px; cursor: pointer;">Poista</button>
            </div>` : ''}
          </div>
        `;
      });

      html += '</div></div>';
    });

    html += '</div>';
  });

  mainContent.innerHTML = html;
}

// --- Theory Section CRUD ---

function showAddSectionModal(level) {
  const html = `
    <form onsubmit="handleSaveSection(event, '${level}')">
      <div class="form-group" style="margin-bottom: 12px;">
        <label><strong>Avain (key)</strong> <span style="color: #999; font-size: 0.85em;">esim. aero, weather</span></label>
        <input type="text" id="section-key" required pattern="[a-z_]+" title="Vain pieniä kirjaimia ja alaviivoja"
          style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px; box-sizing: border-box;">
      </div>
      <div class="form-group" style="margin-bottom: 12px;">
        <label><strong>Nimi</strong></label>
        <input type="text" id="section-title" required
          style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px; box-sizing: border-box;">
      </div>
      <div style="text-align: right; margin-top: 16px;">
        <button type="button" class="btn btn-secondary" onclick="hideModal()">Peruuta</button>
        <button type="submit" class="btn btn-primary">Tallenna</button>
      </div>
    </form>
  `;
  showModal(`Lisää aihealue (${level.toUpperCase()})`, html);
}

async function handleSaveSection(event, level) {
  event.preventDefault();
  const key = $('section-key').value.trim();
  const title = $('section-title').value.trim();
  if (!key || !title) return;

  const result = await api('POST', '/api/theory/sections', { level, key, title });
  if (result) {
    hideModal();
    showSuccess('Aihealue lisätty');
    theoryStructureCache = null;
    renderTheoryManagement();
  }
}

function showEditSectionModal(sectionId, currentTitle) {
  const html = `
    <form onsubmit="handleUpdateSection(event, ${sectionId})">
      <div class="form-group" style="margin-bottom: 12px;">
        <label><strong>Nimi</strong></label>
        <input type="text" id="section-title" required value="${escapeHtml(currentTitle)}"
          style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px; box-sizing: border-box;">
      </div>
      <div style="text-align: right; margin-top: 16px;">
        <button type="button" class="btn btn-secondary" onclick="hideModal()">Peruuta</button>
        <button type="submit" class="btn btn-primary">Tallenna</button>
      </div>
    </form>
  `;
  showModal('Muokkaa aihealuetta', html);
}

async function handleUpdateSection(event, sectionId) {
  event.preventDefault();
  const title = $('section-title').value.trim();
  if (!title) return;

  const result = await api('PUT', `/api/theory/sections/${sectionId}`, { title });
  if (result) {
    hideModal();
    showSuccess('Aihealue päivitetty');
    theoryStructureCache = null;
    renderTheoryManagement();
  }
}

async function deleteSection(sectionId) {
  if (!confirm('Poistetaanko aihealue? Aihealueella ei saa olla aiheita.')) return;
  const result = await api('DELETE', `/api/theory/sections/${sectionId}`);
  if (result) {
    showSuccess('Aihealue poistettu');
    theoryStructureCache = null;
    renderTheoryManagement();
  }
}

// --- Theory Topic CRUD ---

function showAddTopicModal(sectionId, level) {
  const html = `
    <form onsubmit="handleSaveTopic(event, ${sectionId}, '${level}')">
      <div class="form-group" style="margin-bottom: 12px;">
        <label><strong>Avain (key)</strong> <span style="color: #999; font-size: 0.85em;">esim. ${level}_aero_1</span></label>
        <input type="text" id="topic-key" required pattern="[a-z0-9_]+" title="Vain pieniä kirjaimia, numeroita ja alaviivoja"
          style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px; box-sizing: border-box;">
      </div>
      <div class="form-group" style="margin-bottom: 12px;">
        <label><strong>Otsikko</strong></label>
        <input type="text" id="topic-title" required
          style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px; box-sizing: border-box;">
      </div>
      <div class="form-group" style="margin-bottom: 12px;">
        <label><strong>Kesto (minuuttia)</strong></label>
        <input type="number" id="topic-duration" value="45" min="0" max="999"
          style="width: 120px; padding: 8px; border: 1px solid #ccc; border-radius: 4px;">
      </div>
      <div class="form-group" style="margin-bottom: 12px;">
        <label><strong>Kommentti</strong> <span style="color: #999; font-size: 0.85em;">esim. viittaus koulutusoppaaseen</span></label>
        <textarea id="topic-comment" rows="3"
          style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px; box-sizing: border-box;"></textarea>
      </div>
      <div style="text-align: right; margin-top: 16px;">
        <button type="button" class="btn btn-secondary" onclick="hideModal()">Peruuta</button>
        <button type="submit" class="btn btn-primary">Tallenna</button>
      </div>
    </form>
  `;
  showModal('Lisää aihe', html);
}

async function handleSaveTopic(event, sectionId, level) {
  event.preventDefault();
  const key = $('topic-key').value.trim();
  const title = $('topic-title').value.trim();
  const duration_minutes = parseInt($('topic-duration').value) || 45;
  const comment = $('topic-comment').value.trim() || null;

  if (!key || !title) return;

  const result = await api('POST', `/api/theory/sections/${sectionId}/topics`, {
    key, title, duration_minutes, comment
  });
  if (result) {
    hideModal();
    showSuccess('Aihe lisätty');
    theoryStructureCache = null;
    renderTheoryManagement();
  }
}

async function showEditTopicModal(topicId) {
  // Find topic from cache
  const structure = await getTheoryStructure();
  let topic = null;
  for (const level of ['pp1', 'pp2']) {
    for (const section of (structure[level] || [])) {
      const found = section.topics.find(t => t.id === topicId);
      if (found) { topic = found; break; }
    }
    if (topic) break;
  }
  if (!topic) { showError('Aihetta ei löytynyt'); return; }

  const html = `
    <form onsubmit="handleUpdateTopic(event, ${topicId})">
      <div class="form-group" style="margin-bottom: 12px;">
        <label><strong>Avain</strong></label>
        <input type="text" value="${escapeHtml(topic.key)}" disabled
          style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px; box-sizing: border-box; background: #f5f5f5;">
        <small style="color: #999;">Avainta ei voi muuttaa (käytetään suorituksissa)</small>
      </div>
      <div class="form-group" style="margin-bottom: 12px;">
        <label><strong>Otsikko</strong></label>
        <input type="text" id="topic-title" required value="${escapeHtml(topic.title)}"
          style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px; box-sizing: border-box;">
      </div>
      <div class="form-group" style="margin-bottom: 12px;">
        <label><strong>Kesto (minuuttia)</strong></label>
        <input type="number" id="topic-duration" value="${topic.duration_minutes || 45}" min="0" max="999"
          style="width: 120px; padding: 8px; border: 1px solid #ccc; border-radius: 4px;">
      </div>
      <div class="form-group" style="margin-bottom: 12px;">
        <label><strong>Kommentti</strong></label>
        <textarea id="topic-comment" rows="3"
          style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px; box-sizing: border-box;">${escapeHtml(topic.comment || '')}</textarea>
      </div>
      <div style="text-align: right; margin-top: 16px;">
        <button type="button" class="btn btn-secondary" onclick="hideModal()">Peruuta</button>
        <button type="submit" class="btn btn-primary">Tallenna</button>
      </div>
    </form>
  `;
  showModal('Muokkaa aihetta', html);
}

async function handleUpdateTopic(event, topicId) {
  event.preventDefault();
  const title = $('topic-title').value.trim();
  const duration_minutes = parseInt($('topic-duration').value) || 45;
  const comment = $('topic-comment').value.trim() || null;

  if (!title) return;

  const result = await api('PUT', `/api/theory/topics/${topicId}`, {
    title, duration_minutes, comment
  });
  if (result) {
    hideModal();
    showSuccess('Aihe päivitetty');
    theoryStructureCache = null;
    renderTheoryManagement();
  }
}

async function deleteTopic(topicId) {
  if (!confirm('Poistetaanko aihe? Aiheella ei saa olla suorituksia.')) return;
  const result = await api('DELETE', `/api/theory/topics/${topicId}`);
  if (result) {
    showSuccess('Aihe poistettu');
    theoryStructureCache = null;
    renderTheoryManagement();
  }
}

// ============================================================================
// AUDIT LOG VIEW
// ============================================================================

async function renderAuditLog() {
  const mainContent = $('main-content');
  mainContent.innerHTML = '<p style="text-align: center; padding: 40px;">Ladataan...</p>';

  const data = await api('GET', '/api/audit-log');
  if (!data) return;

  const events = data.events || [];

  let html = `
    <div style="padding: 20px;">
      <h1>Tapahtumaloki</h1>

      <div style="overflow-x: auto;">
        <table style="width: 100%; border-collapse: collapse;">
          <thead>
            <tr style="background: #f8f9fa; text-align: left;">
              <th style="padding: 10px;">Aika</th>
              <th style="padding: 10px;">Käyttäjä</th>
              <th style="padding: 10px;">Toiminto</th>
              <th style="padding: 10px;">Kohde</th>
              <th style="padding: 10px;">Tiedot</th>
            </tr>
          </thead>
          <tbody>
  `;

  if (events.length > 0) {
    events.forEach(event => {
      html += `
        <tr style="border-bottom: 1px solid #dee2e6;">
          <td style="padding: 10px;">${formatDateTime(event.timestamp)}</td>
          <td style="padding: 10px;">${escapeHtml(event.user_name || 'Järjestelmä')}</td>
          <td style="padding: 10px;">${escapeHtml(event.action)}</td>
          <td style="padding: 10px;">${escapeHtml(event.entity_type)}</td>
          <td style="padding: 10px;">${escapeHtml(event.details || '')}</td>
        </tr>
      `;
    });
  } else {
    html += '<tr><td colspan="5" style="text-align: center; padding: 20px;">Ei tapahtumia</td></tr>';
  }

  html += '</tbody></table></div></div>';
  mainContent.innerHTML = html;
}

// ============================================================================
// CLUBS VIEW (Admin only)
// ============================================================================

async function renderClubs() {
  const mainContent = $('main-content');
  mainContent.innerHTML = '<p style="text-align: center; padding: 40px;">Ladataan...</p>';

  const data = await api('GET', '/api/clubs');
  if (!data) return;

  const clubs = data.clubs || [];

  let html = `
    <div style="padding: 20px;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
        <h1>Kerhot</h1>
        <button class="btn btn-primary" onclick="showCreateClubModal()">+ Uusi kerho</button>
      </div>

      <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(350px, 1fr)); gap: 16px;">
  `;

  if (clubs.length > 0) {
    clubs.forEach(club => {
      const statusBg = club.is_active ? '#28a745' : '#6c757d';
      const statusText = club.is_active ? 'Aktiivinen' : 'Poistettava';
      html += `
        <div style="border: 1px solid #dee2e6; border-radius: 8px; padding: 16px; background: #fff;">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
            <div>
              <h3 style="margin: 0 0 4px 0;">${escapeHtml(club.name)}</h3>
              <p style="margin: 0; color: #666; font-size: 0.9em;">slug: ${escapeHtml(club.slug)}</p>
            </div>
            <span style="background: ${statusBg}; color: #fff; padding: 4px 8px; border-radius: 4px; font-size: 0.85em;">${statusText}</span>
          </div>
          <p style="margin: 8px 0; color: #555; line-height: 1.4;">${escapeHtml(club.description || '-')}</p>
          <div style="display: flex; gap: 8px; margin-top: 12px;">
            <button class="btn btn-small btn-secondary" onclick="loadClubStats(${club.id})">Tilastot</button>
            <button class="btn btn-small btn-secondary" onclick="showEditClubModal(${club.id})">Muokkaa</button>
          </div>
        </div>
      `;
    });
  } else {
    html += '<p style="grid-column: 1 / -1; text-align: center; padding: 40px; color: #999;">Ei kerhoja vielä</p>';
  }

  html += '</div></div>';
  mainContent.innerHTML = html;
}

function showCreateClubModal() {
  const html = `
    <form onsubmit="handleCreateClub(event)">
      <div style="margin-bottom: 16px;">
        <h3>Kerhon tiedot</h3>
      </div>
      <div class="form-group" style="margin-bottom: 12px;">
        <label>Kerhon nimi *</label>
        <input type="text" id="club-name" required style="width: 100%; padding: 8px; box-sizing: border-box;">
      </div>
      <div class="form-group" style="margin-bottom: 12px;">
        <label>Slug (URL-ystävällinen) *</label>
        <input type="text" id="club-slug" required style="width: 100%; padding: 8px; box-sizing: border-box;">
      </div>
      <div class="form-group" style="margin-bottom: 20px;">
        <label>Kuvaus</label>
        <textarea id="club-description" style="width: 100%; padding: 8px; box-sizing: border-box; min-height: 60px;"></textarea>
      </div>

      <div style="margin-bottom: 16px;">
        <h3>Ensimmäinen ohjaaja</h3>
      </div>
      <div class="form-group" style="margin-bottom: 12px;">
        <label>Ohjaajan nimi *</label>
        <input type="text" id="instructor-name" required style="width: 100%; padding: 8px; box-sizing: border-box;">
      </div>
      <div class="form-group" style="margin-bottom: 12px;">
        <label>Sähköposti *</label>
        <input type="email" id="instructor-email" required style="width: 100%; padding: 8px; box-sizing: border-box;">
      </div>
      <div class="form-group" style="margin-bottom: 12px;">
        <label>Käyttäjänimi *</label>
        <input type="text" id="instructor-username" required style="width: 100%; padding: 8px; box-sizing: border-box;">
      </div>
      <div class="form-group" style="margin-bottom: 20px;">
        <label>Salasana *</label>
        <input type="password" id="instructor-password" required minlength="8" style="width: 100%; padding: 8px; box-sizing: border-box;">
      </div>

      <div style="text-align: right;">
        <button type="button" class="btn btn-secondary" onclick="hideModal()">Peruuta</button>
        <button type="submit" class="btn btn-primary">Luo kerho</button>
      </div>
    </form>
  `;
  showModal('Uusi kerho', html);
}

async function handleCreateClub(event) {
  event.preventDefault();
  const club_name = $('club-name').value.trim();
  const club_slug = $('club-slug').value.trim();
  const club_description = $('club-description').value.trim();
  const instructor_name = $('instructor-name').value.trim();
  const instructor_email = $('instructor-email').value.trim();
  const instructor_username = $('instructor-username').value.trim();
  const instructor_password = $('instructor-password').value;

  if (!club_name || !club_slug || !instructor_name || !instructor_email || !instructor_username || !instructor_password) {
    showError('Kaikki pakolliset kentät vaaditaan');
    return;
  }

  const result = await api('POST', '/api/clubs', {
    club_name, club_slug, club_description, instructor_name, instructor_email, instructor_username, instructor_password
  });
  if (result) {
    hideModal();
    showSuccess('Kerho luotu');
    renderClubs();
  }
}

async function loadClubStats(clubId) {
  const data = await api('GET', `/api/clubs/${clubId}/stats`);
  if (!data) return;

  const club = data.club || {};
  const stats = data.stats || {};

  const html = `
    <div style="text-align: center;">
      <h2>${escapeHtml(club.name)}</h2>
      <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; margin: 20px 0;">
        <div style="background: #f8f9fa; padding: 16px; border-radius: 8px;">
          <div style="font-size: 1.8em; font-weight: bold; color: #2E6DA4;">${stats.students || 0}</div>
          <div>Oppilaita</div>
        </div>
        <div style="background: #f8f9fa; padding: 16px; border-radius: 8px;">
          <div style="font-size: 1.8em; font-weight: bold; color: #2E6DA4;">${stats.instructors || 0}</div>
          <div>Ohjaajia</div>
        </div>
        <div style="background: #f8f9fa; padding: 16px; border-radius: 8px;">
          <div style="font-size: 1.8em; font-weight: bold; color: #2E6DA4;">${stats.sites || 0}</div>
          <div>Lentopaikka</div>
        </div>
        <div style="background: #f8f9fa; padding: 16px; border-radius: 8px;">
          <div style="font-size: 1.8em; font-weight: bold; color: #2E6DA4;">${stats.flights || 0}</div>
          <div>Lentoja</div>
        </div>
      </div>
    </div>
  `;
  showModal('Kerhon tilastot', html);
}

async function showEditClubModal(clubId) {
  const data = await api('GET', `/api/clubs/${clubId}/stats`);
  if (!data) return;

  const club = data.club || {};
  const html = `
    <form onsubmit="handleUpdateClub(event, ${clubId})">
      <div class="form-group" style="margin-bottom: 12px;">
        <label>Nimi</label>
        <input type="text" id="club-name" value="${escapeHtml(club.name)}" style="width: 100%; padding: 8px; box-sizing: border-box;">
      </div>
      <div class="form-group" style="margin-bottom: 12px;">
        <label>Slug</label>
        <input type="text" id="club-slug" value="${escapeHtml(club.slug)}" style="width: 100%; padding: 8px; box-sizing: border-box;">
      </div>
      <div class="form-group" style="margin-bottom: 12px;">
        <label>Kuvaus</label>
        <textarea id="club-description" style="width: 100%; padding: 8px; box-sizing: border-box; min-height: 60px;">${escapeHtml(club.description || '')}</textarea>
      </div>
      <div class="form-group" style="margin-bottom: 20px;">
        <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
          <input type="checkbox" id="club-active" ${club.is_active ? 'checked' : ''}>
          <span>Aktiivinen</span>
        </label>
      </div>
      <div style="text-align: right;">
        <button type="button" class="btn btn-secondary" onclick="hideModal()">Peruuta</button>
        <button type="submit" class="btn btn-primary">Tallenna</button>
      </div>
    </form>
  `;
  showModal('Muokkaa kerhoa', html);
}

async function handleUpdateClub(event, clubId) {
  event.preventDefault();
  const name = $('club-name').value.trim();
  const slug = $('club-slug').value.trim();
  const description = $('club-description').value.trim();
  const is_active = $('club-active').checked;

  const result = await api('PUT', `/api/clubs/${clubId}`, { name, slug, description, is_active });
  if (result) {
    hideModal();
    showSuccess('Kerho tallennettu');
    renderClubs();
  }
}

// ============================================================================
// INITIALIZATION
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
  // Login form
  const loginForm = $('login-form');
  if (loginForm) {
    loginForm.addEventListener('submit', (e) => {
      e.preventDefault();
      handleLogin();
    });
  }

  // Forgot password link
  const forgotLink = $('forgot-password-link');
  if (forgotLink) {
    forgotLink.addEventListener('click', (e) => {
      e.preventDefault();
      $('login-view').style.display = 'none';
      $('forgot-password-view').style.display = 'block';
    });
  }

  // Back to login link
  const backLink = $('back-to-login-link');
  if (backLink) {
    backLink.addEventListener('click', (e) => {
      e.preventDefault();
      showLoginView();
    });
  }

  // Forgot password form
  const forgotForm = $('forgot-password-form');
  if (forgotForm) {
    forgotForm.addEventListener('submit', (e) => {
      e.preventDefault();
      handleResetRequest();
    });
  }

  // Logout button
  const logoutBtn = $('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', handleLogout);
  }

  // Initialize app
  init();
});
