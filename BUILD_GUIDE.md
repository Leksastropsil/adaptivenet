# 📦 How to Build CrackIdlix Client (EXE)

This project uses [Bun](https://bun.sh) to compile the TypeScript client into a standalone Windows executable.

## 1. Build Command

Run the following command in your terminal:

```bash
npm run build
```

This will create a file named **`crackidlix-client.exe`** in your project root.

---

## 2. Distribution Folder Structure

To share this application or run it on another computer, you must create a folder with the following structure:

```
/MyStreamingApp
  ├── crackidlix-client.exe    <-- The file you just built
  ├── cloudflared.exe          <-- REQUIRED: Download from Cloudflare
  └── .env                     <-- OPTIONAL: If pre-configuring secrets
```

### ⚠️ Requirements

1.  **Google Chrome** (or Chromium) must be installed on the target machine. The app uses Puppeteer which launches the installed browser.
2.  **cloudflared.exe**: You must download the Windows binary from [Cloudflare Downloads](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/) and place it next to the `.exe`.

## 3. Running

Double-click `crackidlix-client.exe` to launch.

- It will automatically detect `cloudflared.exe` in the same folder.
- It will launch Chrome in the background for bypassing protections.
