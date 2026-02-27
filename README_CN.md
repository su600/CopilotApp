# Copilot Playground

一个渐进式 Web 应用（PWA），用于通过 GitHub Copilot API 测试和比较 GitHub Copilot 模型。

## 功能特性

- 🔐 **GitHub 身份验证** — 设备流 OAuth 或个人访问令牌
- 🤖 **模型浏览器** — 列出所有 Copilot 模型，包含级别（高级/标准）、上下文窗口大小和每月请求配额
- 💬 **聊天界面** — 与任意 Copilot 模型进行流式聊天，支持对话历史、系统提示预设，以及可调节的温度/最大 Token 数
- 🔄 **模型对比** — 同时将同一提示发送给两个模型
- 📊 **用量看板** — 实时配额跟踪：高级请求剩余次数、超额费用及下次月度重置日期
- ⚙️ **设置** — 管理 OAuth Client ID、刷新 Copilot 令牌，以及清除本地对话历史
- 📱 **PWA** — 可安装，支持离线使用（缓存后）

## 快速开始

### 1. 前置要求

- 拥有有效 **GitHub Copilot Pro**（或更高版本）订阅的 GitHub 账户
- Node.js 18+ 及 npm

### 2. 安装与运行

```bash
npm install
npm run dev
```

然后在浏览器中打开 http://localhost:5173。

### 3. 身份验证

#### 方式 A：个人访问令牌（推荐 — 最简单）

1. 前往 https://github.com/settings/tokens/new?scopes=read:user&description=CopilotApp
2. 生成一个具有 `read:user` 权限的令牌
3. 将令牌粘贴到应用的"使用个人访问令牌"表单中

#### 方式 B：GitHub 设备流 OAuth

1. [创建一个 GitHub OAuth 应用](https://github.com/settings/applications/new)：
   - **应用名称**：`Copilot Playground`（或任意名称）
   - **主页 URL**：`http://localhost:5173`（或你的部署地址）
   - **应用描述**：*(可选)* 例如 `GitHub Copilot Playground`
   - **授权回调 URL**：`http://localhost:5173`（设备流不使用回调，但 GitHub 要求填写一个有效 URL）
   - 勾选 **"启用设备流"**
   - 点击 **注册应用** 并记录你的 **Client ID**
2. 在应用中输入 Client ID，然后点击 **获取设备码**
3. 访问 `github.com/login/device` 并输入显示的代码

> **注意：** 直接从浏览器调用 Copilot API（`api.githubcopilot.com`）可能存在 CORS 限制。如果遇到 CORS 错误，可以在本地服务器上部署应用，或使用浏览器扩展在开发时放宽 CORS 限制。

### 4. 使用 Docker 运行

```bash
docker build -t copilot-app .
docker run -p 8080:80 copilot-app
```

然后在浏览器中打开 http://localhost:8080。

> **注意：** 无需配置任何环境变量 — 所有 API 调用和身份验证均在浏览器端完成。

### 5. 生产构建

```bash
npm run build
npm run preview
```

`dist/` 文件夹是一个完全静态的 PWA，可部署到任意平台（Vercel、GitHub Pages、Netlify 等）。

## 模型级别

| 级别 | 说明 |
|------|------|
| **高级** | 消耗每月请求配额（Copilot Pro：每月 300 次） |
| **标准** | 活跃订阅者可无限次请求 |

完整详情请参阅 [GitHub Copilot 订阅计划](https://docs.github.com/zh/copilot/about-github-copilot/subscription-plans-for-github-copilot)。

## 用量看板

点击导航栏右上角的 **额度按钮** 即可打开用量看板。按钮图标表示当前配额状态：

| 图标 | 含义 |
|------|------|
| 📊 额度 | 默认 / 配额信息加载中 |
| 💰️ 额度 | 检测到超额费用 — 正在计费 |
| ✦ 无限制 | 无限制配额（如 Copilot Business/Enterprise） |

看板展示以下信息：

- Copilot 订阅计划
- 高级请求月度配额、已使用量及剩余次数
- 超额请求次数及预计费用（如有）
- 下次配额重置日期

### 账单详情（可选）

如需查看本月按模型分类的详细用量，可提供 **copilot** 账户权限设为 **只读** 的 **细粒度个人访问令牌**。令牌仅存储在本地浏览器中，仅用于通过同源 `/github-api/...` 代理向 GitHub 发起请求，不会发送到除 GitHub 以外的任何第三方服务器。请不要在不受信任的线上部署中输入令牌。

输入令牌后，看板还将显示：

- 总用量、免费额度已用量、计费请求数
- 本月计费金额（USD）
- 按请求量排名前 5 的模型

## 技术栈

- [Vite](https://vitejs.dev/) + [React 19](https://react.dev/)
- [vite-plugin-pwa](https://vite-pwa-org.netlify.app/) / Workbox 提供 Service Worker 与离线支持
- 无需后端 — 所有 API 调用均直接在浏览器中发起
