FROM alpine:3.20

RUN apk add --no-cache pgbouncer postgresql-client ca-certificates tzdata \
    && mkdir -p /etc/pgbouncer \
    && chown -R nobody:nobody /etc/pgbouncer

COPY entrypoint.sh /usr/local/bin/pgbouncer-entrypoint.sh
RUN chmod 0755 /usr/local/bin/pgbouncer-entrypoint.sh

USER nobody
EXPOSE 6432
ENTRYPOINT ["/usr/local/bin/pgbouncer-entrypoint.sh"]
