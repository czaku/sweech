# 🍭 Sweech

> **Switch between Claude Code, Codex, and 10+ AI providers seamlessly**

Sweech is the ultimate CLI tool for managing multiple AI coding assistants. Use Claude, Codex, Qwen, DeepSeek, OpenRouter, and local LLMs - all simultaneously with different command names.

[![Tests](https://img.shields.io/badge/tests-352%20passing-brightgreen.svg)](https://github.com/czaku/sweech)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue.svg)](https://www.typescriptlang.org/)
[![Buy Me A Coffee](https://img.shields.io/badge/Buy%20Me%20A%20Coffee-support-yellow.svg?logo=buy-me-a-coffee&logoColor=white)](https://buymeacoffee.com/czaku)

```bash
# Use them all at once! 🎉
claude              # Your default Claude account
claude-qwen         # Qwen (Alibaba) - $0.14/M tokens
codex-deepseek      # DeepSeek via Codex - $0.28/M tokens (cheapest!)
codex-router        # OpenRouter - access 300+ models
lm-studio           # Your local LM Studio (FREE!)
```

## ✨ What's New in v0.1.0

- 🔐 **Multiple Claude Accounts** - OAuth support for adding multiple subscription accounts without logging out
- 🚀 **Dual CLI Support** - Claude Code + Codex (OpenAI)
- 🏠 **Custom Providers** - Localhost, LAN, remote hosts
- 🌐 **10+ Providers** - DeepSeek, Qwen, OpenRouter, MiniMax, Kimi, GLM + more
- 💾 **Profile Backup** - Export complete profile data (settings, chat history, credentials)
- 🔧 **Advanced Tools** - Doctor, test, clone, rename commands
- 🛡️ **Smart Reset** - Safe cleanup without touching default directories

---

## 🎯 Quick Start

### 1-Minute Setup

**Step 1:** Install from GitHub

```bash
curl -fsSL https://raw.githubusercontent.com/czaku/sweech/main/install-from-github.sh | bash
```

**Step 2:** Run interactive onboarding

```bash
sweech init
```

The `init` command will guide you through:
- ✅ Adding Sweech to your PATH automatically
- ✅ Detecting installed CLIs (Claude Code, Codex)
- ✅ Setting up your first provider
- ✅ Running a health check to verify everything works

### First Provider - Interactive Setup

Run this command:

```bash
sweech add
```

Example interaction:

```
🍭 Sweech - Add New Provider

? Which CLI are you configuring?
  ❯ Claude Code (Official Anthropic Claude CLI)
    Codex (OpenAI) (Lightweight OpenAI coding agent)

? What would you like to add for Claude Code?
    Another Claude Code account (official provider)
  ❯ External AI provider (MiniMax, Qwen, Kimi, DeepSeek, etc.)

? Choose a provider: (Use arrow keys)
  ❯ Qwen (Alibaba) - Alibaba Qwen models ($0.14-$2.49/M tokens)
    MiniMax - MiniMax M2 coding model ($10/month)
    DeepSeek - Lowest cost option ($0.28/M tokens)
    OpenRouter (Universal) - 300+ models via one API
    Custom Provider - Custom/local LLM

? What command name? (e.g., "qwen", "claude-qwen", "cqwen")
  claude-qwen

? Enter API key: ••••••••••••••••••••

✓ Provider added successfully!

Command: claude-qwen
Provider: Qwen (Alibaba)
Model: qwen-plus

Now run: claude-qwen
```

**That's it!** Your new command is ready to use.

---

## 🌟 Key Features

### 🎨 Multiple CLI Support

Switch between different coding assistants:

```bash
# Claude Code (Anthropic API)
claude              # Default account
claude-qwen         # Qwen via Anthropic API
claude-deep         # DeepSeek via Anthropic API

# Codex (OpenAI API)
codex-deepseek      # DeepSeek via OpenAI API
codex-router        # OpenRouter (300+ models)
codex-qwen          # Qwen via OpenAI API
```

### 🔐 Multiple Claude Accounts (OAuth)

Add multiple Claude subscription accounts **without logging out**:

```bash
# Add another Claude account
$ sweech add
? CLI: Claude Code
? Provider: Claude (Anthropic)
? How would you like to authenticate?
  ❯ OAuth (browser login - adds another account without logging out)
    API Key (static token)
? Command name: claude-work

✓ Provider added successfully!
Command: claude-work

⚠️  Authentication setup required:
   Run: claude-work
   This will start Claude Code's OAuth login flow
   Follow the prompts to authenticate with your account
```

Each profile gets its own isolated authentication:
- `claude` → Your personal account
- `claude-work` → Your work account
- No need to log out/in to switch!

### 🏠 Custom & Local Providers

Use localhost, LAN servers, or custom hosts:

```bash
# LM Studio (localhost)
$ sweech add
? CLI: Codex
? Provider: Custom Provider
? Base URL: http://localhost:1234
? API format: OpenAI-compatible
? Model: llama-3.1-8b-instruct
✓ Command: lm-studio

# Ollama (localhost)
? Base URL: http://localhost:11434/v1
? API format: OpenAI-compatible
? Model: codellama:7b
✓ Command: ollama-code

# Home LAN Server
? Base URL: http://192.168.1.100:8080
? API format: Anthropic-compatible
? Model: custom-model-v1
✓ Command: home-server
```

📖 Complete guide: [CUSTOM-PROVIDERS.md](CUSTOM-PROVIDERS.md)

### 🌐 10+ Cloud Providers

| Provider | CLI | Cost | Notes |
|----------|-----|------|-------|
| **Claude (Anthropic)** | Claude | Varies | Official Claude models |
| **Qwen (Alibaba)** | Claude/Codex | $0.14-$2.49/M | Both APIs supported |
| **DeepSeek** | Claude/Codex | $0.28/M | **Cheapest!** Both APIs |
| **OpenRouter** | Codex | Varies | **300+ models** (Claude, GPT, Gemini, Llama) |
| **MiniMax** | Claude | $10/month | M2 coding model |
| **Kimi K2** | Claude | $0.14-$2.49/M | 256K context window |
| **GLM 4.6** | Claude | $3/month | Zhipu coding plan |
| **Custom/Local** | Both | FREE | LM Studio, Ollama, llama.cpp |

📖 Complete guide: [PROVIDERS.md](PROVIDERS.md)

### 💾 Backup & Restore

Migrate between machines with encrypted backups:

```bash
# Create backup (password-protected)
$ sweech backup
? Enter password: ********
✓ Backup created: sweech-backup-20250203.zip

# Restore on new machine
$ sweech restore sweech-backup-20250203.zip
? Enter password: ********
✓ All profiles restored
✓ Wrapper scripts executable
```

**Includes:**
- All provider configs
- Wrapper scripts
- Aliases
- Usage statistics
- **Complete profile data** (with `sweech backup-chats` - backs up entire profile including settings, credentials, chat history, plugins, and cache)

**Security:**
- AES-256-CBC encryption
- PBKDF2 key derivation (100,000 iterations)
- No password recovery

📖 Complete guide: [BACKUP.md](BACKUP.md)

### 📊 Usage Statistics

Track which providers you use most:

```bash
$ sweech stats

📊 Usage Statistics:

▸ claude-qwen
  Total uses: 142
  Last used: 2/3/2025, 4:32:18 PM
  Avg per day: 8.3

▸ lm-studio
  Total uses: 89
  Last used: 2/3/2025, 3:15:42 PM
  Avg per day: 5.2
```

### 🔗 Command Aliases

Create shortcuts for frequent providers:

```bash
$ sweech alias work=claude-qwen
$ sweech alias local=lm-studio
$ sweech alias fast=codex-deepseek

# Use short names
$ work      # Runs: claude-qwen
$ local     # Runs: lm-studio
$ fast      # Runs: codex-deepseek
```

---

## 📦 All Commands

### Core Commands

```bash
sweech add                     # Add provider (interactive)
sweech list                    # List all providers
sweech remove <name>           # Remove provider
sweech info                    # Show configuration
```

### Provider Management

```bash
sweech show <name>             # Show provider details
sweech edit <name>             # Edit provider config
sweech clone <src> <dest>      # Clone provider config
sweech rename <old> <new>      # Rename provider
sweech test <name>             # Test provider connection
```

### Backup & Migration

```bash
sweech backup                  # Create encrypted backup
sweech restore <file>          # Restore from backup
sweech backup-chats <name>     # Export complete profile data
```

### Utilities

```bash
sweech stats [name]            # Usage statistics
sweech alias [action]          # Manage aliases
sweech discover                # Browse available providers
sweech doctor                  # Check installation health
sweech path                    # Show bin directory path
sweech completion <shell>      # Generate shell completion
```

### Maintenance

```bash
sweech reset                   # Remove all sweech providers
sweech update-wrappers         # Regenerate wrapper scripts
```

---

## 🎯 Real-World Examples

### Cost Optimization

Mix free and paid providers:

```bash
# FREE: Local Ollama for quick iterations
$ ollama-code "add error handling"

# CHEAP: DeepSeek for production code ($0.28/M tokens)
$ codex-deepseek "implement user authentication"

# QUALITY: Claude for complex architecture (official pricing)
$ claude "design the database schema"
```

💰 **Save hundreds per month** with smart provider switching!

### Team Collaboration

Share provider configs with your team:

```bash
# Team lead creates backup
$ sweech backup -o team-config.zip

# Team members restore
$ sweech restore team-config.zip

# Everyone has the same providers! 🎉
```

### Project-Based Workflows

Use aliases for different projects:

```bash
$ sweech alias frontend=claude-qwen
$ sweech alias backend=codex-deepseek
$ sweech alias mobile=claude-kimi     # 256K context for large codebases

# In each project
$ cd ~/frontend && frontend
$ cd ~/backend && backend
$ cd ~/mobile && mobile
```

### LAN Household Setup

One server, multiple machines:

```bash
# Server machine (192.168.1.100)
# Run LM Studio with network access enabled

# All household machines
$ sweech add
? Provider: Custom Provider
? Base URL: http://192.168.1.100:1234
? API format: OpenAI-compatible
? Model: llama-3.1-70b
✓ Command: home-ai

# Free AI for the whole household! 🏠
```

---

## 🛡️ Safety & Security

### Default Directory Protection

Sweech **never touches** your default CLI directories:

- `~/.claude/` - Protected ✅
- `~/.codex/` - Protected ✅

The `claude` and `codex` commands work exactly as before!

### Smart Reset

```bash
$ sweech reset

⚠️  This will remove ALL sweech-created providers.
   Your default ~/.claude/ directory will NOT be touched.

? Remove all sweech providers? Yes

✓ Removed 5 providers
✓ Cleaned ~/.sweech/
✗ Protected ~/.claude/ (untouched)
```

### Secure Backups

- AES-256-CBC encryption
- PBKDF2 key derivation (100,000 iterations)
- Password never stored
- API keys encrypted at rest

---

## 🔧 Advanced Usage

### Health Check

```bash
$ sweech doctor

🔍 Sweech Health Check:

✓ Sweech installed: v0.1.0
✓ Config directory: /Users/you/.sweech
✓ Bin directory: /Users/you/.sweech/bin
✓ Bin in PATH: Yes

Installed CLIs:
  ✓ Claude Code: v2.1.0
  ✓ Codex: v1.5.0

Profiles: 5
  ✓ claude-qwen (Qwen)
  ✓ lm-studio (Custom)
  ✓ codex-deepseek (DeepSeek-OpenAI)
  ✗ broken-profile (config missing)

⚠️ 1 issue found. Run: sweech remove broken-profile
```

### Test Provider Connection

```bash
$ sweech test claude-qwen

🧪 Testing claude-qwen...

✓ Config exists
✓ Wrapper script exists
✓ Wrapper script executable
✓ Provider: Qwen (Alibaba)
✓ Base URL: https://dashscope-intl.aliyuncs.com/apps/anthropic
✓ Model: qwen-plus

All checks passed! ✅
```

### Shell Completion

```bash
# Bash
$ sweech completion bash > ~/.sweech-completion.bash
$ echo 'source ~/.sweech-completion.bash' >> ~/.bashrc
$ source ~/.bashrc

# Zsh
$ sweech completion zsh > ~/.sweech-completion.zsh
$ echo 'source ~/.sweech-completion.zsh' >> ~/.zshrc
$ source ~/.zshrc

# Now use tab completion
$ sweech <TAB>
add       backup    clone     doctor    edit      list      ...
```

---

## 📋 Prerequisites

- **Node.js** 18 or higher
- **Claude Code CLI** (for Claude providers): `npm install -g @anthropic/claude-code`
- **Codex CLI** (for Codex providers): See [Codex installation](https://github.com/openai/codex)
- **API keys** for cloud providers you want to use
- **Local LLM server** (optional): LM Studio, Ollama, llama.cpp

---

## 🚀 Installation

### One-Line Install (Recommended)

```bash
curl -fsSL https://raw.githubusercontent.com/czaku/sweech/main/install-from-github.sh | bash
```

### Manual Install

**Option 1:** Install from GitHub

```bash
npm install -g github:czaku/sweech
```

**Option 2:** Clone and build

```bash
git clone https://github.com/czaku/sweech.git
```

```bash
cd sweech && npm install && npm run build && npm link
```

### Post-Install

Add sweech bin to PATH (choose your shell):

**Bash:**

```bash
echo 'export PATH="$HOME/.sweech/bin:$PATH"' >> ~/.bashrc && source ~/.bashrc
```

**Zsh:**

```bash
echo 'export PATH="$HOME/.sweech/bin:$PATH"' >> ~/.zshrc && source ~/.zshrc
```

**Fish:**

```bash
echo 'set -gx PATH $HOME/.sweech/bin $PATH' >> ~/.config/fish/config.fish && source ~/.config/fish/config.fish
```

Verify installation:

```bash
sweech --version
```

```bash
sweech doctor
```

---

## 🏗️ How It Works

Sweech creates wrapper scripts that set environment variables before launching the CLI:

```bash
# ~/.sweech/bin/claude-qwen
#!/bin/bash
export CLAUDE_CONFIG_DIR="$HOME/.sweech/profiles/claude-qwen"
exec claude "$@"
```

**Directory Structure:**

```
~/.sweech/
├── config.json              # Provider registry
├── profiles/
│   ├── claude-qwen/
│   │   ├── settings.json    # Provider config
│   │   └── Transcripts/     # Chat history
│   └── lm-studio/
│       └── settings.json
└── bin/
    ├── claude-qwen          # Wrapper script
    └── lm-studio            # Wrapper script
```

**Each provider is completely isolated:**

- Own config directory
- Own settings file
- Own chat history
- Own wrapper script

Your default `~/.claude/` stays **completely untouched**!

---

## 🔑 Getting API Keys

### Cloud Providers

- **Qwen**: [DashScope Console](https://dashscope.console.aliyun.com/)
- **MiniMax**: [MiniMax Platform](https://platform.minimax.io/)
- **Kimi**: [Moonshot AI Platform](https://platform.moonshot.cn/)
- **DeepSeek**: [DeepSeek Platform](https://platform.deepseek.com/)
- **GLM**: [Zhipu AI Platform](https://open.bigmodel.cn/)
- **OpenRouter**: [OpenRouter](https://openrouter.ai/)

### Local LLMs (No API Key Needed!)

- **LM Studio**: [lmstudio.ai](https://lmstudio.ai/) - GUI, easiest setup
- **Ollama**: [ollama.ai](https://ollama.ai/) - CLI-focused, fast
- **llama.cpp**: [GitHub](https://github.com/ggerganov/llama.cpp) - Maximum control

📖 See [CUSTOM-PROVIDERS.md](CUSTOM-PROVIDERS.md) for setup guides

---

## 🧪 Testing

Comprehensive test suite with 346 tests:

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Watch mode
npm run test:watch
```

**Test Coverage:**
- ✅ 346 tests passing
- ✅ 15 test suites
- ✅ Provider filtering by CLI
- ✅ Custom provider creation
- ✅ Backup/restore encryption
- ✅ Chat history export
- ✅ Reset protection
- ✅ All commands tested

---

## 🤝 Contributing

Contributions are welcome! Here's how you can help:

### Add New Providers

Edit `src/providers.ts`:

```typescript
{
  name: 'new-provider',
  displayName: 'New Provider',
  baseUrl: 'https://api.newprovider.com/anthropic',
  defaultModel: 'model-name',
  description: 'Description',
  pricing: '$X/M tokens',
  compatibility: ['claude'], // or ['codex'] or both
  apiFormat: 'anthropic' // or 'openai'
}
```

### Add New CLI Support
### Report Issues

Found a bug? [Open an issue](https://github.com/czaku/sweech/issues)

---

## 📚 Documentation

- **[README.md](README.md)** - Main documentation (you are here)
- **[PROVIDERS.md](PROVIDERS.md)** - Complete provider guide
- **[CUSTOM-PROVIDERS.md](CUSTOM-PROVIDERS.md)** - Local & custom LLM setup
- **[BACKUP.md](BACKUP.md)** - Backup & restore guide
- **[ARCHITECTURE.md](ARCHITECTURE.md)** - Technical architecture
- **[TESTING.md](TESTING.md)** - Testing guide
- **[CHANGELOG.md](CHANGELOG.md)** - Version history

---

## 🙏 Credits & Inspiration

Inspired by amazing projects:

- [claude-multi](https://github.com/hmziqrs/claude-multi) by hmziqrs
- [cc-account-switcher](https://github.com/ming86/cc-account-switcher) by ming86
- [cc-compatible-models](https://github.com/Alorse/cc-compatible-models) by Alorse

Special thanks to the community for feedback and testing!

---

## 📄 License

MIT License - See [LICENSE](LICENSE) file

---

## 💡 Tips & Tricks

### Quick Command Names

Use short, memorable names:

```bash
sweech alias q=claude-qwen
```

```bash
sweech alias d=codex-deepseek
```

```bash
sweech alias l=lm-studio
```

### Monitor Costs

Check which providers you use most:

```bash
$ sweech stats

# If you barely use a paid provider, consider canceling
# If you heavily use a cheap provider, keep it!
```

### Export Profile Data

Before removing a provider, export complete profile (including chats, settings, and credentials):

```bash
$ sweech backup-chats claude-qwen
✓ Backed up to: sweech-chats-claude-qwen-20250203.zip
```

### Test Before Using

Test new providers before critical work:

```bash
sweech test new-provider
```

```bash
new-provider "Hello, test message"
```

---

## 🌟 Star Us!

If Sweech saves you money or time, please ⭐ star this repo!

**Made with 🍭 by the Sweech community**

---

## 📞 Support

- 📖 **Documentation**: Read the guides above
- 🐛 **Bug Reports**: [GitHub Issues](https://github.com/czaku/sweech/issues)
- 💬 **Discussions**: [GitHub Discussions](https://github.com/czaku/sweech/discussions)
- 📧 **Email**: (Coming soon)

---

**Happy coding with Sweech! 🍭**
