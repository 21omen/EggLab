# EggLab host integration contract

## 1. Minimum host functions
To realize progressive disclosure, implement a read-only allowlisted resolver. Conceptual interface (not an existing EggLab tool):

```text
knowledge.list_skill_metadata() -> [{name, description, path}]
knowledge.read_skill(name) -> text
knowledge.read_reference(path) -> text
knowledge.get_manifest() -> parsed manifest
```

Do not tell the model these functions exist until the host exposes them.

## 2. Path safety
- Resolve every requested path against one configured `knowledge_root` and normalize it before checking.
- Reject `..`, absolute paths outside root, drive changes, UNC paths, symlink escapes and paths not listed in the manifest.
- Read text only; no write, execute, import, shell, network or arbitrary file browsing.
- Allow only `.md`, `.yaml`, `.yml`, `.txt`; enforce size limits.
- Return compact errors (`not_found`, `not_allowlisted`, `too_large`, `unsupported_type`).
- Record package version/hash to invalidate stale cached content.

## 3. Context strategy
Startup: `AGENT.md`, `ROUTER.md`, skill metadata only. After classification: selected skill bodies. During execution: only reference required for the next concrete decision. For long tasks: compact job state, not the full history of every tool payload.

## 4. Tool contract
EggLab tools remain the production action interface. Host should expose accurate schemas, concise outputs, stable error types and operation/job IDs when possible. For long renders, expose job status rather than forcing the model to infer whether a slow first load is a hang.

## 5. Safe mutation
- Reading approved knowledge: no approval needed.
- Creating new project/document: allowed when requested.
- Editing existing user document: preserve originals; use duplicates/new layers.
- Overwrite, flatten, delete, merge, destructive mask apply or removing source content: explicit approval for that specific action.
- Saving to a new output path: normal requested operation.
- Exporting: confirm destination and result.

## 6. Observability
Record run_id, package/runtime/model version; task classification/profile; skill/reference paths and hashes; sanitized tool names/args/status/timing; render IDs/seeds/dimensions/mode; errors/retries/partial success; audit metrics; final project/export paths; user revision/acceptance. Minimize storage of private prompts/images and provide retention/deletion controls.
