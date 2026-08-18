# Playwright's own image already carries Chromium plus every system library it
# needs. Building from a bare node image means chasing ~40 apt packages, and
# they drift with each Chromium bump — not worth owning.
# Keep this tag pinned to the playwright version in package.json.
FROM mcr.microsoft.com/playwright:v1.49.1-jammy

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY server.js ./

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

# Don't run the browser as root.
USER pwuser

CMD ["node", "server.js"]
