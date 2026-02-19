FROM mcr.microsoft.com/devcontainers/typescript-node:20-bookworm

# Avoid prompts from apt
ENV DEBIAN_FRONTEND=noninteractive

# Install dependencies
RUN apt-get update && apt-get install -y \
    git \
    xvfb \
    x11vnc \
    openbox \
    supervisor \
    python3 \
    python3-pip \
    novnc \
    websockify \
    procps \
    xdg-utils \
    python3-xdg \
    x11-xserver-utils \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Install noVNC
RUN git clone --depth 1 --branch v1.6.0 https://github.com/novnc/noVNC.git /usr/local/novnc \
    && git clone --depth 1 --branch v0.13.0 https://github.com/novnc/websockify /usr/local/novnc/utils/websockify

# Set up working directory
WORKDIR /app

# Install Playwright
COPY package.json package-lock.json* ./
RUN npm install .

# Install browsers with dependencies
RUN npx playwright@1.51 install --with-deps chromium

# Copy scripts
COPY playwright-server.js /app/playwright-server.js
COPY x11-setup.sh /app/x11-setup.sh
COPY launch-session.sh /app/launch-session.sh
COPY app.js /app/app.js

# Make scripts executable
RUN chmod +x /app/x11-setup.sh /app/launch-session.sh

# Create a simple openbox configuration to only show the browser window
RUN mkdir -p /root/.config/openbox
COPY openbox-rc.xml /root/.config/openbox/rc.xml

# Expose ports: noVNC web interface, and Playwright server
#EXPOSE 6080 37367

ENV PLAYWRIGHT_WS_PATH="default"

# Set the display environment variable
#ENV DISPLAY=:99

RUN mkdir -p /workspace
WORKDIR /workspace

COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]

# Start services
CMD ["node", "/app/app.js", "--script", "/app/launch-session.sh"]
