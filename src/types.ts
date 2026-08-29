// 黑马记账 —— 数据类型定义

/** 分类（一级大类或二级小类） */
export interface Category {
  id: number;
  type: "expense" | "income"; // 支出 / 收入
  parent_id: number | null; // null = 一级大类
  name: string;
  emoji: string;
  sort_order: number;
  is_custom: number;
}

/** 一笔收支记录 */
export interface Record {
  id: number;
  type: "expense" | "income";
  amount_cents: number; // 金额（分）
  category_id: number;
  record_date: string; // 'YYYY-MM-DD'
  note: string;
  created_at: string;
}

/** 查询记录时附带分类信息 */
export interface RecordWithCategory extends Record {
  category_name: string;
  category_emoji: string;
  parent_name: string;
}

/** 本月汇总 */
export interface MonthSummary {
  expense_cents: number;
  income_cents: number;
}
