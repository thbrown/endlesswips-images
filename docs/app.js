// CONFIG is loaded from docs/config.js via index.html.
// See docs/config.js.example to create your local copy.
const CONFIG = window.CONFIG;

let idToken = null;

// ---- Google Sign-In -------------------------------------------------------

// Initialize GSI once the library script has loaded
window.addEventListener('load', () => {
  google.accounts.id.initialize({
    client_id: CONFIG.GOOGLE_CLIENT_ID,
    callback: handleCredentialResponse,
    auto_select: false,
  });
  google.accounts.id.renderButton(
    document.getElementById('g_id_signin'),
    { type: 'standard', size: 'large', theme: 'filled_black', text: 'sign_in_with' }
  );
});

window.handleCredentialResponse = function (response) {
  idToken = response.credential;

  // Decode JWT payload (not for security — server verifies; just for display)
  const payload = JSON.parse(atob(idToken.split('.')[1]));

  document.getElementById('signin-btn').classList.add('hidden');
  document.getElementById('user-info').classList.remove('hidden');
  document.getElementById('user-email').textContent = payload.email;
  const avatar = document.getElementById('user-avatar');
  if (payload.picture) {
    avatar.src = payload.picture;
    avatar.style.display = 'block';
  }

  document.getElementById('main-content').classList.remove('hidden');
  loadImages();
};

window.signOut = function () {
  google.accounts.id.disableAutoSelect();
  idToken = null;
  document.getElementById('user-info').classList.add('hidden');
  document.getElementById('signin-btn').classList.remove('hidden');
  document.getElementById('main-content').classList.add('hidden');
  document.getElementById('image-grid').innerHTML = '';
};

// ---- Image list -----------------------------------------------------------

async function loadImages() {
  const grid = document.getElementById('image-grid');
  grid.innerHTML = '<p class="loading-msg">Loading…</p>';

  try {
    const res = await fetch(CONFIG.ADMIN_URL_LIST, {
      headers: { Authorization: `Bearer ${idToken}` },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const images = await res.json();

    const totalSize = images.reduce((sum, img) => sum + img.size, 0);
    const statsBar = document.getElementById('stats-bar');
    document.getElementById('stat-count').textContent = `${images.length} image${images.length !== 1 ? 's' : ''}`;
    document.getElementById('stat-size').textContent = formatSize(totalSize) + ' total';
    statsBar.classList.remove('hidden');

    if (images.length === 0) {
      grid.innerHTML = '<p class="loading-msg">No images yet. Upload something!</p>';
      return;
    }

    grid.innerHTML = '';
    images.forEach((img) => grid.appendChild(buildCard(img)));
  } catch (err) {
    grid.innerHTML = `<p class="loading-msg" style="color:var(--danger)">Failed to load images: ${err.message}</p>`;
  }
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function buildCard(img) {
  const card = document.createElement('div');
  card.className = 'image-card';
  card.dataset.name = img.name;

  const thumbUrl = `${CONFIG.SERVE_URL}/${encodeURIComponent(img.name)}?width=200`;
  const fullUrl  = `${CONFIG.SERVE_URL}/${encodeURIComponent(img.name)}`;

  card.innerHTML = `
    <div class="thumb-wrap">
      <img src="${thumbUrl}" alt="${img.name}" loading="lazy" />
    </div>
    <div class="card-body">
      <div class="card-name" title="${img.name}">${img.name}</div>
      <div class="card-size">${formatSize(img.size)}</div>
      <div class="card-actions">
        <button class="btn btn-copy" data-url="${fullUrl}">Copy URL</button>
        <button class="btn btn-delete" data-name="${img.name}">Delete</button>
      </div>
    </div>
  `;

  card.querySelector('.btn-copy').addEventListener('click', () => copyUrl(fullUrl));
  card.querySelector('.btn-delete').addEventListener('click', () => deleteImage(img.name));

  return card;
}

// ---- Upload ---------------------------------------------------------------

const uploadZone = document.getElementById('upload-zone');
const fileInput  = document.getElementById('file-input');

uploadZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  uploadZone.classList.add('drag-over');
});

uploadZone.addEventListener('dragleave', () => {
  uploadZone.classList.remove('drag-over');
});

uploadZone.addEventListener('drop', (e) => {
  e.preventDefault();
  uploadZone.classList.remove('drag-over');
  if (e.dataTransfer.files.length) uploadFiles(e.dataTransfer.files);
});

fileInput.addEventListener('change', () => {
  if (fileInput.files.length) uploadFiles(fileInput.files);
  fileInput.value = '';
});

async function uploadFiles(files) {
  const progressWrap = document.getElementById('progress-bar-wrap');
  const progressBar  = document.getElementById('progress-bar');
  const status       = document.getElementById('upload-status');

  progressWrap.classList.remove('hidden');
  progressBar.style.width = '10%';
  status.textContent = `Uploading ${files.length} file(s)…`;

  const formData = new FormData();
  Array.from(files).forEach((f) => formData.append('files', f));

  try {
    progressBar.style.width = '40%';
    const res = await fetch(CONFIG.ADMIN_URL_UPLOAD, {
      method: 'POST',
      headers: { Authorization: `Bearer ${idToken}` },
      body: formData,
    });

    progressBar.style.width = '90%';

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }

    const data = await res.json();
    progressBar.style.width = '100%';
    status.textContent = `Uploaded: ${data.uploaded.map((u) => u.name).join(', ')}`;
    showToast(`Uploaded ${data.uploaded.length} image(s)`);
    await loadImages();
  } catch (err) {
    status.textContent = `Upload failed: ${err.message}`;
    status.style.color = 'var(--danger)';
  } finally {
    setTimeout(() => {
      progressWrap.classList.add('hidden');
      progressBar.style.width = '0%';
      status.style.color = '';
    }, 2000);
  }
}

// ---- Delete ---------------------------------------------------------------

async function deleteImage(name) {
  if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;

  try {
    const res = await fetch(`${CONFIG.ADMIN_URL_DELETE}?name=${encodeURIComponent(name)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${idToken}` },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    showToast(`Deleted ${name}`);
    await loadImages();
  } catch (err) {
    showToast(`Delete failed: ${err.message}`);
  }
}

// ---- Copy URL -------------------------------------------------------------

function copyUrl(url) {
  navigator.clipboard.writeText(url).then(() => {
    showToast('URL copied to clipboard');
  }).catch(() => {
    showToast('Copy failed — check browser permissions');
  });
}

// ---- Toast ----------------------------------------------------------------

let toastTimer = null;

function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.remove('hidden');
  // Force reflow so transition fires
  toast.offsetHeight; // eslint-disable-line no-unused-expressions
  toast.classList.add('show');

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.classList.add('hidden'), 200);
  }, 2500);
}
