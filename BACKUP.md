# 🍭 Sweech Backup & Restore

Sweech includes secure backup and restore functionality to migrate your configuration between machines or create safety backups.

## Features

- 🔒 **Password-protected** - Backups are encrypted with AES-256
- 📦 **Complete backup** - Includes all profiles, API keys, and wrapper scripts
- 🚀 **Easy migration** - Move your entire setup to a new machine in minutes
- 💾 **Compressed** - ZIP format for easy storage and transfer

## Creating a Backup

```bash
# Create backup with default name (sweech-backup-YYYYMMDD.zip)
sweech backup

# Or specify a custom filename
sweech backup -o my-backup.zip
```

You'll be prompted to enter a password:

```
? Enter password to encrypt backup: ••••••••
? Confirm password: ••••••••

🍭 Creating backup...

✓ Backup created successfully!

File: sweech-backup-20250203.zip
Size: 12.34 KB
Profiles: 3

⚠️  Keep this backup and password safe!
   You'll need them to restore on a new machine.
```

## What's Included in the Backup

The backup ZIP file contains:

```
profiles/              # All provider configurations
├── claude-mini/
│   └── settings.json  # API keys, base URLs, models
├── claude-qwen/
│   └── settings.json
└── ...

bin/                   # Wrapper scripts
├── claude-mini
├── claude-qwen
└── ...

config.json           # Profile metadata
```

**Important:** Backups contain your API keys in encrypted form!

## Restoring a Backup

On your new machine:

```bash
# 1. Install sweech
npm install -g github:czaku/sweech

# 2. Restore from backup
sweech restore sweech-backup-20250203.zip
```

You'll be prompted for the password:

```
? Enter backup password: ••••••••

🍭 Restoring backup...

✓ Backup restored successfully!

Profiles restored: 3
   - claude-mini
   - claude-qwen
   - claude-deep

⚠️  Make sure ~/.sweech/bin is in your PATH:
   export PATH="$HOME/.sweech/bin:$PATH"
```

## Migrating to a New Machine

Complete workflow for moving to a new machine:

### On Old Machine

```bash
# Create backup
sweech backup -o sweech-backup.zip

# Transfer the ZIP file to new machine
# (email, USB drive, cloud storage, etc.)
```

### On New Machine

```bash
# 1. Install Node.js (if not installed)
# Download from https://nodejs.org/

# 2. Install sweech
npm install -g github:czaku/sweech

# 3. Restore backup
sweech restore sweech-backup.zip

# 4. Add to PATH (choose your shell)
echo 'export PATH="$HOME/.sweech/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc

# 5. Test it works
sweech list
claude-mini --version  # or any of your commands
```

## Backup Best Practices

### Security

- ✅ **Use strong passwords** - Minimum 6 characters required (recommend 12+ with mixed case, numbers, symbols)
- ✅ **Store securely** - Keep backups in password managers or encrypted storage
- ✅ **Don't commit to git** - Backup files are in `.gitignore` by default
- ✅ **Rotate regularly** - Create new backups after adding/changing providers

### Storage

- 📁 **Local backups** - Keep in a secure location on your machine
- ☁️ **Cloud storage** - Use encrypted services (1Password, Dropbox, etc.)
- 💾 **Multiple copies** - Keep backups in different locations
- 🗓️ **Dated names** - Use default naming or add dates for versioning

## Handling Existing Configurations

If you already have providers configured and restore a backup:

```bash
⚠️  Warning: You have existing providers configured:
   - claude-work
   - claude-personal

? This will overwrite existing configurations. Continue? (y/N)
```

Choose:
- **No** - Keep existing configuration
- **Yes** - Replace with backup (existing configs will be overwritten)

## Troubleshooting

### Incorrect Password

```
Error: Incorrect password or corrupted backup file
```

**Solution:** Make sure you're entering the correct password. Passwords are case-sensitive.

### Backup File Not Found

```
Error: Backup file not found: sweech-backup.zip
```

**Solution:** Check the file path. Use absolute path if needed:

```bash
sweech restore /path/to/sweech-backup.zip
```

### Restore Not Working

If restored commands don't work:

```bash
# 1. Check PATH
echo $PATH | grep sweech

# 2. Add to PATH if missing
echo 'export PATH="$HOME/.sweech/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc

# 3. Check wrapper scripts are executable
ls -l ~/.sweech/bin/
chmod +x ~/.sweech/bin/*

# 4. Verify configs
sweech list
cat ~/.sweech/config.json
```

## Example Use Cases

### 1. Setting Up a New Work Computer

```bash
# Transfer backup from personal computer
sweech restore work-setup.zip
```

### 2. Disaster Recovery

```bash
# Weekly backup script
#!/bin/bash
DATE=$(date +%Y%m%d)
sweech backup -o ~/backups/sweech-$DATE.zip
```

### 3. Team Sharing (Advanced)

Share provider configurations with team (be careful with API keys!):

```bash
# Create backup
sweech backup -o team-providers.zip

# Share encrypted file + password securely
# Team members restore on their machines
```

### 4. Testing New Configurations

```bash
# Backup current setup before experimenting
sweech backup -o before-changes.zip

# Try new configurations
sweech add
# ... make changes ...

# Restore if something breaks
sweech restore before-changes.zip
```

## Security Notes

⚠️ **Important Security Information:**

1. **Backups contain API keys** - Treat backup files as sensitive
2. **Password strength matters** - Use strong, unique passwords
3. **Don't share passwords** - Send passwords through separate secure channels
4. **Encryption is strong** - AES-256 with PBKDF2 key derivation
5. **No password recovery** - If you forget the password, the backup is unrecoverable

## Technical Details

- **Encryption:** AES-256-CBC
- **Key derivation:** PBKDF2 (100,000 iterations)
- **Compression:** ZIP level 9
- **File format:** Encrypted ZIP (not directly readable)

---

Back to [README](README.md) | [Quick Start](QUICK_START.md)
