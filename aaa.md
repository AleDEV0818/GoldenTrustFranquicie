# Sistema de KPIs de Franquicias (Cache + Jobs)

## 1. Objetivo General

Proveer métricas (totales y por franquicia) de forma rápida al frontend/SSR sin recalcular en cada request, usando una tabla caché (`intranet.franchise_cache`) y un mini-sistema de trabajos (cola) que refresca los datos bajo demanda o cuando quedan “stale” (obsoletos).

---

## 2. Funciones Principales y su Rol

| Función | Tipo | Rol |
|---------|------|-----|
| `intranet.franchise_cache_meta(date)` | Lectura (metadata) | Informa qué snapshot se usa, cuándo se actualizó, si está stale y si se está refrescando. |
| `intranet.refresh_franchise_cache(date, boolean)` | Refresco síncrono | Regenera la caché para una fecha (o toda) usando la fuente `intranet.franchise_kpis_dashboard(p_date)`. |
| `intranet.franchise_dashboard_fast(date)` | Lectura (detalle) | Devuelve filas formateadas (por franquicia) listas para mostrar. |
| `intranet.franchise_kpis_totals(date)` | Lectura (totales) | Devuelve totales globales formateados. |
| `intranet.enqueue_kpi_refresh(date)` | Encolado | Crea (si no existe ya) un job `queued` para refrescar una fecha. |
| `intranet.run_kpi_refresh_worker()` | Worker | Toma un job `queued`, lo marca `running`, ejecuta el refresco y termina en `done` o `failed`. |

---

## 3. Flujo Actual (Diseño Original con Historial)

1. Frontend/SSR pide panel para una fecha (ej. hoy).
2. Llama `franchise_cache_meta(hoy)`:
   - Determina `used_date` = `max(date1) <= hoy` o la máxima disponible.
   - Si `updated_at` viejo -> `is_stale = true`.
   - Indica si hay job `queued/running`.
3. Si `is_stale = true` y no hay `refreshing`:
   - Llama `enqueue_kpi_refresh(hoy)`.
   - Si no hay worker externo, invoca `run_kpi_refresh_worker()`.
4. Worker:
   - Toma job.
   - Ejecuta `refresh_franchise_cache(hoy, true)` que:
     - Borra (solo esa fecha) y reinserta filas para cada franquicia.
5. Lecturas:
   - `franchise_dashboard_fast(hoy)` → snapshot formateada.
   - `franchise_kpis_totals(hoy)` → totales formateados.
6. Frontend hace polling si `refreshing = true`.

Este modelo permite múltiples snapshots (una por `date1`), conservando historial.

---

## 4. Nueva Necesidad

> “No quiero que se guarden todas las actualizaciones en la tabla `intranet.franchise_cache`, solamente la última. Cuando venga la próxima actualización, que reescriba lo ya existente.”

Esto significa:
- No guardar histórico por fecha.
- Mantener únicamente un estado “vigente” (el más reciente) de las métricas para cada `location_id` / `franchise`.
- Opcional: seguir usando una `date1` única (la del corte actual) o eliminarla del modelo.

---

## 5. Opciones de Implementación

### Opción A (Cambio Mínimo – Mantener columna date1)
Mantienes la estructura actual pero siempre eliminas TODO antes de insertar la nueva snapshot. Resultado: la tabla contiene solo UNA fecha (`date1 = p_date` de la última corrida).

Ventajas:
- No cambias mucho el código existente.
- Las funciones que hoy buscan `max(date1)` seguirán funcionando (solo habrá una).
Desventajas:
- Lectores pueden ver la tabla vacía unos milisegundos entre `DELETE` e `INSERT` (mitigable con transacción o staging).

### Opción B (Refactor Ligero – Hacer date1 irrelevante)
- Seguir igual que A, pero con política fija: `date1 = current_date` (o un valor canónico).
- `meta` podría ignorar el parámetro p_date.

### Opción C (Refactor Profundo – Eliminar date1)
- Redefinir PK como `(location_id)` y quitar `date1`.
- Ajustar todas las funciones que hoy dependen de “snapshot por fecha”.
- Requiere reescritura de: `meta`, `dashboard_fast`, `totals`.
- Más limpio conceptualmente si ya no existe dimensión temporal.

