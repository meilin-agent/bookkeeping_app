<script setup lang="ts">
// 黑马记账 —— 流水页：按日期分组查看全部记录，支持编辑与删除
import { computed, onMounted, ref } from "vue";
import type Database from "@tauri-apps/plugin-sql";
import { getDb } from "../db";
import type { Category, RecordWithCategory } from "../types";

const db = ref<Database | null>(null);
const records = ref<RecordWithCategory[]>([]);
const loading = ref(true);

async function loadRecords() {
  if (!db.value) return;
  records.value = await db.value.select<RecordWithCategory[]>(
    `SELECT r.*, c.name AS category_name, c.emoji AS category_emoji, p.name AS parent_name
     FROM records r
     JOIN categories c ON c.id = r.category_id
     JOIN categories p ON p.id = c.parent_id
     ORDER BY r.record_date DESC, r.id DESC`
  );
  loading.value = false;
}

/** 按日期分组 */
const groups = computed(() => {
  const map = new Map<string, RecordWithCategory[]>();
  for (const r of records.value) {
    const list = map.get(r.record_date) ?? [];
    list.push(r);
    map.set(r.record_date, list);
  }
  return [...map.entries()].map(([date, list]) => {
    const expense = list
      .filter((r) => r.type === "expense")
      .reduce((s, r) => s + r.amount_cents, 0);
    const income = list
      .filter((r) => r.type === "income")
      .reduce((s, r) => s + r.amount_cents, 0);
    return { date, list, expense, income };
  });
});

