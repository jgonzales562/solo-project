# Middleware Composer

An interactive tool for composing, testing, and visualizing Express.js middleware chains. Build middleware pipelines with a drag-and-drop interface, test them with mock requests, and export production-ready code.

## Features

- 📦 **Middleware Catalog** - Pre-built middleware for common tasks (auth, logging, cookies, etc.)
- ⚙️ **Visual Configuration** - Configure middleware options with JSON
- 🎯 **Mock Testing** - Test chains with custom requests without running a real server
- ⏱️ **Performance Timeline** - See execution time and status for each middleware
- 📤 **Code Export** - Generate TypeScript code ready to paste into your project
- 🔍 **Error Handling** - Visualize errors and short-circuits in the chain

## Getting Started

Requires Node.js 18+ (repo `.nvmrc` targets 20.x). If you use `nvm`, run `nvm use`.

### Installation

```bash
npm install
```

### Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Production Build

```bash
npm run build
npm start
```

## How It Works

1. **Select Middleware** - Choose from the catalog of available middleware
2. **Configure & Order** - Adjust options and reorder with ↑↓ buttons
3. **Create Mock Request** - Define method, path, headers, query params, and body
4. **Run Chain** - Execute and see the timeline with execution details (⌘+Enter)
5. **Export Code** - Generate TypeScript code for your Express app (⌘+E)

### Keyboard Shortcuts

- `Cmd/Ctrl + Enter` - Run chain
- `Cmd/Ctrl + E` - Export code

## Available Middleware

- **Logger** - Logs requests to `res.locals`
- **Delay** - Adds artificial delay for testing
- **Set Header** - Sets response headers
- **Set Cookie** - Sets cookies (with HttpOnly option)
- **Auth Required** - Validates authentication token
- **Attach User** - Attaches user data from headers
- **Respond** - Sends JSON response (short-circuits chain)
- **Throw Error** - Tests error handling
- **SSID Cookie** - Sets an HttpOnly session cookie using built-in mock logic

## Architecture

- **Frontend**: Vanilla JavaScript with simple UI
- **Backend**: Express.js + TypeScript
- **Middleware System**: Custom execution engine with timing and error handling
- **Registry Pattern**: Extensible middleware catalog

## Project Structure

```
├── client/           # Frontend UI
│   ├── index.html
│   └── app.js
├── src/
│   ├── server.ts            # Express server
│   ├── routes/
│   │   └── composeRoutes.ts # API endpoints
│   ├── middlewares/
│   │   ├── registry.ts           # Middleware catalog
│   │   └── registryExports.ts    # Typed map of middleware factories
│   ├── composer/
│   │   └── composeTimed.ts  # Chain execution engine
└── dist/            # Compiled JavaScript (generated)
```

## API Endpoints

- `GET /api/middlewares` - Returns middleware catalog
- `POST /api/compose/run` - Executes middleware chain with mock request
- `POST /api/compose/export` - Generates TypeScript code snippet
- `GET /health` - Liveness probe
- `GET /ready` - Readiness probe

## License

ISC