### Opción D (Materialized View en lugar de tabla)
- Usar `REFRESH MATERIALIZED VIEW CONCURRENTLY` para reescritura única.
- Solo útil si la fuente es un SELECT puro y no necesitas ON CONFLICT ni manipulación especial.

---

## 6. Recomendación

Implementar la **Opción A** primero (menos riesgoso). Si más adelante confirmas que nunca necesitarás historial, evalúas Opción C.

---

## 7. Cambios Propuestos (Opción A)

### 7.1. Tabla (sin cambios estructurales obligatorios)
Asegúrate de que **no dependes** de más de un `date1`. No se requieren cambios físicos, pero puedes añadir un CHECK opcional:

```sql
ALTER TABLE intranet.franchise_cache
  ADD CONSTRAINT only_one_snapshot CHECK (
    date1 = (SELECT max(date1) FROM intranet.franchise_cache)
  ) NOT VALID;
-- (NOT VALID para no bloquear; puedes VALIDATE más tarde)
```

(Opcional; es más demostrativo que práctico.)

### 7.2. Modificar `refresh_franchise_cache` para borrar TODO

```sql
CREATE OR REPLACE FUNCTION intranet.refresh_franchise_cache(
    p_date date,
    p_full boolean DEFAULT true
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  -- Borrar TODO el contenido (snapshot anterior)
  TRUNCATE intranet.franchise_cache;

  -- Insertar NUEVA snapshot única
  INSERT INTO intranet.franchise_cache (
    date1, location_id, franchise,
    premium, policies, renewed_premium, renewed_policies,
    lost_premium, lost_policies, renewed_percent, max_percent,
    updated_at
  )
  SELECT
    p_date,
    s.location_id,
    s.franchise,
    COALESCE(NULLIF(replace(s.premium,          ',', ''), '')::numeric, 0),
    COALESCE(NULLIF(replace(s.policies,         ',', ''), '')::bigint,  0),
    COALESCE(NULLIF(replace(s.renewed_premium,  ',', ''), '')::numeric, 0),
    COALESCE(NULLIF(replace(s.renewed_policies, ',', ''), '')::bigint,  0),
    COALESCE(NULLIF(replace(s.lost_premium,     ',', ''), '')::numeric, 0),
    COALESCE(NULLIF(replace(s.lost_policies,    ',', ''), '')::bigint,  0),
    COALESCE(NULLIF(regexp_replace(s.renewed_percent, '[^0-9.\-]', '', 'g'), '')::numeric, 0),
    COALESCE(NULLIF(regexp_replace(s.max_percent,     '[^0-9.\-]', '', 'g'), '')::numeric, 0),
    now()
  FROM intranet.franchise_kpis_dashboard(p_date) AS s;
END;
$$;
```

Notas:
- Reemplaza `DELETE ... WHERE date1 = p_date;` por `TRUNCATE`.
- Quita `ON CONFLICT` (ya no hay filas previas).
- `TRUNCATE` es más rápido y evita scans (pero requiere privilegios y bloquea la tabla brevemente).
- Hazlo dentro de una transacción si quieres atomicidad con otras operaciones.

### 7.3. Sincronización y Lectores

Para minimizar el tiempo “vacío”:

```sql
BEGIN;
TRUNCATE intranet.franchise_cache;
INSERT ...
COMMIT;
```

Con `READ COMMITTED` la ventana vacía es muy breve. Si quieres 100% evitarla, usarías tabla staging y `ALTER TABLE` swap, pero probablemente no sea necesario.

### 7.4. Ajustar `franchise_cache_meta` (opcional simple)

Puedes dejar la versión actual (seguirá funcionando), porque `max(date1)` existirá (una sola fecha). Sin embargo, podrías simplificar:

