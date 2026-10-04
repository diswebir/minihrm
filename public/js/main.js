// ═══════════════════════════════════════════════════════════
//  MiniHRM - Main JavaScript
// ═══════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', function() {

  // ─── Sidebar Toggle ──────────────────────────────────
  const sidebar = document.getElementById('sidebar');
  const sidebarToggle = document.getElementById('sidebarToggle');
  const sidebarClose = document.getElementById('sidebarClose');
  const sidebarOverlay = document.getElementById('sidebarOverlay');

  if (sidebarToggle) {
    sidebarToggle.addEventListener('click', () => {
      sidebar.classList.toggle('show');
      sidebarOverlay.classList.toggle('show');
    });
  }

  if (sidebarClose) {
    sidebarClose.addEventListener('click', () => {
      sidebar.classList.remove('show');
      sidebarOverlay.classList.remove('show');
    });
  }

  if (sidebarOverlay) {
    sidebarOverlay.addEventListener('click', () => {
      sidebar.classList.remove('show');
      sidebarOverlay.classList.remove('show');
    });
  }

  // ─── Auto-dismiss alerts ─────────────────────────────
  document.querySelectorAll('.alert-custom').forEach(alert => {
    setTimeout(() => {
      const bsAlert = bootstrap.Alert.getOrCreateInstance(alert);
      bsAlert.close();
    }, 5000);
  });

  // ─── Confirm delete actions ──────────────────────────
  document.querySelectorAll('[data-confirm]').forEach(el => {
    el.addEventListener('click', function(e) {
      if (!confirm(this.dataset.confirm || 'آیا مطمئن هستید؟')) {
        e.preventDefault();
      }
    });
  });

  // ─── Tooltip init ────────────────────────────────────
  const tooltipTriggerList = document.querySelectorAll('[data-bs-toggle="tooltip"]');
  [...tooltipTriggerList].map(el => new bootstrap.Tooltip(el));

  // ─── Module toggle ───────────────────────────────────
  document.querySelectorAll('.module-toggle').forEach(toggle => {
    toggle.addEventListener('change', async function() {
      const slug = this.dataset.module;
      try {
        const response = await fetch(`/settings/modules/${slug}/toggle`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        });
        const data = await response.json();
        if (data.success) {
          showToast(data.enabled ? 'ماژول فعال شد' : 'ماژول غیرفعال شد', 'success');
        }
      } catch (err) {
        showToast('خطا در تغییر وضعیت ماژول', 'danger');
        this.checked = !this.checked;
      }
    });
  });

  // ─── Toast notifications ─────────────────────────────
  window.showToast = function(message, type = 'info') {
    const toastContainer = document.getElementById('toastContainer') || createToastContainer();
    const toast = document.createElement('div');
    toast.className = `toast align-items-center text-bg-${type} border-0 show`;
    toast.setAttribute('role', 'alert');
    toast.innerHTML = `
      <div class="d-flex">
        <div class="toast-body">${message}</div>
        <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
      </div>
    `;
    toastContainer.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  };

  function createToastContainer() {
    const container = document.createElement('div');
    container.id = 'toastContainer';
    container.className = 'toast-container position-fixed bottom-0 start-0 p-3';
    container.style.zIndex = '9999';
    document.body.appendChild(container);
    return container;
  }

  // ─── Copy to clipboard ───────────────────────────────
  document.querySelectorAll('[data-copy]').forEach(el => {
    el.addEventListener('click', function() {
      const text = this.dataset.copy;
      navigator.clipboard.writeText(text).then(() => {
        showToast('کپی شد!', 'success');
      });
    });
  });

  // ─── Print QR code ───────────────────────────────────
  window.printQR = function() {
    window.print();
  };

});