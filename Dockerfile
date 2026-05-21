FROM node:18 AS builder
WORKDIR /app

# Hanya copy package.json, tanpa lockfile bawaan Windows
COPY package.json ./

# Tambahkan flag --no-audit dan --no-fund biar prosesnya cepet dan bersih
RUN npm install --legacy-peer-deps --no-audit --no-fund

COPY . .

# Jalankan build Vite
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]