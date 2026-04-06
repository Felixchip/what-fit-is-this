FROM node:20-slim

RUN apt-get update && apt-get install -y \
  ffmpeg \
  python3 \
  python3-pip \
  curl \
  --no-install-recommends && \
  curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp && \
  chmod a+rx /usr/local/bin/yt-dlp && \
  apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY src/ ./src/

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["node", "src/index.js"]
