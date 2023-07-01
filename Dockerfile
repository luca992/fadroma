FROM registry.hub.docker.com/library/rust:1.70-slim@sha256:c1df230815034aecf0b4bfeae2df100a7c4fdd5eb12dd5a3985f4bd6b5e6bf18

# Install Rust
RUN rustup default 1.70 && \
  rustup target add wasm32-unknown-unknown && \
  rustup toolchain list && \
  rustup target list
#RUN rustup toolchain install nightly && \
  #rustup target add --toolchain nightly wasm32-unknown-unknown && \
  #rustup toolchain list && \
  #rustup target list
#RUN rustup component add llvm-tools-preview && cargo install grcov

# Install Node and PNPM
RUN apt update && \
  apt install -y nodejs npm binaryen git curl wget clang cmake wabt jq tree && \
  ls -al /var/cache/apt/archives && \
  apt-get clean
RUN npm i -g n && n i 20
RUN corepack enable

# Install Docker CLI
ENV DOCKERVERSION=20.10.23
RUN curl -fsSLO https://download.docker.com/linux/static/stable/x86_64/docker-${DOCKERVERSION}.tgz \
  && tar xzvf docker-${DOCKERVERSION}.tgz --strip 1 \
                 -C /usr/local/bin docker/docker \
  && rm docker-${DOCKERVERSION}.tgz

ENV LLVM_PROFILE_FILE="%p-%m.profraw"

RUN git config --global --add safe.directory "*"
RUN git config --global http.postBuffer 524288000
RUN git config --global http.lowSpeedTime 600
