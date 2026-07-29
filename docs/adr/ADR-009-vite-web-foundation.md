# ADR-009: React/Vite web foundation

Status: accepted — 2026-07-29

Use React with Vite and a hardened Nginx container for the foundation dashboard.
This preserves the requested React/TypeScript, responsive and sophisticated UI
while avoiding unresolved high-severity transitive advisories present in the
evaluated Next.js dependency tree on the implementation date. Reconsider a
server-rendered framework only when it provides a product requirement and
passes the repository security gate.
