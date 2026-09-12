/**
 * 耄耋形象资源（resources/cats）。
 *
 * **「一键替换形象」的实现方式（PRD 要求的那个能力）**：
 *   换形象 = 把 `resources/cats/` 下的 SVG 换掉 + 改 `manifest.json` 里的文件名，
 *   **代码一行不用动** —— 状态机、文案、停留时长全部由 manifest 驱动。
 *
 * 为什么用构建期 `import.meta.glob` 内联，而不是运行时按路径读文件：
 *   · 运行时读文件需要自注册协议或新增 IPC 通道；后者会打破「window.maodie
 *     只有 5 个命名空间」的白名单（P-06），前者要放宽 CSP 的 img-src。
 *   · 构建期内联的代价是「换形象后要重新构建」，对打包发布的软件本来也要重打包。
 *   若将来确实需要「免构建替换」，加一个只读自注册协议即可 —— 上面两条都不难，
 *   但首版不做（YAGNI）。
 */

import rawManifest from '../../../../resources/cats/manifest.json'

/** manifest.json 的形状（技术方案 §4.5）*/
export interface CatManifest {
  version: number
  states: Record<string, { file: string; holdMs: number }>
  text: Record<string, string>
}

export const CAT_MANIFEST = rawManifest as CatManifest

export type CatState = 'ST-01' | 'ST-02' | 'ST-03' | 'ST-04' | 'ST-05'

export const CAT_STATES: CatState[] = ['ST-01', 'ST-02', 'ST-03', 'ST-04', 'ST-05']

/** 构建期把 resources/cats 下的 SVG 全部内联为字符串 */
const modules = import.meta.glob('../../../../resources/cats/*.svg', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

/** 文件名 → SVG 文本 */
const byFile = new Map<string, string>()
for (const [path, text] of Object.entries(modules)) {
  byFile.set(path.split('/').pop() ?? path, text)
}

/** 取某个状态的 SVG 文本。找不到时返回空串（界面会退化成只有文案，不会崩）*/
export function catSvg(state: CatState): string {
  const file = CAT_MANIFEST.states[state]?.file
  return (file && byFile.get(file)) || ''
}

/** 取某个状态的文案模板，`{n}` / `{m}` 由调用方替换 */
export function catText(state: CatState): string {
  return CAT_MANIFEST.text[state] ?? ''
}

/** 取某个状态的停留时长（ms）；0 表示不自回落 */
export function catHoldMs(state: CatState): number {
  return CAT_MANIFEST.states[state]?.holdMs ?? 0
}