function fmtCents(cents: number): string {
  return (cents / 100).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(date: string): string {
  const [y, m, d] = date.split("-");
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  if (date === todayStr) return "今天";
  return `${y}年${Number(m)}月${Number(d)}日`;
}

// ---------- 编辑弹层 ----------
const editing = ref<RecordWithCategory | null>(null);
const editAmount = ref("");
const editDate = ref("");
const editNote = ref("");
const editGroups = ref<Category[]>([]);
const editChildren = ref<Category[]>([]);
const editGroupId = ref<number | null>(null);
const editChildId = ref<number | null>(null);
const confirmDelete = ref(false);
const savingEdit = ref(false);
const editError = ref("");

function openEdit(rec: RecordWithCategory) {
  editing.value = rec;
  confirmDelete.value = false;
  editError.value = "";
  editAmount.value = (rec.amount_cents / 100).toFixed(2).replace(/\.00$/, "");
  editDate.value = rec.record_date;
  editNote.value = rec.note;
  loadEditCategories(rec.type, rec.category_id);
}

async function loadEditCategories(type: "expense" | "income", currentChildId: number) {
  if (!db.value) return;
  const groups = await db.value.select<Category[]>(
    "SELECT * FROM categories WHERE type = ? AND parent_id IS NULL ORDER BY sort_order, id",
    [type]
  );
  editGroups.value = groups;
  // 找到当前记录所属的一级分类
  const kids = await db.value.select<Category[]>(
    "SELECT * FROM categories WHERE id = ?",
    [currentChildId]
  );
  const parentId = kids.length > 0 ? kids[0].parent_id : null;
  editGroupId.value = parentId;
  await loadEditChildren(parentId);
  editChildId.value = currentChildId;
}

async function loadEditChildren(groupId: number | null) {
  if (!db.value) return;
  editGroupId.value = groupId;
  editChildId.value = null;
  if (groupId === null) {
    editChildren.value = [];
    return;
  }
  editChildren.value = await db.value.select<Category[]>(
    "SELECT * FROM categories WHERE parent_id = ? ORDER BY sort_order, id",
    [groupId]
  );
}

function selectEditGroup(id: number | null) {
  loadEditChildren(id);
}

async function saveEdit() {
  if (!db.value || !editing.value) return;
  const cents = Math.round(parseFloat(editAmount.value || "0") * 100);
  if (!Number.isFinite(cents) || cents <= 0) {
    editError.value = "请输入正确的金额";
    return;
  }
  if (editChildId.value === null) {
    editError.value = "请选择分类";
    return;
  }
  savingEdit.value = true;
  try {
    await db.value.execute(
      "UPDATE records SET amount_cents = ?, category_id = ?, record_date = ?, note = ? WHERE id = ?",
      [cents, editChildId.value, editDate.value, editNote.value.trim(), editing.value.id]
    );
    editing.value = null;
    await loadRecords();
  } catch (e) {
    editError.value = "保存失败：" + String(e);
  } finally {
    savingEdit.value = false;
  }
}

async function doDelete() {
  if (!db.value || !editing.value) return;
  try {
    await db.value.execute("DELETE FROM records WHERE id = ?", [editing.value.id]);
    editing.value = null;
    await loadRecords();
  } catch (e) {
    editError.value = "删除失败：" + String(e);
  }
}

onMounted(async () => {
  db.value = await getDb();
  await loadRecords();
});
</script>

<template>
  <div class="page">
    <div class="page-title">流水</div>

    <div v-if="loading" class="empty">正在加载…</div>
    <div v-else-if="records.length === 0" class="empty">
      <div class="empty-icon">🧾</div>
      <p>还没有记录，去「记账」页记第一笔吧</p>
    </div>

    <div v-else class="record-list">
      <div v-for="g in groups" :key="g.date" class="day-group">
        <div class="day-header">
          <span class="day-date">{{ fmtDate(g.date) }}</span>
          <span class="day-count">共 {{ g.list.length }} 笔</span>
          <span class="day-total">
            <span v-if="g.income > 0" class="income">收 ¥{{ fmtCents(g.income) }}</span>
            <span v-if="g.expense > 0" class="expense">支 ¥{{ fmtCents(g.expense) }}</span>
          </span>
        </div>
        <div
          v-for="r in g.list"
          :key="r.id"
          class="record-item"
          @click="openEdit(r)"
        >
          <span class="rec-emoji">{{ r.category_emoji }}</span>
          <div class="rec-main">
            <span class="rec-cat">{{ r.category_name }}</span>
            <span class="rec-parent">{{ r.parent_name }}</span>
            <span v-if="r.note" class="rec-note">{{ r.note }}</span>
          </div>
          <span class="rec-amount" :class="r.type">
            {{ r.type === "expense" ? "-" : "+" }}¥{{ fmtCents(r.amount_cents) }}
          </span>
        </div>
      </div>
    </div>

    <!-- 编辑弹层 -->
    <div v-if="editing" class="overlay" @click.self="editing = null">
      <div class="sheet">
        <div class="sheet-title">编辑这笔记录</div>

        <!-- 删除确认态 -->
        <div v-if="confirmDelete" class="confirm-box">
          <p>确定删除这笔「{{ editing.category_name }} {{ editAmount }} 元」吗？</p>
          <p class="confirm-warn">删除后不可恢复</p>
          <div class="confirm-btns">
            <button class="btn-ghost" @click="confirmDelete = false">取消</button>
            <button class="btn-danger" @click="doDelete">确认删除</button>
          </div>
        </div>

        <template v-else>
          <!-- 金额 + 日期 -->
          <div class="form-row">
            <div class="field">
              <label>金额（元）</label>
              <input v-model="editAmount" type="text" inputmode="decimal" class="input" placeholder="如 25.50" />
            </div>
            <div class="field">
              <label>日期</label>
              <input v-model="editDate" type="date" class="input" />
            </div>
          </div>

          <!-- 分类 -->
          <div class="field">
            <label>分类</label>
            <div class="edit-groups">
              <button
                v-for="g in editGroups"
                :key="g.id"
                class="eg-btn"
                :class="{ active: editGroupId === g.id }"
                @click="selectEditGroup(g.id)"
              >
                {{ g.emoji }} {{ g.name }}
              </button>
            </div>
            <div class="edit-children">
              <button
                v-for="c in editChildren"
                :key="c.id"
                class="ec-btn"
                :class="{ active: editChildId === c.id }"
                @click="editChildId = c.id"
              >
                {{ c.emoji }} {{ c.name }}
              </button>
            </div>
          </div>

          <!-- 备注 -->
          <div class="field">
            <label>备注</label>
            <input v-model="editNote" type="text" class="input" placeholder="选填" maxlength="30" />
          </div>

          <p v-if="editError" class="error-text">{{ editError }}</p>

          <div class="sheet-btns">
            <button class="btn-danger" @click="confirmDelete = true">删除</button>
            <button class="btn-primary" :disabled="savingEdit" @click="saveEdit">保存修改</button>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page {
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 12px 14px 20px;
  overflow-y: auto;
  gap: 10px;
}

.page-title {
  font-size: 20px;
  font-weight: 700;
  color: #1f1f1f;
  letter-spacing: 2px;
}

.empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: #aaa;
  font-size: 14px;
}
.empty-icon {
  font-size: 44px;
}

