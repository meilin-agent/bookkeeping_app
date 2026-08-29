<script setup lang="ts">
// 黑马记账 —— 设置页：分类管理（新增/改名/换图标/删除）+ 关于
import { onMounted, ref } from "vue";
import type Database from "@tauri-apps/plugin-sql";
import { getDb } from "../db";
import type { Category } from "../types";

const db = ref<Database | null>(null);
const tab = ref<"expense" | "income">("expense");
const groups = ref<Category[]>([]); // 一级大类
const childrenMap = ref<Map<number, Category[]>>(new Map());

async function loadCategories() {
  if (!db.value) return;
  const all = await db.value.select<Category[]>(
    "SELECT * FROM categories ORDER BY type, parent_id IS NOT NULL, sort_order, id"
  );
  groups.value = all.filter((c) => c.parent_id === null && c.type === tab.value);
  const map = new Map<number, Category[]>();
  for (const g of groups.value) {
    map.set(g.id, all.filter((c) => c.parent_id === g.id));
  }
  childrenMap.value = map;
}

async function switchTab(t: "expense" | "income") {
  tab.value = t;
  await loadCategories();
}

// ---------- 新增 / 编辑分类弹层 ----------
const showEditor = ref(false);
const editMode = ref<"add" | "rename">("add");
const editId = ref<number | null>(null);
const editName = ref("");
const editEmoji = ref("");
const editGroupId = ref<number | null>(null); // 新增时所属大类
const editError = ref("");

const EMOJI_CHOICES = [
  "🍜", "🍱", "🍲", "🛵", "🍿", "🍎", "☕", "🥤",
  "🚌", "🚕", "🚄", "✈️", "⛽", "🅿️", "🚗", "🚲",
  "👗", "💻", "💄", "🧻", "🎁", "👟", "👜", "📱",
  "🏠", "💡", "🏢", "🔧", "🧹", "🛏️", "🚿", "🌡️",
  "🎬", "🎮", "🏃", "🧳", "🎉", "📺", "🎤", "🎨",
  "💊", "🏥", "🩺", "🧘", "🦷", "👁️", "💉", "🩹",
  "📚", "🎓", "✏️", "🎒", "📖", "🖊️", "📐", "💻",
  "🧧", "🍻", "💐", "❤️", "🤝", "🎂", "💝", "🎊",
  "💰", "🏆", "🛠️", "🏦", "📈", "💵", "🧾", "📦",
];

function openAdd() {
  editMode.value = "add";
  editId.value = null;
  editName.value = "";
  editEmoji.value = "📦";
  editGroupId.value = groups.value[0]?.id ?? null;
  editError.value = "";
  showEditor.value = true;
}

function openRename(cat: Category) {
  editMode.value = "rename";
  editId.value = cat.id;
  editName.value = cat.name;
  editEmoji.value = cat.emoji || "📦";
  editError.value = "";
  showEditor.value = true;
}

async function saveCategory() {
  if (!db.value) return;
  const name = editName.value.trim();
  if (!name) {
    editError.value = "请输入分类名称";
    return;
  }
  if (!editEmoji.value) {
    editError.value = "请选择一个图标";
    return;
  }
  try {
    if (editMode.value === "add") {
      if (editGroupId.value === null) {
        editError.value = "请选择所属大类";
        return;
      }
      // 同大类下重名检查
      const dup = await db.value.select<{ c: number }[]>(
        "SELECT COUNT(*) AS c FROM categories WHERE parent_id = ? AND name = ?",
        [editGroupId.value, name]
      );
      if (dup[0].c > 0) {
        editError.value = "该大类下已有同名分类";
        return;
      }
      await db.value.execute(
        "INSERT INTO categories (type, parent_id, name, emoji, sort_order, is_custom) VALUES (?, ?, ?, ?, 99, 1)",
        [tab.value, editGroupId.value, name, editEmoji.value]
      );
    } else {
      await db.value.execute(
        "UPDATE categories SET name = ?, emoji = ? WHERE id = ?",
        [name, editEmoji.value, editId.value]
      );
    }
    showEditor.value = false;
    await loadCategories();
  } catch (e) {
    editError.value = "保存失败：" + String(e);
  }
}

