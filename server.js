const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');
const QRCode = require('qrcode');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.resolve(__dirname, 'public');
const DATA_DIR = path.resolve(__dirname, 'data');
const MENU_FILE = path.join(DATA_DIR, 'menu.json');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');
const ORDERS_FILE = path.join(DATA_DIR, 'orders.json');
const UPLOADS_DIR = path.join(PUBLIC_DIR, 'uploads', 'comprovantes');

// Ensure uploads directory exists
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ limit: '25mb', extended: true }));
// dotfiles: 'allow' enables serving files even if directory starts with a dot (e.g. .gemini)
app.use(express.static(PUBLIC_DIR, { dotfiles: 'allow' }));

let publicUrl = null;

// Helper: Get local network IP
function getLocalIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const net of interfaces[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return 'localhost';
}

// Start Cloudflare Tunnel for 4G/5G mobile customers
function startTunnel() {
  const possiblePaths = [
    'cloudflared',
    'C:\\Program Files (x86)\\cloudflared\\cloudflared.exe',
    'C:\\Program Files\\cloudflared\\cloudflared.exe'
  ];

  let bin = 'cloudflared';
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      bin = p;
      break;
    }
  }

  console.log('[INTERNET] Gerando link público e seguro para celulares 4G/5G...');

  try {
    const tunnel = spawn(bin, ['tunnel', '--url', `http://localhost:${PORT}`]);

    const handleData = (chunk) => {
      const text = chunk.toString();
      const match = text.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
      if (match && !publicUrl) {
        publicUrl = match[0];
        const fullLink = `${publicUrl}/PedidoPinheiroChurros`;
        console.log('====================================================');
        console.log(`  🌐 LINK DE PEDIDOS OFICIAL (4G/5G):`);
        console.log(`  👉 ${fullLink}`);
        console.log('====================================================');

        io.emit('tunnel_ready', { publicUrl, url: fullLink, orderUrl: fullLink });
      }
    };

    tunnel.stdout.on('data', handleData);
    tunnel.stderr.on('data', handleData);

    tunnel.on('error', (err) => {
      console.log('[INTERNET] Dica: Para funcionar em celulares 4G sem Wi-Fi, o cloudflared pode ser usado.', err.message);
    });

    process.on('exit', () => {
      try { tunnel.kill(); } catch (e) {}
    });
  } catch (err) {
    console.log('[INTERNET] Túnel offline:', err.message);
  }
}

// Data loaders and savers
function loadJson(file, fallback = {}) {
  try {
    if (fs.existsSync(file)) {
      return JSON.parse(fs.readFileSync(file, 'utf-8'));
    }
  } catch (err) {
    console.error(`Erro ao ler ${file}:`, err);
  }
  return fallback;
}

function saveJson(file, data) {
  try {
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error(`Erro ao salvar ${file}:`, err);
  }
}

// Memory cache
let menu = loadJson(MENU_FILE, { categories: [], fillings: [], toppings: [] });
let config = loadJson(CONFIG_FILE, { trailerName: 'Churros Express' });
let orders = loadJson(ORDERS_FILE, []);

// Helper: Calculate sequential daily order number
function getNextOrderNumber() {
  const todayStr = new Date().toISOString().slice(0, 10);
  const todayOrders = orders.filter(o => o.createdAt && o.createdAt.startsWith(todayStr));
  const num = todayOrders.length + 1;
  return `#${String(num).padStart(2, '0')}`;
}

// --- REST API ENDPOINTS ---

// Network Info & QR Code / Link
app.get('/api/network-info', async (req, res) => {
  const ip = getLocalIp();
  const localBase = `http://${ip}:${PORT}`;
  const effectiveBase = publicUrl || localBase;
  const orderUrl = `${effectiveBase}/PedidoPinheiroChurros`;

  try {
    const qrCodeDataUrl = await QRCode.toDataURL(orderUrl, {
      width: 420,
      margin: 2,
      color: { dark: '#0a0a0c', light: '#ffffff' }
    });
    res.json({
      localIp: ip,
      port: PORT,
      url: orderUrl,
      baseUrl: effectiveBase,
      publicUrl: publicUrl ? `${publicUrl}/PedidoPinheiroChurros` : null,
      localUrl: `${localBase}/PedidoPinheiroChurros`,
      isInternet: !!publicUrl,
      qrCode: qrCodeDataUrl
    });
  } catch (err) {
    res.json({ localIp: ip, port: PORT, url: orderUrl, baseUrl: effectiveBase, isInternet: !!publicUrl, qrCode: null });
  }
});

// Config
app.get('/api/config', (req, res) => {
  res.json(config);
});

