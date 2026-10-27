const dns = require("node:dns");
dns.setServers(["8.8.8.8", "1.1.1.1"]);

require("dotenv").config();

const productRoutes = require("./routes/products");
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());
app.use("/api/products", productRoutes);

app.get("/", (req, res) => {
  res.json({
    message: "PricePakad API is running!",
  });
});

app.get("/api/health", (req, res) => {
  res.json({
    status: "OK",
    database:
      mongoose.connection.readyState === 1 ? "connected" : "disconnected",
  });
});

const PORT = process.env.PORT || 5000;

async function startServer() {
  try {
    if (!process.env.MONGODB_URI) {
      throw new Error("MONGODB_URI is missing from environment variables.");
    }

    await mongoose.connect(process.env.MONGODB_URI, {
      dbName: "pricepakad",
    });

    console.log("MongoDB Atlas connected successfully!");

    app.listen(PORT, "0.0.0.0", () => {
      console.log(`PricePakad API running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Startup error:", error.message);
    process.exit(1);
  }
}

startServer();
