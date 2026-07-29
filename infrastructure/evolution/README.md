# Evolution API blueprint

This is a production-oriented starting point for a dedicated Google Compute
Engine VM. It is not enabled by the application.

Required before launch:

- review and pin a supported Evolution API image;
- choose the official Meta Cloud API or explicitly accept testing-only Baileys
  risk;
- use an e2-medium or better VM, encrypted persistent disk, OS Login, automatic
  updates, backups, monitoring, and a reserved IP;
- put TLS/reverse proxy or an approved load balancer in front;
- keep port 8080 bound to localhost/private network;
- store secrets in Secret Manager, not `.env`;
- separate customer WhatsApp instances and enforce tenant mapping;
- test restore, reconnection, rate limits, opt-out, and message idempotency.

The studio's photo archive does not belong on this VM.
