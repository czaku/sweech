/**
 * /vision endpoint — standalone vision call routed by sweech profile.
 *
 * Accepts a system prompt, user prompt, and an array of local image paths,
 * then routes to the underlying provider for the chosen profile:
 *
 *   - anthropic    → POST https://api.anthropic.com/v1/messages
 *     (requires ANTHROPIC_API_KEY env var; OAuth profiles like claude-pole
 *      that use Claude.ai Pro subscriptions need a separate API-key profile
 *      because the Anthropic OAuth flow doesn't grant direct API access)
 *   - openai       → POST https://api.openai.com/v1/chat/completions
 *     (requires OPENAI_API_KEY)
 *   - gemini       → POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent
 *     (requires GEMINI_API_KEY)
 *   - openrouter   → POST https://openrouter.ai/api/v1/chat/completions
 *     (requires OPENROUTER_API_KEY)
 *   - local llodge → POST http://localhost:9031/v1/chat/completions  (no key)
 *
 * Returns { text, provider, model, account, inputTokens?, outputTokens? }.
 *
 * Body schema:
 *   {
 *     sweechProfile: string,            // pick a profile from the estate
 *     systemPrompt?: string,
 *     prompt: string,
 *     imagePaths: string[],             // absolute paths on disk
 *     maxTokens?: number,
 *     thinkingBudgetTokens?: number,    // anthropic extended thinking budget
 *     temperature?: number,
 *   }
 */

import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { homedir } from 'node:os';
import type { Estate } from '../estate.js';

export interface VisionRequest {
  sweechProfile: string;
  systemPrompt?: string;
  prompt: string;
  imagePaths: string[];
  maxTokens?: number;
  thinkingBudgetTokens?: number;
  temperature?: number;
}

export interface VisionResponse {
  text: string;
  provider: string;
  model: string;
  account: string;
  inputTokens?: number;
  outputTokens?: number;
}

function mimeFor(p: string): string {
  const ext = extname(p).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.heic') return 'image/heic';
  return 'image/jpeg';
}

async function readImageBase64(p: string): Promise<{ base64: string; mime: string }> {
  const buf = await readFile(p);
  return { base64: buf.toString('base64'), mime: mimeFor(p) };
}

interface ProfileResolution {
  account: string;
  provider: string;
  model: string;
  baseUrl?: string | undefined;
}

interface SweechConfigEntry {
  name?: string;
  commandName?: string;
  provider?: string;
  model?: string;
  baseUrl?: string;
}

function loadConfigProfiles(): Record<string, SweechConfigEntry> {
  try {
    const raw = readFileSync(join(homedir(), '.sweech', 'config.json'), 'utf8');
    const parsed = JSON.parse(raw);
    const list = Array.isArray(parsed) ? parsed : parsed?.profiles ?? [];
    const out: Record<string, SweechConfigEntry> = {};
    for (const p of list as SweechConfigEntry[]) {
      const key = p.commandName ?? p.name;
      if (key) out[key] = p;
    }
    return out;
  } catch {
    return {};
  }
}

function resolveProfile(estate: Estate | null, profileName: string): ProfileResolution | null {
  // Prefer ~/.sweech/config.json (has model + baseUrl). Fall back to
  // estate.yaml accounts if config is missing the profile. Either source
  // is enough — estate is optional.
  const cfg = loadConfigProfiles()[profileName];
  const acc = estate?.accounts?.[profileName];
  if (!acc && !cfg) return null;
  const provider = (cfg?.provider ?? acc?.provider ?? '').toLowerCase();
  const model = cfg?.model ?? profileName;
  const result: ProfileResolution = {
    account: profileName,
    provider,
    model,
  };
  if (cfg?.baseUrl) result.baseUrl = cfg.baseUrl;
  return result;
}

