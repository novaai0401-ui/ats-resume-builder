# Minimal image for the Render cron services (R-088). The script is the
# ENTRYPOINT, so render.yaml needs NO dockerCommand — Render's argv-level
# dockerCommand parsing is what broke the previous curl one-liners.
FROM alpine:3.20
RUN apk add --no-cache curl
COPY run-cron.sh /run-cron.sh
RUN chmod +x /run-cron.sh
ENTRYPOINT ["/bin/sh", "/run-cron.sh"]
