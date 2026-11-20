/**
 * Platform helpers. Windows behaviour is unchanged; everything else (Linux,
 * and anything POSIX-shaped) gets the equivalent without PowerShell, taskkill,
 * where.exe or curl.exe.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';

export const IS_WIN = process.platform === 'win32';

/** `name` with `.exe` on Windows, bare elsewhere. */
export function exeName(name) {
  return IS_WIN ? `${name}.exe` : name;
}

/** The stable-diffusion.cpp CLI file name. */
export const SD_CLI = exeName('sd-cli');

/** curl binary (Windows ships curl.exe; `curl` there can be a PowerShell alias). */
export const CURL = IS_WIN ? 'curl.exe' : 'curl';

/**
 * curl flags that only exist on Windows' schannel build. Passing
 * --ssl-no-revoke to an OpenSSL curl is an error on older versions.
 */
export function curlTlsArgs() {
  return IS_WIN ? ['--ssl-no-revoke'] : [];
}

/** All descendant pids of `pid` (POSIX, via /proc). */
function descendants(pid) {
  const children = new Map();
  let entries = [];
  try {
    entries = fs.readdirSync('/proc');
  } catch {
    return [];
  }
  for (const name of entries) {
    if (!/^\d+$/.test(name)) continue;
    try {
      const stat = fs.readFileSync(`/proc/${name}/stat`, 'utf8');
      // Field 4 (ppid) follows the parenthesised command, which may contain spaces.
      const rest = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
      const ppid = Number(rest[1]);
      if (!children.has(ppid)) children.set(ppid, []);
      children.get(ppid).push(Number(name));
    } catch {}
  }
  const out = [];
  const walk = (p) => {
    for (const c of children.get(p) || []) {
      out.push(c);
      walk(c);
    }
  };
  walk(Number(pid));
  return out;
}

/** Kill a process and everything it started. Safe when it already exited. */
export function killTree(pid) {
  if (!pid) return;
  if (IS_WIN) {
    try {
      spawn('taskkill', ['/pid', String(pid), '/t', '/f'], { windowsHide: true, stdio: 'ignore' });
    } catch {}
    return;
  }
  // Children first, so nothing is re-parented to init and survives.
  for (const child of descendants(pid).reverse()) {
    try {
      process.kill(child, 'SIGKILL');
    } catch {}
  }
  try {
    process.kill(Number(pid), 'SIGKILL');
  } catch {}
}

/**
 * Kill every running copy of an executable. On Windows by image name (the
 * historic behaviour); elsewhere only processes whose binary is exactly
 * `exePath`, so an unrelated sd-cli from another tool is never touched.
 */
export function killByExecutable(exePath) {
  if (IS_WIN) {
    try {
      spawn('taskkill', ['/F', '/IM', path.basename(exePath), '/T'], {
        windowsHide: true,
        stdio: 'ignore',
      }).unref?.();
    } catch {}
    return;
  }
  let target = '';
  try {
    target = fs.realpathSync(exePath);
  } catch {
    return;
  }
  let entries = [];
  try {
    entries = fs.readdirSync('/proc');
  } catch {
    return;
  }
  for (const name of entries) {
    if (!/^\d+$/.test(name) || Number(name) === process.pid) continue;
    try {
      if (fs.readlinkSync(`/proc/${name}/exe`) === target) process.kill(Number(name), 'SIGKILL');
    } catch {}
  }
}

/** Every match of `cmd` on PATH (where.exe on Windows, a PATH walk elsewhere). */
export function whichAll(cmd) {
  if (IS_WIN) {
    try {
      const out = execFileSync('where.exe', [cmd], { windowsHide: true, encoding: 'utf8', timeout: 5000 });
      return String(out).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    } catch {
      return [];
    }
  }
  const hits = [];
  for (const dir of String(process.env.PATH || '').split(path.delimiter)) {
    if (!dir) continue;
    const file = path.join(dir, cmd);
    try {
      fs.accessSync(file, fs.constants.X_OK);
      if (fs.statSync(file).isFile() && !hits.includes(file)) hits.push(file);
    } catch {}
  }
  return hits;
}

/**
 * Per-user folders for the packaged app. Windows keeps %APPDATA% (roaming,
 * small) and %LOCALAPPDATA% (large, never roams); Linux follows XDG: config
 * and chats under $XDG_CONFIG_HOME, engine/models/bin under $XDG_DATA_HOME.
 */
export function userDirs(appName = 'EggLab') {
  const home = os.homedir();
  if (IS_WIN) {
    return {
      data: path.join(process.env.APPDATA || path.join(home, 'AppData', 'Roaming'), appName),
      local: path.join(process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local'), appName),
    };
  }
  const slug = appName.toLowerCase();
  return {
    data: path.join(process.env.XDG_CONFIG_HOME || path.join(home, '.config'), slug),
    local: path.join(process.env.XDG_DATA_HOME || path.join(home, '.local', 'share'), slug),
  };
}

/**
 * Environment for spawning PhotoCraft and photocraft-cli. Other tools on the
 * same machine may export PHOTOCRAFT_CONTROL_* variables for their own
 * connection; EggLab passes its port and token file explicitly and must not
 * inherit someone else's defaults.
 */
export function photocraftEnv() {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (/^PHOTOCRAFT_CONTROL_/i.test(key)) delete env[key];
  }
  return env;
}
