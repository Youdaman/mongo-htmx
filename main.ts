import { Hono } from 'hono'
import { serveStatic } from 'hono/deno'
import { SSEStreamingApi, streamSSE } from 'hono/streaming'
import { MongoClient } from 'mongodb'

const url = 'mongodb://127.0.0.1:27017';
const client = new MongoClient(url);
const dbName = 'realtime';
await client.connect();
const db = client.db(dbName);
const collection = db.collection('items');

const app = new Hono()

app.get('/', serveStatic({ path: './index.html' }))

app.post('/create', async (c) => {
  const body = await c.req.parseBody();
  const item = body.item;
  console.log(`create item: ${item}`);
  if (item) {
    await collection.insertOne({ item });
    return c.text('Item created', 201);
  }
  return c.text('Item not provided', 400);
});

app.get('/items', async (c) => {
  const items = await collection.find().toArray();
  const html = items.map((item) => `<div class="item">${item.item}</div>`).join('');
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
  const message = `It is ${new Date().toISOString()}`;
  for (const client of clients) {
    try {
      await client.stream.writeSSE({
        data: message,
        event: 'time-update',
      });
    } catch (err) {
      console.log(`Error sending to client ${client.id}:`, err);
      clients.delete(client);
    }
  }
}, 1000);

Deno.serve(app.fetch)
