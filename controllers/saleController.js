const Sale = require("../models/Sale");
const Debtor = require("../models/Debtor");
const Budget = require("../models/Budget");
const Product = require("../models/Product");
const Store = require("../models/Store");

exports.recordSale = async (req, res) => {
  try {
    const {
      name,
      phone,
      due_date,
      currency,
      debt_amount,
      products,
      payment_method,
    } = req.body;

    // 🔒 Majburiy maydonlarni tekshirish
    if (
      !name ||
      !phone ||
      !due_date ||
      !currency ||
      !payment_method ||
      !Array.isArray(products) ||
      products.length === 0
    ) {
      return res.status(400).json({ message: "Kerakli maydonlar to'liq emas" });
    }

    const savedProducts = [];
    let totalDebt = 0;
    let totalProfit = 0;

    for (const p of products) {
      if (
        !p.product_id ||
        !p.product_name ||
        !p.quantity ||
        !p.sell_price ||
        !p.buy_price
      ) {
        return res
          .status(400)
          .json({ message: "Mahsulot ma'lumotlari to'liq emas" });
      }

      // Do'kondan mahsulotni olish
      const storeProduct = await Store.findOne({ product_id: p.product_id });
      if (!storeProduct) {
        return res
          .status(404)
          .json({ message: `${p.product_name} dokonda topilmadi` });
      }

      // Yetarli miqdor borligini tekshirish
      if (storeProduct.quantity < p.quantity) {
        return res.status(400).json({
          message: `${p.product_name} mahsuloti uchun yetarli miqdor yo'q. Mavjud: ${storeProduct.quantity}`,
        });
      }

      // Mahsulotni kamaytirish
      storeProduct.quantity -= p.quantity;
      await storeProduct.save();

      // Savdoni saqlash
      const total_price = p.quantity * p.sell_price;
      const oneProfit = (p.sell_price - p.buy_price) * p.quantity;
      totalProfit += oneProfit;
      totalDebt += total_price;

      const newSale = new Sale({
        product_id: p.product_id,
        product_name: p.product_name,
        sell_price: p.sell_price,
        buy_price: p.buy_price,
        quantity: p.quantity,
        total_price,
        total_price_sum: total_price,
        payment_method,
        debtor_name: name,
        debtor_phone: phone,
        debt_due_date: due_date,
        currency,
      });

      await newSale.save();
      savedProducts.push(newSale);
    }

    // 🔁 Agar qarz bo‘lsa, qarzdor yaratish
    if (payment_method === "qarz") {
      const newDebtor = new Debtor({
        name,
        phone,
        due_date,
        currency,
        debt_amount: totalDebt,
        products: products.map((p) => ({
          product_id: p.product_id,
          product_name: p.product_name,
          product_quantity: p.quantity,
          sell_price: p.sell_price,
          buy_price: p.buy_price,
          currency,
          due_date,
        })),
      });

      await newDebtor.save();
    }

    // 🔁 Byudjetga foyda qo‘shish
    if (payment_method !== "qarz") {
      let budget = await Budget.findOne();
      if (!budget) budget = new Budget({ totalBudget: 0 });

      budget.totalBudget += totalProfit;
      await budget.save();
    }

    return res.status(201).json({
      message: "Sotuv muvaffaqiyatli amalga oshirildi",
      sales: savedProducts,
    });
  } catch (error) {
    console.log(error.message);
    return res
      .status(500)
      .json({ message: "Serverda xatolik: " + error.message });
  }
};

