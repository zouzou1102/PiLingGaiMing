/**
 * 音效（交互说明 §11.3）。
 *
 * 为什么用 Web Audio 合成而不是播放音频文件：
 * `resources/sounds/` 在技术方案里规划了，但**切图资源里并没有音频文件**。
 * 与其塞两个来路不明的音频素材，不如用振荡器合成两个短音 ——
 * 零素材、零网络请求（合成不涉及任何网络）、体积为 0，而且音色可控。
 * 将来若要换成真实音效，把这两个函数改成播放 `resources/sounds/*.wav` 即可，
 * **调用方一行不用动**。
 *
 * 提醒：音效只能是「锦上添花」。任何情况下它都不该影响改名流程 ——
 * 所以这里所有异常都被吞掉。
 */

let ctx: AudioContext | null = null

function audio(): AudioContext | null {
  try {
    if (!ctx) ctx = new AudioContext()
    if (ctx.state === 'suspended') void ctx.resume()
    return ctx
  } catch {
    return null
  }
}

function tone(freq: number, startAt: number, durationMs: number, type: OscillatorType, gain: number): void {
  const ac = audio()
  if (!ac) return
  const osc = ac.createOscillator()
  const vol = ac.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, ac.currentTime + startAt)
  // 指数衰减，避免「咔」的爆音
  vol.gain.setValueAtTime(gain, ac.currentTime + startAt)
  vol.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + startAt + durationMs / 1000)
  osc.connect(vol).connect(ac.destination)
  osc.start(ac.currentTime + startAt)
  osc.stop(ac.currentTime + startAt + durationMs / 1000 + 0.02)
}

/** 全部成功：轻快「叮」（两个音的小上行）*/
export function playSuccess(enabled: boolean): void {
  if (!enabled) return
  try {
    tone(880, 0, 180, 'sine', 0.06)
    tone(1320, 0.08, 220, 'sine', 0.045)
  } catch {
    /* 音效失败不影响任何流程 */
  }
}

/** 有失败 / 跳过：短促「噗」*/
export function playFailure(enabled: boolean): void {
  if (!enabled) return
  try {
    tone(220, 0, 160, 'triangle', 0.05)
  } catch {
    /* 同上 */
  }
}
