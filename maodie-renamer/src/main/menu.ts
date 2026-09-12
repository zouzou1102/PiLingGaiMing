/**
 * 应用菜单（交互说明 §9）。
 *
 * 本项目窗口是 `frame: false`，看不见菜单栏，但**菜单里的加速键依然生效** ——
 * 所以它在这里的作用是：给文本编辑（剪切 / 复制 / 粘贴 / 全选）提供可靠的
 * 加速键，并提供缩放入口（无障碍：200% 文字缩放下不溢出）。
 *
 * 为什么 Ctrl+O / Ctrl+Z / Delete / Esc / Enter 不在这里注册：
 * 它们的行为分别是「打开系统文件框」「切到历史页」「删除列表行」「关闭弹窗」
 * 「触发主操作」——全部是渲染层的动作。要在主进程注册就得新增事件通道，
 * 而事件通道在接口文档里是固定的 3 个。因此这些按键由渲染层的
 * `useKeyboard` 统一处理（见 renderer/src/composables/useKeyboard.ts）。
 *
 * 特别注意：菜单里**不能**放「撤销（undo）」角色 —— Ctrl+Z 在本产品里的语义是
 * 「进入撤销页」，不是「撤销上次输入」。两者冲突时必须让位给产品语义。
 */

import { Menu, app, type MenuItemConstructorOptions } from 'electron'

export function buildAppMenu(): void {
  const isDev = !app.isPackaged

  const template: MenuItemConstructorOptions[] = [
    {
      label: '编辑',
      submenu: [
        { role: 'cut', label: '剪切' },
        { role: 'copy', label: '复制' },
        { role: 'paste', label: '粘贴' },
        { type: 'separator' },
        { role: 'selectAll', label: '全选' },
      ],
    },
    {
      label: '视图',
      submenu: [
        { role: 'resetZoom', label: '实际大小' },
        { role: 'zoomIn', label: '放大' },
        { role: 'zoomOut', label: '缩小' },
        ...(isDev
          ? ([
              { type: 'separator' },
              { role: 'reload', label: '重新载入' },
              { role: 'toggleDevTools', label: '开发者工具' },
            ] as MenuItemConstructorOptions[])
          : []),
      ],
    },
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
