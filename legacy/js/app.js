/* ===================================================
   TETOMI - app.js  (共通ユーティリティ)
   =================================================== */

// =================== AUTH ===================
const AUTH_KEY = 'tetomi_user';

function getUser() {
  try { return JSON.parse(localStorage.getItem(AUTH_KEY)); } catch { return null; }
}
function setUser(user) {
  localStorage.setItem(AUTH_KEY, JSON.stringify(user));
}
function clearUser() {
  localStorage.removeItem(AUTH_KEY);
}
function isLoggedIn() { return !!getUser(); }

// =================== NAV STATE ===================
function updateNavUI() {
  const user = getUser();
  const loginBtn = document.getElementById('navLoginBtn');
  const avatar = document.getElementById('navAvatar');
  const nameEl = document.getElementById('navUserName');
  if (!loginBtn || !avatar) return;
  if (user) {
    loginBtn.classList.add('hidden');
    avatar.classList.remove('hidden');
    if (nameEl) nameEl.textContent = user.name;
  } else {
    loginBtn.classList.remove('hidden');
    avatar.classList.add('hidden');
  }
}

// =================== LOGIN ===================
async function handleLogin(e) {
  e.preventDefault();
  const name       = document.getElementById('loginName').value.trim();
  const email      = document.getElementById('loginEmail').value.trim();
  const university = document.getElementById('loginUniversity').value.trim();
  const faculty    = document.getElementById('loginFaculty').value.trim();
  const grade      = document.getElementById('loginGrade').value;

  if (!name || !email) { showToast('名前とメールアドレスを入力してください', 'error'); return; }

  // 既存ユーザー検索
  try {
    const res  = await fetch(`tables/users?search=${encodeURIComponent(email)}&limit=5`);
    const data = await res.json();
    const found = data.data.find(u => u.email === email);

    if (found) {
      setUser(found);
      showToast(`おかえりなさい、${found.name}さん！`, 'success');
    } else {
      // 新規作成
      const payload = { name, email, university, faculty, grade, rating: 5, rating_count: 0 };
      const cRes    = await fetch('tables/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const created = await cRes.json();
      setUser(created);
      showToast(`登録完了！ようこそ ${created.name} さん`, 'success');
    }
    closeModal('loginModal');
    updateNavUI();
    setTimeout(() => location.reload(), 800);
  } catch(err) {
    console.error(err);
    showToast('ログインに失敗しました', 'error');
  }
}

async function loginAsDemo(userId) {
  try {
    const res  = await fetch(`tables/users/${userId}`);
    if (!res.ok) throw new Error();
    const user = await res.json();
    setUser(user);
    showToast(`${user.name} としてログインしました`, 'success');
    closeModal('loginModal');
    updateNavUI();
    setTimeout(() => location.reload(), 800);
  } catch {
    showToast('デモログインに失敗しました', 'error');
  }
}

function handleLogout() {
  clearUser();
  showToast('ログアウトしました');
  updateNavUI();
  setTimeout(() => location.href = 'index.html', 600);
}

// =================== MODAL ===================
function openModal(id) {
  const el = document.getElementById(id);
  if (el) { el.classList.remove('hidden'); document.body.style.overflow = 'hidden'; }
}
function closeModal(id) {
  const el = document.getElementById(id);
  if (el) { el.classList.add('hidden'); document.body.style.overflow = ''; }
}
// click outside
document.addEventListener('click', e => {
  if (e.target.classList.contains('modal-overlay')) {
    e.target.classList.add('hidden');
    document.body.style.overflow = '';
  }
});

// =================== TOAST ===================
let toastTimer;
function showToast(msg, type = '') {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.className   = 'toast' + (type ? ' ' + type : '');
  t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), 3200);
}

// =================== HAMBURGER ===================
function toggleMenu() {
  const links = document.getElementById('navLinks');
  if (links) links.classList.toggle('open');
}

// =================== SCROLL NAVBAR ===================
window.addEventListener('scroll', () => {
  const nb = document.getElementById('navbar');
  if (nb) nb.classList.toggle('scrolled', window.scrollY > 10);
});

// =================== LISTING CARD FACTORY ===================
function conditionLabel(cond) {
  const map = {
    '新品・未使用':    { label: '新品', cls: 'condition-new' },
    '書き込みなし':    { label: '書き込みなし', cls: 'condition-good' },
    '書き込み少し':    { label: '書き込み少し', cls: 'condition-few' },
    '汚れ・ダメージあり': { label: '汚れあり', cls: 'condition-worn' },
  };
  return map[cond] || { label: cond, cls: 'condition-good' };
}

function statusLabel(s) {
  const map = {
    '出品中':   { label: '出品中', cls: 'status-active' },
    '予約済み': { label: '予約済み', cls: 'status-reserved' },
    '完了':     { label: '取引完了', cls: 'status-done' },
  };
  return map[s] || { label: s, cls: 'status-active' };
}

function getBookEmoji(title) {
  // 絵文字の代わりに書籍カテゴリのアイコン名を返す（Font Awesome）
  return '<i class="fas fa-book" style="color:var(--navy);opacity:0.3;font-size:2.8rem;"></i>';
}

function createListingCard(item, showDelete = false) {
  const c   = conditionLabel(item.condition);
  const st  = statusLabel(item.status);

  const card = document.createElement('div');
  card.className = 'listing-card';
  const imgContent = item.image_url
    ? `<img src="${item.image_url}" alt="${escHtml(item.title)}" loading="lazy" />`
    : `<i class="fas fa-book" style="color:var(--navy);opacity:0.25;font-size:2.8rem;"></i>`;
  card.innerHTML = `
    <div class="card-img">${imgContent}</div>
    <div class="card-body">
      <p class="card-title">${escHtml(item.title)}</p>
      <p class="card-subject"><i class="fas fa-graduation-cap" style="color:var(--primary-light);margin-right:4px;font-size:0.75rem;"></i>${escHtml(item.subject)}</p>
      <div class="card-meta">
        <span class="card-price">¥${Number(item.price).toLocaleString()}</span>
        <span class="card-condition ${c.cls}">${c.label}</span>
      </div>
      <div class="card-footer">
        <span class="card-seller"><i class="fas fa-user-circle"></i>${escHtml(item.seller_name || '不明')}</span>
        ${showDelete
          ? `<button onclick="event.stopPropagation();deleteListing('${item.id}')" class="btn-danger" style="padding:4px 12px;font-size:0.75rem;">削除</button>`
          : `<span class="card-status ${st.cls}">${st.label}</span>`}
      </div>
    </div>
  `;
  card.addEventListener('click', () => {
    location.href = `detail.html?id=${item.id}`;
  });
  return card;
}

// =================== UTILS ===================
function escHtml(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function formatDate(ts) {
  if (!ts) return '';
  const d = new Date(Number(ts));
  return `${d.getFullYear()}/${d.getMonth()+1}/${d.getDate()}`;
}
function getParam(key) {
  return new URLSearchParams(location.search).get(key);
}

// =================== LIKE ===================
function getLikedIds() {
  try { return JSON.parse(localStorage.getItem('tetomi_likes') || '[]'); } catch { return []; }
}
function toggleLocalLike(id) {
  const ids = getLikedIds();
  const i   = ids.indexOf(id);
  if (i === -1) ids.push(id);
  else          ids.splice(i, 1);
  localStorage.setItem('tetomi_likes', JSON.stringify(ids));
  return i === -1; // true = liked
}

// =================== INIT ===================
document.addEventListener('DOMContentLoaded', () => {
  updateNavUI();
});