async function callAnthropic(req: VisionRequest, prof: ProfileResolution): Promise<VisionResponse> {
  const apiKey = process.env['ANTHROPIC_API_KEY'];
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set — Anthropic vision needs an API key (OAuth profiles cannot do vision yet)');
  const userContent: Array<Record<string, unknown>> = [];
  for (const p of req.imagePaths) {
    const { base64, mime } = await readImageBase64(p);
    userContent.push({ type: 'image', source: { type: 'base64', media_type: mime, data: base64 } });
  }
  userContent.push({ type: 'text', text: req.prompt });
  const body: Record<string, unknown> = {
    model: prof.model,
    max_tokens: req.maxTokens ?? 1500,
    temperature: req.temperature ?? 0.4,
    messages: [{ role: 'user', content: userContent }],
  };
  if (req.systemPrompt) body['system'] = req.systemPrompt;
  if (req.thinkingBudgetTokens && req.thinkingBudgetTokens > 0) {
    body['thinking'] = { type: 'enabled', budget_tokens: req.thinkingBudgetTokens };
  }
  const url = (prof.baseUrl ?? 'https://api.anthropic.com') + '/v1/messages';
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(300_000),
  });
  if (!res.ok) throw new Error(`anthropic ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const j = (await res.json()) as {
    content?: Array<{ type: string; text?: string }>;
    usage?: { input_tokens?: number; output_tokens?: number };
  };
  const text = (j.content ?? []).filter((c) => c.type === 'text').map((c) => c.text ?? '').join('\n');
  const result: VisionResponse = {
    text,
    provider: 'anthropic',
    model: prof.model,
    account: prof.account,
  };
  if (j.usage?.input_tokens !== undefined) result.inputTokens = j.usage.input_tokens;
  if (j.usage?.output_tokens !== undefined) result.outputTokens = j.usage.output_tokens;
  return result;
}

async function callOpenAICompat(
  req: VisionRequest,
  prof: ProfileResolution,
  endpointBase: string,
  apiKeyEnv: string,
  providerLabel: string,
): Promise<VisionResponse> {
  const apiKey = process.env[apiKeyEnv];
  if (!apiKey) throw new Error(`${apiKeyEnv} not set`);
  const content: Array<Record<string, unknown>> = [{ type: 'text', text: req.prompt }];
  for (const p of req.imagePaths) {
    const { base64, mime } = await readImageBase64(p);
    content.push({ type: 'image_url', image_url: { url: `data:${mime};base64,${base64}` } });
  }
  const body: Record<string, unknown> = {
    model: prof.model,
    max_tokens: req.maxTokens ?? 1500,
    temperature: req.temperature ?? 0.4,
    messages: [
      ...(req.systemPrompt ? [{ role: 'system', content: req.systemPrompt }] : []),
      { role: 'user', content },
    ],
  };
  const url = endpointBase + '/v1/chat/completions';
  const res = await fetch(url, {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(300_000),
  });
  if (!res.ok) throw new Error(`${providerLabel} ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const j = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const result: VisionResponse = {
    text: j.choices?.[0]?.message?.content ?? '',
    provider: providerLabel,
    model: prof.model,
    account: prof.account,
  };
  if (j.usage?.prompt_tokens !== undefined) result.inputTokens = j.usage.prompt_tokens;
  if (j.usage?.completion_tokens !== undefined) result.outputTokens = j.usage.completion_tokens;
  return result;
}

