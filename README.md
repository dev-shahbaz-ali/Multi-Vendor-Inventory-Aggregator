# Multi-Vendor Inventory Aggregator

A real-time inventory management system that aggregates stock across multiple vendors. Built with Node.js, Express, MongoDB, Socket.io, and EJS.

## Features

- Real-time low-stock alerts via WebSocket (Socket.io)
- Vendor price update webhook with HMAC signature verification
- Atomic stock operations — race-condition-safe purchases (no overselling)
- Inventory reconciliation with email alerts on stock mismatch
- EJS dashboard UI

## Prerequisites

- Node.js 18+
- MongoDB running locally on port 27017 (or provide a remote URI)

## Setup

```bash
# 1. Install dependencies
npm install

# 2. Create your environment file
cp .env.example .env
# Then fill in your values in .env

# 3. Start the development server
npm run dev
```

The server starts at `http://localhost:3000`.

## Environment Variables

See `.env.example` for all required variables.

| Variable | Required | Description |
|---|---|---|
| `PORT` | No (default 3000) | HTTP server port |
| `MONGODB_URI` | **Yes** | MongoDB connection string |
| `SENDGRID_API_KEY` | No | SendGrid API key for reconciliation emails |
| `ALERT_EMAIL_FROM` | No | Sender address for reconciliation emails |
| `ALERT_EMAIL_TO` | No | Recipient address for reconciliation emails |
| `WEBHOOK_SECRET` | No | HMAC secret for verifying vendor webhook payloads |

## Running the Load Test (Race Condition)

```bash
# 1. Start the server
npm run dev

# 2. Set a product's stock to exactly 5
# PUT /api/inventory/<productId>/stock  { "quantity": 5, "operation": "add" }

# 3. Run 50 concurrent purchase requests
npm run test:load -- <productId>
```

Expected: exactly 5 purchases succeed, 45 fail with 409, final stock = 0.

## API Reference

Full endpoint documentation is in `API_DOCUMENTATION.txt`.

| Area | Endpoints |
|---|---|
| Products | `GET/POST /api/products` |
| Inventory | `GET/POST /api/inventory`, `/api/inventory/low-stock`, `/api/inventory/product/:id`, `/api/inventory/:id/stock`, `/api/inventory/:id/threshold` |
| Purchases | `POST /api/purchase`, `POST /api/purchase/batch`, `GET /api/purchase/stats`, `/api/purchase/history/:id`, `/api/purchase/transaction/:id` |
| Webhook | `POST /api/webhook/price-update` |
| Reconciliation | `POST /api/reconciliation/run` |
| Health | `GET /health` |

## Dashboard

Open `http://localhost:3000/dashboard` in a browser. The dashboard connects to the WebSocket and displays live low-stock alerts without page refresh.

## Architecture

```
server.js
└── src/
    ├── routes/         # Thin — endpoint definitions only
    ├── controllers/    # Parse req/res, call services, delegate errors
    ├── services/       # All business logic (inventory, purchase, notification, webhook, reconciliation)
    ├── models/         # Mongoose schemas (Product, Inventory, Transaction, Vendor)
    ├── middlewares/    # errorHandler, validate
    └── views/          # EJS templates
```

Request flow: `Route → Controller → Service → Model`
