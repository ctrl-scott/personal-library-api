// src/server.js
// Express REST API for personal library metadata.

const path = require('path');
const fs = require('fs');
const express = require('express');
const morgan = require('morgan');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const { Store } = require('./store');
const { compile, bookSchema, partialBookSchema, listQuerySchema } = require('./validators');

const DATA_FILE = path.join(__dirname, '..', 'data', 'library.json');
const store = new Store(DATA_FILE);

// Validators
const validateNewBook = compile(bookSchema);
const validatePatchBook = compile(partialBookSchema);
const validateListQuery = compile(listQuerySchema);

const app = express();
app.use(morgan('dev'));
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));



// Health
app.get('/health', (_req, res) => {
  res.json({ ok: true, ts: new Date().toISOString() });
});

// List with filters, pagination, and sorting
app.get('/api/books', async (req, res) => {
  const query = {
    q: req.query.q,
    author: req.query.author,
    tag: req.query.tag,
    beforePurchaseDate: req.query.beforePurchaseDate,
    afterPurchaseDate: req.query.afterPurchaseDate,
    sort: req.query.sort,
    limit: Number(req.query.limit ?? 50),
    offset: Number(req.query.offset ?? 0)
  };

  if (!validateListQuery(query)) {
    return res.status(400).json({ error: 'Invalid query', details: validateListQuery.errors });
  }

  const result = await store.list(query);
  res.json(result);
});

// Retrieve by id
app.get('/api/books/:id', async (req, res) => {
  const item = await store.get(req.params.id);
  if (!item) return res.status(404).json({ error: 'Not found' });
  res.json(item);
});

// Create
app.post('/api/books', async (req, res) => {
  const now = new Date().toISOString();
  const incoming = {
    ...req.body,
    id: uuidv4(),
    createdAt: now,
    updatedAt: now
  };

  if (!validateNewBook(incoming)) {
    return res.status(400).json({ error: 'Validation failed', details: validateNewBook.errors });
  }

  // Optional ISBN de-duplication
  const all = await store.list({ limit: 50000, offset: 0, sort: 'title' });
  const normalizedIncomingIsbn = (incoming.isbn13 || incoming.isbn10 || '').replace(/-/g, '').toUpperCase();
  if (normalizedIncomingIsbn) {
    const dupe = all.items.find((b) => ((b.isbn13 || b.isbn10 || '').replace(/-/g, '')).toUpperCase() === normalizedIncomingIsbn);
    if (dupe) {
      return res.status(409).json({ error: 'Duplicate ISBN', existingId: dupe.id });
    }
  }

  const saved = await store.upsert(incoming);
  res.status(201).json(saved);
});

// Replace (full update)
app.put('/api/books/:id', async (req, res) => {
  const existing = await store.get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });

  const now = new Date().toISOString();
  const replacement = {
    ...req.body,
    id: existing.id,
    createdAt: existing.createdAt,
    updatedAt: now
  };

  if (!validateNewBook(replacement)) {
    return res.status(400).json({ error: 'Validation failed', details: validateNewBook.errors });
  }
  const saved = await store.upsert(replacement);
  res.json(saved);
});

// Patch (partial update)
app.patch('/api/books/:id', async (req, res) => {
  const existing = await store.get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });

  if (!validatePatchBook(req.body)) {
    return res.status(400).json({ error: 'Validation failed', details: validatePatchBook.errors });
  }

  const now = new Date().toISOString();
  const merged = { ...existing, ...req.body, id: existing.id, updatedAt: now };
  // Reuse full validator to ensure merged object is valid
  if (!validateNewBook(merged)) {
    return res.status(400).json({ error: 'Validation failed after merge', details: validateNewBook.errors });
  }

  const saved = await store.upsert(merged);
  res.json(saved);
});

// Delete
app.delete('/api/books/:id', async (req, res) => {
  const removed = await store.remove(req.params.id);
  if (!removed) return res.status(404).json({ error: 'Not found' });
  res.status(204).end();
});

// Tags
app.get('/api/tags', async (_req, res) => {
  const tags = await store.allTags();
  res.json({ count: tags.length, items: tags });
});

// Export all as JSON array
app.get('/api/export/json', async (_req, res) => {
  const books = await store.exportJson();
  res.setHeader('Content-Disposition', 'attachment; filename="books.json"');
  res.json(books);
});

// Import JSON array of books
app.post('/api/import/json', async (req, res) => {
  if (!Array.isArray(req.body)) {
    return res.status(400).json({ error: 'Body must be an array of books' });
  }

  // Validate and normalize each incoming book
  const now = new Date().toISOString();
  const incoming = [];
  for (const raw of req.body) {
    const book = {
      ...raw,
      id: raw.id || uuidv4(),
      createdAt: raw.createdAt || now,
      updatedAt: now
    };
    if (!validateNewBook(book)) {
      return res.status(400).json({ error: 'Validation failed for one or more items', details: validateNewBook.errors, item: raw });
    }
    incoming.push(book);
  }

  const stats = await store.importJson(incoming, { dedupeByIsbn: true });
  res.json({ ok: true, ...stats });
});

// Serve a minimal static index for quick manual checks (optional)
app.get('/', (_req, res) => {
  res.type('text').send('Personal Library API. See /health and /api/books');
});

// Start server
const PORT = process.env.PORT || 3333;
app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Personal Library API listening on http://localhost:${PORT}`);
});

