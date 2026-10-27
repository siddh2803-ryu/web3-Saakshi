# Saakshi Production Setup Guide (Firebase & Vercel)

This document provides exact, manual setup instructions to transition **Phase 0** acceptance criteria from `PENDING` to `PASS`.

---

## 1. Firebase Setup

### 1.1 Create the Firebase Project
1. Open the [Firebase Console](https://console.firebase.google.com/).
2. Click **Add project** (or **Create a project**).
3. Name your project (e.g., `saakshi-evidence` or `saakshi-prod`).
4. (Optional) Enable Google Analytics if desired, then click **Create project**.

### 1.2 Enable Google Sign-In
1. In the Firebase console left sidebar, navigate to **Build** &rarr; **Authentication**.
2. Click **Get Started** (if opening for the first time).
3. Under the **Sign-in method** tab, click **Google** under *Additional providers*.
4. Toggle **Enable**.
5. Set the **Public-facing name for project** to `Saakshi`.
6. Select a **Project support email** from the dropdown.
7. Click **Save**.

### 1.3 Enable Cloud Firestore
1. In the sidebar, navigate to **Build** &rarr; **Firestore Database**.
2. Click **Create database**.
3. Choose a database location close to your primary users (e.g., `asia-south1` for Mumbai / India, or `us-central1`).
4. Select **Start in production mode** and click **Create**.
5. The collections (`users`, `captures`, `watches`, `custody`, `publicProofs`) will be automatically populated by the server API handlers upon first use.

### 1.4 Add Authorized Domains
1. In **Authentication**, switch to the **Settings** tab.
2. Under **Authorized domains**, ensure `localhost` is listed.
3. Click **Add domain** and enter your production domain (e.g., `<your-project>.vercel.app` or your custom domain).

### 1.5 Register Web Application & Copy Config
1. In the project overview, click the **Web icon** (`</>`) to add an application.
2. Register app with nickname `Saakshi Web`. Do not check Firebase Hosting (we host on Vercel).
3. Firebase will display your `firebaseConfig` object.
4. Copy these values into your local `.env.local` file:
   ```env
   NEXT_PUBLIC_FIREBASE_API_KEY=<apiKey>
   NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=<authDomain>
   NEXT_PUBLIC_FIREBASE_PROJECT_ID=<projectId>
   NEXT_PUBLIC_FIREBASE_APP_ID=<appId>
   ```

### 1.6 Generate Admin SDK Service Account Key
1. Click the **Gear icon** next to *Project Overview* &rarr; **Project settings**.
2. Go to the **Service accounts** tab.
3. Click **Generate new private key** &rarr; Confirm **Generate key**.
4. A JSON file will download to your computer.
5. Encode this JSON file as a single-line base64 string:
   - **macOS:**
     ```bash
     base64 -i path/to/serviceAccountKey.json | tr -d '\n' | pbcopy
     ```
   - **Linux:**
     ```bash
     base64 -w 0 path/to/serviceAccountKey.json
     ```
6. Paste this base64 string into `.env.local`:
   ```env
   FIREBASE_SERVICE_ACCOUNT_B64=<paste-base64-string-here>
   ```

---

## 2. Vercel Deployment

### 2.1 Import the GitHub Repository
1. Log in to [Vercel](https://vercel.com).
2. Click **Add New...** &rarr; **Project**.
3. Select your repository: `siddh2803-ryu/web3-Saakshi`.

### 2.2 Configure Monorepo Build Settings
1. **Root Directory:** Click *Edit* and select `apps/web`.
2. **Framework Preset:** `Next.js` (automatically detected).
3. **Build Command:** Leave as default (`next build`).
4. **Output Directory:** Leave as default (`.next`).
5. **Install Command:** Leave as default (`npm install`).

### 2.3 Configure Environment Variables
In the **Environment Variables** section on Vercel, add each of the following variables (referencing `.env.example`):

| Variable Name | Example / Production Value | Notes |
|---|---|---|
| `NEXT_PUBLIC_APP_URL` | `https://<your-project>.vercel.app` | Production app origin |
| `WEBHOOK_SECRET` | `openssl rand -hex 24` | For TinyFish monitor/agent callbacks |
| `CRON_SECRET` | `openssl rand -hex 16` | For scheduled batch anchoring / watch |
| `SANDBOX_ADMIN_SECRET` | `chirp_admin_secret_key_demo` | Protects `/sandbox/admin` simulator |
| `CAPTURE_ENABLED` | `true` | Allows user capture jobs |
| `DAILY_FREE_CAPTURES` | `5` | Free quota per user |
| `TINYFISH_API_KEY` | `tf_live_...` | From TinyFish Console |
| `TINYFISH_MODE` | `live` | Live agent & CDP execution |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | *(From Firebase Web App)* | Client Firebase API key |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | `saakshi-....firebaseapp.com` | Client Auth domain |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | `saakshi-...` | Firebase project ID |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | `1:...:web:...` | Firebase web app ID |
| `FIREBASE_SERVICE_ACCOUNT_B64` | *(Base64 string from Section 1.6)* | Server Admin SDK credentials |
| `MASTER_KEY_B64` | `openssl rand -base64 32` | 256-bit AES master key for DEK wrapping |
| `UID_HASH_SALT` | `openssl rand -hex 16` | Pseudonymous UID hashing salt |
| `PINATA_JWT` | `eyJ...` | Pinata IPFS pinning token |
| `PINATA_GATEWAY` | `https://gateway.pinata.cloud/ipfs` | IPFS retrieval gateway |
| `AMOY_RPC_URL` | `https://rpc-amoy.polygon.technology` | Polygon Amoy testnet RPC |
| `ANCHOR_PRIVATE_KEY` | `0x...` | Private key of funded deployer/anchor role |
| `NEXT_PUBLIC_REGISTRY_ADDRESS` | `0x...` | Deployed `EvidenceRegistry` contract address |
| `NEXT_PUBLIC_CHAIN_ID` | `80002` | Polygon Amoy chain ID |
| `NEXT_PUBLIC_AMOY_RPC_URL` | `https://rpc-amoy.polygon.technology` | Client Amoy RPC |
| `NEXT_PUBLIC_EXPLORER_URL` | `https://amoy.polygonscan.com` | Polygonscan explorer URL |
| `POLYGONSCAN_API_KEY` | *(Optional)* | For contract source verification |
| `GEMINI_API_KEY` | `AIza...` | Google AI Studio Gemini API key |
| `GEMINI_MODEL` | `gemini-2.5-flash` | Gemini model name |

4. Click **Deploy**.

---

## 3. Post-Deployment Acceptance Verification

Once deployed, verify Phase 0 criteria live:

### 3.1 Verify Criterion (a): Deployed URL Landing Page
1. Open `https://<your-project>.vercel.app` in your browser.
2. Confirm the page loads with HTTP 200:
   - Hero header: *"Screenshots can be altered. Web content gets deleted. Saakshi preserves cryptographic proof."*
   - Badges: *"KRITICAL HACKS '26 • Web3 Track • Powered by TinyFish"*
   - 4-Stage cryptographic pipeline cards.
   - Interactive buttons: *"Initiate Evidence Capture"* and *"Verify File (Client-Side)"*.
3. **Status:** `PASS` (Verified with: `LIVE`).

### 3.2 Verify Criterion (b): Google Sign-In
1. Navigate to `/capture/new` or the sign-in modal on the live site.
2. Click **Sign in with Google**.
3. Choose your Google account in the popup.
4. Verify you are redirected back to Saakshi with your authenticated session established and free quota active.
5. **Status:** `PASS` (Verified with: `LIVE`).

### 3.3 Verify Criterion (c): Automated CI
1. Navigate to GitHub: `https://github.com/siddh2803-ryu/web3-Saakshi/actions`.
2. Confirm the latest run on branch `main` shows a green checkmark for both `web` and `contracts` jobs.
3. **Status:** `PASS` (Verified with: `LIVE`).
