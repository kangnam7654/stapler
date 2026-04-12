use serde::Deserialize;

#[derive(Debug, Deserialize)]
pub struct AdapterEntry {
    pub name: String,
    #[serde(rename = "type")]
    #[allow(dead_code)]
    pub adapter_type: String,
    pub probe: AdapterProbe,
    pub models: Vec<AdapterModel>,
}

#[derive(Debug, Deserialize)]
pub struct AdapterModel {
    pub id: String,
    #[allow(dead_code)]
    pub label: String,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "kind")]
pub enum AdapterProbe {
    #[serde(rename = "cli")]
    Cli { command: String, #[allow(dead_code)] style: String },
    #[serde(rename = "http")]
    Http { url: String, #[allow(dead_code)] style: String },
    #[serde(rename = "skip")]
    Skip { reason: String },
}
