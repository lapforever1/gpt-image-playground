# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**始终用中文回答。**

## Commands

```bash
npm run dev          # Start Vite dev server (hot reload)
npm run build        # Type-check (tsc -b) then bundle (vite build)
npm run preview      # Preview production build locally
npm run test         # Run all Vitest tests once
npm run test:watch   # Run tests in watch mode
npm run mock:api     # Start local mock image API for debugging
npm run deploy:cf    # Build and deploy to Cloudflare Workers

# For local dev with CORS proxy: copy dev-proxy.config.example.json → dev-proxy.config.json
# Build-time env: VITE_DEFAULT_API_URL (preset default API endpoint)
# Docker envs: DEFAULT_API_URL, API_PROXY_URL, ENABLE_API_PROXY, LOCK_API_PROXY
```

### Running a single test

```bash
npx vitest run src/lib/mask.test.ts          # One file
npx vitest run -t "mask"                      # By test name pattern
```

## Architecture

Single-page React 19 app with no router. All state is in one Zustand store (`src/store.ts`) persisted to localStorage. Tasks, images, and thumbnails are stored in IndexedDB (`src/lib/db.ts`) with SHA-256 deduplication. Images are identified by their SHA-256 hash, generated at store time.

### Provider / API pipeline

The app supports multiple image-generation providers through a single call site:

1. **`src/lib/api.ts`** — entry point, dispatches to fal or OpenAI-compatible based on active profile
2. **`src/lib/falAiImageApi.ts`** — fal.ai via `@fal-ai/client` SDK, supports sync and queued (polling) tasks
3. **`src/lib/openaiCompatibleImageApi.ts`** — handles both OpenAI Images API (`/v1/images`) and Responses API (`/v1/responses`), plus custom HTTP providers defined via JSON config
4. **`src/lib/apiProfiles.ts`** — profile/settings normalization, validation, defaults, custom provider definition parsing
5. **`src/lib/imageApiShared.ts`** — shared utilities (size validation, base64 normalization, error formatting, MIME map, payload limits)

Provider selection: the active profile's `provider` field determines routing. `'openai'` and `'fal'` are built-in; anything else is treated as a custom provider ID resolved from `settings.customProviders`. Custom providers can define async (submit + poll) or sync (submit with result) workflows via a JSON mapping DSL.

### State architecture (`src/store.ts`)

One Zustand store (`useStore`) with `persist` middleware (localStorage key: `gpt-image-playground`). Partialized persistence — only settings, params, and optionally prompt/input images survive restart. Task records live in IndexedDB only.

Key flows:
- **`submitTask()`** — validates inputs, creates a `TaskRecord`, persists to IndexedDB, fires `executeTask()` async
- **`executeTask()`** — fetches input image data URLs from DB/cache, calls `callImageApi()`, stores output images to IndexedDB, updates task status
- **Retry** creates a new task record (does not mutate the original)
- **Reuse config** (`reuseConfig()`) restores a task's prompt, params, and input images into the input bar
- **ZIP export/import** uses `fflate` — manifest.json + image files, with thumbnail regeneration on import

Image memory management: LRU cache (max 8 full-res images, 80 thumbnails) in module-level Maps. Thumbnails are generated lazily via `requestIdleCallback` backfill with concurrency based on image megapixel size.

### Component structure

Flat layout, all in `src/components/`:
- `Header` / `InputBar` / `SearchBar` — chrome
- `TaskGrid` + `TaskCard` — primary view; waterfall grid of task cards
- `DetailModal` — full task detail with actual-vs-requested parameter comparison
- `Lightbox` — fullscreen image viewer with gallery navigation
- `SettingsModal` — API profiles, custom providers, preferences, data import/export
- `MaskEditorModal` — visual mask editor for image editing
- `ConfirmDialog` / `Toast` / `SupportPromptModal` / `ImageContextMenu` — overlays

Selection: desktop supports drag-to-select (the `[data-drag-select-surface]` attribute) and Ctrl/⌘ click multi-select. Mobile supports swipe-to-select. Batch operations (delete, favorite, export) work on `selectedTaskIds`.

### Data model

Key types in `src/types.ts`:
- `ApiProfile` — named configuration (provider, baseUrl, apiKey, model, codexCli, etc.)
- `AppSettings` — profiles array + activeProfileId + UI preferences + customProviders
- `TaskRecord` — immutable after completion; holds prompt, params, input/output image IDs, actual params from API response, revised prompts
- `StoredImage` / `StoredImageThumbnail` — IndexedDB records
- `InputImage` — UI-only { id, dataUrl } for the input bar

### URL parameter support

`src/lib/urlSettings.ts` handles `?apiUrl=`, `?apiKey=`, `?apiMode=`, `?model=`, `?codexCli=`, `?settings=` query params for pre-filling configuration.

### Size constraints

`src/lib/size.ts` enforces OpenAI's image size rules (multiples of 16, min 320×320, max pixel count by quality, 1K/2K/4K presets). `src/lib/mask.ts` and `src/lib/maskPreprocess.ts` handle mask generation and automatic resolution/size normalization.

### Dev proxy

`src/lib/devProxy.ts` and `vite.config.ts` load `dev-proxy.config.json` at dev server startup to proxy `/api-proxy/` requests, bypassing browser CORS. The `__DEV_PROXY_CONFIG__` define exposes this to the client.

### Testing

Vitest with `vi.spyOn` for fetch mocking. Tests are co-located as `*.test.ts` files. No DOM/component tests — all tests are unit tests on lib functions and store logic.
