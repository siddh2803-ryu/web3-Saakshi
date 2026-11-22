# Saakshi Production Setup Guide (Firebase & Vercel)

This document provides exact, manual setup instructions to transition **Phase 0** acceptance criteria from `PENDING` to `PASS`.

---

## 1. Firebase Setup (Optional)

> [!NOTE]
> **Firebase is Completely Optional:**
> Saakshi includes built-in in-memory and local storage fallbacks for captures, cases, watches, and rate limits. The app defaults to a seamless demo user session (`demo-user`) so all capture, watch, verification, and s.63(4) certificate flows function without needing Google sign-in or a Firebase account. You may skip this entire section if deploying for quick hackathon demonstrations.

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

### 2.2 Configure Monorepo Project Settings in Vercel
1. **Root Directory:** Click *Edit* and set to `apps/web`.
2. **Framework Preset:** `Next.js` (automatically detected).
3. **Node.js Version:** In Vercel Project Settings &rarr; **General** &rarr; **Node.js Version**, ensure `20.x` is selected (matching `.nvmrc` and `engines: >=20.0.0`).
4. **Build Command:** Leave as default (`next build`) or `npm run build`.
5. **Output Directory:** Leave as default (`.next`).
6. **Install Command:** Leave as default (`npm install`).

### 2.3 Configure Production Environment Variables in Vercel
In the **Environment Variables** section on the Vercel project dashboard, add each of the following variables.

> [!IMPORTANT]
> **Production Mode Enforcement:** Production builds strictly require `TINYFISH_MODE=live`. Do **NOT** set `TINYFISH_MODE=fixture`, `IPFS_FALLBACK=dev`, `CHAIN_MODE=mock`, or `AI_FALLBACK=dev` in Vercel. Our fatal build guards (`apps/web/lib/config/guards.ts`) will reject and fail the build if any dev-only flag is set.

#### A. Server-Only Environment Variables (Secret — Never exposed to browser)
- `TINYFISH_MODE`: Set to `live` (mandatory).
- `TINYFISH_API_KEY`: Secret TinyFish API key (`sk-tinyfish-...` or `tf_live_...`).
- `WEBHOOK_SECRET`: Secret token for webhook authenticity (generate with `openssl rand -hex 24`).
- `CRON_SECRET`: Secret token for scheduled monitor polling & custody batching (`openssl rand -hex 16`).
- `SANDBOX_ADMIN_SECRET`: Secret key protecting the `/sandbox/admin` interactive simulator.
- `CAPTURE_ENABLED`: `true`
- `DAILY_FREE_CAPTURES`: `5`
- `FIREBASE_SERVICE_ACCOUNT_B64`: Base64-encoded Firebase Admin SDK service account credentials (from Section 1.6).
- `MASTER_KEY_B64`: Base64-encoded 32-byte AES master key for client DEK wrapping (`openssl rand -base64 32`).
- `UID_HASH_SALT`: Secret salt for pseudonymous owner hashing (`openssl rand -hex 16`).
- `PINATA_JWT`: Secret JWT token for Pinata IPFS pinning service.
- `PINATA_GATEWAY`: IPFS gateway URL (e.g. `https://gateway.pinata.cloud/ipfs`).
- `AMOY_RPC_URL`: JSON-RPC URL for Polygon Amoy testnet (e.g. `https://rpc-amoy.polygon.technology`).
- `ANCHOR_PRIVATE_KEY`: Hex-encoded EVM private key for the on-chain anchor wallet (optional / pending if Amoy contract is pending).
- `POLYGONSCAN_API_KEY`: Polygonscan API key for verification.
- `GEMINI_API_KEY`: Google AI Studio Gemini API key for analysis & complaint drafts.
- `GEMINI_MODEL`: `gemini-2.5-flash`
- `RESEND_API_KEY`: (Optional) For email notifications.

#### B. Client-Side Environment Variables (`NEXT_PUBLIC_*` — Bundled for browser)
- `NEXT_PUBLIC_APP_URL`: Production origin URL (e.g. `https://<your-project>.vercel.app`).
- `NEXT_PUBLIC_FIREBASE_API_KEY`: Client Firebase Web API key.
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`: Firebase Auth domain (e.g. `<project-id>.firebaseapp.com`).
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`: Firebase project identifier.
- `NEXT_PUBLIC_FIREBASE_APP_ID`: Firebase web app identifier (`1:...:web:...`).
- `NEXT_PUBLIC_REGISTRY_ADDRESS`: Deployed `EvidenceRegistry` contract address on Polygon Amoy testnet (or placeholder if Amoy contract is pending).
- `NEXT_PUBLIC_CHAIN_ID`: `80002`
- `NEXT_PUBLIC_AMOY_RPC_URL`: Public Polygon Amoy RPC endpoint (`https://rpc-amoy.polygon.technology`).
- `NEXT_PUBLIC_EXPLORER_URL`: Polygonscan explorer base URL (`https://amoy.polygonscan.com`).

### 2.4 Authorize Domain in Firebase Authentication
1. Open the [Firebase Console](https://console.firebase.google.com/) for your project.
2. Navigate to **Authentication** &rarr; **Settings** tab &rarr; **Authorized domains**.
3. Click **Add domain**.
4. Enter your Vercel deployment domain (e.g., `<your-project>.vercel.app` and any custom domain).
5. Click **Save**. This ensures Google Sign-In popups and redirect flows will succeed in production without auth domain restrictions.

4. Click **Deploy** in Vercel.

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