// ---------- 删除分类 ----------
const deleteConfirm = ref<Category | null>(null);
const deleteError = ref("");

async function askDelete(cat: Category) {
  if (!db.value) return;
  deleteError.value = "";
  const row = await db.value.select<{ c: number }[]>(
    "SELECT COUNT(*) AS c FROM records WHERE category_id = ?",
    [cat.id]
  );
  if (row[0].c > 0) {
    deleteError.value = `「${cat.name}」下有 ${row[0].c} 笔记录，不能删除。请先修改或删除这些记录。`;
    return;
  }
  deleteConfirm.value = cat;
}

async function doDelete() {
  if (!db.value || !deleteConfirm.value) return;
  try {
    await db.value.execute("DELETE FROM categories WHERE id = ?", [deleteConfirm.value.id]);
    deleteConfirm.value = null;
    await loadCategories();
  } catch (e) {
    deleteError.value = "删除失败：" + String(e);
  }
}

onMounted(async () => {
  db.value = await getDb();
  await loadCategories();
});
</script>

<template>
  <div class="page">
    <div class="page-title">设置</div>

    <!-- 类型切换 -->
    <div class="type-switch">
      <button class="type-btn" :class="{ active: tab === 'expense' }" @click="switchTab('expense')">支出分类</button>
      <button class="type-btn" :class="{ active: tab === 'income' }" @click="switchTab('income')">收入分类</button>
    </div>

    <p v-if="deleteError" class="error-banner">{{ deleteError }}</p>

    <!-- 分类列表 -->
    <div class="cat-list">
      <div v-for="g in groups" :key="g.id" class="cat-group">
        <div class="cat-group-title">
          <span class="cg-emoji">{{ g.emoji }}</span>
          <span class="cg-name">{{ g.name }}</span>
          <span class="cg-count">{{ (childrenMap.get(g.id) || []).length }} 个</span>
        </div>
        <div class="cat-children">
          <div v-for="c in childrenMap.get(g.id) || []" :key="c.id" class="cat-item">
            <span class="ci-emoji">{{ c.emoji }}</span>
            <span class="ci-name">{{ c.name }}</span>
            <span v-if="c.is_custom === 1" class="ci-tag">自定义</span>
            <button class="mini-btn" @click="openRename(c)">✎</button>
            <button class="mini-btn mini-del" @click="askDelete(c)">✕</button>
          </div>
        </div>
      </div>
    </div>

    <!-- 新增分类按钮 -->
    <button class="add-btn" @click="openAdd">＋ 新增二级分类</button>

    <!-- 新增/编辑弹层 -->
    <div v-if="showEditor" class="overlay" @click.self="showEditor = false">
      <div class="sheet">
        <div class="sheet-title">{{ editMode === "add" ? "新增分类" : "编辑分类" }}</div>

        <div class="field">
          <label>所属大类</label>
          <div class="edit-groups">
            <button
              v-for="g in groups"
              :key="g.id"
              class="eg-btn"
              :class="{ active: editGroupId === g.id }"
              @click="editGroupId = g.id"
            >
              {{ g.emoji }} {{ g.name }}
            </button>
          </div>
        </div>

        <div class="field">
          <label>分类名称</label>
          <input v-model="editName" type="text" class="input" placeholder="如：宠物、保险…" maxlength="10" />
        </div>

        <div class="field">
          <label>选择图标</label>
          <div class="emoji-grid">
            <button
              v-for="e in EMOJI_CHOICES"
              :key="e"
              class="emoji-btn"
              :class="{ active: editEmoji === e }"
              @click="editEmoji = e"
            >
              {{ e }}
            </button>
          </div>
        </div>

        <p v-if="editError" class="error-text">{{ editError }}</p>

        <div class="sheet-btns">
          <button class="btn-ghost" @click="showEditor = false">取消</button>
          <button class="btn-primary" @click="saveCategory">保存</button>
        </div>
      </div>
    </div>

    <!-- 删除确认弹层 -->
    <div v-if="deleteConfirm" class="overlay" @click.self="deleteConfirm = null">
      <div class="sheet">
        <div class="sheet-title">删除分类</div>
        <p class="confirm-text">
          确定删除分类「{{ deleteConfirm.emoji }} {{ deleteConfirm.name }}」吗？
        </p>
        <p class="confirm-warn">删除后不可恢复</p>
        <div class="sheet-btns">
          <button class="btn-ghost" @click="deleteConfirm = null">取消</button>
          <button class="btn-danger" @click="doDelete">确认删除</button>
        </div>
      </div>
    </div>

    <!-- 关于 -->
    <div class="about">
      <div class="about-logo">🐴</div>
      <div class="about-name">记账</div>
      <div class="about-ver">版本 v0.1.0（开发版）</div>
      <div class="about-slogan">清爽记账 · 分毫不乱 · 数据只在本机</div>
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
  font-size: 14px;
  color: #777;
  cursor: pointer;
  font-family: inherit;
}
.type-btn.active {
  background: #1f1f1f;
  color: #fff;
  font-weight: 600;
}

