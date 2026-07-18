# SimplerDev Chat (mobile)

Native iOS/Android client for the SimplerDevelopment portal — conversations, AI assistant, group chats, the Company Brain (notes / decisions / glossary / people), shared media, approvals inbox, and settings.

Visual + UX language is established by the five hi-fi mockups on `~/Desktop/`:

- `sd-chat-mockup.html` — conversations, AI chat, group chats, Brain browser, media library
- `sd-chat-settings-mockup.html` — **canonical design tokens** live here (the `T` object) and the iOS-style settings table
- `sd-chat-onboarding-mockup.html` — welcome, pick workspace, meet assistant, AI permissions, notifications opt-in, first chat
- `sd-chat-brain-mockup.html` — note, decision, person, glossary, search, AI suggestions
- `sd-chat-composer-mockup.html` — slash menu, mentions, attach, voice mode, artifact, message actions
- `sd-chat-approvals-mockup.html` — inbox, detail, bulk, history, audit export, lock-screen push

## Stack

- **Expo SDK 56** (managed) + **expo-router** file-based navigation
- **TypeScript 6** strict
- **NativeWind v4** + Tailwind 3.4 (utility classes on RN primitives)
- **Zustand** (client state) + **Tanstack Query v5** (server state)
- **expo-linear-gradient** + **react-native-svg** for the AI accent everywhere
- **expo-secure-store** for the auth token
- **@expo/vector-icons** (MaterialIcons) wrapped in our `<MIcon>` atom
- **Bun** as the package manager

## Project structure

```
sd-chat-mobile/
├── app/                          # expo-router screens
│   ├── _layout.tsx               # root: QueryClient, status bar, hydrate auth
│   ├── index.tsx                 # redirect to (tabs) (auth flow lands in Phase 2 D)
│   ├── (tabs)/                   # bottom tabs: Chats / Brain / Media / You
│   │   ├── _layout.tsx
│   │   ├── index.tsx             # CHATS — fleshed out, renders mock conversations
│   │   ├── brain.tsx             # placeholder
│   │   ├── media.tsx             # placeholder
│   │   └── you.tsx               # placeholder
│   ├── (auth)/                   # onboarding stack (placeholders)
│   ├── chat/[id].tsx             # chat detail (placeholder)
│   ├── brain/{note,decision,person,glossary}/[id].tsx
│   └── approvals/{index,[id]}.tsx
├── components/
│   ├── atoms/                    # MIcon, Avatar, AiAvatar, Toggle, Radio, IconTile, Chip, Bubble
│   └── ui/                       # LargeTitle, Card, Screen, Placeholder
├── lib/
│   ├── theme.ts                  # T tokens (verbatim from mockup) + Gradients + helpers
│   ├── api/                      # client / auth / query-client
│   └── mock/                     # conversations / messages / brain / media / workspaces / currentUser
├── tailwind.config.js
├── metro.config.js               # NativeWind metro integration
├── babel.config.js               # NativeWind babel preset
├── global.css                    # @tailwind base/components/utilities
└── nativewind-env.d.ts
```

## Run

```bash
bun install
bunx expo start
# then press `i` for iOS simulator, `a` for Android, `w` for web
```

> First-time iOS run will boot the simulator and download the Expo Go runtime — that's expected.

## Environment

Copy `.env.example` → `.env.local` to override:

| Var | Default | What |
| --- | --- | --- |
| `EXPO_PUBLIC_API_URL` | `https://staging.simplerdevelopment.com` | Backend base URL |
| `EXPO_PUBLIC_AI_STREAM_PATH` | `/api/ai/stream` | Streaming endpoint (Phase 2 D / 3) |

## Phase plan

**Phase 1 — Design system foundation (DONE)**
- Theme tokens ported from the mockups
- Atom + UI molecule components (MIcon, Avatar, AiAvatar, Toggle, Radio, IconTile, Chip, Bubble; LargeTitle, Card, Screen, Placeholder)
- Navigation skeleton across (tabs) / (auth) / chat / brain / approvals
- Mock data fixtures for everything
- Chats tab renders the real list to prove the design system composes

**Phase 2 — Features (in flight, parallel agents)**
- A: Chat detail (bubbles + composer)
- B: Brain browser + detail screens
- C: Approvals inbox + detail
- D: Auth flow + API wire-up
- E: Settings / "You" tab

**Phase 3 — AI streaming wire-up**
- Live assistant via `EXPO_PUBLIC_AI_STREAM_PATH`
- Push notifications + lock-screen approval

## Working with the design system

Tokens live in `lib/theme.ts`. The `T` re-export mirrors the `T` object in the web mockups so you can copy/paste pixel values 1:1.

Gradients are **not** CSS strings — RN has no gradient primitive. Use `<LinearGradient>` from `expo-linear-gradient` with `linearGradientProps(Gradients.ai)` (helper handles the 135° equivalent).

When you need an icon: import `<MIcon>` from `components/atoms`. Material Symbols names from the mockup (`auto_awesome`, `psychology_alt`, `perm_media`, etc.) are translated to MaterialIcons in `MIcon.tsx` — extend that table if you hit a name that isn't there yet.

Hard rules:

- **MaterialIcons, never emojis** in rendered UI. Mockups use Material Symbols; we mirror that with MaterialIcons.
- Atoms compose into screens via the `components/ui/*` molecules — don't reach past them into raw RN primitives without good cause.
- Tailwind classes are fine where natural, but the source of truth for colors is `T` in `lib/theme.ts`. If you find yourself hand-typing `#5B5BD6`, use `T.ai` instead.
