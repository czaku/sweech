import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import chalk from 'chalk';

export interface AgentRecord {
  name: string;
  source: 'user' | 'builtin';
  profiles: Set<string>;
  invocations: number;
  lastTs: number | null;
}

export interface ConfigDir { label: string; dir: string; }

export function enumerateClaudeConfigDirs(home: string = os.homedir()): ConfigDir[] {
  let entries: string[];
  try { entries = fs.readdirSync(home); } catch { return []; }
  return entries
    .filter(n => /^\.claude(-.*)?$/.test(n))
    .map(n => ({ label: n.replace(/^\./, ''), dir: path.join(home, n) }))
    .filter(({ dir }) => {
      try { return fs.statSync(dir).isDirectory(); } catch { return false; }
    });
}

export function readUserAgents(dir: string): string[] {
  const agentsDir = path.join(dir, 'agents');
  try {
    return fs.readdirSync(agentsDir).filter(f => f.endsWith('.md')).map(f => f.replace(/\.md$/, ''));
  } catch { return []; }
}

export function scanSessionsForSubagents(dir: string, sinceMs: number): Map<string, { count: number; lastTs: number }> {
  const out = new Map<string, { count: number; lastTs: number }>();
  const projectsDir = path.join(dir, 'projects');
  let projects: string[];
  try { projects = fs.readdirSync(projectsDir); } catch { return out; }
  for (const proj of projects) {
    const sessionsDir = path.join(projectsDir, proj);
    let names: string[];
    try { names = fs.readdirSync(sessionsDir); } catch { continue; }
    for (const fname of names) {
      if (!fname.endsWith('.jsonl')) continue;
      const fpath = path.join(sessionsDir, fname);
      let stat: fs.Stats;
      try { stat = fs.statSync(fpath); } catch { continue; }
      if (stat.mtimeMs < sinceMs) continue;
      let content: string;
      try { content = fs.readFileSync(fpath, 'utf-8'); } catch { continue; }
      for (const line of content.split('\n')) {
        if (!line.includes('subagent_type')) continue;
        let obj: any;
        try { obj = JSON.parse(line); } catch { continue; }
        const ts = Date.parse(obj.timestamp || '');
        if (!ts || ts < sinceMs) continue;
        const items = obj.message?.content;
        if (!Array.isArray(items)) continue;
        for (const it of items) {
          if (it.type !== 'tool_use') continue;
          if (it.name !== 'Agent' && it.name !== 'Task') continue;
          const name = it.input?.subagent_type;
          if (!name) continue;
          const prev = out.get(name) ?? { count: 0, lastTs: 0 };
          prev.count++;
          if (ts > prev.lastTs) prev.lastTs = ts;
          out.set(name, prev);
        }
      }
    }
  }
  return out;
}

export function aggregate(windowDays: number, dirs?: ConfigDir[]): AgentRecord[] {
  const sinceMs = Date.now() - windowDays * 86_400_000;
  const sources = dirs ?? enumerateClaudeConfigDirs();
  const records = new Map<string, AgentRecord>();

  for (const { label, dir } of sources) {
    for (const name of readUserAgents(dir)) {
      let r = records.get(name);
      if (!r) { r = { name, source: 'user', profiles: new Set(), invocations: 0, lastTs: null }; records.set(name, r); }
      r.profiles.add(label);
    }
    const sub = scanSessionsForSubagents(dir, sinceMs);
    for (const [name, { count, lastTs }] of sub) {
      let r = records.get(name);
      if (!r) { r = { name, source: 'builtin', profiles: new Set(), invocations: 0, lastTs: null }; records.set(name, r); }
      r.invocations += count;
      if (r.lastTs === null || lastTs > r.lastTs) r.lastTs = lastTs;
      r.profiles.add(label);
    }
  }

  return [...records.values()].sort((a, b) => {
    if (b.invocations !== a.invocations) return b.invocations - a.invocations;
    return (b.lastTs ?? 0) - (a.lastTs ?? 0);
  });
}

function timeAgo(ms: number | null): string {
  if (ms === null) return chalk.dim('never');
  const diff = Date.now() - ms;
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

export function render(records: AgentRecord[], windowDays: number, dirCount: number): string {
  const lines: string[] = [];
  lines.push(chalk.bold(`sweech agents`) + chalk.dim(` — ${records.length} agents across ${dirCount} profile dir(s), ${windowDays}d window`));
  lines.push('');

  if (records.length === 0) {
    lines.push(chalk.dim('  no agents configured and no recent invocations'));
    return lines.join('\n');
  }

  const fmtProfs = (set: Set<string>): string => {
    const sorted = [...set].sort();
    if (sorted.length <= 3) return sorted.join(', ');
    return `${sorted.slice(0, 2).join(', ')} +${sorted.length - 2} more`;
  };

  const widthName = Math.max(5, ...records.map(r => r.name.length));
  const widthProf = Math.max(8, ...records.map(r => fmtProfs(r.profiles).length));
  const header =
    '  ' +
    chalk.dim('AGENT'.padEnd(widthName)) + '  ' +
    chalk.dim('SRC    ') + '  ' +
    chalk.dim('PROFILES'.padEnd(widthProf)) + '  ' +
    chalk.dim('USED'.padStart(5)) + '  ' +
    chalk.dim('LAST');
  lines.push(header);

  for (const r of records) {
    const src = r.source === 'user' ? chalk.green('user   ') : chalk.cyan('builtin');
    const profs = fmtProfs(r.profiles);
    const used = r.invocations > 0 ? chalk.bold(String(r.invocations).padStart(5)) : chalk.dim('    0');
    lines.push(
      '  ' +
      r.name.padEnd(widthName) + '  ' +
      src + '  ' +
      profs.padEnd(widthProf) + '  ' +
      used + '  ' +
      timeAgo(r.lastTs)
    );
  }
  return lines.join('\n');
}

export function runAggregatedAgents(windowDays = 7): void {
  const dirs = enumerateClaudeConfigDirs();
  const records = aggregate(windowDays, dirs);
  console.log(render(records, windowDays, dirs.length));
}
