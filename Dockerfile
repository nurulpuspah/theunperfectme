FROM node:18 AS builder
WORKDIR /app

COPY package.json ./

# Paksa instalasi standar agar menarik semua dependency, termasuk Rollup Linux tadi
RUN npm install --legacy-peer-deps

COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]