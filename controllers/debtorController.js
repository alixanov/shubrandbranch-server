const Debtor = require("../models/Debtor");
const Sale = require("../models/Sale");
const Store = require("../models/Store");
const Product = require("../models/Product");

exports.createPayment = async (req, res) => {
  try {
    const { id, amount, currency, rate, payment_method = "naqd" } = req.body;

    if (!id || !amount || !currency || !rate) {
      return res.status(400).json({ message: "Kerakli maydonlar to'liq emas" });
    }

    const debtor = await Debtor.findById(id);
    if (!debtor) {
      return res.status(404).json({ message: "Qarzdor topilmadi" });
    }

    // 💰 To‘lovni USDga aylantiramiz
    const amountInUsd =
      currency === "usd" ? parseFloat(amount) : parseFloat(amount / rate);

    const remainingDebt = debtor.debt_amount - amountInUsd;

    // ✅ Agar to‘liq to‘langan bo‘lsa
    if (remainingDebt <= 0) {
      for (const item of debtor.products) {
        const product = await Product.findById(item.product_id);
        if (!product) continue;

        const storeItem = await Store.findOne({ product_id: item.product_id });

        if (!storeItem || storeItem.quantity < item.product_quantity) {
          return res.status(400).json({
            message: `Omborda ${item.product_name} uchun yetarli mahsulot yo'q`,
          });
        }

        // 📉 Ombordan mahsulotni ayiramiz
        storeItem.quantity -= item.product_quantity;
        await storeItem.save();

        const total_price = item.sell_price * item.product_quantity;
        const total_price_sum =
          currency === "usd" ? total_price : total_price * rate;

        await Sale.create({
          product_id: product._id,
          product_name: item.product_name,
          sell_price: item.sell_price,
          buy_price: product.purchase_price,
          currency: "usd",
          quantity: item.product_quantity,
          total_price,
          total_price_sum,
          payment_method,
          debtor_name: debtor.name,
          debtor_phone: debtor.phone,
          debt_due_date: debtor.due_date,
        });
      }

      // Qarzni to‘liq yopamiz
      debtor.debt_amount = 0;
      debtor.products = [];
      debtor.payment_log = [];
      await debtor.save();

      return res.status(200).json({ message: "Qarz to'liq yopildi" });
    }

    // ♻️ Qisman to‘lov bo‘lsa — faqat kamaytirish
    debtor.debt_amount = remainingDebt;
    debtor.payment_log.push({
      amount: parseFloat(amount),
      date: new Date(),
      currency,
    });

    await debtor.save();

    return res.status(200).json({ message: "Qisman to'lov qabul qilindi" });
  } catch (err) {
    console.error(err.message);
    return res.status(500).json({ message: "Serverda xatolik" });
  }
};

