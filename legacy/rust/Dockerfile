# Builder stage
FROM rust:1.84-slim-bookworm as builder

WORKDIR /usr/src/app
COPY . .

# Install dependencies needed for some crates
RUN apt-get update && apt-get install -y pkg-config libssl-dev && rm -rf /var/lib/apt/lists/*

# Build release
RUN cargo build --release

# Runtime stage
FROM debian:bookworm-slim

WORKDIR /usr/local/bin

# Install runtime dependencies
RUN apt-get update && apt-get install -y ca-certificates libssl3 && rm -rf /var/lib/apt/lists/*

COPY --from=builder /usr/src/app/target/release/api .

# Run as non-root (best practice, though Railway runs as root by default often suitable to specify USER 1000)
# We will keep it simple for now, but ensure it listens on PORT
CMD ["./api"]
