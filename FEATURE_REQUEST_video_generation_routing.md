# Feature request: video-generation routing in sweech

**Filed by:** Sociopuff (vykeai/sociopuff)
**Date:** 2026-05-03
**Priority:** medium-high — required to remove the last direct-API-key codepath in sociopuff
**Status:** proposal

---

## Problem

Sweech today routes **chat-style LLM calls** between subscription Claude accounts and external chat-model providers (OpenAI, Gemini, etc.). Sociopuff already routes all text generation through `omnai` → sweech via `scripts/omnai_router.py`, with the locked rule:

> Local via llodge; frontier via subscription CLI through omnai/sweech; **NEVER ANTHROPIC_API_KEY / OPENAI_API_KEY**.

But sociopuff has a **video-generation** subsystem (`scripts/cloud_broll.py`) that calls specialty cloud video APIs:

| Engine | API | Auth |
|---|---|---|
| MiniMax (Hailuo) | `https://api.minimax.chat` | `MINIMAX_API_KEY` + `MINIMAX_GROUP_ID` |
| Kling AI v1 | `https://api.klingai.com` | HMAC-SHA256 JWT (`KLING_ACCESS_KEY` + `KLING_SECRET_KEY`) |
| Runway Gen-3 Alpha Turbo | `https://api.dev.runwayml.com` | `RUNWAY_API_KEY` |
| Replicate | `https://api.replicate.com` | `REPLICATE_API_TOKEN` |
| Luma Dream Machine | `https://api.lumalabs.ai` | `LUMA_API_KEY` |

**These don't fit the chat-model abstraction.** They're long-running async jobs (poll for completion), they take prompt + image inputs and return MP4 URLs, they have non-uniform auth (JWT, HMAC, plain token), and they're priced per-second-of-output not per-token.

Right now sweech can't route them, so they remain in sociopuff with direct API keys — the last violation of the no-API-keys rule.

---

## Proposal

Add a **video-generation routing layer** to sweech, parallel to the existing chat routing. Same credential-management story, same multi-account / failover / budget mechanics — different request/response shape.

### Scope

**In scope:**
- Sweech profile type `kind: video_generation` (alongside existing `kind: chat`)
- Per-engine credential storage (no env vars in calling code)
- Generic `omnai run --task video-generation --engine <kling|runway|...> --prompt "<text>" [--image <path>]` call shape
- Async job lifecycle: `omnai jobs create` → returns job id; `omnai jobs status <id>` → returns `pending|completed|failed` + output URL when ready
- Budget tier integration (per-second cost tracking like the existing token-based tiers)
- Failover rules: e.g. "if Runway is rate-limited, try Replicate"

**Out of scope (for v1):**
- Image generation (different again — synchronous, faster, different providers)
- Audio/voice generation (already handled separately by ElevenLabs etc. in sociopuff)
- Video EDITING (assembly, captions, etc.) — that stays in sociopuff/ffmpeg

### Suggested CLI shape

```bash
# One-time setup per engine
sweech add --kind video_generation --engine kling
  → prompts for KLING_ACCESS_KEY + KLING_SECRET_KEY

sweech add --kind video_generation --engine runway
  → prompts for RUNWAY_API_KEY

# At runtime, sociopuff calls:
omnai run --task video-generation \
  --engine kling \
  --prompt "ocean waves at sunset, cinematic, 4k" \
  --duration 5 \
  --aspect 16:9 \
  --output /tmp/clip.mp4

# OR async (recommended for long jobs):
job_id=$(omnai jobs create --task video-generation --engine kling --prompt "...")
omnai jobs status $job_id
  → status: completed
  → output: /tmp/clip.mp4
```

### Suggested provider abstraction (sweech-side)

Each engine implements:

```typescript
interface VideoGenerationProvider {
  kind: 'video_generation';
  engine: string;  // 'kling' | 'runway' | 'replicate' | 'minimax' | 'luma'
  generate(prompt: string, opts: VideoGenOptions): Promise<JobHandle>;
  status(jobId: string): Promise<JobStatus>;
  download(jobId: string, outputPath: string): Promise<void>;
  cost_estimate(opts: VideoGenOptions): number;  // USD
}
```

Sweech holds the credentials, signs requests, polls for completion, downloads output. Sociopuff just gets a file path back.

---

## Why this matters

1. **Removes the last direct-API-key violation in sociopuff** — once shipped, the entire codebase routes all paid AI calls through omnai+sweech with zero exceptions.
2. **Multi-account video providers become possible** — same as chat providers, sweech can rotate Kling accounts when one is rate-limited, fail over to Replicate, etc.
3. **Cost tracking unifies** — `omnai cost` shows token costs AND video-second costs in one place.
4. **Other vykeai products benefit** — any future product needing video generation gets the abstraction for free.

---

## Migration path on the sociopuff side

Once shipped:

1. `scripts/cloud_broll.py` deletes its 5 per-engine HTTP clients
2. Replaces them with a single `omnai run --task video-generation --engine $engine` call
3. Removes `MINIMAX_API_KEY` / `KLING_*` / `RUNWAY_API_KEY` / `REPLICATE_API_TOKEN` / `LUMA_API_KEY` from env vars
4. Removes the `provider-lock:allow` exemption in `scripts/check-provider-lock.sh`
5. Provider-lock pre-commit hook becomes strict: zero direct API keys allowed

---

## Open questions

1. **Sync vs async API:** for short clips (<10s), synchronous polling inside `omnai run` is fine. For long renders (Runway can take 5+ min), async with `omnai jobs status` is essential. Should sweech expose both?
2. **Budget tier units:** chat is tokens, video is seconds. Should `omnai tiers` carry both units, or pick one canonical (USD)?
3. **Provider failover for video:** unlike chat, video providers produce qualitatively different outputs. Falling over from Kling to Runway gives a *different-looking* clip. Is auto-failover desirable, or should sociopuff have to ask explicitly?
4. **Parallel jobs:** can `omnai jobs` queue multiple video jobs and report when each finishes (so sociopuff can render 5 b-roll clips in parallel)?

---

## Related

- Sociopuff `scripts/cloud_broll.py` — the consumer
- Sociopuff `scripts/omnai_router.py` — the existing chat routing (reference architecture)
- Sociopuff `scripts/check-provider-lock.sh` — the pre-commit lint that enforces this
