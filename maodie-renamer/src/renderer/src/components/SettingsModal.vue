<script setup lang="ts">
/**
 * SCR-07 设置弹窗（P2-A · 设计确认 §3）。
 *
 * 只放三项：主题 / 音效 / 减少动画。**即改即生效**，所以底部只有一个「完成」，
 * 点它即关闭（不刷新、不跳转、不二次确认），与点遮罩、按 Esc 三者等价。
 *
 * 两点刻意为之：
 *  · 「二次确认阈值」不暴露 —— PRD 从头到尾没要求过这个旋钮，它是内部常量。
 *    按 YAGNI 不做，顺带避免给非技术用户多一个看不懂的开关。
 *  · 主题三选一**复用页签的视觉**（`.md-tabs` / `.md-tab`），零新视觉；
 *    ARIA 用的是「单选按钮组」而不是 `role="tablist"` —— 这里真的是一次三选一，
 *    底下没有可切换的内容面板，用 tab 语义会承诺一个不存在的面板关系。
 *
 * 顺带补上一个 P0 遗留缺口：交互说明 §9 与设计规范 §8 都要求「设置中提供
 * 『减少动画』开关」，但此前界面上根本没有设置入口 —— 开关写好了、也能生效，
 * 用户却打不开。这个弹窗把它补上了。
 */
import AppModal from './AppModal.vue'
import { THEME_OPTIONS } from '@shared/labels'
import type { Theme } from '@shared/theme'
import { usePrefsStore } from '../stores/prefs'
import { useTaskStore } from '../stores/task'

const prefs = usePrefsStore()
const task = useTaskStore()

function setTheme(t: Theme): void {
  void prefs.patch({ theme: t })
}
</script>

<template>
  <AppModal
    v-if="task.modal === 'settings'"
    title="设置"
    :width="480"
    foot="spread"
    @close="task.closeModal()"
  >
    <div class="md-settings">
      <!-- EL-108 主题三选一（默认「始终浅色」，见设计确认 §14 第 4 条）-->
      <div class="md-settings__row">
        <span id="md-settings-theme-label" class="md-settings__label">主题</span>
        <div class="md-tabs md-settings__seg" role="group" aria-labelledby="md-settings-theme-label">
          <button
            v-for="o in THEME_OPTIONS"
            :key="o.value"
            type="button"
            class="md-tab"
            :class="{ 'md-tab--active': prefs.prefs.theme === o.value }"
            :aria-pressed="prefs.prefs.theme === o.value"
            @click="setTheme(o.value)"
          >
            {{ o.label }}
          </button>
        </div>
      </div>
      <p class="md-hint">「跟随系统」会跟着 Windows 的深浅色自动切换。</p>

      <!-- EL-109 音效 -->
      <div class="md-settings__row">
        <span class="md-settings__label">音效</span>
        <label class="md-switch md-settings__switch--sound">
          <input
            type="checkbox"
            aria-label="音效"
            :checked="prefs.prefs.soundEnabled"
            @change="prefs.patch({ soundEnabled: ($event.target as HTMLInputElement).checked })"
          />
          <span class="md-switch__track"><span class="md-switch__thumb" /></span>
        </label>
      </div>

      <!-- EL-110 减少动画（无障碍）-->
      <div class="md-settings__row">
        <span class="md-settings__label">减少动画</span>
        <label class="md-switch md-settings__switch--motion">
          <input
            type="checkbox"
            aria-label="减少动画"
            :checked="prefs.prefs.reduceMotion"
            @change="prefs.patch({ reduceMotion: ($event.target as HTMLInputElement).checked })"
          />
          <span class="md-switch__track"><span class="md-switch__thumb" /></span>
        </label>
      </div>
      <p class="md-hint">开启后猫咪状态切换只换表情、不做位移，动效时长归零。</p>
    </div>

    <template #foot>
      <span class="md-hint">设置立即生效，不需要重启。</span>
      <button class="md-btn md-btn--primary" @click="task.closeModal()">完成</button>
    </template>
  </AppModal>
</template>

<style scoped>
.md-settings {
  display: flex;
  flex-direction: column;
  gap: var(--md-space-3);
}

.md-settings__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--md-space-3);
  min-height: var(--md-ctrl-h);
}

.md-settings__label {
  font-size: 14px;
  font-weight: 600;
  color: var(--md-ink-1);
}

/* 三选一的宽度：三项等分（288 = 4px 台阶上的值，不用随手数）*/
.md-settings__seg {
  width: 288px;
}

/* <p> 的浏览器默认外边距在这套纵向节奏里会多出一截 */
.md-hint {
  margin: 0;
}
</style>
