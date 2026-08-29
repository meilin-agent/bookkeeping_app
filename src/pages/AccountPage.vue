<script setup lang="ts">
// 黑马记账 —— 记账页（首页）：记一笔 = 类型 + 金额 + 分类 + 日期 + 备注
import { computed, onMounted, ref } from "vue";
import type Database from "@tauri-apps/plugin-sql";
import { getDb } from "../db";
import type { Category, MonthSummary } from "../types";

const db = ref<Database | null>(null);

// ---------- 本月汇总 ----------
const summary = ref<MonthSummary>({ expense_cents: 0, income_cents: 0 });

async function loadSummary() {
  if (!db.value) return;
  const now = new Date();
  const firstDay = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const rows = await db.value.select<{ type: string; total: number }[]>(
    "SELECT type, COALESCE(SUM(amount_cents), 0) AS total FROM records WHERE record_date >= ? GROUP BY type",
    [firstDay]
  );
  summary.value = {
    expense_cents: rows.find((r) => r.type === "expense")?.total ?? 0,
    income_cents: rows.find((r) => r.type === "income")?.total ?? 0,
  };
}

// ---------- 类型切换 ----------
type RecType = "expense" | "income";
const recType = ref<RecType>("expense");

// ---------- 金额输入（分单位保存，界面以元显示） ----------
const amountInput = ref(""); // 元，字符串（保留0.00格式）
const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "del"];

function pressKey(k: string) {
  if (k === "del") {
    amountInput.value = amountInput.value.slice(0, -1);
    return;
  }
  const cur = amountInput.value;
  if (k === ".") {
    if (cur.includes(".") || cur.length === 0) return; // 已有小数点或空则忽略
    amountInput.value = cur + ".";
    return;
  }
  // 数字键
  if (cur.includes(".")) {
    const [, dec] = cur.split(".");
    if (dec.length >= 2) return; // 最多 2 位小数
  }
  if (cur === "0") {
    amountInput.value = k; // 首位 0 直接替换
  } else if (cur === "") {
    amountInput.value = k;
  } else {
    amountInput.value = cur + k;
  }
}

/** 金额（分） */
const amountCents = computed(() => {
  if (!amountInput.value) return 0;
  const n = Math.round(parseFloat(amountInput.value) * 100);
  return Number.isFinite(n) ? n : 0;
});

/** 显示金额 */
const displayAmount = computed(() => {
  if (!amountInput.value) return "0.00";
  const n = parseFloat(amountInput.value);
  return Number.isFinite(n) ? n.toFixed(2) : "0.00";
});

// ---------- 分类 ----------
const groups = ref<Category[]>([]); // 一级大类
const children = ref<Category[]>([]); // 二级小类
const selectedGroupId = ref<number | null>(null);
const selectedChildId = ref<number | null>(null);

async function loadGroups() {
  if (!db.value) return;
  groups.value = await db.value.select<Category[]>(
    "SELECT * FROM categories WHERE type = ? AND parent_id IS NULL ORDER BY sort_order, id",
    [recType.value]
  );
  // 默认选中上次使用的一级分类（记在浏览器本地记忆里）
  const saved = localStorage.getItem(`lastGroup-${recType.value}`);
  const savedId = saved ? Number(saved) : null;
  const target = savedId && groups.value.some((g) => g.id === savedId)
    ? savedId
    : groups.value[0]?.id ?? null;
  await selectGroup(target);
}

async function selectGroup(id: number | null) {
  selectedGroupId.value = id;
  selectedChildId.value = null;
  if (id === null || !db.value) {
    children.value = [];
    return;
  }
  children.value = await db.value.select<Category[]>(
    "SELECT * FROM categories WHERE parent_id = ? ORDER BY sort_order, id",
    [id]
  );
}

async function switchType(t: RecType) {
  if (t === recType.value) return;
  recType.value = t;
  await loadGroups();
}

// ---------- 日期 / 备注 ----------
const today = (() => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
})();
const recordDate = ref(today);
const note = ref("");

// ---------- 保存 ----------
const toastMsg = ref("");
const saving = ref(false);

