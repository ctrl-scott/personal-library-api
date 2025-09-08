// tools/smoke-test.js
// Very small runtime check without Jest.

const http = require('http');

function request(method, path, body) {
  const data = body ? Buffer.from(JSON.stringify(body)) : null;
  const opts = {
    hostname: 'localhost',
    port: process.env.PORT || 3333,
    path,
    method,
    headers: data ? { 'Content-Type': 'application/json', 'Content-Length': data.length } : {}
  };
  return new Promise((resolve, reject) => {
    const req = http.request(opts, (res) => {
      const chunks = [];
      res.on('data', (d) => chunks.push(d));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        resolve({ status: res.statusCode, json: text ? JSON.parse(text) : null });
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function run() {
  try {
    // Create
    const book = {
      title: "The Art of Computer Programming, Vol. 1",
      authors: ["Donald E. Knuth"],
      publisher: "Addison-Wesley",
      publicationDate: "1997-07-10",
      isbn13: "978-0201558029",
      purchaseDate: "2020-01-15",
      pricePaid: 89.99,
      tags: ["CS", "Algorithms"],
      readStatus: "Reading"
    };
    const created = await request('POST', '/api/books', book);
    if (created.status !== 201) throw new Error('Create failed');

    // Get
    const got = await request('GET', `/api/books/${created.json.id}`);
    if (got.status !== 200) throw new Error('Get failed');

    // List
    const list = await request('GET', '/api/books?q=Algorithms&limit=5&offset=0');
    if (list.status !== 200 || list.json.items.length < 1) throw new Error('List failed');

    // Patch
    const patched = await request('PATCH', `/api/books/${created.json.id}`, { rating: 5, readStatus: 'Finished' });
    if (patched.status !== 200 || patched.json.rating !== 5) throw new Error('Patch failed');

    // Delete
    const del = await request('DELETE', `/api/books/${created.json.id}`);
    if (del.status !== 204) throw new Error('Delete failed');

    // eslint-disable-next-line no-console
    console.log('Smoke test passed.');
    process.exit(0);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Smoke test failed:', err.message);
    process.exit(1);
  }
}

if (require.main === module) run();

