# Copilot Playground

A Progressive Web App (PWA) for testing and comparing GitHub Copilot Pro models via the GitHub Copilot API.

## Features

- 🔐 **GitHub Authentication** — Device Flow OAuth or Personal Access Token
- 🤖 **Model Explorer** — Lists all Copilot models with tier (Premium/Standard), context window, and monthly request quota
- 💬 **Chat Interface** — Streaming chat with any Copilot model, conversation history, system prompt presets, adjustable temperature/max tokens
- 🔄 **Model Comparison** — Send the same prompt to two models simultaneously
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

1. [Create a GitHub OAuth App](https://github.com/settings/developers):
   - Application type: **OAuth App**
   - No callback URL needed for device flow
   - Note your **Client ID**
2. Enter the Client ID in the app and click **Get Device Code**
3. Visit `github.com/login/device` and enter the shown code

> **Note:** The Copilot API (`api.githubcopilot.com`) may have CORS restrictions when called directly from a browser. If you encounter CORS errors, you can deploy the app on a local server or use a browser extension to relax CORS for development.

### 4. Build for Production

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

## Tech Stack

- [Vite](https://vitejs.dev/) + [React 19](https://react.dev/)
- [vite-plugin-pwa](https://vite-pwa-org.netlify.app/) / Workbox for service worker & offline support
- No backend required — all API calls are made directly from the browser
