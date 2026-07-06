FROM node:22-slim

RUN apt-get update \
	&& apt-get install -y --no-install-recommends ffmpeg curl ca-certificates python3 \
	&& rm -rf /var/lib/apt/lists/* \
	&& curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
	&& chmod +x /usr/local/bin/yt-dlp

WORKDIR /app
COPY package.json .
RUN npm install --omit=dev
COPY node.js .

ENV BOG_MUSIC_TUBE_PORT=9092
EXPOSE 9092
CMD ["node", "node.js"]
