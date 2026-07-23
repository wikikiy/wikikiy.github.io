# 袋书 📖

袋书是一款免费的在线电子书阅读器，支持 EPUB、TXT 等主流电子书格式。提供舒适的阅读体验，支持深色模式、听书功能，无需下载即可在线阅读。

## 功能特点

- 📚 支持 EPUB、TXT 格式电子书
- 📑 左侧目录导航，右侧内容阅读
- ⬅️➡️ 键盘左右方向键翻页
- 🌓 浅色/深色模式切换
- 🎧 听书功能（TTS），支持暂停/播放
- 📱 完美适配 H5 移动端
- 🔄 响应式设计，适配浏览器缩放
- 🧹 一键清除电子书
- 🔒 文件仅在本机浏览器中处理

## 部署到 GitHub Pages

1. Fork 此仓库
2. 进入仓库 Settings > Pages
3. 选择 **Deploy from a branch**
4. 选择 `main` 分支，根目录为 `/daishu`
5. 点击 Save

或者使用 GitHub Actions 自动部署。

## 重要配置

### Google Analytics

在 `index.html` 中找到以下代码，将 `G-XXXXXXXXXX` 替换为你的 Google Analytics ID：

```html
<script async src="https://www.googletagmanager.com/gtag/js?id=G-XXXXXXXXXX"></script>
<script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', 'G-XXXXXXXXXX');
</script>
```

### 站点 URL

在 `_config.yml` 中设置 `url` 为你的 GitHub Pages 地址：

```yaml
url: "https://yourusername.github.io"
```

## 本地开发

```bash
# 安装 Jekyll
gem install jekyll bundler

# 启动本地服务器
cd daishu
jekyll serve

# 访问 http://localhost:4000
```

## 技术栈

- 纯前端 HTML/CSS/JavaScript
- JSZip 解析 EPUB
- Web Speech API 语音合成
- Jekyll 静态站点生成
- 无后端依赖

## 许可证

MIT