/* 日期分组 */
.day-group {
  margin-bottom: 6px;
}
.day-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 2px;
  font-size: 12px;
  color: #999;
}
.day-date {
  font-weight: 600;
  color: #555;
}
.day-count {
  flex: 1;
}
.day-total {
  display: flex;
  gap: 8px;
}
.day-total .expense {
  color: #3d9a5f;
}
.day-total .income {
  color: #e89b2d;
}

/* 单条记录 */
.record-item {
  display: flex;
  align-items: center;
  gap: 10px;
  background: #fff;
  border: 1px solid #f0ece5;
  border-radius: 12px;
  padding: 10px 12px;
  margin-bottom: 6px;
  cursor: pointer;
  transition: box-shadow 0.15s;
}
.record-item:hover {
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.06);
}
.rec-emoji {
  font-size: 22px;
  width: 34px;
  text-align: center;
}
.rec-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}
.rec-cat {
  font-size: 14px;
  color: #1f1f1f;
  font-weight: 600;
}
.rec-parent {
  font-size: 11px;
  color: #bbb;
}
.rec-note {
  font-size: 11px;
  color: #999;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.rec-amount {
  font-size: 15px;
  font-weight: 700;
  white-space: nowrap;
}
.rec-amount.expense {
  color: #3d9a5f;
}
.rec-amount.income {
  color: #e89b2d;
}

/* 弹层 */
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  z-index: 50;
}
.sheet {
  width: 100%;
  max-height: 85%;
  overflow-y: auto;
  background: #faf8f5;
  border-radius: 18px 18px 0 0;
  padding: 18px 16px calc(20px + env(safe-area-inset-bottom));
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.sheet-title {
  font-size: 16px;
  font-weight: 700;
  text-align: center;
  color: #1f1f1f;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.field label {
  font-size: 12px;
  color: #999;
}
.form-row {
  display: flex;
  gap: 10px;
}
.form-row .field {
  flex: 1;
}
.input {
  border: 1.5px solid #e5e1da;
  border-radius: 10px;
  padding: 9px 10px;
  font-size: 14px;
  font-family: inherit;
  background: #fff;
  color: #1f1f1f;
  outline: none;
  width: 100%;
}
.input:focus {
  border-color: #1f1f1f;
}

.edit-groups {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  padding-bottom: 2px;
  scrollbar-width: none;
}
.eg-btn {
  flex-shrink: 0;
  border: 1.5px solid #e5e1da;
  background: #fff;
  border-radius: 8px;
  padding: 6px 10px;
  font-size: 13px;
  cursor: pointer;
  font-family: inherit;
  color: #555;
}
.eg-btn.active {
  border-color: #1f1f1f;
  background: #1f1f1f;
  color: #f0d488;
}
.edit-children {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.ec-btn {
  border: 1.5px solid #e5e1da;
  background: #fff;
  border-radius: 8px;
  padding: 6px 10px;
  font-size: 13px;
  cursor: pointer;
  font-family: inherit;
  color: #555;
}
.ec-btn.active {
  border-color: #1f1f1f;
  color: #1f1f1f;
  font-weight: 600;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.08);
}

.error-text {
  font-size: 12px;
  color: #d33;
}

.sheet-btns {
  display: flex;
  gap: 10px;
}
.sheet-btns .btn-primary {
  flex: 1;
}
.sheet-btns .btn-danger {
  flex: 0 0 auto;
  padding: 0 22px;
}
.btn-primary {
  border: none;
  border-radius: 10px;
  background: #1f1f1f;
  color: #fff;
  font-size: 15px;
  font-weight: 600;
  padding: 11px 0;
  cursor: pointer;
  font-family: inherit;
}
.btn-primary:disabled {
  opacity: 0.6;
}
.btn-danger {
  border: 1.5px solid #d33;
  background: #fff;
  color: #d33;
  border-radius: 10px;
  font-size: 15px;
  font-weight: 600;
  padding: 11px 0;
  cursor: pointer;
  font-family: inherit;
}

/* 删除确认 */
.confirm-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 20px 0 8px;
  font-size: 14px;
  color: #1f1f1f;
  text-align: center;
}
.confirm-warn {
  font-size: 12px;
  color: #d33;
}
.confirm-btns {
  display: flex;
  gap: 12px;
  margin-top: 8px;
}
.confirm-btns .btn-ghost {
  border: 1.5px solid #e5e1da;
  background: #fff;
  border-radius: 10px;
  padding: 9px 26px;
  font-size: 14px;
  cursor: pointer;
  font-family: inherit;
  color: #555;
}
.confirm-btns .btn-danger {
  padding: 9px 26px;
}
</style>
