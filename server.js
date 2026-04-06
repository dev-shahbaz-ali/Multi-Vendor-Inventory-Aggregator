const express = require("express");
const mongoose = require("mongoose");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");
require("dotenv").config();

// Import routes
const productRoutes = require("./src/routes/productRoutes");
const inventoryRoutes = require("./src/routes/inventoryRoutes");
const purchaseRoutes = require("./src/routes/purchaseRoutes");
const webhookRoutes = require("./src/routes/webhookRoutes");
const reconciliationRoutes = require("./src/routes/reconciliationRoutes");

// Notification service — receives io/emitAlert after WebSocket setup
const notificationService = require("./src/services/notificationService");
const errorHandler = require("./src/middlewares/errorHandler");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, "src", "public")));

// Set EJS View Engine
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "src", "views"));

// Mount routes
app.use("/api", productRoutes);
app.use("/api", inventoryRoutes);
app.use("/api", purchaseRoutes);
app.use("/api", webhookRoutes);
app.use("/api", reconciliationRoutes);

// Store connected clients
const connectedClients = new Map();

// WebSocket connection handling
io.on("connection", (socket) => {
  console.log(`🔌 New client connected: ${socket.id}`);

  // Store client
  connectedClients.set(socket.id, socket);

  // Join admin room
  socket.join("admin_dashboard");

  // Send welcome message
  socket.emit("connected", {
    message: "Connected to Inventory Aggregator",
    clientId: socket.id,
    timestamp: new Date().toISOString(),
  });

  // Handle subscription to alerts
  socket.on("subscribe_alerts", () => {
    console.log(`Client ${socket.id} subscribed to alerts`);
    socket.emit("subscribed", {
      status: "success",
      message: "Now receiving real-time inventory alerts",
    });
  });

  // Handle disconnection
  socket.on("disconnect", () => {
    console.log(`🔌 Client disconnected: ${socket.id}`);
    connectedClients.delete(socket.id);
  });
});

// Helper function to emit alerts to all connected clients
function emitAlert(event, data) {
  io.emit(event, data);
  console.log(`📢 Emitted ${event} alert:`, data.message || data);
}

// Make io accessible to routes and controllers
app.set("io", io);
app.set("emitAlert", emitAlert);

// Basic route
app.get("/", (req, res) => {
  res.json({
    message: "Inventory Aggregator API is running!",
    endpoints: {
      health: "/health",
      dashboard: "/dashboard",
      addProduct: "/add-product",
      products: {
        create: "POST /api/products",
        getAll: "GET /api/products",
        getOne: "GET /api/products/:id",
        updatePrice: "PUT /api/products/:id/current-price",
        delete: "DELETE /api/products/:id",
      },
      inventory: {
        create: "POST /api/inventory",
        getAll: "GET /api/inventory",
        getLowStock: "GET /api/inventory/low-stock",
        getByProduct: "GET /api/inventory/product/:productId",
        updateStock: "PUT /api/inventory/:productId/stock",
        updateThreshold: "PUT /api/inventory/:productId/threshold",
      },
      purchase: {
        purchase: "POST /api/purchase",
        batch: "POST /api/purchase/batch",
        transaction: "GET /api/purchase/transaction/:transactionId",
        history: "GET /api/purchase/history/:productId",
        stats: "GET /api/purchase/stats",
      },
    },
    websocket: {
      status: "active",
      connectedClients: connectedClients.size,
      events: ["low_stock_alert", "price_update_alert", "system_alert"],
    },
    timestamp: new Date().toISOString(),
  });
});

// Health check endpoint
app.get("/health", (req, res) => {
  const dbState = mongoose.connection.readyState;
  const states = {
    0: "Disconnected",
    1: "Connected",
    2: "Connecting",
    3: "Disconnecting",
  };

  res.json({
    status: "OK",
    mongodb: states[dbState] || "Unknown",
    websocket: {
      connected: connectedClients.size,
      active: true,
    },
    timestamp: new Date().toISOString(),
  });
});

// Serve dashboard HTML
app.get("/dashboard", (req, res) => {
  res.render("dashboard", { title: "Dashboard" });
});

app.get("/add-product", (req, res) => {
  res.render("add-product", { title: "Add New Product" });
});

app.get("/products-list", (req, res) => {
  res.render("products", { title: "Product Catalog" });
});

app.get("/inventory-list", (req, res) => {
  res.render("inventory", { title: "Inventory Status" });
});

app.get("/manage-inventory", (req, res) => {
  res.render("manage-inventory", { title: "Manage Stock" });
});

app.get("/make-purchase", (req, res) => {
  res.render("make-purchase", { title: "Process Purchase" });
});

app.get("/purchase-history", (req, res) => {
  res.render("purchase-history", { title: "Transaction History" });
});

// Centralized error handling — must be registered after all routes
app.use(errorHandler);

// Check if MongoDB URI is configured
const mongoURI = process.env.MONGODB_URI;
if (!mongoURI) {
  console.error("❌ MONGODB_URI is not defined in .env file");
  console.log(
    "Please create a .env file with MONGODB_URI=mongodb://localhost:27017/inventory_aggregator",
  );
  process.exit(1);
}

console.log(
  `🔌 Connecting to MongoDB at: ${mongoURI.replace(/\/\/([^:]+):([^@]+)@/, "//***:***@")}`,
);

// Connect to MongoDB
mongoose
  .connect(mongoURI, {
    serverSelectionTimeoutMS: 5000,
    family: 4,
  })
  .then(() => {
    console.log("✅ Connected to MongoDB successfully!");

    const PORT = process.env.PORT || 3000;
    server.listen(PORT, () => {
      console.log(`\n🚀 Server running on http://localhost:${PORT}`);
      console.log(`📊 Dashboard: http://localhost:${PORT}/dashboard`);
      console.log(`🔌 WebSocket: ws://localhost:${PORT}`);
      console.log(`\n✨ Ready for requests!\n`);
    });
  })
  .catch((err) => {
    console.error("❌ MongoDB connection error:", err.message);
    console.log("\n📝 Troubleshooting tips:");
    console.log("   1. Make sure MongoDB is installed");
    console.log("   2. Start MongoDB service with: mongod");
    console.log("   3. Check if MongoDB is running on port 27017");
    console.log("   4. Verify your .env file has correct MONGODB_URI");
    process.exit(1);
  });

// Handle MongoDB connection errors
mongoose.connection.on("error", (err) => {
  console.error("MongoDB connection error:", err);
});

mongoose.connection.on("disconnected", () => {
  console.log("MongoDB disconnected");
});

// Graceful shutdown
process.on("SIGINT", async () => {
  try {
    await mongoose.connection.close();
    console.log("MongoDB connection closed through app termination");
    process.exit(0);
  } catch (err) {
    console.error("Error during shutdown:", err);
    process.exit(1);
  }
});

// Pass WebSocket to notification service (single source of truth for alerts)
notificationService.setWebSocket(io, emitAlert);
