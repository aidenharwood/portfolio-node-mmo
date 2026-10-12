# Cel Blade server image: the game client and the realm in one Node process.
#   docker build -t celblade .
#   docker run -p 8080:8080 -v celblade-data:/data celblade
FROM node:22.18.0-alpine

WORKDIR /app
ENV NODE_ENV=production PORT=8080 DATA_DIR=/data

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY server ./server
COPY src ./src
COPY index.html style.css manifest.webmanifest icon.svg ./

RUN mkdir -p /data && chown node:node /data
VOLUME /data
EXPOSE 8080
USER node

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1
CMD ["node", "--disable-warning=ExperimentalWarning", "server/main.js"]