app.post('/api/config', (req, res) => {
  config = { ...config, ...req.body };
  saveJson(CONFIG_FILE, config);
  io.emit('config_updated', config);
  res.json({ success: true, config });
});

// Toggle Store Open / Closed
app.post('/api/config/toggle-open', (req, res) => {
  config.isOpen = typeof config.isOpen === 'boolean' ? !config.isOpen : false;
  saveJson(CONFIG_FILE, config);
  io.emit('store_status_changed', { isOpen: config.isOpen });
  io.emit('config_updated', config);
  console.log(`[LOJA] Status alterado para: ${config.isOpen ? 'ABERTA 🟢' : 'FECHADA 🔴'}`);
  res.json({ success: true, isOpen: config.isOpen });
});

// Menu
app.get('/api/menu', (req, res) => {
  res.json(menu);
});

app.post('/api/menu', (req, res) => {
  menu = req.body;
  saveJson(MENU_FILE, menu);
  io.emit('menu_updated', menu);
  res.json({ success: true, menu });
});

// Orders
app.get('/api/orders', (req, res) => {
  const status = req.query.status;
  if (status === 'active') {
    const active = orders.filter(o => ['recebido', 'preparo', 'pronto'].includes(o.status));
    return res.json(active);
  }
  res.json(orders);
});

app.get('/api/orders/:id', (req, res) => {
  const order = orders.find(o => o.id === req.params.id);
  if (!order) return res.status(404).json({ error: 'Pedido não encontrado' });
  res.json(order);
});

app.post('/api/orders', (req, res) => {
  if (config.isOpen === false) {
    return res.status(403).json({ error: 'Já encerramos nossos pedidos por hoje! Agradecemos o carinho e te esperamos na próxima fornada quentinha! ❤️' });
  }

  const { customerName, vehicleInfo, customerPhone, items, paymentMethod, notes, total, pixReceipt } = req.body;

  if (!customerName || !items || !items.length) {
    return res.status(400).json({ error: 'Dados do pedido incompletos' });
  }

  const orderId = 'ord_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
  const orderNumber = getNextOrderNumber();

  let pixReceiptUrl = null;
  let hasPixReceipt = false;
  let pixReceiptOriginalName = null;

  // Process Pix Receipt attachment if provided (dataUrl base64)
  if (pixReceipt && pixReceipt.dataUrl) {
    try {
      const matches = pixReceipt.dataUrl.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
      if (matches && matches.length === 3) {
        const mimeType = matches[1];
        const base64Data = matches[2];
        let ext = 'jpg';
        if (mimeType.includes('png')) ext = 'png';
        else if (mimeType.includes('pdf')) ext = 'pdf';
        else if (mimeType.includes('webp')) ext = 'webp';

        const safeFileName = `comprovante_${orderId}.${ext}`;
        const filePath = path.join(UPLOADS_DIR, safeFileName);
        fs.writeFileSync(filePath, Buffer.from(base64Data, 'base64'));

        pixReceiptUrl = `/uploads/comprovantes/${safeFileName}`;
        hasPixReceipt = true;
        pixReceiptOriginalName = pixReceipt.fileName || safeFileName;
      }
    } catch (receiptErr) {
      console.error('[ERRO COMPROVANTE PIX]:', receiptErr);
    }
  }

  const newOrder = {
    id: orderId,
    orderNumber,
    customerName: customerName.trim(),
    vehicleInfo: (vehicleInfo || 'No balcão').trim(),
    customerPhone: (customerPhone || '').trim(),
    items,
    paymentMethod: paymentMethod || 'Pix',
    pixReceiptUrl,
    hasPixReceipt,
    pixReceiptOriginalName,
    notes: (notes || '').trim(),
    total: Number(total) || 0,
    status: 'recebido',
    createdAt: new Date().toISOString(),
    statusHistory: [
      { status: 'recebido', time: new Date().toISOString() }
    ]
  };

  orders.unshift(newOrder);
  saveJson(ORDERS_FILE, orders);

  // Broadcast to kitchen (emite para a sala e global para garantir 100%)
  io.to('kitchen').emit('new_order', newOrder);
  io.emit('new_order', newOrder);

  console.log(`[NOVO PEDIDO] ${newOrder.orderNumber} para ${newOrder.customerName} (${newOrder.vehicleInfo}) - R$ ${newOrder.total.toFixed(2)}${hasPixReceipt ? ' [COM COMPROVANTE PIX]' : ''}`);

  res.status(201).json({ success: true, order: newOrder });
});

