# Root-Cause Frontend

React + TypeScript + Vite frontend for the Root-Cause crop disease detection and advisory system.

## Setup

```bash
cd frontend
npm install
```

## Development

```bash
npm run dev
```

Starts Vite dev server with hot reload. The dev server proxies `/api` to `http://127.0.0.1:8000`.

## Type Check

```bash
npm run typecheck
```

## Build

```bash
npm run build
```

Outputs to `frontend/dist`. The backend serves this directory for production.

## Preview

```bash
npm run preview
```

Previews the production build locally.

## Data Modes

### Live Mode (default)

Set in `.env` or environment:

```
VITE_DATA_MODE=live
```

All requests go to the real backend at `/api`.

### Fixture Mode

```
VITE_DATA_MODE=fixture
```

Uses bundled fixture data for development and testing without a backend. Fixture mode:
- Never silently activates after a live API failure
- Is rejected in production builds (see `vite.config.ts`)
- Exercises: classification, leaf box, experimental segmentation, null/stale soil data, unknown attention, attention reasons, unsupported aerial input, queue-full, unavailable chat

## API Configuration

- **Dev proxy**: `/api` → `http://127.0.0.1:8000` (configured in `vite.config.ts`)
- **Production**: Relative `/api` URLs (same origin as assets)
- **Custom base**: Set `VITE_API_BASE` in `.env`

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_DATA_MODE` | `live` | `live` or `fixture` |
| `VITE_API_BASE` | `/api` | API base URL |

See `.env.example` for reference.

## npm Scripts

| Script | Description |
|--------|-------------|
| `dev` | Start Vite dev server |
| `typecheck` | Run TypeScript type checking |
| `build` | Type-check and build for production |
| `preview` | Preview production build |

## Production Build

Build output goes to `frontend/dist`. The backend serves this directory. No production CDN resources are used.

## Offline Verification

After `npm install` and with models prepared:

```bash
npm run build
npm run preview
```

Then disconnect network and verify the app loads and functions correctly.

## Known Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | System health status |
| GET | `/api/zones` | List all zones |
| GET | `/api/zones/{id}/observations` | Observations for a zone |
| GET | `/api/zones/{id}/attention` | Attention items for a zone |
| POST | `/api/observations` | Import observation (multipart: image + metadata) |
| POST | `/api/observations/{id}/analyze` | Start analysis job |
| GET | `/api/jobs/{id}` | Poll job status |
| GET | `/api/results/{id}` | Get analysis result |
| POST | `/api/chat` | Send chat message |
| GET | `/api/assets/{path}` | Get image asset |

## Architecture

- `src/types/contracts.ts` — Wire types shared with backend
- `src/api/` — Typed fetch client with error handling
- `src/hooks/useCropApp.ts` — Main state hook (polling, caching, race protection)
- `src/chat/ChatPanel.tsx` — Explanation-only chat component
- `src/fixtures/` — Fixture transport and data for offline development

## Ownership

- **Friend 1** owns: `src/App.tsx`, `src/components/`, `src/pages/`, `src/styles/`
- **Friend 2** owns: everything else in `frontend/`

## Verification Checklist

- [x] FormData field names correct (`image` + `metadata`)
- [x] No manually set multipart boundary
- [x] Job polling terminates on completion/failure
- [x] Selection race protection (request ID guards)
- [x] No duplicate POST on rerender (job cache)
- [x] Error envelope handling (ApiRequestError)
- [x] Unavailable Ollama handling
- [x] Evidence navigation
- [ ] Real-API checks (require backend)
- [ ] Offline demo verification (requires build)
