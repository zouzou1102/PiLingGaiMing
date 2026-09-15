/**
 * 命令行模式的 Electron 胶水（P2-C · F-15）。
 *
 * 为什么单独一个文件：`cli/run.ts` **刻意不 import electron**（这样 `node --test`
 * 能直接跑命令行逻辑），所以所有需要 Electron 的东西都收在这里。
 */
import { app } from 'electron'
import { CLI_USAGE, isCliInvocation } from '@shared/cli-args'
import { runCli } from './run'

/**
 * 从 `process.argv` 里取出「属于我们的」那一段。
 *
 * 打包后：`argv = [maodie.exe, ...用户参数]` → 切 1 个
 * 开发态：`argv = [electron.exe, '.', ...用户参数]` → 切 2 个
 */
export function cliArgsFrom(argv: string[]): string[] {
  return argv.slice(app.isPackaged ? 1 : 2)
}

export { isCliInvocation }

/**
 * 以命令行模式运行，跑完 `app.exit(退出码)`。
 *
 * ★ 与界面**互斥**（GAP：设计文档完全没提这条）：
 *   如果「耄耋改名」界面正开着，它已经持有单实例锁；此时再跑命令行，
 *   `requestSingleInstanceLock()` 返回 false —— 直接退出并**说明原因**。
 *   绝不并发执行：两个进程各有一份 history.json 的内存镜像，后写的会把先写的
 *   **整体覆盖**掉（写入队列是进程内的），用户的撤销记录会凭空少掉一批。
 *   宁可让用户先关窗口，也不冒这个险 —— 与「绝不毁数据」一致。
 */
export async function runCliAsMain(argv: string[]): Promise<void> {
  // ★ `--help` 必须排在单实例检查**之前**：用法说明任何时候都该看得到，
  //   不该因为「界面正开着」而看不到（实测踩到过：--help 也被锁挡成退出码 2）。
  if (argv.includes('--help')) {
    process.stdout.write(CLI_USAGE + '\n')
    app.exit(0)
    return
  }

  if (!app.requestSingleInstanceLock()) {
    process.stderr.write(
      '检测到「耄耋改名」正在运行。请先关闭窗口，再使用命令行模式。\n' +
        '（同时运行会互相覆盖历史记录，所以这里直接退出了）\n',
    )
    app.exit(2)
    return
  }

  await app.whenReady()

  const code = await runCli(argv, {
    out: (s) => process.stdout.write(s + '\n'),
    err: (s) => process.stderr.write(s + '\n'),
    // app.setPath('userData', …) 已在 main/index.ts 顶部执行过，
    // 所以这里拿到的是与界面版**完全同一个**目录 —— 命令行改完能在界面里撤销
    userDataDir: app.getPath('userData'),
  })
  app.exit(code)
}
