// ====== CLIENTE DRIVE-THRU - APP.JS ======

const socket = io();

// State
let menuData = null;
let configData = null;
let cart = [];
let currentCustomizingItem = null;
let itemQuantity = 1;
let activeOrder = null;

// Audio context for alerts
let audioCtx = null;
function initAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
}

// Play celebratory chime when order is ready
function playReadySound() {
  try {
    initAudio();
    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = 'triangle';
    gain.connect(audioCtx.destination);
    osc.connect(gain);

    // Fanfare chords
    osc.frequency.setValueAtTime(523.25, now); // C5
    osc.frequency.setValueAtTime(659.25, now + 0.15); // E5
    osc.frequency.setValueAtTime(783.99, now + 0.30); // G5
    osc.frequency.setValueAtTime(1046.50, now + 0.45); // C6

    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 1.2);

    osc.start(now);
    osc.stop(now + 1.2);

    // Vibration on mobile
    if ('vibrate' in navigator) {
      navigator.vibrate([300, 150, 300, 150, 500]);
    }
  } catch (e) {
    console.log('Audio not allowed yet:', e);
  }
}

// Format currency
function formatBRL(val) {
  return Number(val).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// DOM Elements
const viewMenu = document.getElementById('view-menu');
const viewTracker = document.getElementById('view-tracker');
const categoryNav = document.getElementById('category-nav');
const menuItemsContainer = document.getElementById('menu-items-container');
const cartBar = document.getElementById('cart-bar');
const cartBarCount = document.getElementById('cart-bar-count');
const cartBarTotal = document.getElementById('cart-bar-total');
const btnOpenCart = document.getElementById('btn-open-cart');

// Modals
const modalOptions = document.getElementById('modal-options');
const btnCloseOptions = document.getElementById('btn-close-options');
const modalProductName = document.getElementById('modal-product-name');
const modalProductPrice = document.getElementById('modal-product-price');
const fillingsList = document.getElementById('fillings-list');
const toppingsList = document.getElementById('toppings-list');
const itemNotes = document.getElementById('item-notes');
const qtyMinus = document.getElementById('qty-minus');
const qtyPlus = document.getElementById('qty-plus');
const qtyDisplay = document.getElementById('qty-display');
const btnAddToCartConfirm = document.getElementById('btn-add-to-cart-confirm');
const modalAddTotal = document.getElementById('modal-add-total');

const modalCheckout = document.getElementById('modal-checkout');
const btnCloseCheckout = document.getElementById('btn-close-checkout');
const checkoutItemsList = document.getElementById('checkout-items-list');
const checkoutTotalVal = document.getElementById('checkout-total-val');
const formCheckout = document.getElementById('form-checkout');

// Tracker Elements
const trackOrderNumber = document.getElementById('track-order-number');
const trackCustomerName = document.getElementById('track-customer-name');
const trackVehicleTag = document.getElementById('track-vehicle-tag');
const statusHero = document.getElementById('status-hero');
const statusHeroIcon = document.getElementById('status-hero-icon');
const statusHeroTitle = document.getElementById('status-hero-title');
const statusHeroMsg = document.getElementById('status-hero-msg');
const trackerItemsList = document.getElementById('tracker-items-list');
const trackerTotalVal = document.getElementById('tracker-total-val');
const trackerPixBox = document.getElementById('tracker-pix-box');
const trackerPixKey = document.getElementById('tracker-pix-key');
const btnCopyPixTracker = document.getElementById('btn-copy-pix-tracker');
const btnNewOrder = document.getElementById('btn-new-order');

// Init
document.addEventListener('DOMContentLoaded', async () => {
  // Listen for audio unlock
  document.body.addEventListener('click', initAudio, { once: true });
  document.body.addEventListener('touchstart', initAudio, { once: true });

  await loadConfig();
  await loadMenu();

  // Check if customer has an existing active order
  const savedOrder = localStorage.getItem('churros_active_order');
  if (savedOrder) {
    try {
      activeOrder = JSON.parse(savedOrder);
      // Fetch latest order status from server
      const res = await fetch(`/api/orders/${activeOrder.id}`);
      if (res.ok) {
        activeOrder = await res.json();
        showTracker(activeOrder);
        socket.emit('track_order', activeOrder.id);
      } else {
        localStorage.removeItem('churros_active_order');
      }
    } catch (e) {
      console.error(e);
      localStorage.removeItem('churros_active_order');
    }
  }
});

// Load Config
async function loadConfig() {
  try {
    const res = await fetch('/api/config');
    configData = await res.json();
    if (configData.trailerName) {
      document.getElementById('trailer-name-display').textContent = configData.trailerName;
      document.title = `${configData.trailerName} - Drive-Thru`;
    }
    if (configData.tagline) {
      document.getElementById('trailer-tagline-display').textContent = configData.tagline;
    }
    if (configData.pixKey) {
      trackerPixKey.textContent = configData.pixKey;
    }
  } catch (err) {
    console.error('Erro ao carregar config:', err);
  }
}

// Load Menu
async function loadMenu() {
  try {
    const res = await fetch('/api/menu');
    menuData = await res.json();
    renderCategories();
    renderMenuItems();
  } catch (err) {
    console.error('Erro ao carregar cardápio:', err);
    menuItemsContainer.innerHTML = '<p style="text-align: center; color: red;">Não foi possível carregar o cardápio. Verifique a conexão.</p>';
  }
}

let selectedChurroSize = 'normal';

// Render Categories Pills
function renderCategories() {
  if (!menuData || !menuData.categories) return;
  categoryNav.innerHTML = '';

  menuData.categories.forEach((cat, idx) => {
    const tab = document.createElement('button');
    tab.className = `category-tab ${idx === 0 ? 'active' : ''}`;
    tab.textContent = cat.name;
    tab.onclick = () => {
      document.querySelectorAll('.category-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const targetSec = document.getElementById(`cat-sec-${cat.id}`);
      if (targetSec) {
        targetSec.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    };
    categoryNav.appendChild(tab);
  });
}

// Render Menu Items
function renderMenuItems() {
  if (!menuData || !menuData.categories) return;
  menuItemsContainer.innerHTML = '';

  menuData.categories.forEach((category, idx) => {
    const section = document.createElement('section');
    section.className = 'menu-section';
    section.id = `cat-sec-${category.id}`;

    const headerRow = document.createElement('div');
    headerRow.className = 'section-header-row';

    const title = document.createElement('h2');
    title.className = 'section-title';
    title.textContent = category.name;
    headerRow.appendChild(title);

    if (category.tag) {
      const tagPill = document.createElement('span');
      tagPill.className = 'section-tag-pill';
      tagPill.textContent = category.tag;
      headerRow.appendChild(tagPill);
    }

    section.appendChild(headerRow);

    if (category.description) {
      const desc = document.createElement('p');
      desc.className = 'section-desc';
      desc.textContent = category.description;
      section.appendChild(desc);
    }

    category.items.forEach(item => {
      const card = document.createElement('div');
      card.className = 'product-card';
      card.onclick = () => openItemModal(item);

      let priceBadgesHtml = '';
      if (item.hasSize) {
        const babyPrice = item.priceBaby || (item.price / 2);
        priceBadgesHtml = `
          <div class="badge-prices">
            <span class="badge-price-normal">🥖 Normal: ${formatBRL(item.price)}</span>
            <span class="badge-price-baby">👶 Baby: ${formatBRL(babyPrice)}</span>
          </div>
        `;
      } else {
        priceBadgesHtml = `
          <div class="product-price" style="margin-top: 6px; font-weight: 900; font-size: 16px; color: var(--brand-pink);">${formatBRL(item.price)}</div>
        `;
      }

      card.innerHTML = `
        <div class="product-info">
          ${item.badge ? `<span class="product-badge">${item.badge}</span>` : ''}
          <h3 class="product-name">${item.name}</h3>
          ${item.description ? `<p class="product-desc">${item.description}</p>` : ''}
          ${priceBadgesHtml}
        </div>
        <div class="product-action">
          <div class="product-emoji">${item.emoji || '🥖'}</div>
          <button class="btn-add" type="button">Escolher +</button>
        </div>
      `;

      section.appendChild(card);
    });

    menuItemsContainer.appendChild(section);

    // Decorative Zigzag Divider between categories
    if (idx < menuData.categories.length - 1) {
      const divider = document.createElement('div');
      divider.className = 'zigzag-divider';
      menuItemsContainer.appendChild(divider);
    }
  });
}

// Select Churro Size (Normal vs Baby)
window.selectChurroSize = function(size) {
  selectedChurroSize = size;
  const cardNormal = document.getElementById('card-size-normal');
  const cardBaby = document.getElementById('card-size-baby');

  if (size === 'baby') {
    cardBaby.classList.add('selected');
    cardNormal.classList.remove('selected');
  } else {
    cardNormal.classList.add('selected');
    cardBaby.classList.remove('selected');
  }

  updateModalTotal();
};

// Open Item Customization Modal
function openItemModal(item) {
  initAudio();
  currentCustomizingItem = JSON.parse(JSON.stringify(item));
  itemQuantity = 1;
  selectedChurroSize = 'normal';
  qtyDisplay.textContent = '1';
  itemNotes.value = '';

  modalProductName.textContent = item.name;
  const descEl = document.getElementById('modal-product-desc');
  if (descEl) descEl.textContent = item.description || '';

  const groupSizes = document.getElementById('group-sizes');
  const groupToppings = document.getElementById('group-toppings');

  if (item.hasSize) {
    groupSizes.style.display = 'block';
    groupToppings.style.display = 'block';

    const priceNormal = item.price;
    const priceBaby = item.priceBaby || (item.price / 2);

    document.getElementById('modal-price-normal').textContent = formatBRL(priceNormal);
    document.getElementById('modal-price-baby').textContent = formatBRL(priceBaby);

    // Reset size to normal
    selectChurroSize('normal');

    // Render Toppings Grid
    toppingsList.innerHTML = '';
    const toppingsBadge = document.getElementById('toppings-badge');
    if (toppingsBadge) toppingsBadge.textContent = 'Escolha até 2';

    (menuData.toppings || []).forEach(topping => {
      const chip = document.createElement('label');
      chip.className = 'topping-chip';
      chip.innerHTML = `
        <span class="topping-chip-check"></span>
        <input type="checkbox" name="topping" value="${topping.name}">
        <span>${topping.name}</span>
      `;

      const chk = chip.querySelector('input');
      chk.addEventListener('change', () => {
        const checkedCount = toppingsList.querySelectorAll('input:checked').length;
        if (checkedCount > 2) {
          chk.checked = false;
          alert('Você pode escolher no máximo 2 confeitos!');
          return;
        }
        if (chk.checked) chip.classList.add('selected');
        else chip.classList.remove('selected');

        const currentCount = toppingsList.querySelectorAll('input:checked').length;
        if (toppingsBadge) {
          toppingsBadge.textContent = `${currentCount}/2 selecionados`;
        }
      });

      toppingsList.appendChild(chip);
    });
  } else {
    // Drink or item without sizes
    groupSizes.style.display = 'none';
    groupToppings.style.display = 'none';
  }

  updateModalTotal();
  modalOptions.classList.add('active');
}

function updateModalTotal() {
  if (!currentCustomizingItem) return;

  let unitPrice = currentCustomizingItem.price;
  if (currentCustomizingItem.hasSize) {
    if (selectedChurroSize === 'baby') {
      unitPrice = currentCustomizingItem.priceBaby || (currentCustomizingItem.price / 2);
    }
  }

  const total = unitPrice * itemQuantity;
  modalAddTotal.textContent = formatBRL(total);
}

// Stepper
qtyMinus.onclick = () => {
  if (itemQuantity > 1) {
    itemQuantity--;
    qtyDisplay.textContent = itemQuantity;
    updateModalTotal();
  }
};

qtyPlus.onclick = () => {
  itemQuantity++;
  qtyDisplay.textContent = itemQuantity;
  updateModalTotal();
};

btnCloseOptions.onclick = () => {
  modalOptions.classList.remove('active');
};

// Add to Cart Confirm
btnAddToCartConfirm.onclick = () => {
  const selectedToppings = [];

  if (currentCustomizingItem.hasSize) {
    toppingsList.querySelectorAll('input:checked').forEach(chk => {
      selectedToppings.push(chk.value);
    });
  }

  const isChurro = !!currentCustomizingItem.hasSize;
  let unitPrice = currentCustomizingItem.price;
  let sizeLabel = '';

  if (isChurro) {
    if (selectedChurroSize === 'baby') {
      unitPrice = currentCustomizingItem.priceBaby || (currentCustomizingItem.price / 2);
      sizeLabel = 'Baby';
    } else {
      unitPrice = currentCustomizingItem.price;
      sizeLabel = 'Normal';
    }
  }

  cart.push({
    id: currentCustomizingItem.id + '_' + Date.now(),
    name: currentCustomizingItem.name,
    isChurro: isChurro,
    size: selectedChurroSize,
    sizeLabel: sizeLabel,
    unitPrice: unitPrice,
    quantity: itemQuantity,
    totalPrice: unitPrice * itemQuantity,
    toppings: selectedToppings,
    notes: itemNotes.value.trim()
  });

  modalOptions.classList.remove('active');
  updateCartBar();
};

// Update Cart Floating Bar
function updateCartBar() {
  const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
  const totalValue = cart.reduce((sum, item) => sum + item.totalPrice, 0);

  if (totalItems > 0) {
    cartBarCount.textContent = `${totalItems} ${totalItems === 1 ? 'item' : 'itens'}`;
    cartBarTotal.textContent = formatBRL(totalValue);
    cartBar.classList.remove('hidden');
  } else {
    cartBar.classList.add('hidden');
  }
}

// Open Checkout Modal
btnOpenCart.onclick = () => {
  renderCheckoutItems();
  modalCheckout.classList.add('active');
};

btnCloseCheckout.onclick = () => {
  modalCheckout.classList.remove('active');
};

function renderCheckoutItems() {
  checkoutItemsList.innerHTML = '';
  if (cart.length === 0) {
    checkoutItemsList.innerHTML = '<p style="text-align: center; color: var(--text-muted); padding: 20px 0;">Seu carrinho está vazio.</p>';
    checkoutTotalVal.textContent = 'R$ 0,00';
    return;
  }

  let total = 0;
  cart.forEach((item, index) => {
    total += item.totalPrice;
    const row = document.createElement('div');
    row.className = 'cart-checkout-item';

    let sizeBadgeHtml = '';
    if (item.sizeLabel) {
      const cls = item.size === 'baby' ? 'baby' : 'normal';
      sizeBadgeHtml = `<span class="badge-churro-size ${cls}">${item.sizeLabel}</span>`;
    }

    let details = [];
    if (item.toppings && item.toppings.length) details.push(`Confeitos: <strong>${item.toppings.join(', ')}</strong>`);
    if (item.notes) details.push(`Obs: "${item.notes}"`);

    row.innerHTML = `
      <div style="flex: 1; padding-right: 12px;">
        <div class="checkout-item-title">
          ${item.quantity}x ${sizeBadgeHtml}${item.name}
        </div>
        ${details.length ? `<div class="checkout-item-sub" style="margin-top: 4px;">${details.join(' • ')}</div>` : ''}
        <button class="checkout-item-remove" type="button" onclick="removeItemFromCart(${index})">Remover item</button>
      </div>
      <div class="checkout-item-price">${formatBRL(item.totalPrice)}</div>
    `;
    checkoutItemsList.appendChild(row);
  });

  checkoutTotalVal.textContent = formatBRL(total);
}

window.removeItemFromCart = function(index) {
  cart.splice(index, 1);
  updateCartBar();
  renderCheckoutItems();
  if (cart.length === 0) {
    modalCheckout.classList.remove('active');
  }
};

// Submit Order
formCheckout.onsubmit = async (e) => {
  e.preventDefault();
  initAudio();

  if (cart.length === 0) {
    alert('Seu carrinho está vazio!');
    return;
  }

  const customerName = document.getElementById('input-customer-name').value.trim();
  const vehicleInfo = document.getElementById('input-vehicle').value.trim();
  const customerPhone = document.getElementById('input-phone').value.trim();
  const paymentMethod = document.getElementById('input-payment').value;
  const notes = document.getElementById('input-order-notes').value.trim();

  if (!customerName || !vehicleInfo) {
    alert('Por favor, informe seu Nome e a Identificação do seu Carro!');
    return;
  }

  const total = cart.reduce((sum, item) => sum + item.totalPrice, 0);

  const orderPayload = {
    customerName,
    vehicleInfo,
    customerPhone,
    paymentMethod,
    notes,
    items: cart,
    total
  };

  const submitBtn = document.getElementById('btn-submit-order');
  submitBtn.disabled = true;
  submitBtn.innerHTML = 'Enviando ao trailer...';

  try {
    const res = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(orderPayload)
    });

    const data = await res.json();
    if (data.success) {
      activeOrder = data.order;
      localStorage.setItem('churros_active_order', JSON.stringify(activeOrder));

      // Clear cart
      cart = [];
      updateCartBar();
      modalCheckout.classList.remove('active');

      // Track order via socket
      socket.emit('track_order', activeOrder.id);

      // Show Tracker Screen
      showTracker(activeOrder);
    } else {
      alert('Erro ao enviar pedido: ' + (data.error || 'Tente novamente.'));
    }
  } catch (err) {
    console.error(err);
    alert('Erro de conexão ao enviar pedido.');
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = '🚀 Enviar Pedido para o Trailer';
  }
};

// Show Tracker View
function showTracker(order) {
  viewMenu.style.display = 'none';
  viewTracker.style.display = 'block';
  window.scrollTo({ top: 0, behavior: 'smooth' });

  trackOrderNumber.textContent = order.orderNumber || '#--';
  trackCustomerName.textContent = order.customerName;
  trackVehicleTag.textContent = `🚗 ${order.vehicleInfo}`;

  // Render items
  trackerItemsList.innerHTML = '';
  (order.items || []).forEach(item => {
    const p = document.createElement('div');
    p.style.fontSize = '13px';
    p.style.marginBottom = '8px';
    p.style.borderBottom = '1px dashed #E5E7EB';
    p.style.paddingBottom = '6px';

    let sizeBadgeHtml = '';
    if (item.sizeLabel) {
      const cls = item.size === 'baby' ? 'baby' : 'normal';
      sizeBadgeHtml = `<span class="badge-churro-size ${cls}">${item.sizeLabel}</span>`;
    }

    let detailsList = [];
    if (item.toppings && item.toppings.length) {
      detailsList.push(`Confeitos: <strong>${item.toppings.join(', ')}</strong>`);
    }
    if (item.notes) {
      detailsList.push(`Obs: "${item.notes}"`);
    }

    p.innerHTML = `
      <div style="display: flex; justify-content: space-between;">
        <span><strong>${item.quantity}x</strong> ${sizeBadgeHtml}<strong>${item.name}</strong></span>
        <span style="font-weight: 700;">${formatBRL(item.totalPrice)}</span>
      </div>
      ${detailsList.length ? `<div style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">${detailsList.join(' • ')}</div>` : ''}
    `;
    trackerItemsList.appendChild(p);
  });

  trackerTotalVal.textContent = formatBRL(order.total);

  // Show Pix key if payment is Pix
  if (order.paymentMethod === 'Pix') {
    trackerPixBox.style.display = 'block';
  } else {
    trackerPixBox.style.display = 'none';
  }

  updateTrackerStatus(order.status);
}

let previousStatus = null;

// Update Tracker Status UI
function updateTrackerStatus(status) {
  if (!status) return;

  // Clear classes
  statusHero.className = 'status-hero';
  document.querySelectorAll('.timeline-step').forEach(step => {
    step.classList.remove('active', 'completed');
  });

  const stepRecebido = document.getElementById('step-recebido');
  const stepPreparo = document.getElementById('step-preparo');
  const stepPronto = document.getElementById('step-pronto');
  const stepEntregue = document.getElementById('step-entregue');

  if (status === 'recebido') {
    statusHero.classList.add('status-recebido');
    statusHeroIcon.textContent = '⏳';
    statusHeroTitle.textContent = 'Pedido Recebido!';
    statusHeroMsg.textContent = 'O trailer recebeu seu pedido e logo entrará na fritadeira.';
    stepRecebido.classList.add('active');
  } else if (status === 'preparo') {
    statusHero.classList.add('status-preparo');
    statusHeroIcon.textContent = '🔥';
    statusHeroTitle.textContent = 'No Óleo & Em Preparo!';
    statusHeroMsg.textContent = 'Seus churros estão fritando quentinhos e sendo recheados com carinho!';
    stepRecebido.classList.add('completed');
    stepPreparo.classList.add('active');
  } else if (status === 'pronto') {
    statusHero.classList.add('status-pronto');
    statusHeroIcon.textContent = '🎉';
    statusHeroTitle.textContent = 'PRONTO PARA RETIRADA!';
    statusHeroMsg.textContent = 'Seu churros está sequinho e quentinho! Pode sair do carro e vir retirar no balcão!';
    stepRecebido.classList.add('completed');
    stepPreparo.classList.add('completed');
    stepPronto.classList.add('active');

    // Trigger Sound Alert and Vibration only once on transition to pronto
    if (previousStatus !== 'pronto') {
      try { playReadySound(); } catch (e) { console.log(e); }
    }
  } else if (status === 'entregue') {
    statusHero.classList.add('status-entregue');
    statusHeroIcon.textContent = '✅';
    statusHeroTitle.textContent = 'Pedido Entregue!';
    statusHeroMsg.textContent = 'Obrigado pela preferência e bom apetite! Esperamos você de novo em breve!';
    stepRecebido.classList.add('completed');
    stepPreparo.classList.add('completed');
    stepPronto.classList.add('completed');
    stepEntregue.classList.add('completed');

    btnNewOrder.style.display = 'block';
  }

  previousStatus = status;
}

// Copy Pix
btnCopyPixTracker.onclick = () => {
  const pix = trackerPixKey.textContent;
  navigator.clipboard.writeText(pix).then(() => {
    btnCopyPixTracker.textContent = 'Copiado! ✓';
    setTimeout(() => {
      btnCopyPixTracker.textContent = 'Copiar Pix';
    }, 2500);
  });
};

// New Order Button
btnNewOrder.onclick = () => {
  localStorage.removeItem('churros_active_order');
  activeOrder = null;
  previousStatus = null;
  btnNewOrder.style.display = 'none';
  viewTracker.style.display = 'none';
  viewMenu.style.display = 'block';
};

// Polling fallback to keep mobile status 100% synchronized even if screen locks or connection drops
async function syncActiveOrderStatus() {
  if (!activeOrder || !activeOrder.id) return;
  try {
    const res = await fetch(`/api/orders/${activeOrder.id}`);
    if (res.ok) {
      const latestOrder = await res.json();
      if (latestOrder.status !== activeOrder.status) {
        console.log(`[SYNC] Status atualizado: ${activeOrder.status} -> ${latestOrder.status}`);
        activeOrder = latestOrder;
        localStorage.setItem('churros_active_order', JSON.stringify(activeOrder));
        updateTrackerStatus(latestOrder.status);
      }
    }
  } catch (err) {
    // Network glitch, will retry next tick
  }
}

// Poll every 2 seconds when order is in progress
setInterval(() => {
  if (activeOrder && ['recebido', 'preparo', 'pronto'].includes(activeOrder.status)) {
    syncActiveOrderStatus();
  }
}, 2000);

// Sync immediately whenever the customer unlocks the phone screen or returns to the browser
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && activeOrder) {
    syncActiveOrderStatus();
  }
});
window.addEventListener('focus', () => {
  if (activeOrder) syncActiveOrderStatus();
});

// Socket Listeners
socket.on('connect', () => {
  if (activeOrder && activeOrder.id) {
    socket.emit('track_order', activeOrder.id);
    syncActiveOrderStatus();
  }
});

socket.on('order_status_changed', (updatedOrder) => {
  if (activeOrder && activeOrder.id === updatedOrder.id) {
    console.log(`[SOCKET] Recebido status: ${updatedOrder.status}`);
    activeOrder = updatedOrder;
    localStorage.setItem('churros_active_order', JSON.stringify(activeOrder));
    updateTrackerStatus(updatedOrder.status);
  }
});
