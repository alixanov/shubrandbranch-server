const Debtor = require("../models/Debtor");
const Sale = require("../models/Sale");
const Store = require("../models/Store");
const Product = require("../models/Product");

// 1. Yangi qarzdor yaratish yoki mavjud mijozga mahsulot qo'shish
exports.createDebtor = async (req, res) => {
  try {
    const { name, phone, due_date, currency = "sum", products = [] } = req.body;

    // 1. Tekshir: products massiv bo‘lishi kerak
    if (!Array.isArray(products) || products.length === 0) {
      return res
        .status(400)
        .json({ message: "Mahsulotlar noto‘g‘ri formatda" });
    }

    let total_debt = 0;

    // 2. Har bir mahsulotni tekshir va currency biriktir
    for (const product of products) {
      if (
        !product.product_id ||
        !product.product_name ||
        !product.sell_price ||
        !product.product_quantity
      ) {
        return res
          .status(400)
          .json({ message: "Mahsulotdagi qiymatlar to‘liq emas" });
      }
      product.currency = product.currency || currency;
      total_debt += product.sell_price * product.product_quantity;
    }

    // 3. Yangi qarzdor obyektini yarat
    const newDebtor = new Debtor({
      name,
      phone,
      due_date,
      currency,
      debt_amount: total_debt,
      products,
    });

    await newDebtor.save();
    res.status(201).json(newDebtor);
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: error.message });
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

    const debtor = await Debtor.findById(id);
    if (!debtor) return res.status(404).json({ message: "Qarzdor topilmadi" });

    const product = await Product.findById(product_id);
    const storeProduct = await Store.findOne({ product_id });

    if (!storeProduct) {
      await Store.create({
        product_id: product._id,
        product_name: product.product_name,
        quantity,
      });
    } else {
      storeProduct.quantity += quantity;
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
    item.product_quantity -= quantity;
    debtor.debt_amount -= item.sell_price * quantity;

    if (item.product_quantity <= 0) {
      debtor.products.splice(prodIndex, 1);
    }

    // if (debtor.products.length === 0) {
    //   await Debtor.findByIdAndDelete(id);
    // } else {
    await debtor.save();
    // }

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