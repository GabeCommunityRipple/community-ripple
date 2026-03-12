# Community Ripple

Geographic demand-clustering platform for neighborhood home services.

## Project Structure

```
community-ripple/
├── public/
│   └── index.html        ← Landing page (your website)
├── api/
│   └── subscribe.js      ← Secure Brevo signup function
├── vercel.json           ← Vercel routing config
└── README.md
```

## Deploy to Vercel

### Step 1 — Add your Brevo API key to Vercel

1. Go to vercel.com → your project → **Settings → Environment Variables**
2. Add a new variable:
   - **Name:** `BREVO_API_KEY`
   - **Value:** your Brevo API key
   - **Environments:** Production, Preview, Development (check all three)
3. Click **Save**

### Step 2 — Push to GitHub

1. Create a new GitHub repo called `community-ripple`
2. Upload all these files (or use git push)
3. Connect the repo to Vercel

### Step 3 — Deploy

Vercel will auto-deploy every time you push to GitHub.

### Step 4 — Connect your domain

In Vercel → your project → **Settings → Domains**
Add `communityripple.com` and follow the DNS instructions.

## Environment Variables Required

| Variable | Description |
|----------|-------------|
| `BREVO_API_KEY` | Your Brevo API key (from Brevo → SMTP & API → API Keys) |

## Brevo Setup

- List ID: `2` (Community Ripple Waitlist)
- Contact attributes used:
  - `ZIP_CODE` — subscriber's ZIP code (used for geographic ripple alerts)
  - `SERVICE_INTEREST` — what service they searched for
