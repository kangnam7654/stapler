//! Project and agent mention processing utilities ported from TypeScript.

use regex::Regex;
use url::Url;
use std::collections::HashSet;
use std::sync::OnceLock;

pub const PROJECT_MENTION_SCHEME: &str = "project://";
pub const AGENT_MENTION_SCHEME: &str = "agent://";

static HEX_COLOR_RE: OnceLock<Regex> = OnceLock::new();
static HEX_COLOR_SHORT_RE: OnceLock<Regex> = OnceLock::new();
static HEX_COLOR_WITH_HASH_RE: OnceLock<Regex> = OnceLock::new();
static HEX_COLOR_SHORT_WITH_HASH_RE: OnceLock<Regex> = OnceLock::new();
static PROJECT_MENTION_LINK_RE: OnceLock<Regex> = OnceLock::new();
static AGENT_MENTION_LINK_RE: OnceLock<Regex> = OnceLock::new();
static AGENT_ICON_NAME_RE: OnceLock<Regex> = OnceLock::new();

fn get_hex_color_re() -> &'static Regex {
    HEX_COLOR_RE.get_or_init(|| Regex::new(r"^[0-9a-f]{6}$").unwrap())
}
fn get_hex_color_short_re() -> &'static Regex {
    HEX_COLOR_SHORT_RE.get_or_init(|| Regex::new(r"^[0-9a-f]{3}$").unwrap())
}
fn get_hex_color_with_hash_re() -> &'static Regex {
    HEX_COLOR_WITH_HASH_RE.get_or_init(|| Regex::new(r"^#[0-9a-f]{6}$").unwrap())
}
fn get_hex_color_short_with_hash_re() -> &'static Regex {
    HEX_COLOR_SHORT_WITH_HASH_RE.get_or_init(|| Regex::new(r"^#[0-9a-f]{3}$").unwrap())
}
fn get_project_mention_link_re() -> &'static Regex {
    PROJECT_MENTION_LINK_RE.get_or_init(|| Regex::new(r"(?i)\[[^\]]*]\((project://[^)\s]+)\)").unwrap())
}
fn get_agent_mention_link_re() -> &'static Regex {
    AGENT_MENTION_LINK_RE.get_or_init(|| Regex::new(r"(?i)\[[^\]]*]\((agent://[^)\s]+)\)").unwrap())
}
fn get_agent_icon_name_re() -> &'static Regex {
    AGENT_ICON_NAME_RE.get_or_init(|| Regex::new(r"(?i)^[a-z0-9-]+$").unwrap())
}

#[derive(Debug, PartialEq, Eq)]
pub struct ParsedProjectMention {
    pub project_id: String,
    pub color: Option<String>,
}

#[derive(Debug, PartialEq, Eq)]
pub struct ParsedAgentMention {
    pub agent_id: String,
    pub icon: Option<String>,
}

pub fn normalize_hex_color(input: Option<String>) -> Option<String> {
    let s = input?.trim().to_lowercase();
    if s.is_empty() {
        return None;
    }

    if get_hex_color_with_hash_re().is_match(&s) {
        return Some(s);
    }
    if get_hex_color_re().is_match(&s) {
        return Some(format!("#{}", s));
    }
    if get_hex_color_short_with_hash_re().is_match(&s) {
        let raw = &s[1..];
        let r = &raw[0..1];
        let g = &raw[1..2];
        let b = &raw[2..3];
        return Some(format!("#{0}{0}{1}{1}{2}{2}", r, g, b));
    }
    if get_hex_color_short_re().is_match(&s) {
        let r = &s[0..1];
        let g = &s[1..2];
        let b = &s[2..3];
        return Some(format!("#{0}{0}{1}{1}{2}{2}", r, g, b));
    }
    None
}

pub fn normalize_agent_icon(input: Option<String>) -> Option<String> {
    let s = input?.trim().to_lowercase();
    if s.is_empty() || !get_agent_icon_name_re().is_match(&s) {
        return None;
    }
    Some(s)
}

pub fn build_project_mention_href(project_id: &str, color: Option<String>) -> String {
    let trimmed = project_id.trim();
    let norm_color = normalize_hex_color(color);
    match norm_color {
        Some(c) => format!("{}{}/?c={}", PROJECT_MENTION_SCHEME, trimmed, urlencoding::encode(&c[1..])),
        None => format!("{}{}", PROJECT_MENTION_SCHEME, trimmed),
    }
}

