# 🍭 Sweech Provider Guide

Complete guide to all supported providers and custom/local LLM setup.

## Provider Compatibility Matrix

| Provider | CLI Support | API Format | Pricing |
|----------|-------------|------------|---------|
| **Anthropic Claude** | Claude | Anthropic | Varies by model |
| **Qwen (Alibaba)** | Claude | Anthropic | $0.14-$2.49/M tokens |
| **MiniMax** | Claude | Anthropic | $10/month |
| **Kimi K2** | Claude | Anthropic | $0.14-$2.49/M tokens |
| **DeepSeek** | Claude | Anthropic | $0.28-$0.42/M tokens |
| **GLM 4.6** | Claude | Anthropic | $3/month |
| **DeepSeek (OpenAI)** | Codex | OpenAI | $0.28-$0.42/M tokens |
| **Qwen (OpenAI)** | Codex | OpenAI | $0.14-$2.49/M tokens |
| **OpenRouter** | Codex | OpenAI | Varies by model |
| **Custom/Local** | Both* | User choice | Self-hosted |

\* Custom providers support either CLI depending on API format chosen.

---

## 🎯 Quick Start

### Add a Provider (Claude CLI)

```bash
sweech add

? Command name: claude-qwen
? CLI type: Claude Code
? Provider: Qwen (Alibaba) - Alibaba Qwen models via DashScope Anthropic API
? API key: sk-***
```

### Add a Provider (Codex CLI)

```bash
sweech add

? Command name: codex-deepseek
? CLI type: Codex (OpenAI)
? Provider: DeepSeek (OpenAI) - DeepSeek via native OpenAI-compatible API
? API key: sk-***
```

---

## 📡 Anthropic-Compatible Providers (Claude CLI)

### Anthropic (Official)

```bash
Provider: Claude (Anthropic)
Base URL: (uses default)
Models: claude-sonnet-4-5, claude-3-5-haiku-20241022
```

Official Anthropic Claude models. Best quality, latest features.

### Qwen (Alibaba)

```bash
Provider: Qwen (Alibaba)
Base URL: https://dashscope-intl.aliyuncs.com/apps/anthropic
Models: qwen-plus, qwen-flash
```

Alibaba's Qwen models via DashScope Anthropic-compatible API. Good balance of cost and performance.

### MiniMax

```bash
Provider: MiniMax
Base URL: https://api.minimax.io/anthropic
Model: MiniMax-M2
```

MiniMax M2 coding model. $10/month flat rate coding plan.

### Kimi K2 (Moonshot AI)

```bash
Provider: Kimi K2 (Moonshot AI)
Base URL: https://api.moonshot.ai/anthropic
Model: kimi-k2-turbo-preview
```

256K context window. Great for large codebases.

### DeepSeek (Anthropic API)

```bash
Provider: DeepSeek
Base URL: https://api.deepseek.com/anthropic
Model: deepseek-chat
```

Lowest cost option via Anthropic-compatible endpoint.

### GLM 4.6 (Zhipu/ZAI)

```bash
Provider: GLM 4.6 (Zhipu/ZAI)
Base URL: https://api.z.ai/api/anthropic
Model: glm-4-plus
```

Zhipu GLM 4.6 models. $3/month coding plan.

---

## 🔌 OpenAI-Compatible Providers (Codex CLI)

### DeepSeek (OpenAI API)

```bash
Provider: DeepSeek (OpenAI)
Base URL: https://api.deepseek.com/v1
Models: deepseek-chat, deepseek-reasoner
```

Native OpenAI-compatible API. Same great pricing, different endpoint.

### Qwen (OpenAI API)

```bash
Provider: Qwen (OpenAI)
Base URL: https://dashscope-intl.aliyuncs.com/compatible-mode/v1
Models: qwen-plus, qwen-turbo
```

DashScope OpenAI-compatible endpoint for Qwen models.

**Regional Endpoints:**
- Singapore: `https://dashscope-intl.aliyuncs.com/compatible-mode/v1`
- US (Virginia): `https://dashscope-us.aliyuncs.com/compatible-mode/v1`
- Beijing: `https://dashscope.aliyuncs.com/compatible-mode/v1`

### OpenRouter (Universal Gateway)

```bash
Provider: OpenRouter (Universal)
Base URL: https://openrouter.ai/api/v1
Models: 300+ models from all providers
```

**Access ALL models through one API:**
- Anthropic: `anthropic/claude-sonnet-4.5`
- Google: `google/gemini-2.5-pro`
- OpenAI: `openai/gpt-4`
- Meta: `meta-llama/llama-3.1-405b`
- And 300+ more!

Get API key: https://openrouter.ai/

---

## 🏠 Custom & Local Providers

Sweech supports any custom or local LLM provider. Perfect for:
- **Localhost:** LM Studio, Ollama, llama.cpp
- **LAN:** Self-hosted on local network (192.168.x.x)
- **Remote:** Custom domains and self-hosted cloud instances

### Setup Custom Provider

```bash
sweech add

? Command name: my-local-llm
? CLI type: Codex (OpenAI)  # or Claude, depending on API format
? Provider: Custom Provider - Custom/local LLM

# You'll be prompted for:
# - Base URL (e.g., http://localhost:1234)
# - API format (OpenAI or Anthropic compatible)
# - Default model name
# - Small/fast model (optional)
# - Display name (optional)
```

### Example: LM Studio

```bash
Base URL: http://localhost:1234
API format: OpenAI-compatible
Default model: llama-3.1-8b-instruct
Small model: llama-3.1-8b-instruct
```

### Example: Ollama (OpenAI Compatible)

```bash
Base URL: http://localhost:11434/v1
API format: OpenAI-compatible
Default model: codellama:7b
Small model: codellama:7b
```

### Example: LAN Server

