FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src

RUN npm run build

FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit dev

COPY --from=builder /app/dist ./dist
COPY system_prompt.txt ./

USER node

EXPOSE 3000

CMD ["node", "dist/index.js"]
