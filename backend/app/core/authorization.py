"""Authorization policy — единый источник истины (#113).

Две точки применения (обе ссылаются на константы этого модуля):
- write-gate (`main.check_write_access_middleware`): запись только для
  `WRITE_REQUIRED_ROLE` (allow-list) — viewer-роль read-only;
- read-gate (`deps.get_current_user`): deny-list — `DENIED_ACCESS_LEVEL`
  блокирует доступ ко всему, остальные роли читают.

Роли бинарные: `admin` / `viewer` (check-constraint `ck_users_role`).
"""

WRITE_REQUIRED_ROLE = "admin"
DENIED_ACCESS_LEVEL = "no_access"
