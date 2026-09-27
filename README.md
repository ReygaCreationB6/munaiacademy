# MUN AI Academy

An AI-powered Model United Nations learning and training platform.
Built with vanilla ES modules — no build step required.

## Quick start

```bash
npm install
cp .env.example .env
# edit .env with your AI key (and optional Supabase credentials)
npm run dev
```

Visit `http://localhost:3000`.

## AI providers

The **AI Settings** page lets each user pick:

| Provider | Notes |
|---|---|
| **Built-in AI** (default) | Server-side proxy. Model + key from `.env`. Recommended. |
| **Bring Your Own API Key** | OpenAI, OpenRouter, Groq, Mistral, Ollama, LM Studio, any OpenAI-compatible endpoint. Key stored in browser. |
| **Demo mode** | Simulated responses. No API. Perfect offline. |

## Accounts & cloud sync (optional)

The app is **local-first** by default — everything is stored in the browser's
localStorage. Sign-in is entirely optional.

To enable accounts and cross-device sync:

1. Create a free project at https://supabase.com
2. Open **SQL Editor** → paste `supabase/schema.sql` → **Run**
3. Open **Settings → API**, copy the **Project URL** and **anon public key**
4. Add them to `.env`:
   ```
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_ANON_KEY=eyJ...
   ```
5. Restart the server.

Sign-in flow:
- Local data stays on the device until the user signs in
- On first sign-in, users are asked whether to upload local data or restore from cloud
- On subsequent sign-ins, cloud wins automatically
- Signing out keeps the local copy intact

### Email confirmation

By default Supabase requires email confirmation. For quicker testing,
go to **Authentication → Providers → Email** and turn **Confirm email** off.
Turn it back on before production.

## Project structure

```
src/
├── ai/            AI abstraction (providers, prompts, manager)
├── analytics/     Skill tracking, heatmap, recommender
├── core/          Store, router, auth, sync, backup, UI helpers
├── data/          Lessons, demo data
├── pages/         Route views
├── simulation/    Engine, delegates, crisis system
└── styles/        CSS design system
supabase/
└── schema.sql     One-shot SQL setup for user accounts
```

## Security

- **Never** commit `.env`.
- The Supabase **anon** key is safe to expose — it's protected by RLS.
- The Supabase **service_role** key must never leave the server. Don't put it in `.env` unless you know exactly why.
- Browser-stored AI keys (BYO mode) are not encrypted — warn your users.

## Feature checklist

| Phase | Feature | Status |
|---|---|---|
| 1–5 | Foundation, AI layer, Coach, Learn, Speech | ✅ |
| 6 | Position Paper + Resolution Builder with exports | ✅ |
| 7 | Full stateful Conference Simulation | ✅ |
| 8 | Crisis mode with 3 scenarios | ✅ |
| 9 | Analytics, heatmap, recommender | ✅ |
| 10 | PWA, offline, a11y, keyboard, deploy | ✅ |
| 11 | Supabase accounts + cloud sync (optional) | ✅ |