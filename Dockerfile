# Langkah 1: Build aplikasi pakai Node.js berbasis Alpine Linux
FROM node:18-alpine AS builder
WORKDIR /app

# Copy package.json dan package-lock.json
COPY package*.json ./

# Install dependencies secara bersih termasuk native binding Tailwind untuk Linux
RUN npm install --include=optional && npm rebuild

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