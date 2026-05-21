# Langkah 1: Build aplikasi menggunakan Node standar (Debian)
FROM node:18 AS builder
WORKDIR /app

# Copy file konfigurasi package
COPY package.json ./

# Pasang dependency dengan mengabaikan binary optional bawaan OS (Kunci sukses Tailwind v4)
RUN npm install --no-optional --legacy-peer-deps

# Copy seluruh source code project
COPY . .

# Jalankan proses build Vite untuk menghasilkan folder dist
RUN npm run build


# Langkah 2: Sediakan web server menggunakan Nginx ringan
FROM nginx:alpine

# Copy hasil build dari stage builder ke dalam folder Nginx
COPY --from=builder /app/dist /usr/share/nginx/html

# Buka port 80 untuk akses web umum
EXPOSE 80

# Jalankan web server Nginx
CMD ["nginx", "-g", "daemon off;"]