```sql
CREATE OR REPLACE FUNCTION intranet.franchise_cache_meta(
  p_date date,
  p_stale_minutes integer DEFAULT 15
)
RETURNS TABLE(
  requested_date date,
  used_date date,
  as_of timestamptz,
  is_stale boolean,
  refreshing boolean
)
LANGUAGE sql
AS $$
  WITH only AS (
    SELECT
      (SELECT max(date1) FROM intranet.franchise_cache) AS use_date,
      (SELECT max(updated_at) FROM intranet.franchise_cache) AS as_of
  ),
  job AS (
    SELECT EXISTS (
      SELECT 1 FROM intranet.kpi_refresh_jobs
      WHERE date1 = p_date
        AND status IN ('queued','running')
    ) AS refreshing
  )
  SELECT
    p_date AS requested_date,
    o.use_date,
    o.as_of,
    CASE
      WHEN o.as_of IS NULL THEN true
      ELSE now() - o.as_of > make_interval(mins => p_stale_minutes)
    END AS is_stale,
    j.refreshing
  FROM only o, job j;
$$;
```

### 7.5. No Cambios Necesarios en:
- `franchise_dashboard_fast`
- `franchise_kpis_totals`

Seguirán funcionando: siempre habrá una sola fecha por lo que `max(date1)` devolverá esa.

---

## 8. (Opcional) Pasar a Opción C más adelante

Pasos resumidos si decides eliminar completamente la dimensión de fecha:

1. Crear nueva tabla:

```sql
CREATE TABLE intranet.franchise_cache_new (
  location_id integer PRIMARY KEY,
  franchise text NOT NULL,
  premium numeric NOT NULL,
  policies bigint NOT NULL,
  renewed_premium numeric NOT NULL,
  renewed_policies bigint NOT NULL,
  lost_premium numeric NOT NULL,
  lost_policies bigint NOT NULL,
  renewed_percent numeric NOT NULL,
  max_percent numeric NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

2. Ajustar `refresh_franchise_cache` (sin p_date):

```sql
CREATE OR REPLACE FUNCTION intranet.refresh_franchise_cache()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  TRUNCATE intranet.franchise_cache_new;
  INSERT INTO intranet.franchise_cache_new (...)
  SELECT ... FROM intranet.franchise_kpis_dashboard(current_date);
END;
$$;
```

3. Cambiar funciones de lectura a esta nueva tabla y eliminar parámetros de fecha o dejarlos ignorados.
4. Renombrar tablas (`ALTER TABLE ... RENAME TO ...`).
5. Actualizar backend Node para dejar de pasar fecha (o mantenerla para firma).

---

## 9. Consideraciones de Concurrencia

- Mientras se hace `TRUNCATE + INSERT`, un request que ejecute `dashboard_fast` puede ver vacío si coincide exactamente en la ventana. Mitigaciones:
  - Aceptar riesgo (probablemente bajo impacto).
  - Usar un “lock de aplicación” (`pg_advisory_lock`) si quieres serializar refrescos:
    ```sql
    PERFORM pg_advisory_lock(98765);
    -- refresco
    PERFORM pg_advisory_unlock(98765);
    ```
  - Staging table + swap (más complejo).

---

## 10. Monitoreo

Consultas útiles:

```sql
-- Última actualización global
SELECT max(updated_at) AS last_update FROM intranet.franchise_cache;

-- Conteo de filas (debe ser el número de franquicias vigente)
SELECT count(*) FROM intranet.franchise_cache;

-- Jobs activos
SELECT * FROM intranet.kpi_refresh_jobs WHERE status IN ('queued','running');

