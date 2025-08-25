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

// mongo connection, collection and change stream setup
const url = 'mongodb://127.0.0.1:27017'
const client = new MongoClient(url)
const dbName = 'realtime'
await client.connect()
const db = client.db(dbName)
const collection = db.collection('items')
const changeStream = collection.watch()

changeStream.on('change', async (change) => {
  if (change.operationType === 'insert' || change.operationType === 'replace') {
    const text = change.fullDocument.text
    await broadcast({ data: text, event: 'items-update' })
  }
})

// setup hono app + middleware
const app = new Hono()
app.use(csrf())
app.use(secureHeaders())
app.use(compress())
app.use(logger())
app.get('*', serveStatic({ root: './static' }))

// Zod schema for items
const itemSchema = z.object({
  text: z.string().min(1, 'Text is required').max(100, 'Text must be less than 100 characters'),
  done: z.boolean().optional(),
})

// create item after validating form data
app.post('/create', zValidator('form', itemSchema), async (c) => {
  const { text } = c.req.valid('form')
  console.log(`Creating item with text: ${text}`)
  await collection.insertOne({ text, createdAt: new Date() })
  return c.body(null, 201)
})

// return HTML for items, reverse chronological order, paginated
app.get('/items', async (c) => {
  const pp = c.req.query('pp') ? parseInt(String(c.req.query('pp'))) : 10
  const items = (await collection.find().sort({ createdAt: -1 }).limit(pp).toArray()).reverse()
  const html = items.map((item) => `<div class="item">${item.createdAt.toISOString()} - ${item.text}</div>`).join('')
  console.log(`html: ${html}`)
  return c.html(html)
})

// SSE client set
const clients = new Set<{ id: number; stream: SSEStreamingApi }>()
let clientId = 0

// SSE connection endpoint
app.get('/sse', (c) => {
  return streamSSE(c, async (stream) => {
    const id = clientId++
    const client = { id, stream }
    clients.add(client)
    console.log(`Client added: ${id}, total clients: ${clients.size}`)
    stream.onAbort(() => {
      console.log(`Client removed: ${id}`)
      clients.delete(client)
    })
    await new Promise(() => { }) // keep connection open until client disconnects
  })
})

// broadcast time update every second 
setInterval(async () => {
  const data = `Time: ${new Date().toISOString()}`
  await broadcast({ data, event: 'time-update'})
}, 1000)

Deno.serve(app.fetch)

// send data/event to all connected clients
async function broadcast({ data, event }: { data: string; event: string }) {
  for (const client of clients) {
    try {
      await client.stream.writeSSE({
        data,
        event,
      })
    } catch (err) {
      console.log(`Error sending to client ${client.id}:`, err)
      clients.delete(client)
    }
  }
}
