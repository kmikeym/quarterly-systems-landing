# Quarterly Systems Status API Worker

This Cloudflare Worker aggregates real-time data from GitHub, RSS feeds, and other sources for the quarterly.systems status page.

## Setup Instructions

### 1. Install Wrangler CLI
```bash
npm install -g wrangler
```

### 2. Login to Cloudflare
```bash
wrangler login
```

### 3. Create KV Namespace
```bash
wrangler kv:namespace create "STATUS_KV"
wrangler kv:namespace create "STATUS_KV" --preview
```

Update the `id` and `preview_id` in `wrangler.toml` with the returned namespace IDs.

### 4. Set Secrets
```bash
wrangler secret put GITHUB_TOKEN
# Enter your GitHub token when prompted
```

### 5. Deploy Worker
```bash
wrangler deploy
```

### 6. Set Custom Domain (Optional)
In Cloudflare Dashboard:
1. Go to Workers & Pages
2. Select your worker
3. Go to Settings → Triggers
4. Add custom domain: `status-api.quarterly.systems`

## API Endpoints

- `GET /api/status` - Returns current status data
- `GET /api/refresh` - Manually refreshes data

## Data Sources

- **GitHub**: User activity, commits, releases
- **RSS Feeds**: KmikeyM blog, Substack
- **Static Data**: Location, service status

## Caching

- Data cached in KV for 30 minutes
- Auto-refresh every 10 minutes via cron
- Falls back to cached data on API failures

## Testing

```bash
# Test locally
wrangler dev

# Test endpoints
curl https://status-api.quarterly.systems/api/status
curl https://status-api.quarterly.systems/api/refresh
```