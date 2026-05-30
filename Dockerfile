FROM node:22-alpine AS base

WORKDIR /app

COPY package*.json ./

FROM base AS development

ENV NODE_ENV=development

RUN npm ci

COPY tsconfig.json tsconfig.build.json jest.config.ts ./
COPY src ./src
COPY tests ./tests

EXPOSE 3010

CMD ["npm", "run", "dev"]

FROM base AS build

RUN npm ci

COPY tsconfig.json tsconfig.build.json ./
COPY src ./src

RUN npm run build
RUN npm prune --omit=dev

FROM node:22-alpine AS production

ENV NODE_ENV=production
ENV PORT=3010

WORKDIR /app

COPY package*.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist

EXPOSE 3010

CMD ["npm", "start"]
