# Tahap 1: Build aplikasi di dalam server Linux GCP
FROM node:18 AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install --legacy-peer-deps
COPY . .
RUN npm run build

# Tahap 2: Jalankan menggunakan Nginx dengan konfigurasi port dinamis
FROM nginx:alpine

# Trik khusus agar Nginx mendengarkan variable $PORT dari Google Cloud Run
CMD ["/bin/sh", "-c", "exec nginx -g 'daemon off;'"]

COPY --from=builder /app/dist /usr/share/nginx/html

# Ganti konfigurasi default Nginx agar membaca port 8080 sesuai maunya GCP
RUN sed -i 's/listen       80;/listen       8080;/g' /etc/nginx/conf.d/default.conf

EXPOSE 8080