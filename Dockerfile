FROM node:22-alpine

ENV NODE_ENV=production \
    DATA_DIR=/data

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY src ./src

# Dossier des données JSON : à monter sur un volume persistant.
RUN mkdir -p /data && chown node:node /data

USER node

CMD ["node", "src/index.js"]
