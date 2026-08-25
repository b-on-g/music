FROM node:22-slim

RUN apt-get update \
	&& apt-get install -y --no-install-recommends ffmpeg curl ca-certificates python3 \
	&& rm -rf /var/lib/apt/lists/*

# yt-dlp отдельным слоем и с cache-buster'ом. В одном слое с apt он намертво
# кешировался: `latest` в URL ничего не значит, если Docker слой не пересобирает,
# и образ месяцами носил июльский бинарь. Протухший yt-dlp получает от YouTube
# 403 на медиа-поток, при живом поиске — выглядит как «качалка молчит».
# В рабочем деплое бинарь монтируется с хоста (см. compose.yml), этот слой —
# только для сборки с нуля. Пересобрать с конкретной версией:
# docker compose build --build-arg YTDLP=2026.08.19 tube
ARG YTDLP=latest
RUN if [ "$YTDLP" = latest ]; then \
		url=https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp; \
	else \
		url=https://github.com/yt-dlp/yt-dlp/releases/download/$YTDLP/yt-dlp; \
	fi \
	&& curl -fsSL "$url" -o /usr/local/bin/yt-dlp \
	&& chmod +x /usr/local/bin/yt-dlp \
	&& /usr/local/bin/yt-dlp --version

WORKDIR /app
COPY package.json .
RUN npm install --omit=dev
COPY node.js .

ENV BOG_MUSIC_TUBE_PORT=9092
EXPOSE 9092
CMD ["node", "node.js"]
