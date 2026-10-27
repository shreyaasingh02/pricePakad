const express = require("express");
const Product = require("../models/Product");
const router = express.Router();

const RETAILERS = new Set(["Amazon", "Flipkart", "Myntra", "Other"]);
const SOURCES = new Set(["authorized-feed", "authorized-api"]);

function safeUrl(value) {
  const u = new URL(String(value));
  if (!["http:", "https:"].includes(u.protocol)) throw new Error("Product URL must use HTTP or HTTPS.");
  return u.toString();
}

function windowDrop(product, days) {
  const cutoff = Date.now() - days * 86400000;
  const points = (product.priceHistory || [])
    .filter(p => new Date(p.recordedAt).getTime() >= cutoff)
    .sort((a, b) => new Date(a.recordedAt) - new Date(b.recordedAt));
  if (points.length < 2) return { days, available: false, dropPercent: null, observations: points.length };
  const startPrice = Number(points[0].price);
  const currentPrice = Number(product.currentPrice);
  const dropPercent = startPrice > 0 ? ((startPrice - currentPrice) / startPrice) * 100 : 0;
  return { days, available: true, startPrice, currentPrice, dropPercent: Math.round(dropPercent * 100) / 100, observations: points.length };
}

function decorate(product) {
  const p = product.toObject ? product.toObject() : product;
  return { ...p, priceWindows: { 7: windowDrop(p, 7), 30: windowDrop(p, 30), 60: windowDrop(p, 60), 90: windowDrop(p, 90) } };
}

function validate(item) {
  const name = String(item.name || "").trim();
  const retailer = String(item.retailer || "").trim();
  const currentPrice = Number(item.currentPrice);
  if (!name) throw new Error("Product name is required.");
  if (!RETAILERS.has(retailer)) throw new Error(`Unsupported retailer: ${retailer}`);
  if (!Number.isFinite(currentPrice) || currentPrice < 0) throw new Error(`Invalid currentPrice for ${name}.`);
  const dataSource = String(item.dataSource || "authorized-feed");
  if (!SOURCES.has(dataSource)) throw new Error("dataSource must be authorized-feed or authorized-api.");
  if (item.trackingPermitted !== true) throw new Error(`Tracking permission must explicitly be true for ${name}.`);
  const originalPrice = item.originalPrice == null || item.originalPrice === "" ? null : Number(item.originalPrice);
  if (originalPrice != null && (!Number.isFinite(originalPrice) || originalPrice < 0)) throw new Error(`Invalid originalPrice for ${name}.`);
  return {
    name,
    brand: String(item.brand || "").trim(),
    category: String(item.category || "other").trim().toLowerCase(),
    retailer,
    productUrl: safeUrl(item.productUrl),
    imageUrl: String(item.imageUrl || "").trim(),
    currentPrice,
    originalPrice,
    currency: String(item.currency || "INR").toUpperCase(),
    dataSource,
    trackingPermitted: true,
    sourceProductId: String(item.sourceProductId || "").trim()
  };
}

// GET /api/products?window=30&minDrop=10&retailer=Amazon
router.get("/", async (req, res) => {
  try {
    const query = {};
    if (req.query.retailer && RETAILERS.has(req.query.retailer)) query.retailer = req.query.retailer;
    const products = await Product.find(query).sort({ updatedAt: -1 }).limit(500);
    let output = products.map(decorate);
    const days = req.query.window == null ? null : Number(req.query.window);
    const minDrop = Number(req.query.minDrop || 0);
    if ([7, 30, 60, 90].includes(days)) {
      output = output.filter(p => p.priceWindows[days].available && p.priceWindows[days].dropPercent >= minDrop);
    }
    res.json({ count: output.length, windowDays: [7, 30, 60, 90].includes(days) ? days : null, products: output });
  } catch (error) {
    console.error("GET /api/products failed:", error);
    res.status(500).json({ error: "Could not load products." });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ error: "Product not found." });
    res.json({ product: decorate(product) });
  } catch {
    res.status(400).json({ error: "Invalid product ID." });
  }
});

// Protected batch import for a provider/feed that explicitly permits this use.
router.post("/import-feed", async (req, res) => {
  if (!process.env.IMPORT_API_KEY || req.get("x-import-key") !== process.env.IMPORT_API_KEY) {
    return res.status(401).json({ error: "Unauthorized import request." });
  }
  const items = req.body && req.body.products;
  if (!Array.isArray(items) || !items.length) return res.status(400).json({ error: 'Send JSON as { "products": [...] }.' });
  if (items.length > 500) return res.status(413).json({ error: "Maximum 500 products per import." });

  const result = { inserted: 0, updated: 0, rejected: [] };
  for (let i = 0; i < items.length; i++) {
    try {
      const item = validate(items[i]);
      const existing = await Product.findOne({ retailer: item.retailer, productUrl: item.productUrl });
      const now = new Date();
      if (!existing) {
        await Product.create({ ...item, lastPriceCheckedAt: now, priceHistory: [{ price: item.currentPrice, recordedAt: now, source: item.dataSource }] });
        result.inserted++;
      } else {
        const last = existing.priceHistory[existing.priceHistory.length - 1];
        // Store a new observation only when the imported actual price differs.
        if (!last || Number(last.price) !== item.currentPrice) {
          existing.priceHistory.push({ price: item.currentPrice, recordedAt: now, source: item.dataSource });
        }
        Object.assign(existing, item, { lastPriceCheckedAt: now });
        await existing.save();
        result.updated++;
      }
    } catch (error) {
      result.rejected.push({ index: i, error: error.message });
    }
  }
  res.status(result.rejected.length ? 207 : 200).json(result);
});

// Protected observation endpoint for trusted provider refresh jobs.
router.post("/:id/observations", async (req, res) => {
  if (!process.env.IMPORT_API_KEY || req.get("x-import-key") !== process.env.IMPORT_API_KEY) {
    return res.status(401).json({ error: "Unauthorized observation request." });
  }
  try {
    const price = Number(req.body.price);
    if (!Number.isFinite(price) || price < 0) return res.status(400).json({ error: "price must be non-negative." });
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ error: "Product not found." });
    if (!product.trackingPermitted) return res.status(403).json({ error: "Price tracking is not permitted for this source." });
    const recordedAt = req.body.recordedAt ? new Date(req.body.recordedAt) : new Date();
    if (Number.isNaN(recordedAt.getTime())) return res.status(400).json({ error: "Invalid recordedAt." });
    product.priceHistory.push({ price, recordedAt, source: String(req.body.source || product.dataSource) });
    product.currentPrice = price;
    product.lastPriceCheckedAt = recordedAt;
    await product.save();
    res.json({ product: decorate(product) });
  } catch (error) {
    console.error("Observation save failed:", error);
    res.status(400).json({ error: "Could not save price observation." });
  }
});

module.exports = router;
