FROM node:18 AS builder
WORKDIR /app

# Copy file package.json dan package-lock.json (jika ada)
COPY package*.json ./

# Pake perintah 'npm ci' + flag os linux agar dia wajib download ulang murni versi Linux
RUN npm ci --os=linux --cpu=x64 --legacy-peer-deps

COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]