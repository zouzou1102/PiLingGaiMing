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
import { onMounted, ref, computed } from 'vue'
import AppModal from './AppModal.vue'
import { THEME_OPTIONS } from '@shared/labels'
import type { AppInfo } from '@shared/types'
import type { Theme } from '@shared/theme'
import { usePrefsStore } from '../stores/prefs'
import { useTaskStore } from '../stores/task'

const prefs = usePrefsStore()
const task = useTaskStore()

function setTheme(t: Theme): void {
  void prefs.patch({ theme: t })
}

/* ── P2-C · EL-114 ~ EL-116 命令行入口 ────────────────────────────────
 * 折起 / 展开是**纯 UI 状态**，不写任何偏好（IX-102）。
 * 「复制程序路径」解决的是进阶用户最大的障碍 —— **不知道程序装在哪**
 * （Electron 默认装在用户目录深处）。这一条比写一百行文档有用。 */
const appInfo = ref<AppInfo | null>(null)
const cliOpen = ref(false)

onMounted(async () => {
  appInfo.value = await window.maodie.app.getInfo()
})

/** 只给一条示例命令（决策 4），并带上本机完整程序路径 */
const cliCommand = computed(() => {
  const exe = appInfo.value?.execPath ?? 'maodie.exe'
  return `${exe} --rename --dir "D:\\下载\\素材" --delete "广告" --yes`
})

async function copyText(text: string, what: string): Promise<void> {
  if (text === '') return
  // 复制成功给一次轻提示（复用既有提示位，**不弹窗**）；不新增 IPC 通道
  await navigator.clipboard.writeText(text)
  task.setStatusOverride(`${what}已复制`)
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

      <!-- EL-114 命令行（P2-C）。折叠行：标签 + 右侧箭头；折起 / 展开是纯 UI 状态 -->
      <div class="md-settings__row">
        <button
          class="md-cli__bar"
          :aria-expanded="cliOpen"
          @click="cliOpen = !cliOpen"
        >
          <span class="md-settings__label">命令行</span>
          <span class="md-cli__caret" :class="{ 'md-cli__caret--open': cliOpen }" aria-hidden="true" />
        </button>
      </div>

      <!-- EL-115 说明 + 代码块；EL-116 复制按钮组 -->
      <div v-if="cliOpen" class="md-cli__body">
        <p class="md-cli__desc">给进阶用户用脚本批量改名。在命令行（或 .bat 文件）里跑下面这条：</p>
        <p class="md-cli__code">{{ cliCommand }}</p>
        <div class="md-cli__btns">
          <button class="md-btn md-btn--secondary" @click="copyText(cliCommand, '命令')">复制命令</button>
          <button
            class="md-btn md-btn--secondary"
            @click="copyText(appInfo?.execPath ?? '', '程序路径')"
          >
            复制程序路径
          </button>
        </div>
        <p class="md-cli__hint">
          「复制命令」会自动带上你机器上的完整程序路径。默认只打印将要做的改动，
          加 <code>--yes</code> 才真正改名。
        </p>
      </div>
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

/* ── P2-C · 命令行入口（EL-114 ~ EL-116，设计 §3.2）──────────────────── */

.md-cli__bar {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0;
  background: none;
  border: none;
  cursor: pointer;
  color: var(--md-ink-1);
}

.md-cli__caret {
  width: 0;
  height: 0;
  border-left: 6px solid transparent;
  border-right: 6px solid transparent;
  border-top: 5px solid currentColor;
  transition: transform var(--md-dur-hover) var(--md-ease-pop);
}

.md-cli__caret--open {
  transform: rotate(180deg);
}

.md-cli__body {
  display: flex;
  flex-direction: column;
  gap: var(--md-space-2);
  padding: 12px;
  border-radius: 10px;
  background: var(--md-bg-warm);
}

.md-cli__desc {
  margin: 0;
  font-size: 12px;
  color: var(--md-ink-2);
}

/* 命令可能很长：**横向滚动、不换行**，否则会被折成两行看不清 */
.md-cli__code {
  margin: 0;
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--md-bg-sunken);
  font-family: var(--md-font-num);
  font-size: 11.5px;
  font-weight: 500;
  color: var(--md-ink-1);
  overflow-x: auto;
  white-space: nowrap;
}

.md-cli__btns {
  display: flex;
  gap: var(--md-space-2);
}

.md-cli__hint {
  margin: 0;
  font-size: 11.5px;
  line-height: 18px;
  color: var(--md-ink-4);
}

.md-cli__hint code {
  font-family: var(--md-font-num);
}
</style>
