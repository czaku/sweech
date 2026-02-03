# 🏠 Custom & Local Providers Guide

## Yes! Local Ollama Works with Both Claude AND Codex

The key is the **API format** the local model exposes.

---

## How It Works

### API Format Determines CLI Compatibility

```
┌─────────────────────────────────────────────────────┐
│  LOCAL MODEL (Ollama, LM Studio, etc.)              │
│                                                      │
│  Exposes API in one of two formats:                 │
│  ┌──────────────────┐   ┌──────────────────┐       │
│  │ OpenAI-Compatible│   │Anthropic-Compatible│     │
│  │   /v1/chat/...   │   │   /v1/messages    │      │
│  └────────┬─────────┘   └────────┬───────────┘     │
│           │                      │                  │
└───────────┼──────────────────────┼──────────────────┘
            │                      │
            ▼                      ▼
      ┌─────────┐            ┌──────────┐
      │  CODEX  │            │  CLAUDE  │
      │   CLI   │            │   CLI    │
      └─────────┘            └──────────┘
```

### The Magic: Choose API Format During Setup

When you add a custom provider with `sweech add`:

1. Select **"Custom Provider"**
2. Enter your base URL (localhost, LAN, or remote)
3. **Choose API format:**
   - `OpenAI-compatible` → Works with **Codex CLI**
   - `Anthropic-compatible` → Works with **Claude CLI**

---

## Ollama + Codex (OpenAI API)

### Default Ollama Setup

Ollama exposes an OpenAI-compatible API by default:

```bash
# Start Ollama server
ollama serve

# Add to sweech for Codex
sweech add

? Command name: ollama-codellama
? CLI type: Codex (OpenAI)
? Provider: Custom Provider

Base URL: http://localhost:11434/v1
API format: OpenAI-compatible
Default model: codellama:7b
```

### Usage

```bash
# Use Ollama with Codex
codex --config ~/.sweech/profiles/ollama-codellama

# Or use wrapper script
ollama-codellama
```

---

## Ollama + Claude (Anthropic API)

### Using a Proxy/Adapter

To use Ollama with Claude CLI, you need an adapter that converts Anthropic API calls to OpenAI format:

**Option 1: Use litellm-proxy**

```bash
# Install litellm
pip install 'litellm[proxy]'

# Start proxy that converts Anthropic → OpenAI
litellm --model ollama/codellama --api_base http://localhost:11434

# Add to sweech for Claude
sweech add

? Command name: ollama-claude
? CLI type: Claude Code
? Provider: Custom Provider

Base URL: http://localhost:8000  # litellm proxy
API format: Anthropic-compatible
Default model: codellama
```

**Option 2: Use OpenRouter (easier)**

```bash
# Just use Codex with OpenRouter instead
sweech add

? Command name: codex-router
? CLI type: Codex (OpenAI)
? Provider: OpenRouter (Universal)

# Now you can access Claude, Gemini, etc. through Codex
```

---

## LM Studio (Best for Both!)

LM Studio has built-in OpenAI-compatible API:

### Setup for Codex

```bash
# In LM Studio: Start Local Server on port 1234
# Check "Enable CORS" and "Serve on Local Network" if needed

sweech add

? Command name: lm-studio
? CLI type: Codex (OpenAI)
? Provider: Custom Provider

Base URL: http://localhost:1234
API format: OpenAI-compatible
Default model: llama-3.1-8b-instruct
Small model: llama-3.1-8b-instruct
Display name: LM Studio Local
```

### Usage

```bash
# Use local LM Studio
lm-studio

# Zero API costs! 🎉
```

---

## LAN Setup (Household/Office)

Share one local server across multiple machines:

### Server Machine (192.168.1.100)

```bash
# Run LM Studio or Ollama
# Enable network access in settings
```

### Client Machines

```bash
sweech add

? Command name: home-server
? CLI type: Codex (OpenAI)
? Provider: Custom Provider

Base URL: http://192.168.1.100:1234
API format: OpenAI-compatible
Default model: llama-3.1-8b
Display name: Home Server
```

Now everyone on the network can use it!

---

## Complete Setup Examples

### 1. Local Ollama for Codex

```bash
# Install Ollama
curl https://ollama.ai/install.sh | sh

# Pull a model
ollama pull codellama:7b

# Add to sweech
sweech add
# Name: ollama-code
# CLI: Codex
# Provider: Custom
# URL: http://localhost:11434/v1
# Format: OpenAI
# Model: codellama:7b

# Use it
ollama-code
```

### 2. LM Studio for Codex

```bash
# Download LM Studio from https://lmstudio.ai
# Load a model (e.g., Llama 3.1 8B Instruct)
# Start Local Server (default port 1234)

# Add to sweech
sweech add
# Name: lm-studio
# CLI: Codex
# Provider: Custom
# URL: http://localhost:1234
# Format: OpenAI
# Model: llama-3.1-8b-instruct

# Use it
lm-studio
```

### 3. llama.cpp Server for Codex

