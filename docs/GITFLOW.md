# Git Flow

Convenciones de ramas, commits y pull requests para el proyecto **Nexo Support**.

---

## Ramas principales

| Rama | Propósito |
|---|---|
| `main` | Producción estable — solo merges desde `release/*` o `hotfix/*` |
| `develop` | Integración de features — rama base para desarrollo |

---

## Ramas de trabajo

| Tipo | Convención | Base |
|---|---|---|
| Feature | `feature/<descripcion>` | `develop` |
| Release | `release/<version>` | `develop` |
| Hotfix | `hotfix/<descripcion>` | `main` |

### Ejemplos

```text
feature/tournament-crud
feature/supabase-client
release/1.0.0
hotfix/fix-attendance-delete
```

---

## Commits

- Idioma: **inglés**
- Formato: imperativo, conciso
- Scope opcional entre paréntesis

### Ejemplos

```text
feat(bot): add supabase client and ping command
docs: document attendance table schema
chore(prisma): scaffold schema for schedules
fix(attendance): revert work count on delete
```

---

## Pull requests

1. Abrir PR hacia `develop` (features) o `main` (hotfixes).
2. Título en inglés, descripción con contexto y plan de prueba.
3. Revisar que no haya secrets en el diff.
4. Squash merge recomendado para features.

---

## Versionado

Seguir [Semantic Versioning](https://semver.org/): `MAJOR.MINOR.PATCH`

- **MAJOR** — cambios incompatibles
- **MINOR** — nueva funcionalidad compatible
- **PATCH** — correcciones de bugs

---

## Referencia

Ver [`AGENTS.md`](./AGENTS.md) para convenciones de código y [`INDEX.md`](./INDEX.md) para el mapa de documentación.
