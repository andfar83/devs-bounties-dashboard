FROM node:24-bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive
ENV PYTHONUNBUFFERED=1

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    git \
    python3 \
    python3-pip \
    python3-venv \
    unzip \
    xz-utils \
  && rm -rf /var/lib/apt/lists/*

RUN python3 -m venv /opt/agent-tools \
  && /opt/agent-tools/bin/pip install --no-cache-dir --upgrade pip \
  && /opt/agent-tools/bin/pip install --no-cache-dir semgrep slither-analyzer

RUN curl -L --fail --retry 3 -o /tmp/foundry.tar.gz https://github.com/foundry-rs/foundry/releases/download/v1.7.1/foundry_v1.7.1_linux_amd64.tar.gz \
  && mkdir -p /opt/foundry \
  && tar -xzf /tmp/foundry.tar.gz -C /opt/foundry \
  && rm /tmp/foundry.tar.gz

ENV PATH="/opt/agent-tools/bin:/opt/foundry:${PATH}"

RUN git --version \
  && node --version \
  && semgrep --version \
  && slither --version \
  && forge --version

WORKDIR /app

COPY package.json ./package.json
COPY scrape-engine ./scrape-engine
COPY agent-worker ./agent-worker

WORKDIR /app/agent-worker
EXPOSE 8080
CMD ["node", "./src/server.mjs"]