```bash
# Build llama.cpp with server
git clone https://github.com/ggerganov/llama.cpp
cd llama.cpp && make

# Download a model
./models/download-model.sh llama-3.1-8b

# Start server
./server -m models/llama-3.1-8b.gguf --port 8080

# Add to sweech
sweech add
# Name: llamacpp
# CLI: Codex
# Provider: Custom
# URL: http://localhost:8080
# Format: OpenAI
# Model: llama-3.1-8b

# Use it
llamacpp
```

### 4. Remote Self-Hosted for Claude

```bash
# Your server running Anthropic-compatible API
# at https://api.company.com

sweech add
# Name: company-ai
# CLI: Claude Code
# Provider: Custom
# URL: https://api.company.com
# Format: Anthropic
# Model: company-model-v1

# Use it
company-ai
```

---

## API Format Quick Reference

| Local Server | Default API | Use With | Notes |
|--------------|-------------|----------|-------|
| **Ollama** | OpenAI | Codex ✅ | Native support |
| **LM Studio** | OpenAI | Codex ✅ | Native support |
| **llama.cpp** | OpenAI | Codex ✅ | Native support |
| **text-generation-webui** | OpenAI | Codex ✅ | Enable API in settings |
| **LocalAI** | OpenAI | Codex ✅ | Native support |
| **Ollama + litellm** | Anthropic | Claude ✅ | Via proxy |

---

## Why Most Local Models → Codex

**Most local LLM servers expose OpenAI-compatible APIs** because:
1. OpenAI API is the de facto standard
2. Easier to implement
3. More tools support it
4. Broader ecosystem

So for local models, you'll typically use **Codex** as your CLI.

---

## Testing Your Setup

### Verify Server is Running

```bash
# For OpenAI-compatible (Ollama, LM Studio, etc.)
curl http://localhost:1234/v1/models

# For Anthropic-compatible
curl http://localhost:8000/v1/models \
  -H "x-api-key: your-key"
```

### Test with sweech

```bash
# Add the provider
sweech add

# Test it
sweech test <command-name>

# Check configuration
sweech doctor
```

---

## Troubleshooting

### "Connection refused"

```bash
# Check server is running
curl http://localhost:1234/v1/models

# Check firewall (for LAN)
# macOS: System Preferences → Security & Privacy → Firewall
# Allow incoming connections

# For LAN, use machine IP not localhost
# Find your IP: ifconfig (macOS/Linux) or ipconfig (Windows)
```

### "Wrong API format"

```bash
# Make sure API format matches
# OpenAI format: /v1/chat/completions endpoint
# Anthropic format: /v1/messages endpoint

# Test with curl:
# OpenAI:
curl http://localhost:1234/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"llama","messages":[{"role":"user","content":"test"}]}'

# Anthropic:
curl http://localhost:8000/v1/messages \
  -H "x-api-key: key" \
  -H "anthropic-version: 2023-06-01" \
  -d '{"model":"model","messages":[{"role":"user","content":"test"}]}'
```

### "Model not found"

```bash
# For Ollama: pull the model first
ollama pull codellama:7b

# For LM Studio: load model in UI
# For llama.cpp: specify correct .gguf file path
```

---

## Advanced: Multiple Local Profiles

You can create multiple profiles pointing to the same local server with different models:

```bash
# Profile 1: Small fast model
sweech add --name ollama-fast
# Model: codellama:7b

# Profile 2: Larger smart model
sweech add --name ollama-smart
# Model: llama-3.1-70b

# Use based on task
ollama-fast      # Quick prototyping
ollama-smart     # Complex problems
```

---

## Cost Savings

### Typical Workflow

```bash
# 1. Prototype with local (free)
ollama-code

# 2. Refine with cheap cloud (DeepSeek $0.28/M)
codex-deepseek

# 3. Final polish with best quality (Claude Sonnet)
claude-official
```

### Monthly Comparison

| Setup | Cost | Speed | Quality |
|-------|------|-------|---------|
| Ollama (local) | $0 | Fast* | Good |
| DeepSeek (cloud) | ~$5-10 | Fast | Great |
| Claude (cloud) | ~$20-50 | Fast | Best |

\* Depends on your hardware (M1/M2 Mac, NVIDIA GPU, etc.)

---

## Summary

### ✅ Ollama Works With Both CLIs

- **Codex** → Use Ollama's native OpenAI API (`http://localhost:11434/v1`)
- **Claude** → Use Ollama + litellm proxy (converts API format)

### ✅ Most Local Models → Codex

Because they expose OpenAI-compatible APIs by default.

### ✅ Best for Local LLMs

1. **LM Studio** - Easiest, GUI, auto-downloads models
2. **Ollama** - CLI-focused, lightweight, fast model switching
3. **llama.cpp** - Maximum control, best performance

### ✅ LAN Sharing

One server, multiple machines. Perfect for households/offices.

---

## What's Next?

- [Provider Guide](PROVIDERS.md) - All cloud providers
- [Architecture](ARCHITECTURE.md) - How sweech works
- [Testing](TESTING.md) - Test suite documentation

Back to [README](README.md)
