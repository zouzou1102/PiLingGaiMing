<script setup lang="ts">
/**
 * R-05 规则设置区（EL-040 ~ EL-055）。
 *
 * DEC-02：三种模式**互斥单选**；规则化页签内五个要素可叠加。
 * EL-044「区分大小写」只在删除 / 替换模式下出现 —— 规则化模式不涉及匹配。
 *
 * 所有变更都是「改 store → files 里的 watch 触发 200ms 防抖重算」，
 * 组件里**不写**预览刷新逻辑，保证刷新入口只有一处。
 */
import { computed } from 'vue'
import MdIcon from './MdIcon.vue'
import { useRuleStore } from '../stores/rule'
import type { DateFormat, RuleMode, SeqPosition } from '@shared/types'

const rule = useRuleStore()

const TABS: Array<{ mode: RuleMode; label: string }> = [
  { mode: 'delete', label: '删除字符' },
  { mode: 'replace', label: '替换字符' },
  { mode: 'rule', label: '规则化' },
]

const isRuleMode = computed(() => rule.rule.mode === 'rule')

/** 前缀 / 后缀里用了 {d} 但没勾「启用日期」时给个提示（否则会静默展开成空串）*/
const needsDateHint = computed(
  () =>
    isRuleMode.value &&
    !rule.rule.rule.dateEnabled &&
    (rule.rule.rule.prefix.includes('{d}') || rule.rule.rule.suffix.includes('{d}')),
)
const needsSeqHint = computed(
  () =>
    isRuleMode.value &&
    !rule.rule.rule.seqEnabled &&
    (rule.rule.rule.prefix.includes('{n}') || rule.rule.rule.suffix.includes('{n}')),
)

function setNumber(key: 'seqStart' | 'seqStep' | 'seqPad', raw: string): void {
  const n = Number(raw)
  rule.patchInner({ [key]: Number.isFinite(n) ? n : 0 } as Partial<typeof rule.rule.rule>)
}
</script>

<template>
  <section class="md-rulepanel">
    <!-- EL-040 页签组（三选一，互斥）-->
    <div class="md-tabs" role="tablist">
      <button
        v-for="t in TABS"
        :key="t.mode"
        class="md-tab"
        :class="{ 'md-tab--active': rule.activeMode === t.mode }"
        role="tab"
        :aria-selected="rule.activeMode === t.mode"
        @click="rule.setMode(t.mode)"
      >
        {{ t.label }}
      </button>
    </div>

    <div class="md-rulepanel__form">
      <!-- ── 删除模式 ── -->
      <template v-if="rule.rule.mode === 'delete'">
        <label class="md-rulepanel__label">待删字符串</label>
        <input
          class="md-input"
          placeholder="例如：【某某公众号】"
          :value="rule.rule.delete.text"
          @input="rule.patch({ delete: { text: ($event.target as HTMLInputElement).value } })"
        />
      </template>

      <!-- ── 替换模式 ── -->
      <template v-else-if="rule.rule.mode === 'replace'">
        <label class="md-rulepanel__label">查找</label>
        <input
          class="md-input"
          placeholder="例如：最终版"
          :value="rule.rule.replace.find"
          @input="rule.patch({ replace: { find: ($event.target as HTMLInputElement).value } })"
        />
        <label class="md-rulepanel__label">替换为</label>
        <input
          class="md-input"
          placeholder="留空 = 删除"
          :value="rule.rule.replace.to"
          @input="rule.patch({ replace: { to: ($event.target as HTMLInputElement).value } })"
        />
      </template>

      <!-- ── 规则化模式（五个要素可叠加）── -->
      <template v-else>
        <label class="md-rulepanel__label">前缀</label>
        <input
          class="md-input"
          placeholder="如 {d}-发票-"
          :value="rule.rule.rule.prefix"
          @input="rule.patchInner({ prefix: ($event.target as HTMLInputElement).value })"
        />
        <label class="md-rulepanel__label">后缀</label>
        <input
          class="md-input"
          placeholder="加在扩展名之前"
          :value="rule.rule.rule.suffix"
          @input="rule.patchInner({ suffix: ($event.target as HTMLInputElement).value })"
        />

        <p class="md-hint md-rulepanel__varhint">
          支持变量 <code>{n}</code> 序号、<code>{d}</code> 日期 —— 变量需先勾选下方对应开关
        </p>

        <div class="md-rulepanel__group">
          <label class="md-check">
            <input
              type="checkbox"
              :checked="rule.rule.rule.seqEnabled"
              @change="rule.patchInner({ seqEnabled: ($event.target as HTMLInputElement).checked })"
            />
            <span class="md-check__box"><MdIcon name="check" :size="11" /></span>
            <span class="md-check__label">启用序号</span>
          </label>

          <div class="md-rulepanel__nums">
            <label class="md-rulepanel__numitem">
              <span>起始</span>
              <input
                class="md-input md-input--num"
                type="number"
                min="0"
                :disabled="!rule.rule.rule.seqEnabled"
                :value="rule.rule.rule.seqStart"
                @input="setNumber('seqStart', ($event.target as HTMLInputElement).value)"
              />
            </label>
            <label class="md-rulepanel__numitem">
              <span>步长</span>
              <input
                class="md-input md-input--num"
                type="number"
                min="1"
                :disabled="!rule.rule.rule.seqEnabled"
                :value="rule.rule.rule.seqStep"
                @input="setNumber('seqStep', ($event.target as HTMLInputElement).value)"
              />
            </label>
            <label class="md-rulepanel__numitem">
              <span>补零</span>
              <input
                class="md-input md-input--num"
                type="number"
                min="0"
                max="6"
                :disabled="!rule.rule.rule.seqEnabled"
                :value="rule.rule.rule.seqPad"
                @input="setNumber('seqPad', ($event.target as HTMLInputElement).value)"
              />
            </label>
          </div>

          <label class="md-rulepanel__picker">
            <span>序号位置</span>
            <select
              class="md-select"
              :disabled="!rule.rule.rule.seqEnabled"
              :value="rule.rule.rule.seqPosition"
              @change="rule.patchInner({ seqPosition: ($event.target as HTMLSelectElement).value as SeqPosition })"
            >
              <option value="suffix">排在最后</option>
              <option value="prefix">排在最前</option>
            </select>
          </label>
        </div>

        <div class="md-rulepanel__group">
          <label class="md-check">
            <input
              type="checkbox"
              :checked="rule.rule.rule.dateEnabled"
              @change="rule.patchInner({ dateEnabled: ($event.target as HTMLInputElement).checked })"
            />
            <span class="md-check__box"><MdIcon name="check" :size="11" /></span>
            <span class="md-check__label">启用日期（取执行当天）</span>
          </label>

          <label class="md-rulepanel__picker">
            <span>日期格式</span>
            <select
              class="md-select"
              :disabled="!rule.rule.rule.dateEnabled"
              :value="rule.rule.rule.dateFormat"
              @change="rule.patchInner({ dateFormat: ($event.target as HTMLSelectElement).value as DateFormat })"
            >
              <option value="YYYY-MM-DD">2026-09-11</option>
              <option value="YYYYMMDD">20260911</option>
              <option value="YYYY年MM月DD日">2026年09月11日</option>
            </select>
          </label>
        </div>

        <label class="md-check md-rulepanel__span">
          <input
            type="checkbox"
            :checked="rule.rule.rule.keepOriginal"
            @change="rule.patchInner({ keepOriginal: ($event.target as HTMLInputElement).checked })"
          />
          <span class="md-check__box"><MdIcon name="check" :size="11" /></span>
          <span class="md-check__label">保留原文件名（取消则丢弃原主体）</span>
        </label>

        <p v-if="needsDateHint" class="md-hint md-rulepanel__warn">
          名称里用了 <code>{d}</code>，但「启用日期」没勾 —— 日期会展开成空
        </p>
        <p v-if="needsSeqHint" class="md-hint md-rulepanel__warn">
          名称里用了 <code>{n}</code>，但「启用序号」没勾 —— 序号会展开成空
        </p>
      </template>

      <!-- EL-044 区分大小写：规则化模式下不出现（该模式不涉及匹配）-->
      <label v-if="!isRuleMode" class="md-check md-rulepanel__span">
        <input
          type="checkbox"
          :checked="rule.rule.caseSensitive"
          @change="rule.patch({ caseSensitive: ($event.target as HTMLInputElement).checked })"
        />
        <span class="md-check__box"><MdIcon name="check" :size="11" /></span>
        <span class="md-check__label">区分大小写</span>
      </label>
    </div>

    <!-- EL-055 自动处理重名冲突（DEC-05：默认未勾选）-->
    <footer class="md-rulepanel__foot">
      <label class="md-switch">
        <input
          type="checkbox"
          :checked="rule.rule.autoResolveConflict"
          @change="rule.patch({ autoResolveConflict: ($event.target as HTMLInputElement).checked })"
        />
        <span class="md-switch__track"><span class="md-switch__thumb" /></span>
        <span class="md-switch__label">自动处理重名冲突</span>
      </label>
      <p class="md-hint">
        关闭时冲突项会被跳过。无论开关如何，都「不会覆盖」任何已有文件。当前规则：{{ rule.summary }}
      </p>
    </footer>
  </section>
