//! Minimal YAML frontmatter parser.
//!
//! Ports the hand-rolled frontmatter parser from company-skills.ts
//! (`parseFrontmatterMarkdown`, `parseYamlFrontmatter`, `parseYamlBlock`).
//!
//! This intentionally avoids a full YAML crate to match the behaviour of the
//! original TypeScript implementation exactly (same subset of YAML syntax).

use serde_json::Value;

/// Parsed result of a skill markdown file.
#[derive(Debug, Clone)]
pub struct ParsedSkillDoc {
    pub frontmatter: serde_json::Map<String, Value>,
    pub body: String,
}

/// Parses `---\n…\n---\n` frontmatter from a markdown string.
///
/// If the content doesn't start with `---\n` (or the closing `\n---\n` is
/// missing) the whole content is treated as body with empty frontmatter.
pub fn parse_frontmatter_markdown(raw: &str) -> ParsedSkillDoc {
    let normalized = raw.replace("\r\n", "\n");

    if !normalized.starts_with("---\n") {
        return ParsedSkillDoc {
            frontmatter: serde_json::Map::new(),
            body: normalized.trim().to_string(),
        };
    }

    let Some(closing) = normalized[4..].find("\n---\n") else {
        return ParsedSkillDoc {
            frontmatter: serde_json::Map::new(),
            body: normalized.trim().to_string(),
        };
    };
    let closing = closing + 4; // adjust for the initial `4..` slice

    let frontmatter_raw = normalized[4..closing].trim();
    let body = normalized[closing + 5..].trim().to_string();

    ParsedSkillDoc {
        frontmatter: parse_yaml_frontmatter(frontmatter_raw),
        body,
    }
}

// ── Internal YAML parser ────────────────────────────────────────────────────

#[derive(Debug)]
struct YamlLine {
    indent: usize,
    content: String,
}

fn prepare_yaml_lines(raw: &str) -> Vec<YamlLine> {
    raw.split('\n')
        .filter_map(|line| {
            let content = line.trim().to_string();
            if content.is_empty() || content.starts_with('#') {
                return None;
            }
            let indent = line.chars().take_while(|c| *c == ' ').count();
            Some(YamlLine { indent, content })
        })
        .collect()
}

fn parse_yaml_scalar(raw: &str) -> Value {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Value::String(String::new());
    }
    match trimmed {
        "null" | "~" => return Value::Null,
        "true" => return Value::Bool(true),
        "false" => return Value::Bool(false),
        "[]" => return Value::Array(vec![]),
        "{}" => return Value::Object(Default::default()),
        _ => {}
    }

    // Numeric
    if let Ok(n) = trimmed.parse::<i64>() {
        return Value::Number(n.into());
    }
    if let Ok(f) = trimmed.parse::<f64>() {
        if let Some(n) = serde_json::Number::from_f64(f) {
            return Value::Number(n);
        }
    }

    // JSON literal (quoted string, array, object)
    if trimmed.starts_with('"') || trimmed.starts_with('[') || trimmed.starts_with('{') {
        if let Ok(v) = serde_json::from_str::<Value>(trimmed) {
            return v;
        }
    }

    Value::String(trimmed.to_string())
}

struct ParseResult {
    value: Value,
    next_index: usize,
}

fn parse_yaml_block(lines: &[YamlLine], start: usize, indent_level: usize) -> ParseResult {
    let mut index = start;
    while index < lines.len() && lines[index].content.is_empty() {
        index += 1;
    }
    if index >= lines.len() || lines[index].indent < indent_level {
        return ParseResult {
            value: Value::Object(Default::default()),
            next_index: index,
        };
    }

    let is_array = lines[index].indent == indent_level && lines[index].content.starts_with('-');

    if is_array {
        let mut values: Vec<Value> = Vec::new();
        while index < lines.len() {
            let line = &lines[index];
            if line.indent < indent_level {
                break;
            }
            if line.indent != indent_level || !line.content.starts_with('-') {
                break;
            }
            let remainder = line.content[1..].trim().to_string();
            index += 1;
            if remainder.is_empty() {
                let nested = parse_yaml_block(lines, index, indent_level + 2);
                values.push(nested.value);
                index = nested.next_index;
                continue;
            }
            let sep = remainder.find(':');
            if let Some(sep_idx) = sep {
                let before = &remainder[..sep_idx];
                if !before.is_empty()
                    && !remainder.starts_with('"')
                    && !remainder.starts_with('{')
                    && !remainder.starts_with('[')
                {
                    let key = before.trim().to_string();
                    let raw_val = remainder[sep_idx + 1..].trim().to_string();
                    let mut obj = serde_json::Map::new();
                    obj.insert(key, parse_yaml_scalar(&raw_val));
                    if index < lines.len() && lines[index].indent > indent_level {
                        let nested = parse_yaml_block(lines, index, indent_level + 2);
                        if let Value::Object(extra) = nested.value {
                            obj.extend(extra);
                        }
                        index = nested.next_index;
                    }
                    values.push(Value::Object(obj));
                    continue;
                }
            }
            values.push(parse_yaml_scalar(&remainder));
        }
        return ParseResult {
            value: Value::Array(values),
            next_index: index,
        };
    }

    // Object
    let mut record = serde_json::Map::new();
    while index < lines.len() {
        let line = &lines[index];
        if line.indent < indent_level {
            break;
        }
        if line.indent != indent_level {
            index += 1;
            continue;
        }
        let sep = line.content.find(':');
        let Some(sep_idx) = sep else {
            index += 1;
            continue;
        };
        if sep_idx == 0 {
            index += 1;
            continue;
        }
        let key = line.content[..sep_idx].trim().to_string();
        let remainder = line.content[sep_idx + 1..].trim().to_string();
        index += 1;
        if remainder.is_empty() {
            let nested = parse_yaml_block(lines, index, indent_level + 2);
            record.insert(key, nested.value);
            index = nested.next_index;
        } else {
            record.insert(key, parse_yaml_scalar(&remainder));
        }
    }
    ParseResult {
        value: Value::Object(record),
        next_index: index,
    }
}

fn parse_yaml_frontmatter(raw: &str) -> serde_json::Map<String, Value> {
    let lines = prepare_yaml_lines(raw);
    if lines.is_empty() {
        return serde_json::Map::new();
    }
    let indent = lines[0].indent;
    let result = parse_yaml_block(&lines, 0, indent);
    match result.value {
        Value::Object(map) => map,
        _ => serde_json::Map::new(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn no_frontmatter() {
        let doc = parse_frontmatter_markdown("# Hello\nWorld");
        assert!(doc.frontmatter.is_empty());
        assert_eq!(doc.body, "# Hello\nWorld");
    }

    #[test]
    fn basic_frontmatter() {
        let raw = "---\nname: my-skill\ndescription: does stuff\n---\n# Body";
        let doc = parse_frontmatter_markdown(raw);
        assert_eq!(
            doc.frontmatter.get("name"),
            Some(&serde_json::Value::String("my-skill".into()))
        );
        assert_eq!(doc.body, "# Body");
    }

    #[test]
    fn bool_and_null() {
        let raw = "---\nenabled: true\noptional: null\n---\nbody";
        let doc = parse_frontmatter_markdown(raw);
        assert_eq!(doc.frontmatter.get("enabled"), Some(&serde_json::Value::Bool(true)));
        assert_eq!(doc.frontmatter.get("optional"), Some(&serde_json::Value::Null));
    }
}