async function save() {
  if (saving.value) return;
  if (amountCents.value <= 0) {
    showToast("请输入金额");
    return;
  }
  if (selectedChildId.value === null) {
    showToast("请选择分类");
    return;
  }
  if (!db.value) return;
  saving.value = true;
  try {
    await db.value.execute(
      "INSERT INTO records (type, amount_cents, category_id, record_date, note) VALUES (?, ?, ?, ?, ?)",
      [recType.value, amountCents.value, selectedChildId.value, recordDate.value, note.value.trim()]
    );
    // 记住本次使用的一级分类，下次打开默认选中
    localStorage.setItem(`lastGroup-${recType.value}`, String(selectedGroupId.value));
    showToast("✓ 已记下这笔账");
    amountInput.value = "";
    note.value = "";
    recordDate.value = today;
    await loadSummary();
  } catch (e) {
    showToast("保存失败：" + String(e));
  } finally {
    saving.value = false;
  }
}

let toastTimer: ReturnType<typeof setTimeout> | null = null;
function showToast(msg: string) {
  toastMsg.value = msg;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toastMsg.value = ""), 1800);
}

// ---------- 格式化 ----------
function fmtCents(cents: number): string {
  return (cents / 100).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

onMounted(async () => {
  db.value = await getDb();
  await loadSummary();
  await loadGroups();
});
</script>

<template>
  <div class="page">
    <!-- 本月汇总卡片 -->
    <div class="summary-card">
      <div class="summary-title">本月（{{ today.slice(0, 7) }}）</div>
      <div class="summary-row">
        <div class="sum-item">
          <span class="sum-label">支出</span>
          <span class="sum-value expense">¥{{ fmtCents(summary.expense_cents) }}</span>
        </div>
        <div class="sum-item">
          <span class="sum-label">收入</span>
          <span class="sum-value income">¥{{ fmtCents(summary.income_cents) }}</span>
        </div>
        <div class="sum-item">
          <span class="sum-label">结余</span>
          <span class="sum-value" :class="summary.income_cents - summary.expense_cents >= 0 ? 'income' : 'expense'">
            {{ summary.income_cents - summary.expense_cents >= 0 ? "+" : "" }}¥{{ fmtCents(summary.income_cents - summary.expense_cents) }}
          </span>
        </div>
      </div>
    </div>

    <!-- 类型切换 -->
    <div class="type-switch">
      <button class="type-btn" :class="{ active: recType === 'expense' }" @click="switchType('expense')">支出</button>
      <button class="type-btn" :class="{ active: recType === 'income' }" @click="switchType('income')">收入</button>
    </div>

    <!-- 金额 -->
    <div class="amount-box">
      <span class="amount-symbol">¥</span>
      <span class="amount-text">{{ displayAmount }}</span>
    </div>

    <!-- 数字键盘 -->
    <div class="keypad">
      <button v-for="k in keys" :key="k" class="key" :class="{ 'key-del': k === 'del' }" @click="pressKey(k)">
        {{ k === "del" ? "⌫" : k }}
      </button>
    </div>

    <!-- 一级分类横栏 -->
    <div class="group-bar">
      <button
        v-for="g in groups"
        :key="g.id"
        class="group-item"
        :class="{ active: selectedGroupId === g.id }"
        @click="selectGroup(g.id)"
      >
        <span class="group-emoji">{{ g.emoji }}</span>
        <span class="group-name">{{ g.name }}</span>
      </button>
    </div>

    <!-- 二级分类网格 -->
    <div class="child-grid">
      <button
        v-for="c in children"
        :key="c.id"
        class="child-item"
        :class="{ active: selectedChildId === c.id }"
        @click="selectedChildId = c.id"
      >
        <span class="child-emoji">{{ c.emoji }}</span>
        <span class="child-name">{{ c.name }}</span>
      </button>
    </div>

    <!-- 日期 + 备注 + 保存 -->
    <div class="form-row">
      <input v-model="recordDate" type="date" class="date-input" />
      <input v-model="note" type="text" class="note-input" placeholder="备注（选填）" maxlength="30" />
    </div>
    <button class="save-btn" :disabled="saving" @click="save">✓ 保存</button>

    <!-- 提示条 -->
    <transition name="toast">
      <div v-if="toastMsg" class="toast">{{ toastMsg }}</div>
    </transition>
  </div>
</template>

<style scoped>
.page {
  display: flex;
  flex-direction: column;
  min-height: 100%;
  padding: 12px 14px 20px;
  gap: 10px;
  overflow-y: auto;
}

/* 汇总卡片 */
.summary-card {
  background: linear-gradient(135deg, #1f1f1f, #3d3d3d);
  border-radius: 14px;
  padding: 14px 16px;
  color: #fff;
}
.summary-title {
  font-size: 12px;
  color: #bbb;
  margin-bottom: 8px;
}
.summary-row {
  display: flex;
  justify-content: space-between;
}
.sum-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.sum-label {
  font-size: 11px;
  color: #bbb;
}
.sum-value {
  font-size: 16px;
  font-weight: 600;
}
.expense {
  color: #3d9a5f;
}
.income {
  color: #e89b2d;
}
.summary-card .expense,
.summary-card .income {
  color: #fff;
}

/* 类型切换 */
.type-switch {
  display: flex;
  background: #f0ede8;
  border-radius: 10px;
  padding: 3px;
}
.type-btn {
  flex: 1;
  padding: 8px 0;
  border: none;
  background: transparent;
  border-radius: 8px;
  font-size: 15px;
  color: #777;
  cursor: pointer;
  font-family: inherit;
}
.type-btn.active {
  background: #1f1f1f;
  color: #fff;
  font-weight: 600;
}

/* 金额 */
.amount-box {
  text-align: center;
  padding: 6px 0 2px;
}
.amount-symbol {
  font-size: 26px;
  color: #1f1f1f;
  margin-right: 4px;
}
.amount-text {
  font-size: 40px;
  font-weight: 700;
  color: #1f1f1f;
  letter-spacing: 1px;
}

/* 数字键盘 */
.keypad {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
}
.key {
  padding: 10px 0;
  border: none;
  border-radius: 10px;
  background: #f0ede8;
  font-size: 20px;
  color: #1f1f1f;
  cursor: pointer;
  font-family: inherit;
  transition: background 0.15s;
}
.key:hover {
  background: #e5e1da;
}
.key:active {
  background: #d9d4cb;
}
.key-del {
  font-size: 18px;
  color: #8a857c;
}

/* 一级分类横栏 */
.group-bar {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  padding: 2px 0;
  scrollbar-width: none;
}
.group-item {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 6px 10px;
  border: none;
  border-radius: 10px;
  background: #f0ede8;
  cursor: pointer;
  font-family: inherit;
}
.group-item.active {
  background: #1f1f1f;
}
.group-emoji {
  font-size: 18px;
}
.group-name {
  font-size: 11px;
  color: #666;
}
.group-item.active .group-name {
  color: #f0d488;
}

/* 二级分类网格 */
.child-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 6px;
}
.child-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  padding: 8px 2px;
  border: 1.5px solid transparent;
  border-radius: 10px;
  background: #f8f6f2;
  cursor: pointer;
  font-family: inherit;
  transition: all 0.15s;
}
.child-item.active {
  border-color: #1f1f1f;
  background: #fff;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}
.child-emoji {
  font-size: 22px;
}
.child-name {
  font-size: 11px;
  color: #555;
}
.child-item.active .child-name {
  color: #1f1f1f;
  font-weight: 600;
}

/* 日期 + 备注 */
.form-row {
  display: flex;
  gap: 8px;
}
.date-input,
.note-input {
  border: 1.5px solid #e5e1da;
  border-radius: 10px;
  padding: 8px 10px;
  font-size: 14px;
  font-family: inherit;
  background: #fff;
  color: #1f1f1f;
  outline: none;
}
.date-input {
  flex: 0 0 auto;
  width: 140px;
}
.note-input {
  flex: 1;
  min-width: 0;
}
.date-input:focus,
.note-input:focus {
  border-color: #1f1f1f;
}

/* 保存按钮 */
.save-btn {
  padding: 12px 0;
  border: none;
  border-radius: 12px;
  background: linear-gradient(135deg, #1f1f1f, #3d3d3d);
  color: #fff;
  font-size: 17px;
  font-weight: 600;
  cursor: pointer;
  font-family: inherit;
  letter-spacing: 4px;
  transition: opacity 0.15s;
}
.save-btn:hover {
  opacity: 0.9;
}
.save-btn:disabled {
  opacity: 0.6;
}

/* 提示条 */
.toast {
  position: fixed;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  background: rgba(31, 31, 31, 0.92);
  color: #fff;
  padding: 10px 22px;
  border-radius: 12px;
  font-size: 14px;
  z-index: 100;
  pointer-events: none;
}
.toast-enter-active,
.toast-leave-active {
  transition: opacity 0.2s;
}
.toast-enter-from,
.toast-leave-to {
  opacity: 0;
}
</style>
