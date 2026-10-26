# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| main    | :white_check_mark: |

## Reporting a Vulnerability

Please report security vulnerabilities to **Harald Weiss** via one of the following channels:

- **GitHub private vulnerability reporting** (when enabled): Use "Report a vulnerability" under this repository's "Security" tab. Otherwise, use the email address below.
- **Email**: opensource@wolfinisoftware.de

### What to include

- A clear description of the vulnerability
- Steps to reproduce (browser, OS, provider configuration)
- The affected component(s) (anonymizer, AI provider integration, localStorage handling)
- Potential impact (PII leakage, data exfiltration, etc.)
- Suggested fix or mitigation (if known)

### Response timeline

- **Acknowledgment**: Within 3 business days
- **Initial assessment**: Within 7 business days
- **Fix / patch**: Depends on severity; you will be kept informed of progress

## Security best practices for contributors

- All commits must be signed off (`git commit -s`) per the Developer Certificate of Origin (DCO).
- API keys are stored in `localStorage` **in plaintext** — only use on trusted devices. Never commit API keys to the repository.
- Backups via "Einstellungen → Alle Daten exportieren" exclude API keys (provider entry exported with empty `apiKey`).
- Anonymization runs in the browser. Optional AI provider calls and VirusTotal/AbuseIPDB reputation lookups send data to the selected service; reputation lookups include the selected IP address. The page also loads external fonts and static assets.
- Cloudflare Pages deployment uses `_headers` with CSP, HSTS, X-Frame-Options: DENY, Referrer-Policy, and Permissions-Policy.
- For HTTPS + Ollama access, use the PNA proxy on port 11435 (see README).

## Disclosure policy

We follow coordinated disclosure. Please do not publicly disclose a vulnerability until we have had a reasonable window to investigate and release a fix. Credit will be given upon request.
