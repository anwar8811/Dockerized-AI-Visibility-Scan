# syntax=docker/dockerfile:1

# ---- Stage 1: build ----
# Needs the full Rust toolchain (rustc, cargo) to compile; none of this
# stage ends up in the final image.
FROM rust:1-slim-bookworm AS build
WORKDIR /app/analyzer

COPY Cargo.toml Cargo.lock ./
COPY src ./src

# --release: no debug symbols/assertions, optimized binary - this is what
# actually runs in the runtime stage below.
RUN cargo build --release

# ---- Stage 2: runtime ----
# Slim image: only the compiled binary, no Rust toolchain, no source. Same
# Debian base (bookworm) as the build stage so the binary's glibc version
# matches exactly - a mismatched base here is the classic "GLIBC_X.XX not
# found" runtime error.
FROM debian:bookworm-slim AS runtime
WORKDIR /app/analyzer

COPY --from=build /app/analyzer/target/release/analyzer ./analyzer

RUN groupadd --system app && useradd --system --gid app app
USER app

EXPOSE 8080
CMD ["./analyzer"]