// Endpoint to attach / update pix receipt on existing order (e.g., from tracker)
app.post('/api/orders/:id/receipt', (req, res) => {
  const order = orders.find(o => o.id === req.params.id);
  if (!order) return res.status(404).json({ error: 'Pedido não encontrado' });

  const { pixReceipt } = req.body;
  if (!pixReceipt || !pixReceipt.dataUrl) {
    return res.status(400).json({ error: 'Nenhum comprovante enviado' });
  }

  try {
    const matches = pixReceipt.dataUrl.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    if (matches && matches.length === 3) {
      const mimeType = matches[1];
      const base64Data = matches[2];
      let ext = 'jpg';
      if (mimeType.includes('png')) ext = 'png';
      else if (mimeType.includes('pdf')) ext = 'pdf';
      else if (mimeType.includes('webp')) ext = 'webp';

      const safeFileName = `comprovante_${order.id}_${Date.now()}.${ext}`;
      const filePath = path.join(UPLOADS_DIR, safeFileName);
      fs.writeFileSync(filePath, Buffer.from(base64Data, 'base64'));

      order.pixReceiptUrl = `/uploads/comprovantes/${safeFileName}`;
      order.hasPixReceipt = true;
      order.pixReceiptOriginalName = pixReceipt.fileName || safeFileName;
      order.updatedAt = new Date().toISOString();

      saveJson(ORDERS_FILE, orders);
      io.to('kitchen').emit('order_status_changed', order);
      io.emit('order_status_changed', order);

      console.log(`[COMPROVANTE ANEXADO] Pedido ${order.orderNumber} comprovante salvo: ${safeFileName}`);

      return res.json({ success: true, order });
    }
    res.status(400).json({ error: 'Formato inválido do comprovante' });
  } catch (err) {
    console.error('Erro ao salvar comprovante:', err);
    res.status(500).json({ error: 'Falha ao salvar comprovante' });
  }
});

app.patch('/api/orders/:id/status', (req, res) => {
  const { status } = req.body;
  const validStatuses = ['recebido', 'preparo', 'pronto', 'entregue', 'cancelado'];

  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: 'Status inválido' });
  }

  const order = orders.find(o => o.id === req.params.id);
  if (!order) {
    return res.status(404).json({ error: 'Pedido não encontrado' });
  }

  order.status = status;
  order.updatedAt = new Date().toISOString();
  order.statusHistory.push({ status, time: order.updatedAt });

  saveJson(ORDERS_FILE, orders);

  // Broadcast status update to all connected clients (kitchen and customer phones)
  io.emit('order_status_changed', order);

  console.log(`[STATUS ALTERADO] Pedido ${order.orderNumber} mudou para: ${status.toUpperCase()}`);

  res.json({ success: true, order });
});

// Socket.io Realtime Events
io.on('connection', (socket) => {
  // Kitchen connects
  socket.on('join_kitchen', () => {
    socket.join('kitchen');
    const active = orders.filter(o => ['recebido', 'preparo', 'pronto'].includes(o.status));
    socket.emit('initial_active_orders', active);
    if (publicUrl) {
      const fullLink = `${publicUrl}/PedidoPinheiroChurros`;
      socket.emit('tunnel_ready', { publicUrl, url: fullLink, orderUrl: fullLink });
    }
  });

  // Customer connects to track their specific order
  socket.on('track_order', (orderId) => {
    socket.join(`order_${orderId}`);
    const order = orders.find(o => o.id === orderId);
    if (order) {
      socket.emit('order_status_changed', order);
    }
  });
});

// HTML page routing shortcuts
app.get(['/', '/PedidoPinheiroChurros', '/pedidopinheirochurros', '/pedido'], (req, res) => {
  res.sendFile(path.resolve(PUBLIC_DIR, 'index.html'), { dotfiles: 'allow' });
});

app.get('/painel', (req, res) => {
  res.sendFile(path.resolve(PUBLIC_DIR, 'painel.html'), { dotfiles: 'allow' });
});

app.get(['/qrcode', '/link'], (req, res) => {
  res.sendFile(path.resolve(PUBLIC_DIR, 'qrcode.html'), { dotfiles: 'allow' });
});

// Start Server & Cloudflare Tunnel
server.listen(PORT, '0.0.0.0', () => {
  const ip = getLocalIp();
  console.log('====================================================');
  console.log(`  PINHEIRO CHURROS DRIVE-THRU - SERVIDOR ONLINE!`);
  console.log(`  - Painel de Pedidos (PC): http://localhost:${PORT}/painel`);
  console.log(`  - Link Local (Wi-Fi): http://${ip}:${PORT}/PedidoPinheiroChurros`);
  console.log(`  - Central do Link p/ Fixar: http://localhost:${PORT}/link`);
  console.log('====================================================');

  startTunnel();
});
