import fs from "node:fs/promises";
import path from "node:path";
import { resolvePaperclipInstanceRoot } from "../home-paths.js";
import { logger } from "../middleware/logger.js";

const COMPANY_DOC_FILES = ["COMMUNICATION.md", "WORKFLOW-CEO.md", "WORKFLOW-EXEC.md"];

function resolveCompanyDocsDir(companyId: string): string {
  return path.resolve(resolvePaperclipInstanceRoot(), "companies", companyId, "docs");
}

function resolveTemplateUrl(fileName: string): URL {
  return new URL(`../onboarding-assets/company-docs/${fileName}`, import.meta.url);
}

export async function ensureCompanyDocs(companyId: string): Promise<void> {
  const docsDir = resolveCompanyDocsDir(companyId);
  await fs.mkdir(docsDir, { recursive: true });

  for (const fileName of COMPANY_DOC_FILES) {
    const targetPath = path.join(docsDir, fileName);
    const exists = await fs.stat(targetPath).then(() => true).catch(() => false);
    if (exists) continue;

    try {
      const templatePath = new URL(resolveTemplateUrl(fileName)).pathname;
      const content = await fs.readFile(templatePath, "utf8");
      await fs.writeFile(targetPath, content, "utf8");
    } catch (err) {
      logger.warn({ err, fileName, companyId }, "failed to copy company doc template");
    }
  }
}
