'use strict';

const { allAddedLines } = require('./diff');

// Order matters: more specific patterns first so the reported type is useful.
const PATTERNS = [
  { name: 'AWS Access Key ID', regex: /\bAKIA[0-9A-Z]{16}\b/g },
  { name: 'GitHub Token', regex: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,}\b/g },
  { name: 'Google API Key', regex: /\bAIza[0-9A-Za-z_\-]{35}\b/g },
  { name: 'Stripe Live Secret Key', regex: /\bsk_live_[0-9A-Za-z]{24,}\b/g },
  { name: 'Slack Token', regex: /\bxox[baprs]-[0-9A-Za-z\-]{10,}\b/g },
  { name: 'OpenAI API Key', regex: /\bsk-proj-[0-9A-Za-z_\-]{20,}\b/g },
  { name: 'Anthropic API Key', regex: /\bsk-ant-[0-9A-Za-z_\-]{20,}\b/g },
  {
    name: 'Private Key',
    regex: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?(?:PRIVATE|PRIVATE KEY)-----/g,
  },
  {
    name: 'Hardcoded credential',
    regex:
      /\b(password|passwd|pwd|secret|api[-_]?key|auth[-_]?token|access[-_]?token)\b\s*[:=]\s*["'][^"'\s]{8,}["']/gi,
  },
  {
    name: 'Connection string',
    regex:
      /\b(?:mongodb(?:\+srv)?|postgres(?:ql)?|mysql|redis|amqp):\/\/[^\s'"]+\b/g,
  },
  { name: 'npm Token', regex: /\bnpm_[A-Za-z0-9]{36}\b/g },
  {
    name: 'SendGrid API Key',
    regex: /\bSG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}\b/g,
  },
  {
    name: 'Telegram Bot Token',
    regex: /\b\d{8,10}:[A-Za-z0-9_-]{35}\b/g,
  },
  {
    name: 'Azure Storage Connection String',
    regex:
      /\b(?:DefaultEndpointsProtocol|AccountName|AccountKey)=[^;"'\s]{10,}/g,
  },
  {
    name: 'JWT',
    regex:
      /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
  },
  {
    name: 'AWS Secret Key',
    regex:
      /\b(?:aws[-_]?secret[-_]?access[-_]?key|aws_secret)\b\s*[:=]\s*["'][A-Za-z0-9/+=]{40}["']/gi,
  },
];

/**
 * Mask most of a matched secret so logs never echo the real value.
 */
function redact(value) {
  if (value.length <= 8) return '****';
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

/**
 * Scan added lines for hardcoded secrets.
 *
 * @param {Array<{filename: string, patch?: string}>} files
 * @param {string[]} excludePaths file path substrings to skip
 * @returns {Array<{ file: string, line: number, type: string, secret: string, context: string }>}
 */
function findSecrets(files, excludePaths = []) {
  const findings = [];
  const skip = excludePaths.map((p) => p.toLowerCase());

  for (const row of allAddedLines(files)) {
    const loweredFile = row.file.toLowerCase();
    if (skip.some((p) => loweredFile.includes(p.toLowerCase()))) continue;

    for (const { name, regex } of PATTERNS) {
      const matches = row.text.matchAll(regex);
      for (const m of matches) {
        findings.push({
          file: row.file,
          line: row.line,
          type: name,
          secret: redact(m[0]),
          context: row.text.trim().slice(0, 120),
        });
      }
    }
  }
  return findings;
}

module.exports = { findSecrets, redact };
