# drum-coach

## Deploy

Run:

```bash
./deploy.sh
```

This builds the app, syncs `dist/` to `/var/www/drum-coach`, validates nginx, and reloads it.

To publish to a different directory:

```bash
PUBLIC_SITE_ROOT=/some/path ./deploy.sh
```
