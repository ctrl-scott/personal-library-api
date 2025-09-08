// src/store.js
// A tiny atomic JSON file datastore with a write queue.
// The in-memory model is { books: [] }.

const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');

class Store {
  constructor(filePath) {
    this.filePath = filePath;
    this.tmpPath = `${filePath}.tmp`;
    this.state = { books: [] };
    this.ready = this._init();
    this._writeQueue = Promise.resolve();
  }

  async _init() {
    await fsp.mkdir(path.dirname(this.filePath), { recursive: true });
    try {
      const data = await fsp.readFile(this.filePath, 'utf8');
      this.state = JSON.parse(data);
      if (!this.state.books || !Array.isArray(this.state.books)) {
        this.state.books = [];
      }
    } catch (err) {
      if (err.code === 'ENOENT') {
        await this._flush();
      } else {
        throw err;
      }
    }
  }

  _enqueueWrite() {
    // Serialize writes to avoid corruption.
    this._writeQueue = this._writeQueue.then(() => this._flush());
    return this._writeQueue;
  }

  async _flush() {
    const text = JSON.stringify(this.state, null, 2);
    await fsp.writeFile(this.tmpPath, text, 'utf8');
    await fsp.rename(this.tmpPath, this.filePath);
  }

  // ---- CRUD helpers ----

  async list({ q, author, tag, beforePurchaseDate, afterPurchaseDate, sort, limit, offset }) {
    await this.ready;
    let rows = this.state.books.slice();

    if (q && q.trim()) {
      const needle = q.trim().toLowerCase();
      rows = rows.filter((b) => {
        const hay = [
          b.title, b.subtitle, b.publisher, b.notes,
          ...(b.authors || []),
          ...(b.tags || [])
        ].filter(Boolean).join(' ').toLowerCase();
        return hay.includes(needle);
      });
    }
    if (author && author.trim()) {
      const a = author.trim().toLowerCase();
      rows = rows.filter((b) => (b.authors || []).some((x) => x.toLowerCase().includes(a)));
    }
    if (tag && tag.trim()) {
      const t = tag.trim().toLowerCase();
      rows = rows.filter((b) => (b.tags || []).some((x) => x.toLowerCase() === t));
    }
    if (beforePurchaseDate) {
      rows = rows.filter((b) => b.purchaseDate && b.purchaseDate <= beforePurchaseDate);
    }
    if (afterPurchaseDate) {
      rows = rows.filter((b) => b.purchaseDate && b.purchaseDate >= afterPurchaseDate);
    }

    const compare = (field, dir) => (a, b) => {
      const av = a[field] ?? '';
      const bv = b[field] ?? '';
      if (av < bv) return dir === 'asc' ? -1 : 1;
      if (av > bv) return dir === 'asc' ? 1 : -1;
      return 0;
    };

    const sortMap = {
      'title': compare('title', 'asc'),
      '-title': compare('title', 'desc'),
      'purchaseDate': compare('purchaseDate', 'asc'),
      '-purchaseDate': compare('purchaseDate', 'desc'),
      'createdAt': compare('createdAt', 'asc'),
      '-createdAt': compare('createdAt', 'desc'),
      'updatedAt': compare('updatedAt', 'asc'),
      '-updatedAt': compare('updatedAt', 'desc')
    };

    rows.sort(sortMap[sort] || sortMap.title);

    const total = rows.length;
    const slice = rows.slice(offset, offset + limit);
    return { total, items: slice };
  }

  async get(id) {
    await this.ready;
    return this.state.books.find((b) => b.id === id) || null;
  }

  async upsert(book) {
    await this.ready;
    const idx = this.state.books.findIndex((b) => b.id === book.id);
    if (idx >= 0) {
      this.state.books[idx] = book;
    } else {
      this.state.books.push(book);
    }
    await this._enqueueWrite();
    return book;
  }

  async remove(id) {
    await this.ready;
    const before = this.state.books.length;
    this.state.books = this.state.books.filter((b) => b.id !== id);
    const removed = before !== this.state.books.length;
    if (removed) await this._enqueueWrite();
    return removed;
  }

  async allTags() {
    await this.ready;
    const set = new Set();
    for (const b of this.state.books) (b.tags || []).forEach((t) => set.add(t));
    return Array.from(set).sort();
  }

  async exportJson() {
    await this.ready;
    return JSON.parse(JSON.stringify(this.state.books));
  }

  async importJson(array, { dedupeByIsbn = true } = {}) {
    await this.ready;
    if (!Array.isArray(array)) throw new Error('Import payload must be an array of books');

    const isbnKey = (b) => (b.isbn13 || b.isbn10 || '').replace(/-/g, '').toUpperCase();
    const byIsbn = new Map(this.state.books.map((b) => [isbnKey(b), b.id]));

    let created = 0, updated = 0;
    for (const incoming of array) {
      const key = isbnKey(incoming);
      if (dedupeByIsbn && key && byIsbn.has(key)) {
        // Merge minimal fields into existing record
        const id = byIsbn.get(key);
        const existing = this.state.books.find((b) => b.id === id);
        Object.assign(existing, { ...incoming, id, updatedAt: new Date().toISOString() });
        updated += 1;
      } else {
        this.state.books.push(incoming);
        if (dedupeByIsbn && key) byIsbn.set(key, incoming.id);
        created += 1;
      }
    }
    await this._enqueueWrite();
    return { created, updated };
  }
}

module.exports = { Store };

