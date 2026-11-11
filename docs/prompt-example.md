# 前端页面元素批注

我在浏览器里对页面元素做了可视化批注。请先根据下面的定位信息在代码中找到对应元素，再按批注调整 UI。

## 页面信息
- 地址：http://127.0.0.1:63229/index.html
- 标题：Nimbus 控制台 · ElementNote 演示
- 视口：1248 × 804（devicePixelRatio 1），滚动位置 (0, 0)
- 批注数量：2
- 生成时间：2026-11-10 16:07:46
- 环境：本地开发页面（localhost / 内网地址）

## 批注详情

### 批注 1
**批注内容**：主按钮字号偏大，和右侧图标基线不齐，改成 14px 并与图标垂直居中

- 元素：`<button class="cta" id="primary-cta" data-testid="hero-cta">开始使用 <span class="arrow">→</span></button>`
- CSS 选择器：`#primary-cta`
- XPath：`//*[@id="primary-cta"]`
- 位置：文档坐标 (280, 232)，尺寸 124 × 44 px；选中时视口坐标 (280, 232)
- 文本：“开始使用 →”
- 父级路径：`body > div.shell > main.main > section.hero > div.hero-actions`
- 同级元素：父级下共 2 个元素，自身第 1 个；相邻：`button#hero-doc.hero-link "查看走查规范"`
- 关键属性：`data-testid="hero-cta"`
- 计算样式：`display: flex; position: static; flex-direction: row; justify-content: normal; align-items: center; gap: 7px; grid-template-columns: none; width: 123.953px; height: 44.3438px; margin: 0px; padding: 9px 18px; font-family: -apple-system; font-size: 17px; font-weight: 700; line-height: 26.35px; letter-spacing: normal; color: rgb(55, 48, 163); background-color: rgb(255, 255, 255); border: 0px none rgb(55, 48, 163); border-radius: 9px; box-shadow: rgba(15, 23, 42, 0.18) 0px 8px 20px 0px; overflow: visible`

### 批注 2
**批注内容**：这个按钮的组件层级需要确认

- 元素：`<button id="component-demo" type="button">用这个按钮试一下</button>`
- CSS 选择器：`#component-demo`
- XPath：`//*[@id="component-demo"]`
- 位置：文档坐标 (865, 729)，尺寸 110 × 29 px；选中时视口坐标 (865, 729)
- 文本：“用这个按钮试一下”
- 父级路径：`div.shell > main.main > section.grid-2 > div.card > div.component-demo`
- 同级元素：父级下共 2 个元素，自身第 2 个；相邻：`br`
- 关键属性：`type="button"`
- 计算样式：`display: inline-block; position: static; flex-direction: row; justify-content: normal; align-items: normal; gap: normal; grid-template-columns: none; width: 110px; height: 29.0469px; margin: 6px 0px 0px; padding: 5px 10px; font-family: -apple-system; font-size: 11px; font-weight: 600; line-height: 17.05px; letter-spacing: normal; color: rgb(67, 56, 202); background-color: rgb(255, 255, 255); border: 1px solid rgb(199, 210, 254); border-radius: 7px; overflow: visible`
- 组件栈：React `CardActions > DashboardPage`，源码 `src/pages/Dashboard.tsx:42:7`

## 任务要求
1. 先用 CSS 选择器 / XPath / 父级路径定位元素，再用组件栈确认组件与源码文件；不要只凭描述猜位置。
2. 对每条批注分别给出：问题判断、要修改的文件、关键代码改动（样式或结构）；保持页面现有设计语言，不做无关重构。
3. 涉及视觉细节（间距、颜色、字号、圆角等）时，结合「计算样式」给出具体数值，并说明修改前后的差异。
4. 这是本地开发页面：请在当前项目内按页面路由、组件名、选择器特征检索源码，不要臆造文件路径。
5. 如果信息不足（缺少截图、设计稿、设计 token 或更多上下文），先列出需要我补充的内容，再给出方案。
