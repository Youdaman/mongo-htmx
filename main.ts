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

const changeStream = collection.watch();
changeStream.on('error', (error) => {
  console.error('Change stream error:', error);
});
changeStream.on('change', (change) => {
  console.log('Received a change event:', change);
});
console.log('Change stream created');

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

// let id = 0

app.get('/sse', (c) => {
  return streamSSE(c, async (stream) => {
    while (true) {
      const message = `It is ${new Date().toISOString()}`
      await stream.writeSSE({
        data: message,
        event: 'EventName',
        // id: String(id++),
      })
      await stream.sleep(1000)
    }
  })
})


// // Streaming endpoint for live updates
// app.get('/stream', async (c) => {
//   console.log('Received GET request to /stream');
//   return streamSSE(c, async (stream) => {
//     console.log('Stream connection established');
//     stream.onAbort(() => {
//       console.log('Stream aborted by client');
//     });

//     changeStream.on('change', async (change) => {
//       console.log('Received a change event in /stream:', change);
//       if ('fullDocument' in change && change.fullDocument) {
//         const item = change.fullDocument;
//         const html = `<div class="item">${item.item}</div>`;
//         // Send the data in the correct SSE format using streamSSE
//         await stream.writeSSE({
//           data: html,
//           event: 'message'
//         });
//       }
//     });
//   });
// });

// Start the server
Deno.serve(app.fetch)
