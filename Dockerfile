# Base Image
FROM oven/bun:1

# Workdir
WORKDIR /app

# Install Deps
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile

# Copy Source
COPY . .

# Environment
ENV PORT=3000

# Expose
EXPOSE 3000

# Start
CMD ["bun", "run", "src/server.ts"]