```bash
Base URL: http://192.168.1.100:8080
API format: OpenAI-compatible
Default model: mistral-7b
```

### Example: Custom Remote

```bash
Base URL: https://api.your-company.com
API format: Anthropic-compatible
Default model: custom-model-v1
```

### Common Local LLM Servers

| Server | Default URL | API Format |
|--------|-------------|------------|
| LM Studio | `http://localhost:1234` | OpenAI |
| Ollama | `http://localhost:11434/v1` | OpenAI |
| llama.cpp | `http://localhost:8080` | OpenAI |
| text-generation-webui | `http://localhost:5000` | OpenAI |
| LocalAI | `http://localhost:8080` | OpenAI |

---

## 🎨 Usage Examples

### Use Multiple Providers

```bash
# Add Claude with Anthropic
sweech add --name claude-official --cli claude --provider anthropic

# Add Claude with cheaper DeepSeek
sweech add --name claude-cheap --cli claude --provider deepseek

# Add Codex with OpenRouter (access to everything)
sweech add --name codex-router --cli codex --provider openrouter

# Add local Ollama
sweech add --name local-llama --cli codex --provider custom
```

### Switch Between Providers

```bash
# Use official Claude
claude-official

# Use cheap DeepSeek for prototyping
claude-cheap

# Use OpenRouter to access Gemini
codex-router  # then use model: google/gemini-2.5-pro

# Use local Ollama (no API costs!)
local-llama
```

### Cost Optimization

```bash
# Expensive tasks: use official Claude
claude-official --model claude-opus-4-5

# Medium tasks: use Qwen
claude-qwen --model qwen-plus

# Cheap tasks: use DeepSeek
claude-cheap --model deepseek-chat

# Free (local): use Ollama
local-llama --model codellama:7b
```

---

## 💡 Tips & Best Practices

### Choosing a Provider

**For Claude CLI:**
- **Best Quality:** Anthropic (official)
- **Best Value:** DeepSeek ($0.28-$0.42/M tokens)
- **Best Balance:** Qwen ($0.14-$2.49/M tokens)
- **Long Context:** Kimi K2 (256K context)

**For Codex CLI:**
- **Universal Access:** OpenRouter (300+ models)
- **Lowest Cost:** DeepSeek OpenAI ($0.28-$0.42/M tokens)
- **Self-Hosted:** Custom/Local (free after setup)

### API Key Management

Store API keys securely:
```bash
# Add provider with API key
sweech add
# API key is stored in ~/.sweech/profiles/<name>/settings.json

# Update API key later
sweech edit <command-name>
# Choose "API Key" to update
```

### Testing Providers

```bash
# Test a provider configuration
sweech test <command-name>

# Check if CLI is installed
sweech doctor
```

### Custom Provider Validation

When setting up custom providers, verify:
1. ✅ Server is running and accessible
2. ✅ API format matches (OpenAI vs Anthropic)
3. ✅ Model name is correct
4. ✅ Authentication works (if required)

Test with curl:
```bash
# OpenAI-compatible
curl http://localhost:1234/v1/models

# Anthropic-compatible
curl https://api.your-server.com/v1/models \
  -H "x-api-key: your-key"
```

---

## 🔧 Advanced Configuration

### Multiple Instances of Same Provider

```bash
# Different models
sweech add --name claude-fast --provider anthropic --model claude-3-5-haiku
sweech add --name claude-smart --provider anthropic --model claude-sonnet-4-5

# Different API keys (personal vs work)
sweech add --name qwen-personal --provider qwen
sweech add --name qwen-work --provider qwen
```

### Regional Endpoints

```bash
# Qwen Singapore
sweech add --name qwen-sg
# Base URL: https://dashscope-intl.aliyuncs.com/compatible-mode/v1

# Qwen US
sweech add --name qwen-us
# Base URL: https://dashscope-us.aliyuncs.com/compatible-mode/v1
```

### LAN Network Setup

For household/office network:
```bash
# Server machine (192.168.1.100):
# Run LM Studio or Ollama, enable network access

# Client machines:
sweech add --name lan-llm
# Base URL: http://192.168.1.100:1234
# Now everyone on the network can use it!
```

---

## 📊 Provider Comparison

| Feature | Anthropic | DeepSeek | Qwen | OpenRouter | Custom |
|---------|-----------|----------|------|------------|--------|
| **Cost** | Medium | Lowest | Low | Varies | Free* |
| **Quality** | Highest | High | High | Varies | Varies |
| **Speed** | Fast | Fast | Fast | Varies | Varies |
| **Context** | 200K | 64K | 128K | Varies | Varies |
| **Models** | Claude | DeepSeek | Qwen | 300+ | Any |
| **Privacy** | Cloud | Cloud | Cloud | Cloud | Local* |

\* For self-hosted setups

---

## 🆘 Troubleshooting

### Provider Not Working

```bash
# Check configuration
sweech test <command-name>

# Check CLI is installed
sweech doctor

# Check profile settings
cat ~/.sweech/profiles/<command-name>/settings.json
```

### Custom Provider Connection Failed

```bash
# Verify server is running
curl http://localhost:1234/v1/models

# Check firewall (for LAN)
# Allow port in firewall settings

# Verify API format
# OpenAI: /v1/chat/completions
# Anthropic: /v1/messages
```

### Wrong API Format

```bash
# If you see errors like "unexpected response format":
sweech edit <command-name>
# Update to correct provider or API format
```

---

## 🚀 What's Next?

- List all your providers: `sweech list`
- Clone a provider: `sweech clone <source> <target>`
- Rename a provider: `sweech rename <old> <new>`
- Remove a provider: `sweech remove <name>`
- Backup configurations: `sweech backup`

Back to [README](README.md) | [Architecture](ARCHITECTURE.md)
