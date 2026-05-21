# Langkah 1: Build aplikasi menggunakan Node versi lengkap (bukan slim/alpine)
FROM node:18 AS builder
WORKDIR /app

# HANYA copy package.json agar lockfile lama yang eror diabaikan total
COPY package.json ./

# Paksa hapus cache dan install package bersih langsung untuk arsitektur Linux
RUN npm cache clean --force && \
    npm install --os=linux --cpu=x64 --legacy-peer-deps

# Baru copy sisa file project lainnya
COPY . .

# Jalankan build Vite
RUN npm run build


# Langkah 2: Jalankan menggunakan Nginx
FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]