/**
 * Asset registry (Phase D).
 *
 * Every finished render/edit becomes an immutable asset record: the panel can
 * show a chat's outputs as a tray of thumbnails and place any of them back
 * into a canvas without re-rendering. Assets belong to the chat that made
 * them; the canvas they landed on is just a link.
 */
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR, readJson, writeJson, uid } from './paths.mjs';

const ASSETS_FILE = path.join(DATA_DIR, 'assets.json');
const MAX_ASSETS = 500;

function loadAssets() {
  const data = readJson(ASSETS_FILE, null);
  if (data && typeof data === 'object' && !Array.isArray(data)) return data;
  return {};
}

let assets = loadAssets();

function save() {
  writeJson(ASSETS_FILE, assets);
}

/**
 * Record one finished render/edit. One asset per finished job: repeated job
 * cards upserts never duplicate. Missing/ vanished files are refused — an
 * asset always points at real pixels.
 */
export function recordAsset({
  threadId,
  docKey = null,
  path: file,
  kind = 'render',
  prompt = null,
  seed = null,
  jobId = null,
  parents = [],
} = {}) {
  if (!file || !fs.existsSync(file)) return null;
  if (jobId) {
    const existing = Object.values(assets).find((a) => a.jobId === jobId);
    if (existing) return existing;
  }
  const id = uid('asset');
  assets[id] = {
    id,
    threadId: threadId || null,
    docKey: docKey || null,
    path: file,
    kind: kind === 'edit' ? 'edit' : 'render',
    prompt: prompt ? String(prompt).slice(0, 400) : null,
    seed: seed === null || seed === undefined ? null : Number(seed),
    jobId: jobId || null,
    parents: Array.isArray(parents) ? parents.slice(0, 10) : [],
    createdAt: Date.now(),
  };
  // Keep the newest MAX_ASSETS records; the files themselves are untouched.
  const oldest = Object.values(assets)
    .sort((a, b) => a.createdAt - b.createdAt)
    .slice(0, Math.max(0, Object.keys(assets).length - MAX_ASSETS));
  for (const gone of oldest) delete assets[gone.id];
  save();
  return assets[id];
}

/** A chat's assets, newest first. */
export function assetsForChat(threadId, limit = 60) {
  return Object.values(assets)
    .filter((a) => a.threadId === threadId)
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, limit);
}

export function assetFor(id) {
  return assets[id] || null;
}
