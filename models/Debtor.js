const mongoose = require("mongoose");

const debtorSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    phone: { type: String, required: true },
    debt_amount: { type: Number, required: true },
    due_date: { type: Date, required: false }, // Qarzdor uchun umumiy muddati
    currency: { type: String, enum: ["sum", "usd"], required: true },

    payment_log: {
      type: [
        {
          amount: { type: Number, required: true },
          currency: { type: String, enum: ["sum", "usd"], required: true },
          date: { type: Date, default: Date.now },
        },
      ],
      default: [],
    },

    products: [
      {
        product_id: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Product",
          required: true,
        },
        product_name: { type: String, required: true },
        product_quantity: { type: Number, required: true },
        sell_price: { type: Number, required: true },
        sold_date: { type: Date, default: Date.now },

        // ❌ mana bu noto'g'ri bo'lgan:
        due_date: { type: Date, required: false },

        // ✅ to'g'risi: bu maydon kerak emas
      },
    ],
  },
  { timestamps: true }
);

module.exports = mongoose.model("Debtor", debtorSchema);
