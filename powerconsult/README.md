powerconsult

Alterações feitas nesta branch para organizar arquitetura:

- `src/infra` - clients compartilhados (redis, browser)
- `src/ws/server.ts` - implementação do WebSocket server (sessões e Playwright)
- `src/server.ts` - shim que re-exporta `src/ws/server.ts`
- Atualizados imports para usar `src/infra/redis` e `src/infra/browser`
- Scripts no `package.json`: `dev:api`, `dev:ws`, `dev`.

Como rodar (dev):

1. Inicie Redis local (ou exporte REDIS_URL).
2. Rodar API: pnpm run dev:api
3. Rodar WS: pnpm run dev:ws

Notas:

- Mantive `src/playground.ts` como sandbox - não usado em produção.
- Recomendo rodar `pnpm install` e `npx tsc --noEmit` localmente para ajustar tipos.
