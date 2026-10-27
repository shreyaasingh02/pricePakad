const mongoose = require("mongoose");

const pricePointSchema = new mongoose.Schema({
  price: { type: Number, required: true, min: 0 },
  recordedAt: { type: Date, required: true, default: Date.now },
  source: { type: String, default: "authorized-feed" }
}, { _id: false });

const productSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  brand: { type: String, default: "" },
  category: { type: String, default: "other", index: true },
  retailer: { type: String, required: true, enum: ["Amazon", "Flipkart", "Myntra", "Other"], index: true },
  productUrl: { type: String, required: true, trim: true },
  imageUrl: { type: String, default: "" },
  currentPrice: { type: Number, required: true, min: 0 },
  originalPrice: { type: Number, default: null, min: 0 },
  currency: { type: String, default: "INR" },
  priceHistory: { type: [pricePointSchema], default: [] },
  lastPriceCheckedAt: { type: Date, default: null },
  dataSource: { type: String, enum: ["manual", "authorized-feed", "authorized-api"], default: "authorized-feed" },
  // True only if the data source's terms permit storing and displaying price history.
  trackingPermitted: { type: Boolean, default: false, index: true },
  sourceProductId: { type: String, default: "" }
}, { timestamps: true });

productSchema.index({ retailer: 1, productUrl: 1 }, { unique: true });
module.exports = mongoose.model("Product", productSchema);
