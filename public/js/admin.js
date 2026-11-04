// ====== PAINEL DA COZINHA - ADMIN.JS ======

const socket = io();

let allOrders = [];
let soundEnabled = true;
let audioCtx = null;
let currentConfig = null;
let currentCustomerUrl = '';

// Audio Synthesizer (Loud & Clear Trailer Chime)
function initAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
}

function playNewOrderSound() {
  if (!soundEnabled) return;
  try {
    initAudio();
    const now = audioCtx.currentTime;

    // High distinct two-tone bell (Ding-Dong)
    const playTone = (freq, start, duration) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, start);

      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.4, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, start + duration);

      osc.connect(gain);
      gain.connect(audioCtx.destination);

      osc.start(start);
      osc.stop(start + duration);
    };

    // Ding (784Hz - G5) then Dong (1046Hz - C6) repeated
    playTone(784, now, 0.4);
    playTone(1046, now + 0.25, 0.7);
    playTone(784, now + 0.8, 0.4);
    playTone(1046, now + 1.05, 0.9);
  } catch (e) {
    console.error('Audio error:', e);
  }
}

// Format BRL
function formatBRL(val) {
  return Number(val).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// Calculate elapsed time text
function getElapsedText(dateStr) {
  if (!dateStr) return '';
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'agora mesmo';
  if (diffMins === 1) return 'há 1 min';
  return `há ${diffMins} min`;
}

// DOM Elements
const listNovos = document.getElementById('list-novos');
const listPreparo = document.getElementById('list-preparo');
const listProntos = document.getElementById('list-prontos');
const listEntregues = document.getElementById('list-entregues');

const countNovos = document.getElementById('count-novos');
const countPreparo = document.getElementById('count-preparo');
const countProntos = document.getElementById('count-prontos');
const countEntregues = document.getElementById('count-entregues');

const statCountToday = document.getElementById('stat-count-today');
const statRevenueToday = document.getElementById('stat-revenue-today');

const btnToggleSound = document.getElementById('btn-toggle-sound');
const soundStatusIcon = document.getElementById('sound-status-icon');
const soundStatusText = document.getElementById('sound-status-text');
const btnTestSound = document.getElementById('btn-test-sound');

const modalSettings = document.getElementById('modal-settings');
const btnOpenSettings = document.getElementById('btn-open-settings');
const btnCloseSettings = document.getElementById('btn-close-settings');
const formSettings = document.getElementById('form-settings');

// Init
document.addEventListener('DOMContentLoaded', async () => {
  // Unlock audio on any click
  document.body.addEventListener('click', initAudio, { once: true });

  await loadConfig();
  await loadOrders();

  // Socket connect to kitchen room
  socket.emit('join_kitchen');

  // Elapsed time refresher every 20 seconds
  setInterval(() => {
    updateElapsedLabels();
  }, 20000);
});

// Load Config
async function loadConfig() {
  try {
    const res = await fetch('/api/config');
    currentConfig = await res.json();
    if (currentConfig.trailerName) {
      document.getElementById('admin-trailer-name').textContent = `Painel da Cozinha • ${currentConfig.trailerName}`;
    }

    // Network info
    const netRes = await fetch('/api/network-info');
    const netData = await netRes.json();
    currentCustomerUrl = netData.publicUrl || netData.url;
    
    const linkDisplay = document.getElementById('header-customer-link-display');
    if (linkDisplay) {
      linkDisplay.textContent = currentCustomerUrl;
      linkDisplay.href = currentCustomerUrl;
    }
    
    const setLinkDisplay = document.getElementById('settings-client-url');
    if (setLinkDisplay) setLinkDisplay.textContent = currentCustomerUrl;
  } catch (e) {
    console.error(e);
  }
}

function copyCustomerLink(btn) {
  if (!currentCustomerUrl) return;
  navigator.clipboard.writeText(currentCustomerUrl).then(() => {
    const origHtml = btn.innerHTML;
    btn.innerHTML = '<span>✓ Link Copiado!</span>';
    btn.style.filter = 'brightness(1.2)';
    setTimeout(() => {
      btn.innerHTML = origHtml;
      btn.style.filter = '';
    }, 2500);
  }).catch(() => {
    prompt('Copie o link abaixo para enviar aos clientes:', currentCustomerUrl);
  });
}

function copyWhatsAppMessage(btn) {
  if (!currentCustomerUrl) return;
  const msg = `🥖 *PINHEIRO CHURROS - PEÇA PELO CELULAR!* 🚗\n\nEvite filas! Clique no link abaixo para abrir nosso cardápio, faça seu pedido direto do carro e só venha retirar no balcão quando avisarmos que está pronto:\n\n👉 ${currentCustomerUrl}`;
  navigator.clipboard.writeText(msg).then(() => {
    const origHtml = btn.innerHTML;
    btn.innerHTML = '<span>✓ Mensagem Copiada!</span>';
    btn.style.filter = 'brightness(1.2)';
    setTimeout(() => {
      btn.innerHTML = origHtml;
      btn.style.filter = '';
    }, 2500);
  }).catch(() => {
    prompt('Copie a mensagem abaixo:', msg);
  });
}

const btnCopyCustomerLink = document.getElementById('btn-copy-customer-link');
if (btnCopyCustomerLink) {
  btnCopyCustomerLink.onclick = function() { copyCustomerLink(this); };
}

const btnCopyLinkBar = document.getElementById('btn-copy-link-bar');
if (btnCopyLinkBar) {
  btnCopyLinkBar.onclick = function() { copyCustomerLink(this); };
}

const btnCopyWhatsappMsg = document.getElementById('btn-copy-whatsapp-msg');
if (btnCopyWhatsappMsg) {
  btnCopyWhatsappMsg.onclick = function() { copyWhatsAppMessage(this); };
}

// Load Orders
async function loadOrders() {
  try {
    const res = await fetch('/api/orders');
    allOrders = await res.json();
    renderBoard();
  } catch (err) {
    console.error('Erro ao carregar pedidos:', err);
  }
}

// Render Kanban Board
function renderBoard() {
  const novos = allOrders.filter(o => o.status === 'recebido');
  const preparo = allOrders.filter(o => o.status === 'preparo');
  const prontos = allOrders.filter(o => o.status === 'pronto');
  const entregues = allOrders.filter(o => o.status === 'entregue');

  // Counts
  countNovos.textContent = novos.length;
  countPreparo.textContent = preparo.length;
  countProntos.textContent = prontos.length;
  countEntregues.textContent = entregues.length;

  // Stats today
  statCountToday.textContent = allOrders.length;
  const totalRevenue = allOrders
    .filter(o => o.status !== 'cancelado')
    .reduce((sum, o) => sum + (Number(o.total) || 0), 0);
  statRevenueToday.textContent = formatBRL(totalRevenue);

  // Render columns
  renderColumn(listNovos, novos, 'novos');
  renderColumn(listPreparo, preparo, 'preparo');
  renderColumn(listProntos, prontos, 'prontos');
  renderColumn(listEntregues, entregues, 'entregues');
}

function renderColumn(container, ordersList, type) {
  container.innerHTML = '';
  if (ordersList.length === 0) {
    const emptyMsg = {
      novos: 'Nenhum pedido novo no momento',
      preparo: 'Nenhum churro sendo preparado agora',
      prontos: 'Nenhum pedido aguardando retirada',
      entregues: 'Nenhum pedido entregue ainda'
    }[type];
    container.innerHTML = `<div class="empty-col-message">${emptyMsg}</div>`;
    return;
  }

  ordersList.forEach(order => {
    const card = document.createElement('div');
    card.className = 'k-card';
    card.id = `card-${order.id}`;

    const diffMins = Math.floor((Date.now() - new Date(order.createdAt).getTime()) / 60000);
    const isLate = (order.status === 'recebido' || order.status === 'preparo') && diffMins >= 10;
    if (isLate) card.classList.add('urgent');

    // Build items HTML
    let itemsHtml = '';
    (order.items || []).forEach(item => {
      let sizeBadge = '';
      if (item.sizeLabel) {
        const isBaby = item.size === 'baby';
        const bg = isBaby ? '#1E3A8A' : '#78350F';
        const border = isBaby ? '#60A5FA' : '#F59E0B';
        const text = isBaby ? '#BFDBFE' : '#FEF3C7';
        sizeBadge = `<span style="display: inline-block; background: ${bg}; border: 1.5px solid ${border}; color: ${text}; padding: 2px 7px; border-radius: 4px; font-size: 11px; font-weight: 900; margin-right: 6px;">${isBaby ? '👶 BABY' : '🥖 NORMAL'}</span>`;
      }

      let detailsHtml = '';
      if (item.toppings && item.toppings.length) {
        detailsHtml += `<div>• Confeitos: <strong style="color: #FDE68A;">${item.toppings.join(', ')}</strong></div>`;
      }
      if (item.notes) {
        detailsHtml += `<div style="color: #FCA5A5;">• Obs: "${item.notes}"</div>`;
      }

      itemsHtml += `
        <div class="k-item-row">
          <span>${item.quantity}x ${sizeBadge}<strong style="color: #F8FAFC;">${item.name}</strong></span>
          <span>${formatBRL(item.totalPrice)}</span>
        </div>
        ${detailsHtml ? `<div class="k-item-details">${detailsHtml}</div>` : ''}
      `;
    });

    // Action button depending on status
    let actionBtnHtml = '';
    if (order.status === 'recebido') {
      actionBtnHtml = `
        <button class="k-btn-action k-btn-start" onclick="updateOrderStatus('${order.id}', 'preparo')">
          <span>▶ Iniciar Fritura / Preparo</span>
        </button>
      `;
    } else if (order.status === 'preparo') {
      actionBtnHtml = `
        <button class="k-btn-action k-btn-ready" onclick="updateOrderStatus('${order.id}', 'pronto')">
          <span>✔ MARCAR COMO PRONTO!</span>
        </button>
      `;
    } else if (order.status === 'pronto') {
      actionBtnHtml = `
        <button class="k-btn-action k-btn-finish" onclick="updateOrderStatus('${order.id}', 'entregue')">
          <span>✅ Entregar / Finalizar</span>
        </button>
      `;
    }

    card.innerHTML = `
      <div class="k-card-header">
        <span class="k-order-num">${order.orderNumber}</span>
        <span class="k-time-elapsed ${isLate ? 'late' : ''}" data-created="${order.createdAt}">${getElapsedText(order.createdAt)}</span>
      </div>

      <div class="k-vehicle-banner">
        <span>🚗</span>
        <span>${order.vehicleInfo}</span>
      </div>

      <div class="k-customer-name">
        Cliente: <strong>${order.customerName}</strong>
        ${order.customerPhone ? `<span style="font-size: 11px; color: #94A3B8;">(${order.customerPhone})</span>` : ''}
      </div>

      <div class="k-items-box">
        ${itemsHtml}
      </div>

      ${order.notes ? `<div class="k-notes-box"><strong>Obs do Pedido:</strong> ${order.notes}</div>` : ''}

      <div class="k-footer">
        <span class="k-pay-badge">💳 ${order.paymentMethod}</span>
        <strong style="color: #F8FAFC; font-size: 15px;">Total: ${formatBRL(order.total)}</strong>
      </div>

      ${actionBtnHtml ? `<div style="margin-top: 10px;">${actionBtnHtml}</div>` : ''}
    `;

    container.appendChild(card);
  });
}

// Update Elapsed Labels
function updateElapsedLabels() {
  document.querySelectorAll('.k-time-elapsed').forEach(el => {
    const created = el.getAttribute('data-created');
    if (created) {
      el.textContent = getElapsedText(created);
      const diffMins = Math.floor((Date.now() - new Date(created).getTime()) / 60000);
      if (diffMins >= 10) el.classList.add('late');
      else el.classList.remove('late');
    }
  });
}

// Update Order Status (Action Button Click)
window.updateOrderStatus = async function(orderId, nextStatus) {
  initAudio();
  try {
    const res = await fetch(`/api/orders/${orderId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: nextStatus })
    });

    const data = await res.json();
    if (data.success) {
      const idx = allOrders.findIndex(o => o.id === orderId);
      if (idx !== -1) {
        allOrders[idx] = data.order;
        renderBoard();
      }
    } else {
      alert('Erro ao atualizar status: ' + (data.error || ''));
    }
  } catch (err) {
    console.error(err);
    alert('Erro de conexão com o servidor.');
  }
};

// Toggle Sound
btnToggleSound.onclick = () => {
  soundEnabled = !soundEnabled;
  if (soundEnabled) {
    soundStatusIcon.textContent = '🔊';
    soundStatusText.textContent = 'Som Ativo';
    btnToggleSound.style.background = '#334155';
    playNewOrderSound();
  } else {
    soundStatusIcon.textContent = '🔇';
    soundStatusText.textContent = 'Som Mudo';
    btnToggleSound.style.background = '#7F1D1D';
  }
};

// Test Sound Button
btnTestSound.onclick = () => {
  playNewOrderSound();
};

// Settings Modal
btnOpenSettings.onclick = () => {
  if (currentConfig) {
    document.getElementById('set-trailer-name').value = currentConfig.trailerName || '';
    document.getElementById('set-tagline').value = currentConfig.tagline || '';
    document.getElementById('set-pix-key').value = currentConfig.pixKey || '';
    document.getElementById('set-pix-name').value = currentConfig.pixBeneficiary || '';
  }
  modalSettings.classList.add('active');
};

btnCloseSettings.onclick = () => {
  modalSettings.classList.remove('active');
};

formSettings.onsubmit = async (e) => {
  e.preventDefault();
  const trailerName = document.getElementById('set-trailer-name').value.trim();
  const tagline = document.getElementById('set-tagline').value.trim();
  const pixKey = document.getElementById('set-pix-key').value.trim();
  const pixBeneficiary = document.getElementById('set-pix-name').value.trim();

  try {
    const res = await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trailerName, tagline, pixKey, pixBeneficiary })
    });
    const data = await res.json();
    if (data.success) {
      currentConfig = data.config;
      document.getElementById('admin-trailer-name').textContent = `Painel da Cozinha • ${trailerName}`;
      modalSettings.classList.remove('active');
      alert('Configurações salvas com sucesso!');
    }
  } catch (err) {
    console.error(err);
    alert('Erro ao salvar configurações.');
  }
};

// Socket Events
socket.on('tunnel_ready', (data) => {
  if (data) {
    const finalUrl = data.url || (data.publicUrl ? `${data.publicUrl}/PedidoPinheiroChurros` : '');
    if (finalUrl) {
      currentCustomerUrl = finalUrl;
      
      const linkDisplay = document.getElementById('header-customer-link-display');
      if (linkDisplay) {
        linkDisplay.textContent = finalUrl;
        linkDisplay.href = finalUrl;
      }

      const el = document.getElementById('settings-client-url');
      if (el) el.textContent = finalUrl;
      console.log('Link pronto:', finalUrl);
    }
  }
});

socket.on('new_order', (newOrder) => {
  console.log('Novo pedido recebido via Socket:', newOrder);
  // Add to beginning of array
  allOrders.unshift(newOrder);
  renderBoard();
  playNewOrderSound();

  // Browser desktop notification if permission granted
  if (Notification && Notification.permission === 'granted') {
    new Notification(`🔔 Novo Pedido: ${newOrder.orderNumber}`, {
      body: `Cliente: ${newOrder.customerName} (${newOrder.vehicleInfo}) - R$ ${newOrder.total.toFixed(2)}`
    });
  }
});

socket.on('order_status_changed', (updatedOrder) => {
  const idx = allOrders.findIndex(o => o.id === updatedOrder.id);
  if (idx !== -1) {
    allOrders[idx] = updatedOrder;
    renderBoard();
  }
});

// Request desktop notification permission on first load
if (window.Notification && Notification.permission !== 'granted' && Notification.permission !== 'denied') {
  Notification.requestPermission();
}
