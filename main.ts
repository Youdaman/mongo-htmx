import { Hono } from 'hono'
import { serveStatic } from 'hono/deno'
import { SSEStreamingApi, streamSSE } from 'hono/streaming'
import { MongoClient } from 'mongodb'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'

const schema = z.object({
  item: z.string().min(1, 'Item is required'),
  createdAt: z.date().optional()
})

const url = 'mongodb://127.0.0.1:27017';
const client = new MongoClient(url);
const dbName = 'realtime';
await client.connect();
const db = client.db(dbName);
const collection = db.collection('items');

const app = new Hono()

app.get('/', serveStatic({ path: './index.html' }))

app.post('/create', zValidator('form', schema), async (c) => {
  // const body = await c.req.parseBody();
  const body = c.req.valid('form')
  const item = body.item;
  console.log(`create item: ${item}`);
  if (item) {
    await collection.insertOne({ item, createdAt: new Date() }); // Add createdAt field
    return c.text('Item created', 201);
  }
  return c.text('Item not provided', 400);
});

app.get('/items', async (c) => {
  const pp = c.req.query('pp') ? parseInt(String(c.req.query('pp'))) : 10;
  console.log(`get items: ${pp}`);
  const items = (await collection.find().sort({ createdAt: -1 }).limit(pp).toArray()).reverse();
  const html = items.map((item) => `<div class="item">${item.createdAt.toISOString()} - ${item.item}</div>`).join('');
  return c.html(html);
});

const clients = new Set<{ id: number; stream: SSEStreamingApi }>();
let clientId = 0;

app.get('/sse', async (c) => {
  return streamSSE(c, async (stream) => {
    const id = clientId++;
    const client = { id, stream };
    clients.add(client);

    console.log(`Client added: ${id}, total clients: ${clients.size}`);

    stream.onAbort(() => {
      console.log(`Client removed: ${id}`);
      clients.delete(client);
    });

    // Keep the connection open until the client disconnects
    await new Promise(() => { });
  });
});

// Broadcast updates to all clients at a fixed interval
setInterval(async () => {
  const data = `Time: ${new Date().toISOString()}`;
  for (const client of clients) {
    try {
      await client.stream.writeSSE({
        data,
        event: 'time-update',
      });
    } catch (err) {
      console.log(`Error sending to client ${client.id}:`, err);
      clients.delete(client);
    }
  }
}, 1000);

// const pipeline = [
//   { $match: { operationType: 'insert' } }, // Only watch for insert operations
//   {
//     $match: {
//       'fullDocument.createdAt': {
//         $gte: new Date(Date.now() - 30 * 1000), // Only include documents from the last 30 seconds
//       },
//     },
//   },
// ];

// const changeStream = collection.watch(pipeline);
// const changeStream = collection.watch([], { fullDocument: 'updateLookup' });
const changeStream = collection.watch();

changeStream.on('change', async (change) => {
  const data = 'fullDocument' in change && change.fullDocument ? change.fullDocument.item : null;
  for (const client of clients) {
    try {
      await client.stream.writeSSE({
        data,
        event: 'items-update',
      });
    } catch (err) {
      console.log(`Error sending to client ${client.id}:`, err);
      clients.delete(client);
    }
  }
});

Deno.serve(app.fetch)