-- Jobs fallidos recientes
SELECT id, date1, last_error, finished_at
FROM intranet.kpi_refresh_jobs
WHERE status='failed'
ORDER BY finished_at DESC
LIMIT 5;
```

---

## 11. Resumen Ejecutivo

- Antes: se acumulaban snapshots por fecha (historial implícito).
- Ahora (requerido): mantener solo la última snapshot.
- Solución mínima: `TRUNCATE` + `INSERT` en la función de refresh; el resto de funciones sigue válido.
- Opcional futuro: eliminar columna `date1` y simplificar todo el pipeline.

---

## 12. Checklist de Implementación (Opción A)

| Paso | Acción | Estado (✔/✖) |
|------|--------|--------------|
| 1 | Confirmar backup previo de la tabla | |
| 2 | Modificar `refresh_franchise_cache` para usar `TRUNCATE` | |
| 3 | (Opcional) Simplificar `franchise_cache_meta` | |
| 4 | Probar refresh manual | |
| 5 | Verificar lecturas (`dashboard_fast`, `kpis_totals`) | |
| 6 | Revisar endpoints Node (no requieren cambios) | |
| 7 | Ejecutar pruebas de concurrencia (simples) | |
| 8 | Limpiar jobs antiguos si ya no necesitas histórico | |
| 9 | Documentar nueva política (sin historial) | |
| 10 | (Opcional) Programar tarea de refresco periódica | |

---

## 13. Riesgos / Trade-offs

| Riesgo | Mitigación |
|--------|------------|
| Ventana breve sin datos | Usar transacción, staging o aceptar riesgo. |
| Necesidad futura de histórico | Guardar histórico en tabla separada antes de truncar. |
| Lecturas durante refresco | Retornar meta.refreshing=true para que frontend entienda estado. |
| Fallo durante inserción deja tabla vacía | Envolver en transacción; si error, rollback evita pérdida. |

Ejemplo con staging (si alguna vez lo requieres):

```sql
BEGIN;
CREATE TEMP TABLE _new_cache AS
SELECT ... FROM intranet.franchise_kpis_dashboard(p_date);

TRUNCATE intranet.franchise_cache;
INSERT INTO intranet.franchise_cache
SELECT * FROM _new_cache;
COMMIT;
```

---

## 14. Siguientes Pasos Opcionales

- Añadir función `intranet.force_refresh_latest()` que ignore fecha y refresque solo “ahora”.
- Guardar histórico ligero (solo totales) en una tabla `intranet.franchise_cache_audit(date1, total_premium, total_policies, updated_at)`.
- Métricas de auditoría (número de refrescos por día, duración, errores).

---

## 15. Ejemplo Final de la Función Ajustada

```sql
CREATE OR REPLACE FUNCTION intranet.refresh_franchise_cache(
    p_date date,
    p_full boolean DEFAULT true
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  TRUNCATE intranet.franchise_cache;

  INSERT INTO intranet.franchise_cache (
    date1, location_id, franchise,
    premium, policies, renewed_premium, renewed_policies,
    lost_premium, lost_policies, renewed_percent, max_percent,
    updated_at
  )
  SELECT
    p_date,
    s.location_id,
    s.franchise,
    COALESCE(NULLIF(replace(s.premium,          ',', ''), '')::numeric, 0),
    COALESCE(NULLIF(replace(s.policies,         ',', ''), '')::bigint,  0),
    COALESCE(NULLIF(replace(s.renewed_premium,  ',', ''), '')::numeric, 0),
    COALESCE(NULLIF(replace(s.renewed_policies, ',', ''), '')::bigint,  0),
    COALESCE(NULLIF(replace(s.lost_premium,     ',', ''), '')::numeric, 0),
    COALESCE(NULLIF(replace(s.lost_policies,    ',', ''), '')::bigint,  0),
    COALESCE(NULLIF(regexp_replace(s.renewed_percent, '[^0-9.\-]', '', 'g'), '')::numeric, 0),
    COALESCE(NULLIF(regexp_replace(s.max_percent,     '[^0-9.\-]', '', 'g'), '')::numeric, 0),
    now()
  FROM intranet.franchise_kpis_dashboard(p_date) s;
END;
$$;
```

---

## 16. Preguntas Frecuentes (FAQ)

**¿Qué pasa si dos procesos refrescan a la vez?**  
Si ambos hacen TRUNCATE + INSERT casi al mismo tiempo, prevalece el último. Si esto es un problema, usa un advisory lock.

**¿Cómo conservo histórico si algún día lo quiero?**  
Antes del TRUNCATE puedes volcar un resumen:
```sql
INSERT INTO intranet.franchise_cache_history (date1, aggregated_json, saved_at)
SELECT date1, jsonb_agg(to_jsonb(c.*)), now()
FROM intranet.franchise_cache c
GROUP BY date1;
```

**¿Puedo seguir usando los parámetros de fecha en las funciones?**  
Sí, aunque ya no aporten. Permite no tocar el backend todavía.

---

¿Quieres que te genere también la variante “sin date1” (Opción C) lista para ejecutar? Me dices y la preparo.
