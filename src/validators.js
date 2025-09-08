// src/validators.js
// JSON Schemas and Ajv validators for request bodies.

const Ajv = require('ajv');
const addFormats = require('ajv-formats');

const ajv = new Ajv({ allErrors: true, removeAdditional: 'failing' });
addFormats(ajv);

// A "Book" represents a single purchased item in your collection.
// You can add or remove properties as needed. Unknown properties will be rejected.
const bookSchema = {
  $id: 'Book',
  type: 'object',
  additionalProperties: false,
  required: ['title'],
  properties: {
    // Identity
    id: { type: 'string', readOnly: true },
    title: { type: 'string', minLength: 1 },
    subtitle: { type: 'string' },
    authors: {
      type: 'array',
      items: { type: 'string', minLength: 1 },
      default: []
    },
    publisher: { type: 'string' },
    publicationDate: { type: 'string', format: 'date' },
    isbn10: { type: 'string', pattern: '^[0-9Xx-]{10,}$' },
    isbn13: { type: 'string', pattern: '^(97(8|9))?[0-9-]{10,}$' },
    edition: { type: 'string' },
    format: { type: 'string', enum: ['Hardcover', 'Paperback', 'eBook', 'Audiobook', 'Other'], default: 'Hardcover' },

    // Ownership / purchase metadata
    purchaseDate: { type: 'string', format: 'date' },
    pricePaid: { type: 'number', minimum: 0 },
    currency: { type: 'string', minLength: 1, default: 'USD' },
    condition: { type: 'string', enum: ['New', 'Like New', 'Very Good', 'Good', 'Acceptable', 'Poor'], default: 'Good' },
    location: { type: 'string', description: 'Shelf, box, room, etc.' },

    // Curation
    tags: {
      type: 'array',
      items: { type: 'string', minLength: 1 },
      default: []
    },
    notes: { type: 'string' },
    readStatus: { type: 'string', enum: ['Unread', 'Reading', 'Finished', 'Abandoned'], default: 'Unread' },
    rating: { type: 'integer', minimum: 1, maximum: 5 },

    // Optional extras
    coverUrl: { type: 'string', format: 'uri' },

    // System
    createdAt: { type: 'string', format: 'date-time', readOnly: true },
    updatedAt: { type: 'string', format: 'date-time', readOnly: true }
  }
};

// Partial updates allow any subset of properties (except readOnly system fields).
const partialBookSchema = {
  $id: 'BookPatch',
  type: 'object',
  additionalProperties: false,
  properties: { ...bookSchema.properties }
};
delete partialBookSchema.properties.id;
delete partialBookSchema.properties.createdAt;
delete partialBookSchema.properties.updatedAt;

const listQuerySchema = {
  $id: 'ListQuery',
  type: 'object',
  additionalProperties: false,
  properties: {
    q: { type: 'string' },
    author: { type: 'string' },
    tag: { type: 'string' },
    beforePurchaseDate: { type: 'string', format: 'date' },
    afterPurchaseDate: { type: 'string', format: 'date' },
    sort: {
      type: 'string',
      enum: ['title', '-title', 'purchaseDate', '-purchaseDate', 'createdAt', '-createdAt', 'updatedAt', '-updatedAt'],
      default: 'title'
    },
    limit: { type: 'integer', minimum: 1, maximum: 500, default: 50 },
    offset: { type: 'integer', minimum: 0, default: 0 }
  }
};

const compile = (schema) => ajv.compile(schema);

module.exports = {
  compile,
  bookSchema,
  partialBookSchema,
  listQuerySchema,
  ajv
};

