FROM python:3.11-slim-bookworm

# rclone — один статический бинарник для внешней копии бэкапов (#126):
# SMB/CIFS, SFTP, FTP(S), WebDAV, NFS и локальные диски без монтирований.
# Версия закреплена; при запуске backend без контейнера путь задаётся RCLONE_PATH.
COPY --from=rclone/rclone:1.75.2 /usr/local/bin/rclone /usr/local/bin/rclone
RUN chmod +x /usr/local/bin/rclone

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libpq-dev \
    postgresql-client \
    fontconfig \
    && rm -rf /var/lib/apt/lists/*


COPY fonts/ /usr/local/share/fonts/hrms/
RUN fc-cache -f -v

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN sed -i 's/\r$//' entrypoint.sh && chmod +x entrypoint.sh

EXPOSE 8000

ENTRYPOINT ["/app/entrypoint.sh"]
