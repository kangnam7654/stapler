//! napi-rs bindings exposing `scan_workspace_skills` to Node.js.
//!
//! The scan is blocking file I/O, so it runs on libuv's thread pool
//! via `AsyncTask` to avoid blocking the JS event loop. The return
//! value is a JSON string to sidestep napi type mapping for nested
//! structs/enums — the TS adapter parses it.
//!
//! Exported functions:
//!
//! - `scanWorkspaceSkillsAsync(companyId, workspaceCwd) -> Promise<string>`

use std::path::PathBuf;

use napi::bindgen_prelude::AsyncTask;
use napi::{Env, Error, Result, Status, Task};
use napi_derive::napi;

use crate::scan::scan_workspace_skills;

/// Blocked system directory prefixes that should never be scanned.
#[cfg(unix)]
const BLOCKED_PREFIXES: &[&str] = &["/etc", "/proc", "/sys", "/dev", "/var/run"];
#[cfg(not(unix))]
const BLOCKED_PREFIXES: &[&str] = &[];

/// Blocking scan wrapped as an `AsyncTask` — runs on the libuv thread pool.
pub struct ScanWorkspaceTask {
    company_id: String,
    workspace_cwd: PathBuf,
}

impl Task for ScanWorkspaceTask {
    type Output = String;
    type JsValue = String;

    fn compute(&mut self) -> Result<Self::Output> {
        let result = scan_workspace_skills(&self.company_id, &self.workspace_cwd);
        serde_json::to_string(&result).map_err(|e| {
            Error::new(
                Status::GenericFailure,
                format!("skills-scanner: json serialize failed: {e}"),
            )
        })
    }

    fn resolve(&mut self, _env: Env, output: Self::Output) -> Result<Self::JsValue> {
        Ok(output)
    }
}

/// napi entry point. Returns a `Promise<string>` to JS.
///
/// The string is JSON of the Rust `WorkspaceScanResult` struct
/// (snake_case field names). The TS adapter parses and remaps to
/// camelCase `ImportedSkill`.
///
/// Validates that `workspace_cwd` is a real directory and not a
/// restricted system path before starting the scan.
#[napi(js_name = "scanWorkspaceSkillsAsync")]
pub fn scan_workspace_skills_async(
    company_id: String,
    workspace_cwd: String,
) -> Result<AsyncTask<ScanWorkspaceTask>> {
    let path = PathBuf::from(&workspace_cwd);

    // Must be an existing directory
    if !path.is_dir() {
        return Err(Error::new(
            Status::InvalidArg,
            format!("workspace_cwd is not a directory: {workspace_cwd}"),
        ));
    }

    // Reject sensitive system directories
    let canonical = std::fs::canonicalize(&path).unwrap_or_else(|_| path.clone());
    let canon_str = canonical.to_string_lossy();
    for prefix in BLOCKED_PREFIXES {
        if canon_str.starts_with(prefix) {
            return Err(Error::new(
                Status::InvalidArg,
                "workspace_cwd points to a restricted system directory".to_string(),
            ));
        }
    }

    Ok(AsyncTask::new(ScanWorkspaceTask {
        company_id,
        workspace_cwd: canonical,
    }))
}
