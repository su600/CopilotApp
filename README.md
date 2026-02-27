# Copilot Playground

[中文文档](README_CN.md)

A Progressive Web App (PWA) for testing and comparing GitHub Copilot models via the GitHub Copilot API.

## Features

- 🔐 **GitHub Authentication** — Device Flow OAuth or Personal Access Token
- 🤖 **Model Explorer** — Lists all Copilot models with tier (Premium/Standard), context window, and monthly request quota
- 💬 **Chat Interface** — Streaming chat with any Copilot model, conversation history, system prompt presets, adjustable temperature/max tokens
- 🔄 **Model Comparison** — Send the same prompt to two models simultaneously
- 📊 **Usage Dashboard** — Real-time quota tracking: remaining premium requests, overage cost, and next monthly reset date
- ⚙️ **Settings** — Manage OAuth Client ID, refresh Copilot token, and clear local conversation history
- 📱 **PWA** — Installable, works offline (once cached)

## Getting Started

### 1. Prerequisites

- A GitHub account with an active **GitHub Copilot Pro** (or higher) subscription
- Node.js 18+ and npm

### 2. Install & Run

```bash
npm install
npm run dev
```

Then open http://localhost:5173 in your browser.

### 3. Authentication

#### Option A: Personal Access Token (Recommended — simplest)

1. Go to https://github.com/settings/tokens/new?scopes=read:user&description=CopilotApp
2. Generate a token with `read:user` scope
3. Paste it in the app's "Use Personal Access Token" form

#### Option B: GitHub Device Flow OAuth

1. [Create a GitHub OAuth App](https://github.com/settings/applications/new):
   - **Application name**: `Copilot Playground` (or any name you like)
   - **Homepage URL**: `http://localhost:5173` (or your deployed app URL)
   - **Application description**: *(optional)* e.g. `GitHub Copilot Playground`
   - **Authorization callback URL**: `http://localhost:5173` (Device Flow does not use a callback, but GitHub requires a value — any valid URL works)
   - Check **"Enable Device Flow"**
   - Click **Register application** and note your **Client ID**
2. Enter the Client ID in the app and click **Get Device Code**
3. Visit `github.com/login/device` and enter the shown code

> **Note:** The Copilot API (`api.githubcopilot.com`) may have CORS restrictions when called directly from a browser. If you encounter CORS errors, you can deploy the app on a local server or use a browser extension to relax CORS for development.

### 4. Run with Docker

```bash
docker build -t copilot-app .
docker run -p 8080:80 copilot-app
```

Then open http://localhost:8080 in your browser.

> **Note:** No environment variables are required — all API calls and authentication are handled entirely in the browser.

### 5. Build for Production

```bash
npm run build
npm run preview
```

The `dist/` folder is a fully static PWA that can be deployed anywhere (Vercel, GitHub Pages, Netlify, etc.).

## Model Tiers

| Tier | Description |
|------|-------------|
| **Premium** | Consumes monthly request quota (Copilot Pro: 300 req/month) |
| **Standard** | Unlimited requests for active subscribers |

See [GitHub Copilot subscription plans](https://docs.github.com/en/copilot/about-github-copilot/subscription-plans-for-github-copilot) for full details.

## Usage Dashboard

Click the **quota button** in the top-right navigation bar to open the Usage Dashboard. The button icon indicates your current quota state:

| Icon | Meaning |
|------|---------|
| 📊 额度 | Default / quota info loading |
| 💰️ 额度 | Overage detected — you are being billed |
| ✦ 无限制 | Unlimited quota (e.g. Copilot Business/Enterprise) |

The dashboard shows:

- Your Copilot plan
- Monthly premium request quota, usage, and remaining count
- Overage requests and estimated cost (if any)
- Next quota reset date

### Billing Details (optional)

For a detailed per-model breakdown of your monthly usage, you can provide a **Fine-Grained Personal Access Token** with the **copilot** account permission set to **read-only**. The token is stored locally in your browser and never sent to any third-party server.

Once entered, the dashboard also shows:

- Total, included (free), billed request counts
- Total billed amount in USD
- Top 5 models by request volume

## Tech Stack

- [Vite](https://vitejs.dev/) + [React 19](https://react.dev/)
- [vite-plugin-pwa](https://vite-pwa-org.netlify.app/) / Workbox for service worker & offline support
- No backend required — all API calls are made directly from the browser
