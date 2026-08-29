<script setup lang="ts">
// 黑马记账 —— 主框架：底部导航 + 页面切换（简单切换方案）
import { ref } from "vue";
import AccountPage from "./pages/AccountPage.vue";
import RecordsPage from "./pages/RecordsPage.vue";
import SettingsPage from "./pages/SettingsPage.vue";

type Tab = "account" | "records" | "settings";
const tab = ref<Tab>("account");

const tabs: { key: Tab; label: string; icon: string }[] = [
  { key: "account", label: "记账", icon: "＋" },
  { key: "records", label: "流水", icon: "🧾" },
  { key: "settings", label: "设置", icon: "⚙️" },
];
</script>

<template>
  <div class="app">
    <main class="content">
      <AccountPage v-show="tab === 'account'" />
      <RecordsPage v-show="tab === 'records'" />
      <SettingsPage v-show="tab === 'settings'" />
    </main>

    <nav class="tabbar">
      <button
        v-for="t in tabs"
        :key="t.key"
        class="tab-item"
        :class="{ active: tab === t.key }"
        @click="tab = t.key"
      >
        <span class="tab-icon">{{ t.icon }}</span>
        <span class="tab-label">{{ t.label }}</span>
      </button>
    </nav>
  </div>
</template>

<style>
:root {
  font-family: "Microsoft YaHei", "PingFang SC", "Segoe UI", sans-serif;
  font-size: 16px;
  color: #1f1f1f;
  background-color: #faf8f5;
}

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html,
body,
#app {
  height: 100%;
}

.app {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.content {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.content > * {
  flex: 1;
  min-height: 0;
}

/* 底部导航 */
.tabbar {
  display: flex;
  border-top: 1px solid #eee8e0;
  background: #fff;
  padding: 4px 0 calc(6px + env(safe-area-inset-bottom));
}
.tab-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
  border: none;
  background: transparent;
  padding: 5px 0;
  cursor: pointer;
  font-family: inherit;
}
.tab-icon {
  font-size: 20px;
  line-height: 1.2;
  color: #999;
}
.tab-label {
  font-size: 11px;
  color: #999;
}
.tab-item.active .tab-icon,
.tab-item.active .tab-label {
  color: #1f1f1f;
  font-weight: 600;
}
</style>