// Barcha sotuv tarixini olish
exports.getSalesHistory = async (req, res) => {
  try {
    const sales = await Sale.find().populate("product_id");
    res.status(200).json(sales);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Kunlik sotuvlar statistikasi
exports.getDailySales = async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    const dailySales = await Sale.find({
      createdAt: { $gte: today, $lt: tomorrow },
    }).populate("product_id");

    res.status(200).json(dailySales);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Haftalik sotuvlar statistikasi
exports.getWeeklySales = async (req, res) => {
  try {
    const today = new Date();
    const startOfWeek = new Date(
      today.setDate(today.getDate() - today.getDay())
    );
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 7);

    const weeklySales = await Sale.find({
      createdAt: { $gte: startOfWeek, $lt: endOfWeek },
    }).populate("product_id");

    res.status(200).json(weeklySales);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Oylik sotuvlar statistikasi
exports.getMonthlySales = async (req, res) => {
  try {
    const today = new Date();
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);

    const monthlySales = await Sale.find({
      createdAt: { $gte: startOfMonth, $lt: endOfMonth },
    }).populate("product_id");

    res.status(200).json(monthlySales);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Yillik sotuvlar statistikasi
exports.getYearlySales = async (req, res) => {
  try {
    const today = new Date();
    const startOfYear = new Date(today.getFullYear(), 0, 1);
    const endOfYear = new Date(today.getFullYear() + 1, 0, 1);

    const yearlySales = await Sale.find({
      createdAt: { $gte: startOfYear, $lt: endOfYear },
    }).populate("product_id");

    res.status(200).json(yearlySales);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Sklad va dokonlardagi mahsulotlarni taqqoslash
exports.compareStockLevels = async (req, res) => {
  try {
    const skladProducts = await Product.find({ location: "sklad" });
    const dokonProducts = await Product.find({ location: "dokon" });

    const skladTotal = skladProducts.reduce(
      (total, product) => total + product.quantity,
      0
    );
    const dokonTotal = dokonProducts.reduce(
      (total, product) => total + product.quantity,
      0
    );

    res.status(200).json({
      skladTotal,
      dokonTotal,
      skladProducts,
      dokonProducts,
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.getLast12MonthsSales = async (req, res) => {
  try {
    const today = new Date();
    const last12Months = [];

    for (let i = 0; i < 12; i++) {
      const year = today.getFullYear();
      const month = today.getMonth() - i;
      const date = new Date(year, month, 1);
      last12Months.push({
        year: date.getFullYear(),
        month: date.getMonth() + 1,
        dateStr: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
          2,
          "0"
        )}`,
      });
    }

    const allProducts = await Product.find({}, "_id product_name");

    const sales = await Sale.aggregate([
      {
        $match: {
          createdAt: {
            $gte: new Date(today.getFullYear(), today.getMonth() - 11, 1),
          },
        },
      },
      {
        $group: {
          _id: {
            year: { $year: "$createdAt" },
            month: { $month: "$createdAt" },
            product_id: "$product_id",
          },
          total_quantity: { $sum: "$quantity" },
          product_name: { $first: "$product_name" },
        },
      },
    ]);

    // Natijani hosil qilish
    const result = last12Months.map(({ year, month, dateStr }) => {
      // Shu oyga tegishli sotuvlarni olish
      const monthlySales = sales.filter(
        (sale) => sale._id.year === year && sale._id.month === month
      );

      // Barcha mahsulotlarni tahlil qilib, mavjud bo'lmaganlarini qo'shish
      const productMap = new Map();

      allProducts.forEach((product) => {
        productMap.set(product._id.toString(), {
          product_name: product.product_name,
          sold_quantity: 0,
          product_id: product._id.toString(),
        });
      });

      monthlySales.forEach((sale) => {
        productMap.set(sale._id.product_id.toString(), {
          product_name: sale.product_name,
          sold_quantity: sale.total_quantity,
          product_id: sale._id.product_id.toString(),
        });
      });

      return {
        date: dateStr,
        products: Array.from(productMap.values()),
      };
    });

    res.status(200).json(result);
  } catch (error) {
    res.status(400).json({ message: error?.message || "Xatolik yuz berdi" });
  }
};

exports.deleteSale = async (req, res) => {
  try {
    const { id } = req.params;
    const sale = await Sale.findById(id);
    if (!sale) return res.status(404).json({ message: "Sotuv topilmadi" });

    const {
      product_id,
      quantity,
      sell_price,
      buy_price,
      location = "store",
    } = sale;

    const profitToRemove = (sell_price - buy_price) * quantity;

    // Mahsulotni qayta qo‘shish
    if (location === "store" || location === "dokon") {
      const storeProduct = await Store.findOne({ product_id });
      if (storeProduct) {
        storeProduct.quantity += quantity;
        await storeProduct.save();
      }
    } else {
      const product = await Product.findById(product_id);
      if (product) {
        product.quantity += quantity;
        await product.save();
      }
    }

    // Byudjetni kamaytirish
    const budget = await Budget.findOne();
    if (budget) {
      budget.totalBudget -= profitToRemove;
      await budget.save();
    }

    await sale.deleteOne();

    res.status(200).json({ message: "Sotuv o‘chirildi va miqdor tiklandi" });
  } catch (error) {
    console.log(error.message);
    res.status(500).json({ message: "Serverda xatolik" });
  }
};
