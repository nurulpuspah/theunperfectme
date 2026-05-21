# Langkah 1: Build aplikasi pakai Node berbasis Debian Slim (lebih bersahabat dengan Tailwind v4)
FROM node:18-slim AS builder
WORKDIR /app

# Copy package.json dan package-lock.json
COPY package*.json ./

# Jalankan instalasi dependency secara bersih
RUN npm ci

# Copy seluruh source code aplikasi
COPY . .

# Jalankan proses build Vite
RUN npm run build


# Langkah 2: Jalankan hasil build pakai web server Nginx
FROM nginx:alpine

# Copy hasil build dari stage builder ke folder default Nginx
COPY --from=builder /app/dist /usr/share/nginx/html

# Buka port 80 untuk akses web
EXPOSE 80

# Jalankan Nginx
CMD ["nginx", "-g", "daemon off;"]