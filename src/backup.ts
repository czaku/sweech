/**
 * Backup and restore functionality for sweetch configurations
 * Creates password-protected ZIP files containing all profiles and settings
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import archiver from 'archiver';
import unzipper from 'unzipper';
import inquirer from 'inquirer';
import chalk from 'chalk';
import { ConfigManager } from './config';

const ENCRYPTION_ALGORITHM = 'aes-256-cbc';
const SALT_LENGTH = 32;
const IV_LENGTH = 16;

/**
 * Encrypt data with password
 */
function encrypt(data: Buffer, password: string): Buffer {
  const salt = crypto.randomBytes(SALT_LENGTH);
  const key = crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256');
  const iv = crypto.randomBytes(IV_LENGTH);

  const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);

  // Combine salt + iv + encrypted data
  return Buffer.concat([salt, iv, encrypted]);
}

/**
 * Decrypt data with password
 */
function decrypt(data: Buffer, password: string): Buffer {
  const salt = data.slice(0, SALT_LENGTH);
  const iv = data.slice(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
  const encrypted = data.slice(SALT_LENGTH + IV_LENGTH);

  const key = crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256');

  const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, key, iv);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]);
}

/**
 * Create a backup of the sweetch configuration
 */
export async function backupSweetch(outputFile?: string): Promise<void> {
  const config = new ConfigManager();
  const profiles = config.getProfiles();

  if (profiles.length === 0) {
    console.log(chalk.yellow('\n⚠️  No providers configured. Nothing to backup.\n'));
    return;
  }

  // Ask for password
  const { password } = await inquirer.prompt([
    {
      type: 'password',
      name: 'password',
      message: 'Enter password to encrypt backup:',
      mask: '*',
      validate: (input: string) => {
        if (!input || input.length < 6) {
          return 'Password must be at least 6 characters';
        }
        return true;
      }
    }
  ]);

  const { confirmPassword } = await inquirer.prompt([
    {
      type: 'password',
      name: 'confirmPassword',
      message: 'Confirm password:',
      mask: '*',
      validate: (input: string) => {
        if (input !== password) {
          return 'Passwords do not match';
        }
        return true;
      }
    }
  ]);

  // Generate output filename
  const timestamp = new Date().toISOString().split('T')[0].replace(/-/g, '');
  const defaultOutput = `sweetch-backup-${timestamp}.zip`;
  const finalOutput = outputFile || defaultOutput;

  console.log(chalk.cyan('\n🍭 Creating backup...\n'));

  // Create temporary unencrypted zip
  const tempZip = path.join('/tmp', `sweetch-temp-${Date.now()}.zip`);

  const output = fs.createWriteStream(tempZip);
  const archive = archiver('zip', {
    zlib: { level: 9 }
  });

  output.on('close', async () => {
    try {
      // Encrypt the zip file
      const zipData = fs.readFileSync(tempZip);
      const encrypted = encrypt(zipData, password);
      fs.writeFileSync(finalOutput, encrypted);

      // Clean up temp file
      fs.unlinkSync(tempZip);

      console.log(chalk.green('✓ Backup created successfully!\n'));
      console.log(chalk.cyan('File:'), path.resolve(finalOutput));
      console.log(chalk.cyan('Size:'), (encrypted.length / 1024).toFixed(2) + ' KB');
      console.log(chalk.cyan('Profiles:'), profiles.length);
      console.log();
      console.log(chalk.yellow('⚠️  Keep this backup and password safe!'));
      console.log(chalk.yellow('   You\'ll need them to restore on a new machine.\n'));
    } catch (error: any) {
      console.error(chalk.red('Encryption failed:'), error.message);
      if (fs.existsSync(tempZip)) {
        fs.unlinkSync(tempZip);
      }
      throw error;
    }
  });

  archive.on('error', (err) => {
    throw err;
  });

  archive.pipe(output);

  // Add all profiles
  archive.directory(config.getProfilesDir(), 'profiles');

  // Add config file
  archive.file(config.getConfigFile(), { name: 'config.json' });

  // Add bin directory (wrapper scripts)
  archive.directory(config.getBinDir(), 'bin');

  await archive.finalize();
}

/**
 * Restore sweetch configuration from a backup
 */
export async function restoreSweetch(backupFile: string): Promise<void> {
  if (!fs.existsSync(backupFile)) {
    throw new Error(`Backup file not found: ${backupFile}`);
  }

  const config = new ConfigManager();
  const existingProfiles = config.getProfiles();

  // Warn if there are existing profiles
  if (existingProfiles.length > 0) {
    console.log(chalk.yellow('\n⚠️  Warning: You have existing providers configured:'));
    existingProfiles.forEach(p => {
      console.log(chalk.gray(`   - ${p.commandName}`));
    });
    console.log();

    const { confirmOverwrite } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirmOverwrite',
        message: 'This will overwrite existing configurations. Continue?',
        default: false
      }
    ]);

    if (!confirmOverwrite) {
      console.log(chalk.yellow('Cancelled'));
      return;
    }
  }

  // Ask for password
  const { password } = await inquirer.prompt([
    {
      type: 'password',
      name: 'password',
      message: 'Enter backup password:',
      mask: '*',
      validate: (input: string) => {
        if (!input) {
          return 'Password is required';
        }
        return true;
      }
    }
  ]);

  console.log(chalk.cyan('\n🍭 Restoring backup...\n'));

  try {
    // Decrypt the backup
    const encryptedData = fs.readFileSync(backupFile);
    const decryptedData = decrypt(encryptedData, password);

    // Write decrypted zip to temp file
    const tempZip = path.join('/tmp', `sweetch-restore-${Date.now()}.zip`);
    fs.writeFileSync(tempZip, decryptedData);

    // Extract zip to config directory
    const configDir = config.getConfigDir();

    await fs.createReadStream(tempZip)
      .pipe(unzipper.Extract({ path: configDir }))
      .promise();

    // Make all bin scripts executable
    const binDir = config.getBinDir();
    if (fs.existsSync(binDir)) {
      const files = fs.readdirSync(binDir);
      files.forEach(file => {
        const filePath = path.join(binDir, file);
        fs.chmodSync(filePath, 0o755);
      });
    }

    // Clean up temp file
    fs.unlinkSync(tempZip);

    const restoredProfiles = config.getProfiles();

    console.log(chalk.green('✓ Backup restored successfully!\n'));
    console.log(chalk.cyan('Profiles restored:'), restoredProfiles.length);
    restoredProfiles.forEach(p => {
      console.log(chalk.gray(`   - ${p.commandName}`));
    });
    console.log();
    console.log(chalk.yellow('⚠️  Make sure ~/.sweech/bin is in your PATH:'));
    console.log(chalk.gray(`   export PATH="${binDir}:$PATH"`));
    console.log();

  } catch (error: any) {
    if (error.message.includes('Bad decrypt')) {
      throw new Error('Incorrect password or corrupted backup file');
    }
    throw error;
  }
}
