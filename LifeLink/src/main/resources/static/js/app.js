/* ===== LIFELINK APP.JS ===== */
'use strict';

// ── State ──────────────────────────────────────────────────────────────────
const App = {
    currentSection: 'home',
    darkMode: false,
    deferredInstallPrompt: null,
    qrGenerated: false,
};

// ── DOM Ready ──────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    initNavigation();
    loadMedicalInfo();
    renderHistory();
    updateStats();
    registerServiceWorker();
    initInstallPrompt();
    navigateTo('home');
});

// ── Theme ──────────────────────────────────────────────────────────────────
function initTheme() {
    const saved = localStorage.getItem('ll_dark_mode');
    App.darkMode = saved === 'true';
    applyTheme();
}

function toggleDarkMode() {
    App.darkMode = !App.darkMode;
    localStorage.setItem('ll_dark_mode', App.darkMode);
    applyTheme();
}

function applyTheme() {
    document.documentElement.setAttribute('data-theme', App.darkMode ? 'dark' : 'light');
    const btn = document.getElementById('btn-theme');
    if (btn) btn.innerHTML = App.darkMode ? '<i class="fas fa-sun"></i>' : '<i class="fas fa-moon"></i>';
}

// ── Navigation ─────────────────────────────────────────────────────────────
function initNavigation() {
    document.querySelectorAll('.nav-tab, .bottom-nav-item').forEach(btn => {
        btn.addEventListener('click', () => {
            const section = btn.dataset.section;
            if (section) navigateTo(section);
        });
    });
}

function navigateTo(sectionId) {
    // Hide all sections
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    // Show target
    const target = document.getElementById('section-' + sectionId);
    if (target) target.classList.add('active');

    // Update nav tabs
    document.querySelectorAll('.nav-tab, .bottom-nav-item').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.section === sectionId);
    });

    App.currentSection = sectionId;

    // Lazy actions per section
    if (sectionId === 'medical') loadMedicalInfo();
    if (sectionId === 'qr') maybeGenerateQR();
    if (sectionId === 'history') renderHistory();
    if (sectionId === 'stats') updateStats();
}

