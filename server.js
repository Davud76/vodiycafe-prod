const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();
const cors = require("cors");
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;


app.use(cors());
app.use(express.json());

// Static folders test
app.use('/ringtone', express.static(path.join(__dirname, 'ringtone')));
app.use('/images', express.static(path.join(__dirname, 'images')));
app.use('/', express.static(path.join(__dirname, 'public')));

// Data files
const DATA_DIR = path.join(__dirname, 'data');
const MENU_FILE = path.join(DATA_DIR, 'menu.json');
const ORDERS_FILE = path.join(DATA_DIR, 'orders.json');
const HISTORY_FILE = path.join(DATA_DIR, 'history.json');
const NEXTID_FILE = path.join(DATA_DIR, 'nextId.json');
const TABLES_FILE = path.join(DATA_DIR, 'tables.json');
const SALES_FILE = path.join(DATA_DIR, 'sales.json');

// Ensure data dir + files
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
if (!fs.existsSync(MENU_FILE)) fs.writeFileSync(MENU_FILE, '[]');
if (!fs.existsSync(ORDERS_FILE)) fs.writeFileSync(ORDERS_FILE, '[]');
if (!fs.existsSync(HISTORY_FILE)) fs.writeFileSync(HISTORY_FILE, '[]');
if (!fs.existsSync(NEXTID_FILE)) fs.writeFileSync(NEXTID_FILE, '1');
if (!fs.existsSync(TABLES_FILE)) {
  // generate 15 tables with tokens if missing
  const defaultTables = [];
  for (let i = 1; i <= 15; i++) {
    defaultTables.push({ table: i, token: `T${i}-${Math.random().toString(36).substring(2,8)}` });
  }
  fs.writeFileSync(TABLES_FILE, JSON.stringify(defaultTables, null, 2));
}
if (!fs.existsSync(SALES_FILE)) fs.writeFileSync(SALES_FILE, '[]');

// Helpers
function safeReadFile(file){ try{ return fs.readFileSync(file,'utf8'); } catch(e){ return null; } }
function readJson(file){ try{ const txt = safeReadFile(file); return txt ? JSON.parse(txt) : []; } catch(e){ return []; } }
function writeJson(file,obj){ fs.writeFileSync(file,JSON.stringify(obj,null,2)); }
function nextId(){ 
  try{
    let curTxt = safeReadFile(NEXTID_FILE);
    const cur = Number(curTxt);
    const n = (Number.isFinite(cur)&&cur>=1)?cur:1;
    fs.writeFileSync(NEXTID_FILE,String(n+1));
    return n;
  } catch(e){ fs.writeFileSync(NEXTID_FILE,'2'); return 1; }
}

// Kitchen password
const KITCHEN_PASSWORD = 'BackPass123';
const kitchenAuthMiddleware = (req,res,next)=>{
  const pw = req.headers['x-kitchen-password'];
  if(pw !== KITCHEN_PASSWORD) return res.status(401).json({ error:'Unauthorized: wrong kitchen password' });
  next();
};

// --- ROUTES ---
// GET menu, orders, history
app.get('/api/menu', (req,res)=>{ res.json(readJson(MENU_FILE)); });
app.get('/api/orders', (req,res)=>{ res.json(readJson(ORDERS_FILE)); });
app.get('/api/history', (req,res)=>{ res.json(readJson(HISTORY_FILE)); });

// POST create order
app.post('/api/orders', (req,res)=>{
  const payload = req.body;
  if(!Array.isArray(payload.items) || payload.items.length===0)
    return res.status(400).json({error:'items required'});

  const tableToken = typeof payload.tableToken==='string'?payload.tableToken.trim():'';
  if(!tableToken) return res.status(400).json({error:'tableToken required'});

  const tables = readJson(TABLES_FILE);
  const tableEntry = tables.find(t => t.token === tableToken);
  if(!tableEntry) return res.status(403).json({error:'Invalid table token'});

  const id = nextId();
  const order = {
    id,
    tableNumber: tableEntry.table,
    items: payload.items,
    total: Number(payload.total||0),
    time: payload.time||new Date().toISOString(),
    status: 'new'
  };

  const orders = readJson(ORDERS_FILE);
  orders.push(order);
  writeJson(ORDERS_FILE, orders);

  // save for analytics
  const sales = readJson(SALES_FILE);
  sales.push(order);
  writeJson(SALES_FILE, sales);

  res.json({success:true, order});
});

// POST update order status
app.post('/api/orders/:id/status', kitchenAuthMiddleware, (req,res)=>{
  const id = Number(req.params.id);
  const { status } = req.body;
  if(!status) return res.status(400).json({error:'status required'});

  const orders = readJson(ORDERS_FILE);
  const history = readJson(HISTORY_FILE);
  const idx = orders.findIndex(o=>Number(o.id)===id);
  if(idx===-1) return res.status(404).json({error:'Order not found'});

  orders[idx].status = status;

  if(status==='accepted'){
    const accepted = orders.splice(idx,1)[0];
    accepted.acceptedAt = new Date().toISOString();
    accepted.status='accepted';
    history.push(accepted);
    writeJson(HISTORY_FILE, history);
  }
  writeJson(ORDERS_FILE, orders);
  res.json({success:true});
});

// POST clear orders/history
app.post('/api/clear', kitchenAuthMiddleware, (req,res)=>{
  const { target } = req.body;
  let orders = readJson(ORDERS_FILE);
  let history = readJson(HISTORY_FILE);

  if(target==='live'){
    orders.forEach(o=>{ o.status='archived'; o.acceptedAt = new Date().toISOString(); history.push(o); });
    orders = [];
  } else if(target==='history'){
    history = [];
  } else return res.status(400).json({error:'Invalid target'});

  writeJson(ORDERS_FILE, orders);
  writeJson(HISTORY_FILE, history);
  res.json({success:true});
});

// Serve kitchen page
app.get('/kitchen', (req,res)=>{ res.sendFile(path.join(__dirname,'public','kitchen.html')); });

// Middleware to protect analytics page
const analyticsAuthMiddleware = (req, res, next) => {
  const pw = req.query.pw || req.headers['x-kitchen-password'];
  if(pw !== KITCHEN_PASSWORD) return res.status(403).send('Access Denied');
  next();
};

// Serve analytics page
app.get('/analytics', analyticsAuthMiddleware, (req,res)=>{
  res.sendFile(path.join(__dirname,'public','analytics.html'));
});
// API to check kitchen password for showing analytics button
app.post('/api/check-kitchen-password', (req, res) => {
  const pw = req.body.password;
  if(pw === KITCHEN_PASSWORD){
    return res.json({ success: true });
  } else {
    return res.json({ success: false });
  }
});

// Analytics API
app.get('/api/analytics', analyticsAuthMiddleware, (req,res)=>{
  const { start, end } = req.query;
  const sales = readJson(SALES_FILE);

  const startTime = start ? new Date(start) : new Date('1970-01-01');
  const endTime = end ? new Date(end) : new Date();

  const filtered = sales.filter(o=>{
    const t = new Date(o.time);
    return t>=startTime && t<=endTime;
  });

  const itemsCount = {};
  let totalSales = 0;

  filtered.forEach(o=>{
    totalSales += Number(o.total||0);
    (o.items||[]).forEach(i=>{
      itemsCount[i.name] = (itemsCount[i.name]||0) + Number(i.qty);
    });
  });

  res.json({ itemsCount, totalSales });
});

// Start server
app.listen(PORT, ()=>{ console.log(`🍽 VodiyCafe server running at http://localhost:${PORT}`); });
