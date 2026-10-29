# DropBridge (React + Node)

Send text, images, PDFs, ZIPs (any size) from your phone and download them on any device.
Files are stored on the machine running the server, in `data/`, until you delete them.

## Run it
    npm install
    npm run build
    npm start            # http://localhost:3000

Password: edit the `.env` file (ACCESS_PASSWORD=...). Leave it empty to disable the password.
Restart the server after changing it. `.env.example` shows the format.

## Use from your phone
- Same Wi-Fi: open http://<your-computer-LAN-IP>:3000 on the phone.
- From anywhere: deploy to a VPS / Render / Railway / Fly.io (needs a persistent disk for `data/`),
  or tunnel with `npx cloudflared tunnel --url http://localhost:3000`. Keep ACCESS_PASSWORD set in .env if it's public.

## Develop
`npm run dev` -> UI on http://localhost:5173 (proxies /api to :3000).
