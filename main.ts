import { Hono } from 'hono'
import { z } from 'zod'
// import { describeRoute } from 'hono-openapi'
// import { resolver, validator as zValidator } from 'hono-openapi/zod'
import { validator as zValidator } from 'hono-openapi/zod'
import { csrf } from 'hono/csrf'
import { secureHeaders } from 'hono/secure-headers'
import { compress } from 'hono/compress'
import { logger } from 'hono/logger'
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

const app = new Hono()
app.use(csrf())
app.use(secureHeaders())
app.use(compress())
app.use(logger())
app.get('*', serveStatic({ root: './static' }))

const itemSchema = z.object({
  item: z.string().min(1, 'Item is required'),
  done: z.boolean().optional(),
})

app.post('/create', zValidator('form', itemSchema), async (c) => {
  const body = c.req.valid('form')
  const item = body.item
  if (item) {
    await collection.insertOne({ item, createdAt: new Date() })
    c.header('HX-Trigger', 'itemAdded')
    return c.text('Created', 201)
  }
  return c.text('Item not provided', 400)
})

app.get('/items', async (c) => {
  const pp = c.req.query('pp') ? parseInt(String(c.req.query('pp'))) : 10
  const items = (await collection.find().sort({ createdAt: -1 }).limit(pp).toArray()).reverse()
  const html = items.map((item) => `<div class="item">${item.createdAt.toISOString()} - ${item.item}</div>`).join('')
  return c.html(html)
})

Deno.serve(app.fetch)
