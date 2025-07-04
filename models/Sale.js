const mongoose = require("mongoose");

const saleSchema = new mongoose.Schema(
  {
    product_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: false, // ❗ qarzdor to‘lovi uchun shart emas
    },
    product_name: { type: String, required: true },
    sell_price: { type: Number },
    buy_price: { type: Number },
    currency: {
      type: String,
      enum: ["sum", "usd"],
      default: "sum",
    },
    quantity: { type: Number, min: 1 },
    total_price: { type: Number, required: true },
    total_price_sum: { type: Number },
    payment_method: {
      type: String,
      enum: ["naqd", "plastik", "qarz", "qarzdor_tolovi"], // ✅ qo‘shildi
      required: true,
    },
    debtor_name: { type: String },
    debtor_phone: { type: String },
    client_name: { type: String }, // ✅ qarzdor to‘lovi uchun qo‘shildi
    debt_due_date: { type: Date },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Sale", saleSchema);