pub fn parse_project_mention_href(href: &str) -> Option<ParsedProjectMention> {
    if !href.to_lowercase().starts_with(PROJECT_MENTION_SCHEME) {
        return None;
    }

    let url = Url::parse(href).ok()?;
    if url.scheme() != "project" {
        return None;
    }

    let project_id = format!("{}{}", url.host_str().unwrap_or(""), url.path())
        .trim_matches('/')
        .trim()
        .to_string();

    if project_id.is_empty() {
        return None;
    }

    let color_param = url.query_pairs()
        .find(|(k, _)| k == "c" || k == "color")
        .map(|(_, v)| v.into_owned());

    Some(ParsedProjectMention {
        project_id,
        color: normalize_hex_color(color_param),
    })
}

pub fn build_agent_mention_href(agent_id: &str, icon: Option<String>) -> String {
    let trimmed = agent_id.trim();
    let norm_icon = normalize_agent_icon(icon);
    match norm_icon {
        Some(i) => format!("{}{}/?i={}", AGENT_MENTION_SCHEME, trimmed, urlencoding::encode(&i)),
        None => format!("{}{}", AGENT_MENTION_SCHEME, trimmed),
    }
}

pub fn parse_agent_mention_href(href: &str) -> Option<ParsedAgentMention> {
    if !href.to_lowercase().starts_with(AGENT_MENTION_SCHEME) {
        return None;
    }

    let url = Url::parse(href).ok()?;
    if url.scheme() != "agent" {
        return None;
    }

    let agent_id = format!("{}{}", url.host_str().unwrap_or(""), url.path())
        .trim_matches('/')
        .trim()
        .to_string();

    if agent_id.is_empty() {
        return None;
    }

    let icon_param = url.query_pairs()
        .find(|(k, _)| k == "i" || k == "icon")
        .map(|(_, v)| v.into_owned());

    Some(ParsedAgentMention {
        agent_id,
        icon: normalize_agent_icon(icon_param),
    })
}

pub fn extract_project_mention_ids(markdown: &str) -> Vec<String> {
    if markdown.is_empty() {
        return vec![];
    }
    let mut ids = HashSet::new();
    let re = get_project_mention_link_re();
    for cap in re.captures_iter(markdown) {
        if let Some(href) = cap.get(1) {
            if let Some(parsed) = parse_project_mention_href(href.as_str()) {
                ids.insert(parsed.project_id);
            }
        }
    }
    let mut result: Vec<String> = ids.into_iter().collect();
    result.sort();
    result
}

pub fn extract_agent_mention_ids(markdown: &str) -> Vec<String> {
    if markdown.is_empty() {
        return vec![];
    }
    let mut ids = HashSet::new();
    let re = get_agent_mention_link_re();
    for cap in re.captures_iter(markdown) {
        if let Some(href) = cap.get(1) {
            if let Some(parsed) = parse_agent_mention_href(href.as_str()) {
                ids.insert(parsed.agent_id);
            }
        }
    }
    let mut result: Vec<String> = ids.into_iter().collect();
    result.sort();
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_normalize_hex_color() {
        assert_eq!(normalize_hex_color(Some("FF0000".into())), Some("#ff0000".into()));
        assert_eq!(normalize_hex_color(Some("#f00".into())), Some("#ff0000".into()));
        assert_eq!(normalize_hex_color(Some("invalid".into())), None);
    }

    #[test]
    fn test_project_mention_href() {
        let href = build_project_mention_href("my-proj", Some("f00".into()));
        // Note: URL parsing might add trailing slash if path is empty, we handle it in parser
        
        let parsed = parse_project_mention_href(&href).unwrap();
        assert_eq!(parsed.project_id, "my-proj");
        assert_eq!(parsed.color, Some("#ff0000".into()));
    }

    #[test]
    fn test_agent_mention_href() {
        let href = build_agent_mention_href("agent-123", Some("bot".into()));
        
        let parsed = parse_agent_mention_href(&href).unwrap();
        assert_eq!(parsed.agent_id, "agent-123");
        assert_eq!(parsed.icon, Some("bot".into()));
    }

    #[test]
    fn test_extract_mentions() {
        let markdown = "Check [Project](project://p1) and [Other](project://p2?c=aabbcc). Also [Agent](agent://a1).";
        let p_ids = extract_project_mention_ids(markdown);
        assert_eq!(p_ids, vec!["p1".to_string(), "p2".to_string()]);
        
        let a_ids = extract_agent_mention_ids(markdown);
        assert_eq!(a_ids, vec!["a1".to_string()]);
    }
}
