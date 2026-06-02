const functions = require('firebase-functions');
const admin = require('firebase-admin');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors')({ origin: true });

admin.initializeApp();
const db = admin.firestore();

const JWT_SECRET = functions.config().app?.jwt_secret || 'rotary-ocv-secret-2025';
const DOC_ID = 'main'; // single document for all data

// ── Auth Middleware ──
function verifyToken(req) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return null;
  try {
    return jwt.verify(auth.slice(7), JWT_SECRET);
  } catch { return null; }
}

// ── Helper: wrap with CORS ──
function handle(fn) {
  return functions.https.onRequest((req, res) => cors(req, res, () => fn(req, res)));
}

// ============================================
// GET /api/data — Public: get all data
// ============================================
exports.getData = handle(async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const doc = await db.collection('ocv').doc(DOC_ID).get();
    if (!doc.exists) {
      return res.json({
        governor: {
          name: 'Governor Name',
          designation: 'District Governor',
          district: 'District',
          year: 'RI Year 2025-26',
          theme: 'Service Above Self',
          photo: null,
          contact: ''
        },
        items: [],
        hasPassword: false
      });
    }
    const data = doc.data();
    // Never expose password hash to client
    const { passwordHash, ...safeData } = data;
    return res.json({ ...safeData, hasPassword: !!passwordHash });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Failed to fetch data' });
  }
});

// ============================================
// POST /api/auth/setup — Set password (first time)
// ============================================
exports.setupPassword = handle(async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const { password } = req.body;
    if (!password || password.length < 4) return res.status(400).json({ error: 'Password too short' });

    const doc = await db.collection('ocv').doc(DOC_ID).get();
    if (doc.exists && doc.data().passwordHash) {
      return res.status(400).json({ error: 'Password already set. Use login instead.' });
    }

    const hash = await bcrypt.hash(password, 12);
    await db.collection('ocv').doc(DOC_ID).set({ passwordHash: hash }, { merge: true });

    const token = jwt.sign({ role: 'admin' }, JWT_SECRET, { expiresIn: '8h' });
    return res.json({ token, message: 'Password set successfully' });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Failed to set password' });
  }
});

// ============================================
// POST /api/auth/login — Login
// ============================================
exports.login = handle(async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const { password } = req.body;
    if (!password) return res.status(400).json({ error: 'Password required' });

    const doc = await db.collection('ocv').doc(DOC_ID).get();
    if (!doc.exists || !doc.data().passwordHash) {
      return res.status(400).json({ error: 'No password set. Please set up first.' });
    }

    const valid = await bcrypt.compare(password, doc.data().passwordHash);
    if (!valid) return res.status(401).json({ error: 'Incorrect password' });

    const token = jwt.sign({ role: 'admin' }, JWT_SECRET, { expiresIn: '8h' });
    return res.json({ token });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Login failed' });
  }
});

// ============================================
// PUT /api/governor — Update governor profile
// ============================================
exports.updateGovernor = handle(async (req, res) => {
  if (req.method !== 'PUT') return res.status(405).json({ error: 'Method not allowed' });
  if (!verifyToken(req)) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const { name, designation, district, year, theme, photo, contact } = req.body;
    if (!name) return res.status(400).json({ error: 'Name required' });
    await db.collection('ocv').doc(DOC_ID).set({
      governor: { name, designation, district, year, theme, photo: photo || null, contact: contact || '' }
    }, { merge: true });
    return res.json({ success: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Failed to update governor' });
  }
});

// ============================================
// POST /api/items — Add item (visit or travel)
// ============================================
exports.addItem = handle(async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!verifyToken(req)) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const item = req.body;
    if (!item || !item.type) return res.status(400).json({ error: 'Item type required' });
    if (!item.id) item.id = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

    const doc = await db.collection('ocv').doc(DOC_ID).get();
    const items = doc.exists ? (doc.data().items || []) : [];
    items.push(item);
    await db.collection('ocv').doc(DOC_ID).set({ items }, { merge: true });
    return res.json({ success: true, item });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Failed to add item' });
  }
});

// ============================================
// PUT /api/items/:id — Update item
// ============================================
exports.updateItem = handle(async (req, res) => {
  if (req.method !== 'PUT') return res.status(405).json({ error: 'Method not allowed' });
  if (!verifyToken(req)) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const id = req.path.split('/').pop();
    const updatedItem = req.body;

    const doc = await db.collection('ocv').doc(DOC_ID).get();
    if (!doc.exists) return res.status(404).json({ error: 'Not found' });

    const items = doc.data().items || [];
    const idx = items.findIndex(i => i.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Item not found' });

    items[idx] = { ...items[idx], ...updatedItem, id };
    await db.collection('ocv').doc(DOC_ID).set({ items }, { merge: true });
    return res.json({ success: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Failed to update item' });
  }
});

// ============================================
// DELETE /api/items/:id — Delete item
// ============================================
exports.deleteItem = handle(async (req, res) => {
  if (req.method !== 'DELETE') return res.status(405).json({ error: 'Method not allowed' });
  if (!verifyToken(req)) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const id = req.path.split('/').pop();
    const doc = await db.collection('ocv').doc(DOC_ID).get();
    if (!doc.exists) return res.status(404).json({ error: 'Not found' });

    const items = (doc.data().items || []).filter(i => i.id !== id);
    await db.collection('ocv').doc(DOC_ID).set({ items }, { merge: true });
    return res.json({ success: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Failed to delete item' });
  }
});

// ============================================
// POST /api/migrate — Migrate localStorage data to Firestore
// ============================================
exports.migrateData = handle(async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!verifyToken(req)) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const { governor, items } = req.body;
    const doc = await db.collection('ocv').doc(DOC_ID).get();
    const existing = doc.exists ? doc.data() : {};

    const update = {};
    if (governor) update.governor = governor;
    if (items && items.length > 0) {
      const existingItems = existing.items || [];
      // Merge — avoid duplicates by ID
      const existingIds = new Set(existingItems.map(i => i.id));
      const newItems = items.filter(i => !existingIds.has(i.id));
      update.items = [...existingItems, ...newItems];
    }

    if (Object.keys(update).length > 0) {
      await db.collection('ocv').doc(DOC_ID).set(update, { merge: true });
    }
    return res.json({ success: true, migrated: items?.length || 0 });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Migration failed' });
  }
});
