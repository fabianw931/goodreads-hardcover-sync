# Kindle (Goodreads) to Hardcover Sync

A "set it and forget it" tool to sync Kindle reads to Hardcover.app automatically.

## How it works
1. **Kindle** automatically updates **Goodreads**.
2. This script watches your **Goodreads RSS Feed**.
3. When a new book appears, it searches **Hardcover.app** via API.
4. It logs the book to your "Read" status on Hardcover.

## Local Setup
1. Clone this repo.
2. Create a `.env` file with your credentials (see `.env.example`).
3. Run `pip install -r requirements.txt`.
4. Test with `python sync.py --dry-run`.

## GitHub Actions Setup (Free)
1. Fork this repo.
2. Go to **Settings > Secrets > Actions**.
3. Add `GOODREADS_RSS_URL` and `HARDCOVER_API_TOKEN`.
4. Enable the Workflow in the **Actions** tab.