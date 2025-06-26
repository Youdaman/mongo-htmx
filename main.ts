import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import { csrf } from 'hono/csrf'
import { secureHeaders } from 'hono/secure-headers'
import { compress } from 'hono/compress'
import { logger } from 'hono/logger'
import { streamSSE, SSEStreamingApi } from 'hono/streaming'
import { serveStatic } from 'hono/deno'
import { MongoClient } from 'mongodb'
import '@std/dotenv/load'

// TODO refactor into separate file
const url = 'mongodb://127.0.0.1:27017'
const client = new MongoClient(url)
const dbName = 'realtime'
await client.connect()
const db = client.db(dbName)
const collection = db.collection('items')
const changeStream = collection.watch();

changeStream.on('change', async (change) => {
  const data = 'fullDocument' in change && change.fullDocument ? change.fullDocument.item : null;
  await broadcast({ data, event: 'items-update'})
});

const app = new Hono()
app.use(csrf())
app.use(secureHeaders())
app.use(compress())
app.use(logger())
app.get('*', serveStatic({ root: './static' }))

const itemSchema = z.object({
  item: z.string().min(1, 'Item is required').max(100, 'Item must be less than 100 characters'),
  done: z.boolean().optional(),
})

app.post('/create', zValidator('form', itemSchema), async (c) => {
  const { item } = c.req.valid('form')
  await collection.insertOne({ item, createdAt: new Date() })
  return c.body(null, 201)
})

app.get('/items', async (c) => {
  const pp = c.req.query('pp') ? parseInt(String(c.req.query('pp'))) : 10
  const items = (await collection.find().sort({ createdAt: -1 }).limit(pp).toArray()).reverse()
  const html = items.map((item) => `<div class="item">${item.createdAt.toISOString()} - ${item.item}</div>`).join('')
  return c.html(html)
})

const clients = new Set<{ id: number; stream: SSEStreamingApi }>();
let clientId = 0;

app.get('/sse', (c) => {
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
  await broadcast({ data, event: 'time-update'})
}, 1000);

Deno.serve(app.fetch)

async function broadcast({ data, event }: { data: string | Record<string, unknown>; event: string }) {
  for (const client of clients) {
    try {
      await client.stream.writeSSE({
        data,
        event,
      });
    } catch (err) {
      console.log(`Error sending to client ${client.id}:`, err);
      clients.delete(client);
    }
  }
}
