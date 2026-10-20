# Saakshi Demo Script & Walkthrough Guide

## Demo Overview (KRITICAL HACKS '26 Finale)
**Target Scenario:** An anonymous company ("CareerBridge Global") posts an internship scam requiring a ₹2,499 registration fee via UPI. Victims realize the fraud, and the scammer attempts to delete the post.

### Stage 1: Introduction (0:00 - 0:15)
- Open Saakshi Landing Page (`/`).
- "Screenshots can be faked in seconds, and incriminating posts disappear. Meet Saakshi, an AI witness for the internet."

### Stage 2: Capture Launch (0:15 - 0:45)
- Click "Start a Capture".
- Click "Auto-Fill" to load the Chirp Demo Scam Post (`/sandbox/post/internship-scam-alert`).
- Click "Launch Evidence Capture".
- Show the Live Preview: TinyFish Cloud Agent browsing, scrolling, closing popups, and recording every step into a forensic filmstrip.

### Stage 3: Fingerprinting & AI Analysis (0:45 - 1:15)
- Show the Evidence Details Page (`/capture/[id]`).
- Show the Plaintext Artifacts Table with SHA-256 copy buttons (the exact hash required under BSA 2023 s.63(4)).
- Show the Gemini Analysis: English and Hindi objective summaries, detected claims, identified categories ("fake_job", "financial_fraud"), and complaint drafts.

### Stage 4: On-Chain Anchoring (1:15 - 1:40)
- Click "Anchor On-Chain".
- Show the Polygon Amoy transaction hash, block number, and Polygonscan explorer link.
- Display the QR code pointing to `/v/[id]`.

### Stage 5: Live Deletion & Watch Alert (1:40 - 2:05)
- Open the Sandbox Admin Panel (`/sandbox/admin`) in a split tab.
- Click "Simulate Delete (404)". The post now returns 404 "This post has been removed".
- Return to Saakshi, navigate to the "Deletion Watch" tab, and click "Check Now".
- Within seconds: TinyFish Monitor flags `DELETED`, calculates the line diff, triggers an automatic re-capture, and preserves the proof of deletion.

### Stage 6: Trustless Public Verification & Legal Certificate (2:05 - 2:30)
- Open `/verify` in an incognito window (unauthenticated).
- Drag and drop the original downloaded screenshot or manifest. Result turns **GREEN (Verified)**.
- Alter 1 character in the file and drop it again. Result turns **RED (Tamper Detected)**.
- Open the Section 63(4) Part A Draft Certificate PDF.
- Conclude: "Saakshi. Because the truth shouldn't have an expiry date."