</template>

<style scoped>
.md-rulepanel {
  background: var(--md-bg-card);
  border-radius: var(--md-radius-card);
  box-shadow: var(--md-shadow-card);
  padding: var(--md-space-3);
  display: flex;
  flex-direction: column;
  gap: var(--md-space-3);
  /* ★ 按内容完整展开，**自己不做滚动**（滚动交给外层 .md-main__right-body 整块滚）。
     规则化模式内容再长也只是把整块工作区撑高，不去压缩列表、也不出现嵌套滚动条。 */
  flex: 0 0 auto;
}

.md-rulepanel__form {
  display: grid;
  grid-template-columns: 68px minmax(0, 1fr);
  align-items: center;
  gap: var(--md-space-2);
}

.md-rulepanel__label {
  font-size: 12.5px;
  font-weight: 500;
  color: var(--md-ink-2);
}

.md-rulepanel__span {
  grid-column: 1 / -1;
}

.md-rulepanel__varhint,
.md-rulepanel__warn {
  grid-column: 1 / -1;
  margin: 0;
}

.md-rulepanel__warn {
  color: var(--md-warn);
}

.md-rulepanel__group {
  grid-column: 1 / -1;
  display: flex;
  flex-direction: column;
  gap: var(--md-space-2);
  padding: var(--md-space-2);
  border-radius: var(--md-radius-input);
  background: var(--md-bg-warm);
}

.md-rulepanel__nums {
  display: flex;
  gap: var(--md-space-3);
  flex-wrap: wrap;
}

.md-rulepanel__numitem,
.md-rulepanel__picker {
  display: flex;
  align-items: center;
  gap: var(--md-space-2);
  font-size: 12.5px;
  color: var(--md-ink-2);
}

.md-rulepanel__foot {
  border-top: 1px solid var(--md-line);
  padding-top: var(--md-space-3);
  display: flex;
  flex-direction: column;
  gap: var(--md-space-1);
}

code {
  font-family: var(--md-font-num);
  background: var(--md-bg-sunken);
  border-radius: 4px;
  padding: 0 4px;
}
</style>
