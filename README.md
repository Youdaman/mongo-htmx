# Real-time MongoDB Updates with Deno, Hono and HTMX

A simple demonstration of real-time updates using MongoDB Change Streams,
Server-Sent Events (SSE), and HTMX. Built with the Hono web framework for Deno.
Watch as items update instantly across multiple browser windows without writing
any JavaScript.

## Features

- 🦕 Built with Deno and TypeScript
- 🚀 Hono web framework
- 📊 MongoDB Change Streams for real-time data
- 🔄 Server-Sent Events (SSE) for pushing updates
- ⚡ HTMX for dynamic UI updates
- 🔍 Configurable pagination limit (`pp` query parameter)

## Quick Start

1. **Install Dependencies**
   - [Deno](https://deno.land/#installation)
   - [MongoDB](https://www.mongodb.com/try/download/community)

2. **Start MongoDB with Replication**

   MongoDB Change Streams require a replica set. Either:

   a) Add to your mongod.cfg:
   ```yaml
   replication:
     replSet: "rs0"
   ```

   b) Or start mongod with the --replSet flag:
   ```bash
   mongod --replSet rs0
   ```

   Then initialize the replica set:
   ```bash
   mongosh
   > rs.initiate()
   ```

3. **Run the Application**
   ```bash
   deno task dev
   ```

4. **Visit the App**
   ```
   http://localhost:8000
   ```

## How It Works

1. Hono handles HTTP routing and SSE streaming
2. MongoDB Change Streams watch for database updates
3. Server pushes changes via SSE to connected clients
4. HTMX updates the DOM without page refresh
5. Items list shows most recent items first, limited by `pp` parameter
   (default: 10)

## API Endpoints

- `GET /` - Main page (Hono static file serving)
- `POST /create` - Create new item
- `GET /items?pp={limit}` - List items with optional pagination limit
- `GET /sse` - SSE connection for real-time updates

## Project Structure

```
├── main.ts       # Hono server implementation
├── index.html    # Frontend with HTMX
├── deno.json     # Deno configuration
└── README.md     # Documentation
```

## Tech Stack

- **[Deno](https://deno.land/)** - Modern runtime for JavaScript and TypeScript
- **[Hono](https://hono.dev/)** - Ultrafast web framework
- **[MongoDB](https://www.mongodb.com/)** - Document database with Change
  Streams
- **[HTMX](https://htmx.org/)** - HTML-based interactivity

## License

MIT
