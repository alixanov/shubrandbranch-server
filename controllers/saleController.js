const Sale = require("../models/Sale");
const Debtor = require("../models/Debtor");
const Budget = require("../models/Budget");
const Product = require("../models/Product"); // Product modelini import qilish

// Sotuvni yaratish yoki yangilash
exports.recordSale = async (req, res) => {
  try {
    const {
      product_id,
      product_name,
      sell_price,
      buy_price,
      quantity,
      currency,
      total_price,
      total_price_sum,
      payment_method,
      debtor_name,
      debtor_phone,
      debt_due_date,
    } = req.body;

    // 🔐 Doimiy tarzda dokondan sotiladi
    const location = "store";

    // Mahsulotni dokondan topish
    const storeProduct = await Store.findOne({ product_id });
    if (!storeProduct) {
      return res.status(404).json({ message: "Mahsulot dokonda topilmadi" });
    }

    const product = await Product.findById(product_id);
    if (!product) {
      return res.status(404).json({ message: "Mahsulot topilmadi" });
    }

    if (storeProduct.quantity < quantity) {
      return res.status(400).json({
        message: `Dokonda yetarli mahsulot yo'q. Mavjud: ${storeProduct.quantity}, talab: ${quantity}`,
      });
    }

    if (payment_method === "qarz") {
      const newDebtor = new Debtor({
        name: debtor_name,
        phone: debtor_phone,
        debt_amount: total_price,
        due_date: debt_due_date,
        currency,
        products: [
          {
            product_id,
            product_name,
            product_quantity: quantity,
            sell_price,
            due_date: debt_due_date,
            currency,
          },
        ],
      });
      await newDebtor.save();

      storeProduct.quantity -= quantity;
      await storeProduct.save();

      return res.status(201).json({
        message: "Qarzga sotildi, qarzdor saqlandi",
        debtor: newDebtor,
      });
    }

    const totalProfit = (sell_price - buy_price) * quantity;
    const newSale = new Sale({
      product_id,
      product_name,
      sell_price,
      buy_price,
      currency,
      quantity,
      total_price,
      total_price_sum,
      payment_method,
      debtor_name: null,
      debtor_phone: null,
      debt_due_date: null,
    });

    await newSale.save();

    storeProduct.quantity -= quantity;
    await storeProduct.save();

    let budget = await Budget.findOne();
    if (!budget) {
      budget = new Budget({ totalBudget: 0 });
    }
    budget.totalBudget += totalProfit;
    await budget.save();

    res.status(201).json({
      message: "Dokondan sotildi",
      sale: newSale,
      remaining_quantity: storeProduct.quantity,
    });
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ message: "Xatolik yuz berdi" });
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

      // Barcha mahsulotlarni tahlil qilib, mavjud bo‘lmaganlarini qo‘shish
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

// Sotuvni o‘chirish
exports.deleteSale = async (req, res) => {
  try {
    const { id } = req.params;

    const sale = await Sale.findByIdAndDelete(id);
    if (!sale) {
      return res.status(404).json({ message: "Sotuv topilmadi" });
    }

    res.status(200).json({ message: "Sotuv muvaffaqiyatli o‘chirildi" });
  } catch (error) {
    res.status(500).json({ message: "Server xatosi", error: error.message });
  }
};
