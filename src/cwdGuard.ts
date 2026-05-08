try {
  process.cwd();
} catch {
  process.chdir(require('os').homedir());
}
