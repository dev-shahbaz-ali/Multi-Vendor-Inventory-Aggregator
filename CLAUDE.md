# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Start development server (with auto-reload)
npm run dev

# Start production server
node server.js

# Run unit tests
npm test

# Run race condition load test
npm run test:load
```

MongoDB must be running locally before starting the server.

## Environment Setup

Create a `.env` file in the root with:
```
PORT=3000
MONGODB_URI=mongodb://localhost:27017/inventory_aggregator
SENDGRID_API_KEY=your-sendgrid-api-key
ALERT_EMAIL_FROM=alerts@yourdomain.com
ALERT_EMAIL_TO=admin@yourdomain.com
LOW_STOCK_THRESHOLD=10
WEBHOOK_SECRET=your-webhook-secret
```

The server exits on startup if `MONGODB_URI` is missing or if MongoDB is unreachable.

## Architecture — Clean Architecture / Service Pattern

Entry point is `server.js`. The project MUST follow a service pattern with clear layer separation:

```
src/
├── routes/            # HTTP route definitions only — call controllers
├── controllers/       # Parse request/response — call services
├── services/          # ALL business logic lives here
│   ├── inventoryService.js      # Stock management logic
│   ├── purchaseService.js       # Purchase processing with atomic updates
│   ├── reconciliationService.js # Vendor vs local stock comparison
│   └── notificationService.js   # WebSocket alert emission
├── integrations/      # External service wrappers
│   ├── emailService.js          # SendGrid/Mailgun wrapper
│   └── webhookHandler.js        # Incoming webhook processing
├── models/            # Mongoose schemas
├── middlewares/       # Auth, validation, error handling
├── websocket/         # Socket.io setup and event handlers
├── views/             # EJS templates for dashboard
├── config/            # Environment config, DB connection
├── utils/             # Helper functions
└── tests/
    ├── unit/          # Service function tests
    ├── integration/   # API endpoint tests
    └── load/          # Race condition scripts (50 concurrent requests)
```

### Layer Rules

- **Routes** → only define endpoints, call controllers. No logic.
- **Controllers** → parse req/res, call services, send response. Never touch DB directly.
- **Services** → ALL business logic. Call models/repositories for data. Call integrations for external APIs.
- **Integrations** → wrap third-party APIs (SendGrid, vendor webhooks). Only called by services.
- **Models** → Mongoose schemas and queries only.

### Request Flow

```
HTTP Request → Route → Controller → Service → Model (DB)
                                       ↓
                                  Integration (email/websocket)
```

## Data Models (`src/models/`)

- **Product** — catalog item with SKU (unique, uppercased), vendorId, and price
- **Inventory** — one record per product; tracks `stock`, `lowStockThreshold`, `version`, and `lastSyncedAt`
- **Transaction** — purchase audit log with UUID `transactionId` and status (`pending` → `completed`/`failed`)
- **Vendor** — vendor information (must be actively used in webhook and reconciliation flows)

## Key Features

### 1. WebSocket — Low Stock Alerts (Push)

- Socket.io runs alongside Express in `server.js`
- The `io` instance and `emitAlert` helper are initialized in `server.js` and injected into controllers via `controller.setWebSocket(io, emitAlert)`
- Controllers store these as module-level variables
- When stock drops ≤ threshold after any update, emit `low_stock_alert` to all connected clients
- Alert payload: `{ productId, productName, currentStock, threshold, timestamp }`
- Admin dashboard at `/dashboard` connects to WebSocket and displays alerts in real-time

**WebSocket events:**
- `low_stock_alert` — fired after stock reduction drops stock ≤ threshold
- `connected` — sent to each client on connect
- `subscribed` — reply to `subscribe_alerts` from client

### 2. Webhook — Vendor Price Updates (Pull)

- Endpoint: `POST /api/webhook/price-update`
- Accepts JSON: `{ vendorId, productId, newPrice, timestamp }`
- Validates incoming payload (required fields, data types)
- Authenticates via `x-webhook-secret` header matched against `WEBHOOK_SECRET` env var
- Updates local product price in database
- Logs all incoming webhook events
- Returns 200 on success, 400 on invalid data, 401 on bad secret

### 3. Race Condition Prevention — Atomic Purchases

Uses MongoDB atomic `findOneAndUpdate` — the stock check and decrement happen in ONE operation:

```javascript
const result = await Inventory.findOneAndUpdate(
  { productId, stock: { $gte: quantity } },
  { $inc: { stock: -quantity }, $inc: { version: 1 } },
  { new: true }
);
// result is null → stock insufficient → reject purchase
```

This prevents overselling without needing MongoDB transactions. Every write also increments `version` for optimistic locking.

**Test criteria:** Set stock to 5, fire 50 concurrent requests → exactly 5 succeed, stock ends at 0, never negative.

### 4. Email — Reconciliation Failure Alerts

- Uses SendGrid (or Mailgun/Nodemailer) for email
- Reconciliation function compares vendor-reported stock vs local DB stock
- Email triggers ONLY on mismatch (not on every check)
- Email includes: product name, vendor stock, local stock, vendor name, timestamp
- All credentials in `.env`
- Email failures are caught and logged — they never crash the app
- Email logic lives in `src/integrations/emailService.js`, called by `src/services/reconciliationService.js`

## API Summary

| Resource | Base path |
|----------|-----------|
| Products | `POST/GET /api/products`, `GET/PUT/DELETE /api/products/:id` |
| Inventory | `POST/GET /api/inventory`, routes under `/api/inventory/:productId/...` |
| Purchases | `POST /api/purchase`, `POST /api/purchase/batch` |
| Webhook | `POST /api/webhook/price-update` |
| Reconciliation | `POST /api/reconciliation/run` |
| Health | `GET /health` |

## Coding Conventions

- Use `async/await` everywhere — no raw callbacks or `.then()` chains
- Consistent response format: `{ success: boolean, data: any, message: string }`
- HTTP status codes: 200 (ok), 201 (created), 400 (bad request), 404 (not found), 409 (conflict/out of stock), 500 (server error)
- All errors pass through centralized error-handling middleware
- No hardcoded secrets anywhere — everything from `.env`
- No dead code — every model and module must be actively used

## Common Pitfalls

- **DO NOT** put business logic in route files or controllers — use services
- **DO NOT** use `find()` then `save()` for stock updates — use atomic `findOneAndUpdate`
- **DO NOT** hardcode API keys or database URIs
- **DO NOT** send emails on every reconciliation — only on mismatches
- **DO NOT** let email failures crash the purchase or reconciliation flow
- **DO NOT** skip input validation on webhook endpoints
- **DO NOT** leave the Vendor model unused — integrate it into webhook and reconciliation flows