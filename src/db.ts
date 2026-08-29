// 黑马记账 —— 数据库初始化
// 数据保存在电脑本机（Tauri 应用数据目录），不联网、不上传
import Database from "@tauri-apps/plugin-sql";

let db: Database | null = null;

/** 获取数据库实例（首次调用时自动初始化） */
export async function getDb(): Promise<Database> {
  if (db) return db;
  db = await Database.load("sqlite:heima.db");
  await initSchema();
  await seedDefaultCategories();
  return db;
}

/** 建表：记账表 + 分类表 */
async function initSchema() {
  await db!.execute(`
    CREATE TABLE IF NOT EXISTS categories (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      type       TEXT    NOT NULL,                -- 'expense' 支出 / 'income' 收入
      parent_id  INTEGER,                         -- NULL = 一级大类，否则为所属一级分类 id
      name       TEXT    NOT NULL,                -- 分类名
      emoji      TEXT    DEFAULT '',              -- 分类图标（emoji）
      sort_order INTEGER DEFAULT 0,               -- 显示顺序
      is_custom  INTEGER DEFAULT 0                -- 0 = 内置分类，1 = 用户自定义
    )
  `);
  await db!.execute(`
    CREATE TABLE IF NOT EXISTS records (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      type         TEXT    NOT NULL,              -- 'expense' 支出 / 'income' 收入
      amount_cents INTEGER NOT NULL,              -- 金额，单位：分（避免小数误差）
      category_id  INTEGER NOT NULL,              -- 二级分类 id
      record_date  TEXT    NOT NULL,              -- 日期 'YYYY-MM-DD'
      note         TEXT    DEFAULT '',
      created_at   TEXT    DEFAULT (datetime('now', 'localtime'))
    )
  `);
}

/** 写入内置默认分类（仅首次运行时执行；已存在则跳过） */
async function seedDefaultCategories() {
  const row = await db!.select<{ c: number }[]>(
    "SELECT COUNT(*) AS c FROM categories"
  );
  if (row[0].c > 0) return;

  // [一级大类名, 一级emoji, 二级小类 [名称, emoji] 列表]
  type Child = [string, string];
  const expenseGroups: [string, string, Child[]][] = [
    ["餐饮美食", "🍽️", [["早餐", "🌅"], ["午餐", "🍱"], ["晚餐", "🍲"], ["外卖", "🛵"], ["零食饮料", "🍿"], ["水果", "🍎"]]],
    ["交通出行", "🚗", [["公交地铁", "🚌"], ["打车", "🚕"], ["火车", "🚄"], ["飞机", "✈️"], ["加油", "⛽"], ["停车", "🅿️"]]],
    ["购物消费", "🛍️", [["服饰鞋包", "👗"], ["数码电器", "💻"], ["美妆护肤", "💄"], ["日用百货", "🧻"], ["礼物", "🎁"]]],
    ["居住缴费", "🏠", [["房租房贷", "🏠"], ["水电燃气", "💡"], ["物业费", "🏢"], ["话费网费", "📱"], ["家居维修", "🔧"]]],
    ["娱乐休闲", "🎮", [["电影演出", "🎬"], ["游戏", "🎮"], ["运动健身", "🏃"], ["旅行", "🧳"], ["聚会", "🎉"], ["会员订阅", "📺"]]],
    ["健康医疗", "💊", [["药品", "💊"], ["门诊", "🏥"], ["体检", "🩺"], ["保健", "🧘"]]],
    ["学习教育", "📚", [["书籍", "📚"], ["课程培训", "🎓"], ["文具", "✏️"], ["学费", "🎒"]]],
    ["人情往来", "🤝", [["红包", "🧧"], ["请客", "🍻"], ["礼金", "💐"], ["捐赠", "❤️"]]],
    ["其他", "📦", [["其他支出", "📦"]]],
  ];
  const incomeGroups: [string, string, Child[]][] = [
    ["工作收入", "💼", [["工资", "💰"], ["奖金", "🏆"], ["兼职", "🛠️"]]],
    ["投资理财", "📈", [["利息", "🏦"], ["基金股票收益", "📈"]]],
    ["人情往来", "🤝", [["红包", "🧧"], ["礼金", "💐"], ["报销", "🧾"]]],
    ["其他", "📦", [["其他收入", "💵"]]],
  ];

  for (const [group, emoji, children] of expenseGroups) {
    await db!.execute(
      "INSERT INTO categories (type, parent_id, name, emoji, sort_order) VALUES ('expense', NULL, ?, ?, ?)",
      [group, emoji, 0]
    );
    const parent = await db!.select<{ id: number }[]>(
      "SELECT id FROM categories WHERE type = 'expense' AND parent_id IS NULL AND name = ?",
      [group]
    );
    for (const [name, childEmoji] of children) {
      await db!.execute(
        "INSERT INTO categories (type, parent_id, name, emoji, sort_order) VALUES ('expense', ?, ?, ?, ?)",
        [parent[0].id, name, childEmoji, 0]
      );
    }
  }
  for (const [group, emoji, children] of incomeGroups) {
    await db!.execute(
      "INSERT INTO categories (type, parent_id, name, emoji, sort_order) VALUES ('income', NULL, ?, ?, ?)",
      [group, emoji, 0]
    );
    const parent = await db!.select<{ id: number }[]>(
      "SELECT id FROM categories WHERE type = 'income' AND parent_id IS NULL AND name = ?",
      [group]
    );
    for (const [name, childEmoji] of children) {
      await db!.execute(
        "INSERT INTO categories (type, parent_id, name, emoji, sort_order) VALUES ('income', ?, ?, ?, ?)",
        [parent[0].id, name, childEmoji, 0]
      );
    }
  }
}
