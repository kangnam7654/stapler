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
#[napi(js_name = "scanWorkspaceSkillsAsync")]
pub fn scan_workspace_skills_async(
    company_id: String,
    workspace_cwd: String,
) -> AsyncTask<ScanWorkspaceTask> {
    AsyncTask::new(ScanWorkspaceTask {
        company_id,
        workspace_cwd: PathBuf::from(workspace_cwd),
    })
}
