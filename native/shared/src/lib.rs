//! Native shared utilities exported to Node.js via napi-rs.

use napi_derive::napi;

#[napi]
pub fn version() -> String {
    "0.1.0".to_string()
}