async function callGemini(req: VisionRequest, prof: ProfileResolution): Promise<VisionResponse> {
  const apiKey = process.env['GEMINI_API_KEY'] ?? process.env['GOOGLE_API_KEY'];
  if (!apiKey) throw new Error('GEMINI_API_KEY (or GOOGLE_API_KEY) not set');
  const parts: Array<Record<string, unknown>> = [{ text: req.prompt }];
  for (const p of req.imagePaths) {
    const { base64, mime } = await readImageBase64(p);
    parts.push({ inline_data: { mime_type: mime, data: base64 } });
  }
  const body: Record<string, unknown> = {
    contents: [{ role: 'user', parts }],
    generationConfig: {
      maxOutputTokens: req.maxTokens ?? 1500,
      temperature: req.temperature ?? 0.4,
    },
  };
  if (req.systemPrompt) body['systemInstruction'] = { parts: [{ text: req.systemPrompt }] };
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${prof.model}:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(300_000),
  });
  if (!res.ok) throw new Error(`gemini ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const j = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  };
  const text = (j.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('\n');
  const result: VisionResponse = {
    text,
    provider: 'gemini',
    model: prof.model,
    account: prof.account,
  };
  if (j.usageMetadata?.promptTokenCount !== undefined) result.inputTokens = j.usageMetadata.promptTokenCount;
  if (j.usageMetadata?.candidatesTokenCount !== undefined) result.outputTokens = j.usageMetadata.candidatesTokenCount;
  return result;
}

async function callLlodge(req: VisionRequest, prof: ProfileResolution): Promise<VisionResponse> {
  // The 'llodge' profile in sweech points at the control plane (port 9000),
  // but the actual mlx_vlm.server lives on port 9031 once a VLM is loaded.
  const url = process.env['SWEECH_LLODGE_VISION_URL'] ?? 'http://localhost:9031/v1/chat/completions';
  const model =
    process.env['SWEECH_LLODGE_VLM_MODEL']
    ?? '/Users/Shared/Models/vlm/Qwen3-VL-8B-Instruct-MLX-8bit';
  const content: Array<Record<string, unknown>> = [{ type: 'text', text: req.prompt }];
  for (const p of req.imagePaths) {
    const { base64, mime } = await readImageBase64(p);
    content.push({ type: 'image_url', image_url: { url: `data:${mime};base64,${base64}` } });
  }
  const body = {
    model,
    max_tokens: req.maxTokens ?? 1500,
    temperature: req.temperature ?? 0.4,
    messages: [
      ...(req.systemPrompt ? [{ role: 'system', content: req.systemPrompt }] : []),
      { role: 'user', content },
    ],
    stream: false,
  };
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(300_000),
  });
  if (!res.ok) throw new Error(`llodge ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const j = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { input_tokens?: number; output_tokens?: number };
  };
  const result: VisionResponse = {
    text: j.choices?.[0]?.message?.content ?? '',
    provider: 'llodge',
    model,
    account: prof.account,
  };
  if (j.usage?.input_tokens !== undefined) result.inputTokens = j.usage.input_tokens;
  if (j.usage?.output_tokens !== undefined) result.outputTokens = j.usage.output_tokens;
  return result;
}

export async function handleVision(estate: Estate | null, req: VisionRequest): Promise<VisionResponse> {
  if (!req.sweechProfile) throw new Error('sweechProfile required');
  if (!req.prompt) throw new Error('prompt required');
  if (!Array.isArray(req.imagePaths) || req.imagePaths.length === 0) {
    throw new Error('imagePaths required (non-empty array)');
  }

  const prof = resolveProfile(estate, req.sweechProfile);
  if (!prof) throw new Error(`profile ${req.sweechProfile} not found in sweech estate`);

  // Route by provider type.
  const p = prof.provider;

  // Local llodge — explicit account or "custom provider" with VL model name.
  if (prof.account === 'llodge' || p === 'custom provider' || /vl|vision/i.test(prof.model)) {
    if (prof.account === 'llodge' || /custom/i.test(p)) {
      return callLlodge(req, prof);
    }
  }

  if (p === 'anthropic') return callAnthropic(req, prof);
  if (p === 'openai') return callOpenAICompat(req, prof, 'https://api.openai.com', 'OPENAI_API_KEY', 'openai');
  if (p === 'gemini') return callGemini(req, prof);
  if (p === 'openrouter' || p === 'openrouter (universal)') {
    return callOpenAICompat(req, prof, 'https://openrouter.ai/api', 'OPENROUTER_API_KEY', 'openrouter');
  }

  // GLM / Alibaba DashScope / etc — try OpenAI-compat with the profile's baseUrl.
  if (prof.baseUrl) {
    const envKey = `${p.toUpperCase().replace(/[^A-Z]/g, '_')}_API_KEY`;
    return callOpenAICompat(req, prof, prof.baseUrl, envKey, p);
  }

  // Fallback to llodge if no provider match.
  return callLlodge(req, prof);
}
