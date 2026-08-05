# Base Node Debian-slim image
FROM node:20-slim

WORKDIR /app

# Install OpenSSL and CA Certificates for Prisma
RUN apt-get update -y && apt-get install -y openssl ca-certificates

# Copy dependency configs
COPY package*.json ./
COPY prisma ./prisma/

# Install dependencies
RUN npm ci

# Copy application source
COPY . .

# Generate Prisma Client
RUN npx prisma generate

EXPOSE 5000

CMD ["npm", "start"]
