Proposta de arquitetura para powerconsult

Objetivo

- Organizar o código para facilitar testes, manutenção, reuso e deploy.

Camadas propostas

1. /src/api

- Entradas do sistema (Express HTTP handlers, rotas). Mantém apenas validação, autenticação e mapeamento para controllers.
- Arquivos: `src/api/server.ts` (express), `src/api/routes/*.ts`.

2. /src/ws

- WebSocket server e sessões: `src/ws/server.ts` (o atual `src/server.ts` pode ser movido aqui).
- Lógica de sessão e lifecycle.

3. /src/controllers

- Orquestra operações chamando services e formatando respostas.
- Controllers devem ser puras, sem efeitos colaterais de infra (abrir browser, Redis). Recebem interfaces.

4. /src/services

- Integrações com bancos/3rd parties e regras de negócio que exigem efeitos colaterais (playwright, http requests).
- Separar clients por banco: `services/itau`, `services/bradesco`, `services/bancopan`.

5. /src/domain

- Tipos, modelos e lógicas puras (validações, DTOs, mapeamentos).

6. /src/infra

- Implementações concretas: redis client, browser factory, logger, config loader.

7. /tests

- Testes unitários (jest / vitest) e e2e minimal.

Recomendações práticas

- Interface para BrowserFactory em `src/infra/browser.ts` (getBrowser, closeBrowser).
- Injeção de dependências mínima: controllers recebem objetos com os clients necessários (repo pattern leve).
- Mantenha `src/playground.ts` como sandbox; não rodar em produção.
- Adicionar scripts `dev:api`, `dev:ws` (já adicionados).

Próximos passos

- Mover `src/server.ts` para `src/ws/server.ts` e ajustar imports.
- Criar `src/infra/browser.ts` e `src/infra/redis.ts` para isolar dependências.
- Rodar TypeScript --noEmit para checar erros e ajustar tipagens.
