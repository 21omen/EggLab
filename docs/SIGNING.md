# Windows SmartScreen and code signing

## Why Windows says the app is dangerous

EggLab's installer is **not digitally signed**. Windows marks files downloaded
from the internet with Mark-of-the-Web and asks SmartScreen to judge them. An
unsigned file from a new publisher has no reputation, so SmartScreen shows:

> Windows protected your PC — Microsoft Defender SmartScreen prevented an
> unrecognized app from starting.

This is a **reputation warning, not a virus detection**. It is the same dialog
used for many new open-source installers. The local build reports:

```text
Get-AuthenticodeSignature .\EggLab-Setup-0.3.28.exe
Status : NotSigned
```

Users can continue with **More info → Run anyway**, and should verify the
release hash from `SHA256SUMS.txt`:

```powershell
Get-ChildItem .\EggLab-Setup-*.exe | Get-FileHash -Algorithm SHA256
```

## The permanent fix: sign the installer

No code change can remove the warning from an unsigned binary. Windows needs a
certificate whose publisher identity is trusted. Signing also protects the
download from tampering.

### Free for open source: SignPath Foundation

[SignPath Foundation](https://signpath.org/) provides free code signing for
open-source projects. The private key lives in their HSM, the certificate
vouches for the repository build, and their page explicitly targets installation
warnings.

1. Apply at <https://signpath.org/apply> with the public EggLab repository.
2. After approval, connect the GitHub repository in SignPath.io.
3. Add the SignPath GitHub Action to the release workflow. It should sign
   `dist/EggLab-Setup-*.exe` **after** `npm run dist` and **before** checksums
   and `gh release upload`, so the published hash covers the signed file.
4. Keep `WIN_CSC_LINK` unset for that path; SignPath performs the signing.

This is the recommended route for a free MIT project.

### Commercial certificate (OV or EV)

- **EV** certificates get SmartScreen trust immediately.
- **OV** certificates still need download reputation, so the warning may linger.
- Since 2023 the private key must be on an HSM/token. For CI, use the CA's cloud
  signing service (DigiCert KeyLocker, SSL.com eSigner, Certum SimplySign) or
  **Azure Trusted Signing**.
- Azure Trusted Signing is a monthly Microsoft service; eligibility depends on
  country and individual/organization validation.
- Certum and other CAs offer discounted open-source code-signing certificates.

The build is already configured for a `.pfx` certificate:

- `panel/package.json` → `win.signingHashAlgorithms: ["sha256"]` and an RFC 3161
  timestamp server.
- `.github/workflows/release.yml` reads two repository secrets:
  - `WIN_CSC_LINK` — base64 of the `.pfx`, or a URL to it
  - `WIN_CSC_KEY_PASSWORD` — its password
- When both are set, electron-builder signs the app and installer during
  `npm run dist`. The workflow prints the signature status and warns when the
  installer is still unsigned.

Never commit a `.pfx` or its password.

### Verify a signed build

```powershell
Get-AuthenticodeSignature .\EggLab-Setup-0.3.28.exe |
  Select-Object Status, SignerCertificate

signtool verify /pa /v .\EggLab-Setup-0.3.28.exe
```

`Status` must be `Valid`. For OV certificates, SmartScreen may still warn until
the file builds reputation; EV and SignPath Foundation certificates are trusted
immediately.

## If Microsoft Defender quarantines the file

That is a different problem from SmartScreen. Submit the exact installer to
Microsoft's file submission portal:

<https://www.microsoft.com/en-us/wdsi/filesubmission>

Include the release URL and SHA-256. Do not disable Defender for users.

## Do not use a self-signed certificate

A self-signed certificate produces “Unknown publisher” and asks users to install
a root certificate. It does not build SmartScreen trust and is worse than an
unsigned release.

## Release checklist

- [ ] Certificate or SignPath signing is active in the workflow
- [ ] `Get-AuthenticodeSignature` reports `Valid`
- [ ] `SHA256SUMS.txt` is generated **after** signing
- [ ] The published asset is downloaded once and re-checked
- [ ] README “More info → Run anyway” text is removed only after the first
      signed release is live
