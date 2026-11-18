import "dotenv/config";
import { createRequire } from "node:module";
import argon2 from "argon2";

const require = createRequire(import.meta.url);
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const email = (process.env.DEMO_EMAIL || "demo@example.test").toLowerCase();
const password = process.env.SEED_DEMO_PASSWORD;
if (process.env.NODE_ENV === "production") throw new Error("The demo seed is disabled in production.");
if (!password || password.length < 12) throw new Error("Set SEED_DEMO_PASSWORD to a unique password of at least 12 characters before seeding.");

try {
  const now = new Date();
  const languages = [
    ["en", "English", "English", true],
    ["ml", "Malayalam", "മലയാളം", false],
    ["hi", "Hindi", "हिन्दी", false],
    ["ta", "Tamil", "தமிழ்", false],
  ];
  for (const [code, name, nativeName, isDefault] of languages) {
    await prisma.language.upsert({ where: { code }, create: { code, name, nativeName, isDefault }, update: { name, nativeName, isDefault, isEnabled: true } });
  }
  const user = await prisma.user.upsert({
    where: { email },
    create: { name: "FinSight Demo", email, passwordHash: await argon2.hash(password, { type: argon2.argon2id }), emailVerifiedAt: now, preference: { create: { language: "en", currency: "INR", timezone: "Asia/Kolkata" } } },
    update: { name: "FinSight Demo", passwordHash: await argon2.hash(password, { type: argon2.argon2id }), emailVerifiedAt: now },
  });
  await prisma.userPreference.upsert({ where: { userId: user.id }, create: { userId: user.id }, update: {} });
  const accounts = [
    { name: "Everyday Savings", accountType: "bank", openingBalance: "85000.00", currentBalance: "92350.00" },
    { name: "Cash Wallet", accountType: "cash", openingBalance: "5000.00", currentBalance: "3470.00" },
  ];
  const accountRows = [];
  for (const account of accounts) {
    const row = await prisma.account.findFirst({ where: { userId: user.id, name: account.name } });
    accountRows.push(row ?? await prisma.account.create({ data: { ...account, userId: user.id, currency: "INR" } }));
  }
  const categorySpecs = [
    ["Groceries", "expense", "shopping-cart", "#62a87c"], ["Transport", "expense", "car", "#7094c4"],
    ["Dining", "expense", "utensils", "#d99369"], ["Utilities", "expense", "lightbulb", "#9682c4"],
    ["Salary", "income", "briefcase", "#62a87c"], ["Freelance", "income", "laptop", "#7094c4"],
  ];
  const categoryRows = new Map();
  for (const [name, type, icon, color] of categorySpecs) {
    const row = await prisma.category.upsert({ where: { userId_name_type: { userId: user.id, name, type } }, create: { userId: user.id, name, type, icon, color, isDefault: true }, update: { icon, color, isDefault: true } });
    categoryRows.set(name, row);
  }
  const txs = [
    ["Monthly salary", "income", "52000.00", "Salary", 3, 0], ["Weekly groceries", "expense", "2840.50", "Groceries", 2, 0],
    ["Metro and bus pass", "expense", "1250.00", "Transport", 1, 0], ["Weekend dinner", "expense", "1840.00", "Dining", 2, 1],
    ["Electricity bill", "expense", "2180.00", "Utilities", 6, 0], ["Design project", "income", "12500.00", "Freelance", 9, 0],
  ];
  for (const [description, type, amount, categoryName, daysAgo, accountIndex] of txs) {
    const transactionDate = new Date(now); transactionDate.setDate(now.getDate() - daysAgo);
    const category = categoryRows.get(categoryName);
    const exists = await prisma.transaction.findFirst({ where: { userId: user.id, description, transactionDate } });
    if (!exists && category) await prisma.transaction.create({ data: { userId: user.id, accountId: accountRows[accountIndex].id, categoryId: category.id, type, amount, currency: "INR", description, transactionDate } });
  }
  console.info(`Demo data seeded for ${email}. A password was read from SEED_DEMO_PASSWORD and is not written to source.`);
} finally {
  await prisma.$disconnect();
}