exports.editDebtor = async (req, res) => {
  try {
    const { id } = req.params;
    await Debtor.findByIdAndUpdate(id, req.body);
    res.status(200).json({ message: "Qarzdor ma'lumotlari yangilandi" });
  } catch (err) {
    console.log(err.message);
    return res.status(500).json({ message: "Serverda xatolik" });
  }
};
exports.updateDebtor = async (req, res) => {
  try {
    const { id } = req.params;
    const { amount, product_id } = req.body;

    const parsedAmount = amount;
    if (!amount || isNaN(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ message: "To'langan summa noto'g'ri" });
    }

    const debtor = await Debtor.findById(id);
    if (!debtor) return res.status(404).json({ message: "Qarzdor topilmadi" });

    debtor.debt_amount -= parsedAmount;
    debtor.payment_log.push({ amount: parsedAmount, date: new Date() });

    // Qarzdor to‘liq to‘ladi, mahsulotlar sotuvga o‘tadi
    if (debtor.debt_amount <= 0) {
      for (const p of debtor.products) {
        const product = await Product.findById(p.product_id);
        await Sale.create({
          product_id: p.product_id,
          product_name: p.product_name,
          sell_price: p.sell_price,
          buy_price: product.purchase_price,
          quantity: p.product_quantity,
          total_price: p.sell_price * p.product_quantity,
          payment_method: "qarz",
          debtor_name: debtor.name,
          debtor_phone: debtor.phone,
          debt_due_date: debtor.due_date,
        });
      }

      await debtor.deleteOne();
      return res
        .status(200)
        .json({ message: "Qarz to'liq to'landi va sotuvlar yozildi" });
    }

    await debtor.save();
    res.status(200).json(debtor);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
exports.getAllDebtors = async (req, res) => {
  try {
    const debtors = await Debtor.find().populate("products.product_id");
    res.status(200).json(debtors);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
exports.deleteDebtor = async (req, res) => {
  try {
    const { id } = req.params;
    await Debtor.findByIdAndDelete(id);
    res.status(200).json({ message: "Qarzdor o'chirildi" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.vazvratDebt = async (req, res) => {
  try {
    const { quantity, id, product_id } = req.body;

    const numericQuantity = Number(quantity);
    if (!numericQuantity || isNaN(numericQuantity) || numericQuantity <= 0) {
      return res.status(400).json({ message: "Miqdor noto‘g‘ri kiritilgan" });
    }

    const debtor = await Debtor.findById(id);
    if (!debtor) return res.status(404).json({ message: "Qarzdor topilmadi" });

    const product = await Product.findById(product_id);
    if (!product)
      return res.status(404).json({ message: "Mahsulot topilmadi" });

    let storeProduct = await Store.findOne({ product_id });

    if (!storeProduct) {
      storeProduct = await Store.create({
        product_id: product._id,
        product_name: product.product_name,
        quantity: numericQuantity,
      });
    } else {
      storeProduct.quantity += numericQuantity;
      await storeProduct.save();
    }

    const prodIndex = debtor.products.findIndex((p) => {
      const pId =
        typeof p.product_id === "object"
          ? p.product_id._id?.toString()
          : p.product_id?.toString();
      return pId === product_id;
    });

    if (prodIndex === -1) {
      return res.status(404).json({ message: "Mahsulot qarzdorda topilmadi" });
    }

    const item = debtor.products[prodIndex];

    item.product_quantity -= numericQuantity;
    debtor.debt_amount -= item.sell_price * numericQuantity;

    if (item.product_quantity <= 0) {
      debtor.products.splice(prodIndex, 1);
    }

    await debtor.save();

    res.status(200).json({ message: "Mahsulot qaytarildi" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.createPayment = async (req, res) => {
  try {
    const { id, amount, currency, rate, payment_method = "naqd" } = req.body;

    if (!id || !amount || !currency || !rate) {
      return res.status(400).json({ message: "Kerakli maydonlar to'liq emas" });
    }

    const debtor = await Debtor.findById(id).lean();
    if (!debtor) {
      return res.status(404).json({ message: "Qarzdor topilmadi" });
    }

    // 💰 To‘lov summasini dollarga konvertatsiya qilish
    let amountInUsd =
      currency === "usd" ? parseFloat(amount) : parseFloat(amount / rate);
    console.log(amountInUsd);

    let remainingDebt = parseFloat(debtor.debt_amount - amountInUsd);

    // ✅ Agar to‘liq to‘langan bo‘lsa — sotuvga yozish
    if (remainingDebt <= 0) {
      for (const item of debtor.products) {
        const product = await Product.findById(item.product_id);
        if (!product) continue;

        const total_price = item.sell_price * item.product_quantity;
        const total_price_sum =
          currency === "usd" ? total_price : total_price * rate;

        const sale = new Sale({
          product_id: product._id,
          product_name: item.product_name,
          sell_price: item.sell_price,
          buy_price: product.purchase_price,
          currency: "usd",
          quantity: item.product_quantity,
          total_price,
          total_price_sum,
          payment_method,
          debtor_name: debtor.name,
          debtor_phone: debtor.phone,
          debt_due_date: debtor.due_date,
        });

        await sale.save();
      }

      await Debtor.findByIdAndUpdate(id, {
        debt_amount: 0,
        products: [],
        payment_log: [],
      });

      return res.status(200).json({ message: "Qarz to'liq yopildi" });
    }

    // ♻️ Qisman to‘lov bo‘lsa — faqat kamaytirish
    await Debtor.findByIdAndUpdate(id, {
      debt_amount: remainingDebt,
      $push: {
        payment_log: {
          amount: parseFloat(amount),
          date: new Date(),
          currency,
        },
      },
    });

    return res.status(200).json({ message: "Qisman to'lov qabul qilindi" });
  } catch (err) {
    console.error(err.message);
    return res.status(500).json({ message: "Serverda xatolik" });
  }
};

// ❌ Qarzdorni o‘chirish
exports.deleteDebtor = async (req, res) => {
  try {
    const { id } = req.params;
    const debtor = await Debtor.findById(id);
    if (!debtor) {
      return res.status(404).json({ message: "Qarzdor topilmadi" });
    }

    await debtor.deleteOne();
    res.status(200).json({ message: "Qarzdor o‘chirildi" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
