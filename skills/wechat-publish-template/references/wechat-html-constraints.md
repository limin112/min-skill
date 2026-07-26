# 公众号 HTML 限制速查

微信公众号编辑器（mp.weixin.qq.com）会对粘贴进来的 HTML 做严格过滤。下面这些约束是写本模板时必须遵守的：

## ✅ 可用

- 全部基础 HTML 标签：`<section>`、`<p>`、`<span>`、`<div>`、`<h1-6>`、`<a>`、`<img>`、`<table>`、`<ul>`、`<ol>`、`<li>`、`<blockquote>`、`<strong>`、`<em>`、`<code>`、`<pre>`、`<br>`、`<hr>`
- **inline `style` 属性**——这是公众号唯一稳定支持的样式方式
- 颜色：`color` / `background` / `background-color`（含 hex、rgb、rgba）
- 字号字重：`font-size` / `font-weight` / `font-family`（仅 PingFang、Helvetica、sans-serif、monospace 等系统字体）
- 盒模型：`padding` / `margin` / `border` / `border-radius` / `box-sizing`
- 布局：`display: inline-block` / `block` / `flex`（新版编辑器支持 flex）
- 文本：`line-height` / `letter-spacing` / `text-align` / `text-decoration`
- 渐变：`background: linear-gradient(...)`
- 表格：`<table>` + `<tr>` + `<td>`，老牌做法，跨设备最稳
- 图片：`<img src="https://...">`，必须是公众号"素材库"上传或微信认可的图床（外链常被替换）

## ❌ 不可用 / 会被过滤

- `<style>` 块里的任何 class 选择器
- 任何 `class` 属性（保留也会被剥）
- `::before` / `::after` 伪元素
- `position: fixed` / `absolute`（部分会被剥）
- `transform` / `animation` / `transition`
- `<script>` / 任何 JS
- 外部 CSS / 外部字体（`@font-face`、`@import`）
- 表单元素 `<input>` / `<form>` / `<button>`（功能上）
- SVG 的高级特性（`<filter>`、`<mask>`、`<animate>`）——基础 path/rect/text 可以但不稳定
- `data-*` 自定义属性（除了 `data-src` 用于图片）
- `<iframe>` / `<video>` / `<audio>`（要用，必须通过公众号编辑器自带组件插入）

## ⚠️ 注意事项

1. **手机优先**——70%+ 读者在 iPhone/Android 上看，宽度按 375-414px 测
2. **不要写 `width: 100vw`**——用 `width: 100%` 或固定 px
3. **图片要先传公众号**——本地路径或随便的图床发不出去；先在公众号编辑器里"上传图片"拿到 mp 域名 URL，再替换
4. **复制粘贴流程**——在浏览器里打开 HTML 文件 → 全选复制 → 粘贴进公众号编辑器（不要直接贴 HTML 源码，要贴"渲染后的"页面）
5. **链接白名单**——外链跳转会被剥，只保留文字。要做点击跳转得用公众号"原文链接"或文章互链
6. **emoji 可以用**——但 unicode 装饰字符（▶ ● ★ 等）跨设备渲染不一致，最好嵌在 background-color 块里当背景而不是直接当文字

## 推荐工作流

```
MD 草稿 → skill 转 HTML → 浏览器预览 → 全选复制 → 公众号编辑器粘贴 → 上传图片替换 → 预览 → 发
```