.error-banner {
  background: #fdecec;
  color: #c33;
  border-radius: 10px;
  padding: 9px 12px;
  font-size: 12px;
  line-height: 1.5;
}

/* 分类列表 */
.cat-group {
  margin-bottom: 12px;
}
.cat-group-title {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 2px;
}
.cg-emoji {
  font-size: 18px;
}
.cg-name {
  font-size: 15px;
  font-weight: 700;
  color: #1f1f1f;
  flex: 1;
}
.cg-count {
  font-size: 11px;
  color: #bbb;
}
.cat-children {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.cat-item {
  display: flex;
  align-items: center;
  gap: 5px;
  background: #fff;
  border: 1px solid #f0ece5;
  border-radius: 10px;
  padding: 7px 10px;
  font-size: 13px;
}
.ci-emoji {
  font-size: 15px;
}
.ci-name {
  color: #333;
}
.ci-tag {
  font-size: 10px;
  color: #b8860b;
  border: 1px solid #e6c872;
  border-radius: 4px;
  padding: 0 4px;
}
.mini-btn {
  border: none;
  background: #f0ede8;
  color: #666;
  width: 22px;
  height: 22px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
  font-family: inherit;
  line-height: 1;
}
.mini-btn:hover {
  background: #e5e1da;
}
.mini-del {
  color: #c33;
}

/* 新增按钮 */
.add-btn {
  border: 1.5px dashed #d5cfc4;
  background: transparent;
  border-radius: 12px;
  padding: 11px 0;
  font-size: 14px;
  color: #8a857c;
  cursor: pointer;
  font-family: inherit;
  transition: all 0.15s;
}
.add-btn:hover {
  border-color: #1f1f1f;
  color: #1f1f1f;
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

.emoji-grid {
  display: grid;
  grid-template-columns: repeat(8, 1fr);
  gap: 4px;
}
.emoji-btn {
  border: 1.5px solid #e5e1da;
  background: #fff;
  border-radius: 8px;
  font-size: 16px;
  padding: 4px 0;
  cursor: pointer;
}
.emoji-btn.active {
  border-color: #1f1f1f;
  background: #1f1f1f;
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
.btn-ghost {
  flex: 1;
  border: 1.5px solid #e5e1da;
  background: #fff;
  border-radius: 10px;
  font-size: 15px;
  color: #555;
  padding: 11px 0;
  cursor: pointer;
  font-family: inherit;
}
.btn-danger {
  flex: 1;
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

.confirm-text {
  font-size: 14px;
  color: #1f1f1f;
  text-align: center;
  padding: 10px 0 0;
}
.confirm-warn {
  font-size: 12px;
  color: #d33;
  text-align: center;
}

/* 关于 */
.about {
  margin-top: auto;
  padding-top: 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  color: #999;
}
.about-logo {
  width: 56px;
  height: 56px;
  border-radius: 14px;
  background: linear-gradient(135deg, #1f1f1f, #3d3d3d);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28px;
  margin-bottom: 6px;
}
.about-name {
  font-size: 15px;
  font-weight: 700;
  color: #1f1f1f;
}
.about-ver {
  font-size: 12px;
}
.about-slogan {
  font-size: 11px;
}
</style>