// ── SOS Button ────────────────────────────────────────────────────────────
function activateSOS() {
    const btn = document.getElementById('sos-btn');
    btn.classList.add('pulsing');
    btn.disabled = true;

    showToast('<i class="fas fa-spinner fa-spin"></i> Obteniendo ubicación...', 'info');

    if (!navigator.geolocation) {
        showToast('<i class="fas fa-exclamation-circle"></i> Geolocalización no disponible', 'error');
        btn.classList.remove('pulsing');
        btn.disabled = false;
        return;
    }

    navigator.geolocation.getCurrentPosition(
        (pos) => {
            const { latitude, longitude, accuracy } = pos.coords;
            const now = new Date();
            const timestamp = now.toLocaleString('es-ES');

            // Show location card
            const card = document.getElementById('location-card');
            card.classList.add('show');
            document.getElementById('loc-lat').textContent = latitude.toFixed(6);
            document.getElementById('loc-lon').textContent = longitude.toFixed(6);
            document.getElementById('loc-acc').textContent = Math.round(accuracy);
            document.getElementById('loc-time').textContent = timestamp;

            // Save to history
            saveSOSEvent(latitude, longitude, timestamp);
            updateStats();

            showToast('<i class="fas fa-check-circle"></i> Ayuda solicitada correctamente.', 'success');

            setTimeout(() => {
                btn.classList.remove('pulsing');
                btn.disabled = false;
            }, 3000);
        },
        (err) => {
            const msgs = {
                1: 'Permiso denegado. Activa la ubicación.',
                2: 'Posición no disponible.',
                3: 'Tiempo de espera agotado.',
            };
            showToast('<i class="fas fa-times-circle"></i> ' + (msgs[err.code] || 'Error desconocido'), 'error');
            btn.classList.remove('pulsing');
            btn.disabled = false;
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
}

// ── Medical Info ───────────────────────────────────────────────────────────
function saveMedicalInfo() {
    const info = {
        name:      document.getElementById('med-name').value.trim(),
        blood:     document.getElementById('med-blood').value,
        allergies: document.getElementById('med-allergies').value.trim(),
        meds:      document.getElementById('med-meds').value.trim(),
        contact:   document.getElementById('med-contact').value.trim(),
        phone:     document.getElementById('med-phone').value.trim(),
    };

    if (!info.name) {
        showToast('<i class="fas fa-exclamation-triangle"></i> Ingresa al menos tu nombre.', 'error');
        return;
    }

    localStorage.setItem('ll_medical', JSON.stringify(info));
    App.qrGenerated = false; // Force QR regeneration
    showToast('<i class="fas fa-check-circle"></i> Información médica guardada.', 'success');
    updateStats();
}

function loadMedicalInfo() {
    const raw = localStorage.getItem('ll_medical');
    if (!raw) return;
    try {
        const info = JSON.parse(raw);
        const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
        setVal('med-name',      info.name);
        setVal('med-blood',     info.blood);
        setVal('med-allergies', info.allergies);
        setVal('med-meds',      info.meds);
        setVal('med-contact',   info.contact);
        setVal('med-phone',     info.phone);
    } catch(e) { console.warn('Error loading medical info', e); }
}

function clearMedicalInfo() {
    if (!confirm('¿Borrar toda la información médica?')) return;
    localStorage.removeItem('ll_medical');
    ['med-name','med-blood','med-allergies','med-meds','med-contact','med-phone'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = id === 'med-blood' ? 'No sé' : '';
    });
    App.qrGenerated = false;
    showToast('<i class="fas fa-trash"></i> Información borrada.', 'error');
    updateStats();
}

function getMedicalInfo() {
    const raw = localStorage.getItem('ll_medical');
    return raw ? JSON.parse(raw) : null;
}

// ── QR Code ────────────────────────────────────────────────────────────────
function maybeGenerateQR() {
    const info = getMedicalInfo();
    const container = document.getElementById('qrcode');
    const placeholder = document.getElementById('qr-placeholder');
    const details = document.getElementById('qr-details');

    if (!info) {
        if (placeholder) placeholder.style.display = 'block';
        if (details)     details.style.display = 'none';
        container.innerHTML = '';
        return;
    }

    if (App.qrGenerated) return;

    if (placeholder) placeholder.style.display = 'none';
    if (details)     details.style.display = 'block';

    const text = [
        '🚨 EMERGENCIA MÉDICA - LIFELINK',
        '─────────────────────',
        `Nombre: ${info.name}`,
        `Tipo de sangre: ${info.blood}`,
        `Alergias: ${info.allergies || 'Ninguna conocida'}`,
        `Medicamentos: ${info.meds || 'Ninguno'}`,
        `Contacto: ${info.contact}`,
        `Teléfono: ${info.phone}`,
        '─────────────────────',
        `Generado: ${new Date().toLocaleString('es-ES')}`,
    ].join('\n');

    // Show text preview
    const el = document.getElementById('qr-text-preview');
    if (el) {
        el.innerHTML = `<strong>${info.name}</strong> | ${info.blood}<br>
            Alergias: ${info.allergies || 'Ninguna'}<br>
            Contacto: ${info.contact} ${info.phone}`;
    }

    container.innerHTML = '';
    if (window.QRCode) {
        new QRCode(container, {
            text: text,
            width: 220,
            height: 220,
            colorDark: '#212121',
            colorLight: '#ffffff',
            correctLevel: QRCode.CorrectLevel.M,
        });
        App.qrGenerated = true;
    } else {
        container.innerHTML = '<p style="color:var(--text-secondary);text-align:center">Cargando generador QR...</p>';
        setTimeout(maybeGenerateQR, 1000);
    }
}

function downloadQR() {
    const canvas = document.querySelector('#qrcode canvas');
    if (!canvas) { showToast('Genera el QR primero.', 'error'); return; }
    const link = document.createElement('a');
    link.download = 'lifelink-qr.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
}

// ── Nearby (Google Maps links) ─────────────────────────────────────────────
function openNearby(type) {
    const queries = {
        hospital: 'hospitales+cercanos',
        farmacia:  'farmacias+cercanas',
        policia:   'policia+cercana',
    };
    const q = queries[type] || type;

    if (!navigator.geolocation) {
        const url = `https://www.google.com/maps/search/${q}`;
        window.open(url, '_blank');
        return;
    }

    showToast('<i class="fas fa-map-marker-alt"></i> Obteniendo ubicación...', 'info');

    navigator.geolocation.getCurrentPosition(
        (pos) => {
            const { latitude, longitude } = pos.coords;
            const url = `https://www.google.com/maps/search/${q}/@${latitude},${longitude},15z`;
            window.open(url, '_blank');
        },
        () => {
            const url = `https://www.google.com/maps/search/${q}`;
            window.open(url, '_blank');
        },
        { timeout: 5000 }
    );
}

// ── SOS History ────────────────────────────────────────────────────────────
function saveSOSEvent(lat, lon, timestamp) {
    const history = getHistory();
    history.unshift({
        id: Date.now(),
        date: new Date().toLocaleDateString('es-ES'),
        time: new Date().toLocaleTimeString('es-ES'),
        lat: lat.toFixed(6),
        lon: lon.toFixed(6),
        timestamp,
    });
    // Keep max 50 entries
    localStorage.setItem('ll_history', JSON.stringify(history.slice(0, 50)));
}

function getHistory() {
    try { return JSON.parse(localStorage.getItem('ll_history') || '[]'); }
    catch(e) { return []; }
}

function renderHistory() {
    const history = getHistory();
    const tbody = document.getElementById('history-tbody');
    const empty = document.getElementById('history-empty');
    if (!tbody) return;

    tbody.innerHTML = '';

    if (history.length === 0) {
        if (empty) empty.style.display = 'block';
        document.querySelector('.table-wrapper').style.display = 'none';
        return;
    }

    if (empty) empty.style.display = 'none';
    document.querySelector('.table-wrapper').style.display = 'block';

    history.forEach((entry, idx) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${idx + 1}</td>
            <td>${entry.date}</td>
            <td>${entry.time}</td>
            <td style="font-family:monospace;font-size:0.82rem">${entry.lat}, ${entry.lon}</td>
            <td>
                <a href="https://www.google.com/maps?q=${entry.lat},${entry.lon}"
                   target="_blank" class="btn btn-blue" style="padding:4px 10px;font-size:0.78rem">
                   <i class="fas fa-map-marker-alt"></i> Ver
                </a>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function clearHistory() {
    if (!confirm('¿Borrar todo el historial de emergencias?')) return;
    localStorage.removeItem('ll_history');
    renderHistory();
    updateStats();
    showToast('<i class="fas fa-trash"></i> Historial borrado.', 'error');
}

// ── Statistics ─────────────────────────────────────────────────────────────
function updateStats() {
    const history = getHistory();
    const medical = getMedicalInfo();

    const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };

    setEl('stat-sos',     history.length);
    setEl('stat-medical', medical ? '✓' : '✗');
    setEl('stat-medlabel', medical ? 'Guardada' : 'Sin datos');

    if (history.length > 0) {
        const last = history[0];
        setEl('stat-location', `${last.date}`);
        setEl('stat-loclabel', last.time);
    } else {
        setEl('stat-location', '—');
        setEl('stat-loclabel', 'Sin registros');
    }

    // Update stat-medical color
    const medEl = document.getElementById('stat-medical');
    if (medEl) medEl.style.color = medical ? '#2e7d32' : 'var(--red)';
}

// ── Service Worker ─────────────────────────────────────────────────────────
function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js')
            .then(reg => console.log('[LifeLink] SW registrado:', reg.scope))
            .catch(err => console.warn('[LifeLink] SW error:', err));
    }
}

// ── PWA Install ────────────────────────────────────────────────────────────
function initInstallPrompt() {
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        App.deferredInstallPrompt = e;
        const banner = document.getElementById('install-banner');
        if (banner) banner.classList.add('show');
    });

    window.addEventListener('appinstalled', () => {
        const banner = document.getElementById('install-banner');
        if (banner) banner.classList.remove('show');
        showToast('<i class="fas fa-check-circle"></i> LifeLink instalado correctamente.', 'success');
    });
}

function installApp() {
    if (!App.deferredInstallPrompt) return;
    App.deferredInstallPrompt.prompt();
    App.deferredInstallPrompt.userChoice.then(result => {
        console.log('[LifeLink] Instalación:', result.outcome);
        App.deferredInstallPrompt = null;
        document.getElementById('install-banner').classList.remove('show');
    });
}

function dismissInstall() {
    const banner = document.getElementById('install-banner');
    if (banner) banner.classList.remove('show');
}

// ── Toast Notification ─────────────────────────────────────────────────────
let toastTimer = null;
function showToast(msg, type = 'success') {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.innerHTML = msg;
    toast.className = 'toast show ' + (type === 'error' ? 'error' : type === 'info' ? 'info' : '');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 3500);
}
