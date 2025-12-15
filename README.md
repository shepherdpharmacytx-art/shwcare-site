# shwcare.com (Static HTML Starter)

## Local preview
Open `index.html` or run:
- `python -m http.server 8080`
Then: http://localhost:8080

## GitHub Pages deploy
1) Create a GitHub repo (e.g., `shwcare-site`)
2) Upload these files to the repo root
3) GitHub: Settings → Pages → Source: Deploy from a branch → main / root
4) Wait for the Pages URL.

## Custom domain (shwcare.com)
GitHub: Settings → Pages → Custom domain → `shwcare.com`
DNS A records (apex):
- 185.199.108.153
- 185.199.109.153
- 185.199.110.153
- 185.199.111.153

Optional: `www` CNAME → `<your-username>.github.io`
Enable "Enforce HTTPS" after DNS propagates.

## Intake links
Replace mailto buttons in `start.html` with your secure intake portal link(s) when ready.
Do not collect PHI on the public site.