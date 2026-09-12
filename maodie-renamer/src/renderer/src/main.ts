/**
 * 渲染层入口。
 *
 * 样式导入顺序有讲究：tokens（变量）→ base（组件与布局）→ animations（动效）。
 * animations 最后，它的关键帧不会被 base 的选择器覆盖。
 */

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'

import './styles/tokens.css'
import './styles/base.css'
import './styles/animations.css'

createApp(App).use(createPinia()).mount('#app')
