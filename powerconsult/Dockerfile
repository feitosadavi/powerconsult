# ---------- Base (Ubuntu Noble) ----------
  FROM mcr.microsoft.com/playwright:v1.54.2-noble AS base
  WORKDIR /app
  
  # tools for healthchecks/scripts
  RUN apt-get update && apt-get install -y --no-install-recommends curl jq \
    && rm -rf /var/lib/apt/lists/*
  
  # pnpm via corepack
  RUN corepack enable && corepack prepare pnpm@9.0.0 --activate
  
  # cache deps
  COPY package.json pnpm-lock.yaml ./
  
  # ---------- Dev ----------
    FROM mcr.microsoft.com/playwright:v1.54.2-noble AS dev
    WORKDIR /app
    
    RUN apt-get update && apt-get install -y --no-install-recommends curl jq xvfb xauth \
      && rm -rf /var/lib/apt/lists/*
    
    RUN corepack enable && corepack prepare pnpm@9.0.0 --activate
    
    COPY package.json pnpm-lock.yaml ./
    RUN pnpm install
    
    COPY tsconfig.json ./
    COPY src ./src
    
    ENV DISPLAY=:99
    EXPOSE 5000
    
    # Start virtual display and your dev script
    CMD ["bash", "-lc", "pnpm run dev:ws"]
  
  # ---------- Build (TS -> JS) ----------
  FROM base AS build
  RUN pnpm install --frozen-lockfile
  COPY tsconfig.json ./
  COPY src ./src
  RUN pnpm run build
  
  # ---------- Prod (runtime) ----------
  # IMPORTANT: same base/tag as build
  FROM mcr.microsoft.com/playwright:v1.54.2-noble AS prod
  WORKDIR /app
  
  # tiny utilities if you want
  RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*
  
  ENV NODE_ENV=production
  
  # bring only what you need
  COPY package.json pnpm-lock.yaml ./
  COPY --from=build /app/node_modules ./node_modules
  COPY --from=build /app/dist ./dist
  
  EXPOSE 5000
  CMD ["node", "dist/ws/server.js"]
  