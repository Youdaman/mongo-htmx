import { Hono } from 'hono'
import { serveStatic } from 'hono/deno'
import { streamSSE } from 'hono/streaming'
import { MongoClient } from 'mongodb'

const url = 'mongodb://127.0.0.1:27017';
const client = new MongoClient(url);
const dbName = 'realtime';
await client.connect();
const db = client.db(dbName);
const collection = db.collection('items');

const app = new Hono()

// Serve the static index.html file
app.get('/', serveStatic({ path: './index.html' }))

// Endpoint to create a new item
app.post('/create', async (c) => {
  console.log('Received POST request to /create');
  const body = await c.req.parseBody(); // Parse form data
  console.log(body); // Debugging: Check if "item" is received
  const item = body.item; // Extract the "item" field
  if (item) {
    await collection.insertOne({ item }); // Insert the item into the database
    // const html = `<div class="item">${item}</div>`; // HTML for the new item
    // return c.html(html); // Return the HTML fragment
    // return a 201 response
    return c.text('Item created successfully', 201); // Return a success message
  }
  return c.text('Invalid input', 400); // Return an error for invalid input
});

// Endpoint to fetch existing items
app.get('/items', async (c) => {
  const items = await collection.find().toArray();
  const html = items.map((item) => `<div class="item">${item.item}</div>`).join('');
  return c.html(html);
});

let id = 0
app.get('/sse', (c) => {
  return streamSSE(c, async (stream) => {
    while (true) {
      const message = `It is ${new Date().toISOString()}`
      await stream.writeSSE({
        data: message,
        event: 'EventName',
        id: String(id++),
      })
      await stream.sleep(1000)
    }
  })
})

// Global list of subscribers
interface SSEClient {
  id: number;
  send: (data: string, event?: string) => Promise<void>;
}

const subscribers = new Set<SSEClient>();
let clientId = 0;

// Start a single change stream that broadcasts to all subscribers
async function startChangeStream() {
  const changeStream = collection.watch();
  console.log('Global change stream created');
  for await (const change of changeStream) {
    console.log('Change event detected:', change);
    if ('fullDocument' in change && change.fullDocument) {
      const item = change.fullDocument;
      const html = `<div class="item">${item.item}</div>`;
      // Broadcast the new item to all connected clients
      for (const client of subscribers) {
        try {
          await client.send(html, 'message');
        } catch (e) {
          console.log(`Error sending to client ${client.id}:`, e);
        }
      }
    }
  }
}
startChangeStream(); // Launch the global change stream in the background

// Modify the /stream endpoint to add clients to subscribers
app.get('/stream', (c) => {
  console.log('Received GET request to /stream for SSE pub-sub');

  return streamSSE(c, async (stream) => {
    // Create an SSEClient for this connection
    const client: SSEClient = {
      id: clientId++,
      send: async (data: string, event?: string) => {
        await stream.writeSSE({ data, event: event || 'message' });
      },
    };

    subscribers.add(client);
    console.log('Client added:', client.id);
    try {
      // Wait indefinitely until the client disconnects (which will cause stream.sleep to throw an error)
      while (true) {
        await stream.sleep(1000);
      }
    } catch (e) {
      // Client disconnected
    } finally {
      subscribers.delete(client);
      console.log('Client removed:', client.id);
    }
  });
});

// Start the server
Deno.serve(app.fetch)
