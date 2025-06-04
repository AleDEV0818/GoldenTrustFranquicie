A continuación se presenta un resumen en formato Markdown de los procesos y vistas definidas en la base de datos, describiendo qué hace cada una y mostrando fragmentos clave de su código.

---

# Resumen de Procesos en la Base de Datos

Esta base de datos utiliza múltiples vistas para transformar y consolidar la información de pólizas de seguros, permitiendo alimentar dashboards y reportes. Cada vista resume la información de ventas, cancelaciones y desempeño (diario, mensual y anual) segmentada por tipo de negocio. A continuación se describe cada vista, su propósito y se resalta la parte crucial del código.

---

## 1. `intranet.agency_location_corp_daily`

**Propósito:**  
Genera un resumen diario para ubicaciones corporativas de la agencia. La vista agrupa las pólizas emitidas el día actual por tipo de negocio:
- **New Business**
- **Renewal**
- **Rewrite**
- **Total (global)**

**Fragmento clave:**
```sql
CREATE OR REPLACE VIEW intranet.agency_location_corp_daily AS
 SELECT 'New Business'::text AS business_type,
        sum(s.premium) AS premium,
        count(s.binder_date) AS policies
   FROM qq.policies s
  WHERE s.business_type::text = 'N'::text 
    AND s.lob_id <> 34 
    AND s.lob_id <> 40 
    AND (s.policy_status::text = 'C'::text OR s.policy_status::text = 'A'::text)
    AND s.binder_date = CURRENT_DATE 
    AND s.premium > '$1.00'::money
UNION
 -- (Se repiten bloques similares para 'Renewal', 'Rewrite' y 'Total')
```

**Explicación:**  
Filtra las pólizas del día actual según criterios de negocio, estado, ramos y valor mínimo; luego agrupa y suma primas y contabiliza pólizas por categoría.

---

## 2. `intranet.agency_dashboard_agencies`

**Propósito:**  
Genera un reporte mensual del desempeño de cada agencia (ubicación) para nuevos negocios, mostrando:
- Número de pólizas emitidas.
- Suma total de primas.
- Porcentaje de crecimiento/reducción respecto al mes anterior.

**Fragmento clave:**
```sql
CREATE OR REPLACE VIEW intranet.agency_dashboard_agencies AS
 SELECT l.location_id AS id_location,
        nbl.location,
        nbl.policies,
        nbl.premium,
        CASE
          WHEN nbl.lmpremium = '$0.00'::money THEN '0'::numeric
          ELSE round((nbc.premium / nbl.lmpremium * 100::double precision)::numeric, 1) - 100::numeric
        END AS percent
   FROM (
         SELECT tm.location, tm.policies, tm.premium, llm.lmpolicies, llm.lmpremium
           FROM (
                 SELECT l_1.alias AS location,
                        count(qq_policies.binder_date) AS policies,
                        sum(qq_policies.premium) AS premium
                   FROM qq.policies qq_policies
                   JOIN qq.contacts c ON c.entity_id = qq_policies.customer_id
                   JOIN qq.locations l_1 ON c.location_id = l_1.location_id
                  WHERE qq_policies.business_type::text = 'N'::text 
                    AND date_trunc('month', qq_policies.binder_date) = date_trunc('month', CURRENT_DATE)
                    ... 
                  GROUP BY l_1.alias
                ) tm
           LEFT JOIN (
                 -- (Subconsulta para datos del mes anterior)
                ) llm ON llm.location::text = tm.location::text
        ) nbl
 LEFT JOIN qq.locations l ON initcap(TRIM(BOTH FROM l.alias::text)) = initcap(TRIM(BOTH FROM nbl.location::text))
 ORDER BY nbl.premium DESC;
```

**Explicación:**  
Une datos del mes actual y del mes anterior para calcular la variación porcentual en primas generadas por cada agencia.

---

## 3. `intranet.agency_csr_last_week`

**Propósito:**  
Presentar un ranking de los tres CSR (representantes de servicio) con mejor desempeño durante la última semana (en nuevos negocios), mostrando:
- Nombre del CSR.
- Número de pólizas.
- Total de primas (formateado).

**Fragmento clave:**
```sql
CREATE OR REPLACE VIEW intranet.agency_csr_last_week AS
 SELECT u.display_name AS csr,
        count(p.binder_date) AS policies,
        to_char(sum(p.premium)::numeric, '$FM999,999') AS premium,
        u.entity_id AS id_user,
        l.alias AS location
   FROM qq.policies p
   JOIN qq.contacts u ON p.csr_id = u.entity_id
   JOIN qq.locations l ON l.location_id = u.location_id
  WHERE u.contact_type::text = 'E'::text 
    AND u.status::text = 'A'::text 
    AND p.binder_date >= (date_trunc('week', now()) - '7 days'::interval)
    AND p.binder_date < date_trunc('week', now())
    AND p.lob_id <> 34 
    AND p.lob_id <> 40 
    AND p.business_type::text = 'N'::text
  GROUP BY l.alias, u.entity_id
  ORDER BY sum(p.premium) DESC
  LIMIT 3;
```

**Explicación:**  
Combina información de pólizas, contactos y ubicaciones para identificar a los CSR con mayor generación de primas la semana anterior.

---

## 4. `intranet.cancellation_last_month`

**Propósito:**  
Generar un reporte de cancelaciones relevantes en el último mes, calculando el valor ajustado de la prima según la duración de la vigencia de la póliza. Excluye cancelaciones compensadas (cuando existe una nueva emisión o reescritura).

**Fragmento clave:**
```sql
CREATE OR REPLACE VIEW intranet.cancellation_last_month AS
 SELECT c.display_name AS name,
        l.display_name AS line_of_business,
        csr.display_name AS csr,
        loc.location_name AS location,
        CASE
          WHEN policies.term::text ~~ '%S%'::text
           THEN policies.premium - ((policies.cancellation_date - policies.effective_date) * policies.premium / 183)
          ELSE policies.premium - ((policies.cancellation_date - policies.effective_date) * policies.premium / 365)
        END AS premium,
        policies.cancellation_date
   FROM qq.policies policies
   JOIN qq.contacts c ON c.entity_id = policies.customer_id
   JOIN qq.lob l ON policies.lob_id = l.lob_id
   JOIN qq.contacts csr ON csr.entity_id = policies.csr_id
   JOIN qq.locations loc ON loc.location_id = c.location_id
  WHERE policies.cancellation_date >= date_trunc('month', now() - '1 year'::interval)
    AND policies.policy_status::text = 'C'::text
    AND policies.premium > '$1.00'::money
    AND NOT (EXISTS (SELECT NULL FROM ...))
```

**Explicación:**  
Calcula el impacto de una cancelación ajustando la prima en función de los días transcurridos y filtra aquellas cancelaciones que están compensadas.

---

## 5. `intranet.dashboard_company`

**Propósito:**  
Proporciona un resumen mensual del desempeño por compañía (carrier) en nuevos negocios, mostrando:
- Número de pólizas.
- Suma total de primas.
- Variación porcentual en primas respecto al mes anterior.

**Fragmento clave:**
```sql
CREATE OR REPLACE VIEW intranet.dashboard_company AS
 SELECT l.entity_id AS id_company,
        nbc.company,
        nbc.policies,
        nbc.premium,
        CASE 
          WHEN nbc.lmpremium = '$0.00'::money 
          THEN '0'::numeric 
          ELSE round((nbc.premium / nbc.lmpremium * 100::double precision)::numeric, 1) - 100::numeric
        END AS percent
 FROM (
       -- Subconsulta que une datos del mes actual y del mes anterior por compañía
      ) nbc
 LEFT JOIN qq.contacts l ON initcap(TRIM(BOTH FROM l.display_name)) = initcap(TRIM(BOTH FROM nbc.company::text))
 WHERE l.status::text = 'A'::text
 ORDER BY nbc.premium DESC;
```

**Explicación:**  
Agrupa la información de carriers y calcula la variación porcentual de primas, permitiendo analizar el rendimiento mensual.

---

## 6. `intranet.dashboard_company_today`

**Propósito:**  
Proporciona un resumen del rendimiento del día actual, clasificado en:
- New Business
- Renewal
- Rewrite
- Total (acumulado)

**Fragmento clave:**
```sql
CREATE OR REPLACE VIEW intranet.dashboard_company_today AS
 SELECT 'New Business'::text AS business_type,
        sum(s.premium) AS premium,
        count(s.binder_date) AS policies
   FROM qq.policies s
  WHERE s.business_type::text = 'N'::text
    AND s.binder_date = CURRENT_DATE
    ...
UNION
 -- Bloques similares para Renewal, Rewrite y Total
```

**Explicación:**  
Filtra y agrupa las pólizas del día actual según el tipo de negocio para obtener un resumen inmediato de la actividad.

---

## 7. `intranet.dashboard_company_year`

**Propósito:**  
Resumen anual del desempeño para cada tipo de negocio (New Business, Renewal, Rewrite y TOTAL), con proyecciones anuales:
- Suma acumulada de primas y número de pólizas.
- Proyecciones anuales (`premiumtkg` y `policiestkg`)

**Fragmento clave:**
```sql
CREATE OR REPLACE VIEW intranet.dashboard_company_year AS
 SELECT business_type,
        premium,
        policies,
        CASE
          WHEN CURRENT_DATE = make_date(EXTRACT(year FROM CURRENT_DATE)::integer, 1, 1)
          THEN premium * 365
          ELSE premium / (CURRENT_DATE - make_date(EXTRACT(year FROM CURRENT_DATE)::integer, 1, 1)) * 365
        END AS premiumtkg,
        CASE
          WHEN CURRENT_DATE = make_date(EXTRACT(year FROM CURRENT_DATE)::integer, 1, 1)
          THEN round((policies * 365)::numeric, 0)
          ELSE round((policies::double precision / (CURRENT_DATE - make_date(EXTRACT(year FROM CURRENT_DATE)::integer, 1, 1)) * 365)::numeric, 0)
        END AS policiestkg
 FROM (
       -- Unión de resultados por tipo de negocio desde el inicio del año hasta hoy
      ) unnamed_subquery;
```

**Explicación:**  
Calcula tanto los totales acumulados del año como proyecciones anuales basadas en el promedio diario.

---

## 8. `intranet.dashboard_sales_last_year`

**Propósito:**  
Resumen mensual global de ventas durante el último año, sin segmentar por tipo de negocio.

**Fragmento clave:**
```sql
CREATE OR REPLACE VIEW intranet.dashboard_sales_last_year AS
 SELECT to_char(date_trunc('month', now()) - '1 year'::interval, 'MM') AS month,
        to_char(date_trunc('month', now()) - '1 year'::interval, 'yyyy') AS year,
        count(policies.binder_date) AS policies,
        sum(policies.premium) AS premium
 FROM qq.policies
 WHERE policies.binder_date >= (date_trunc('month', now()) - '1 year'::interval)
   AND policies.binder_date < (date_trunc('month', now()) - '11 mons'::interval)
   ...
 UNION
 -- Bloques para cada mes hasta llegar al mes actual
```

**Explicación:**  
Realiza un UNION sobre bloques de SELECT para cada mes del último año, agrupando totales de pólizas y primas.

---

## 9. `intranet.dashboard_sales_last_year_cn`

**Propósito:**  
Resumen mensual de cancelaciones ocurridas durante el último año (cuenta y suma de primas), a partir de la vista de cancelaciones.

**Fragmento clave:**
```sql
CREATE OR REPLACE VIEW intranet.dashboard_sales_last_year_cn AS
 SELECT to_char(date_trunc('month', now()) - '1 year'::interval, 'MM') AS month,
        to_char(date_trunc('month', now()) - '1 year'::interval, 'yyyy') AS year,
        count(cancellation_last_month.cancellation_date) AS polcan,
        CASE WHEN sum(cancellation_last_month.premium) IS NULL THEN '$0.00'::money 
             ELSE sum(cancellation_last_month.premium) 
        END AS premcan
 FROM intranet.cancellation_last_month
 WHERE cancellation_last_month.cancellation_date >= (date_trunc('month', now()) - '1 year'::interval)
   AND cancellation_last_month.cancellation_date < (date_trunc('month', now()) - '11 mons'::interval)
 UNION
 -- Bloques para cada mes
```

**Explicación:**  
Agrupa y suma las cancelaciones mensuales para valorar el impacto de las cancelaciones.

---

## 10. `intranet.dashboard_sales_last_year_nb`

**Propósito:**  
Resumen mensual de ventas de nuevos negocios (business_type = 'N') durante el último año.

**Fragmento clave:**
```sql
CREATE OR REPLACE VIEW intranet.dashboard_sales_last_year_nb AS
 SELECT to_char(date_trunc('month', now()) - '1 year'::interval, 'MM') AS month,
        to_char(date_trunc('month', now()) - '1 year'::interval, 'yyyy') AS year,
        count(policies.binder_date) AS policies,
        sum(policies.premium) AS premium
 FROM qq.policies
 WHERE policies.business_type::text = 'N'::text
   AND policies.binder_date >= (date_trunc('month', now()) - '1 year'::interval)
   AND policies.binder_date < (date_trunc('month', now()) - '11 mons'::interval)
   ...
 UNION
 -- Por cada mes del último año
```

**Explicación:**  
Filtra únicamente las pólizas de nuevos negocios y agrupa la información mensual.

---

## 11. `intranet.dashboard_sales_last_year_rn`

**Propósito:**  
Resumen mensual de ventas de renovaciones (business_type = 'R') durante el último año.

**Fragmento clave:**
```sql
CREATE OR REPLACE VIEW intranet.dashboard_sales_last_year_rn AS
 SELECT to_char(date_trunc('month', now()) - '1 year'::interval, 'MM') AS month,
        to_char(date_trunc('month', now()) - '1 year'::interval, 'yyyy') AS year,
        count(policies.binder_date) AS policies,
        sum(policies.premium) AS premium
 FROM qq.policies
 WHERE policies.business_type::text = 'R'::text
   AND policies.binder_date >= (date_trunc('month', now()) - '1 year'::interval)
   AND ... -- Resto de condiciones similares
 UNION
 -- Por cada mes
```

**Explicación:**  
Agrupa las pólizas de renovaciones mensualmente para obtener recuentos y totales de primas.

---

## 12. `intranet.dashboard_sales_last_year_rw`

**Propósito:**  
Resumen mensual de ventas de reescrituras (business_type = 'W') durante el último año.

**Fragmento clave:**
```sql
CREATE OR REPLACE VIEW intranet.dashboard_sales_last_year_rw AS
 SELECT to_char(date_trunc('month', now()) - '1 year'::interval, 'MM') AS month,
        to_char(date_trunc('month', now()) - '1 year'::interval, 'yyyy') AS year,
        count(policies.binder_date) AS policies,
        sum(policies.premium) AS premium
 FROM qq.policies
 WHERE policies.business_type::text = 'W'::text
   AND policies.binder_date >= (date_trunc('month', now()) - '1 year'::interval)
   AND ... -- Resto de condiciones (exclusiones y filtros)
 UNION
 -- Por cada mes
```

**Explicación:**  
Filtra y agrupa las pólizas re-escritas por mes para evaluar su contribución durante el último año.

---

## 13. `intranet.nbtv_total_sales_month`

**Propósito:**  
Resume la actividad total de ventas para el mes actual, mostrando:
- La suma total de primas (formateada—con manejo de `NULL`),
- El número total de pólizas emitidas.

**Fragmento clave:**
```sql
CREATE OR REPLACE VIEW intranet.nbtv_total_sales_month AS
 SELECT
    CASE WHEN sum(premium) IS NULL THEN '$0.00'::money ELSE sum(premium) END AS premium,
    count(binder_date) AS policies
 FROM qq.policies
 WHERE binder_date >= date_trunc('month', CURRENT_DATE::timestamp with time zone)
   AND binder_date <= CURRENT_DATE
   AND (policy_status::text = 'A'::text OR policy_status::text = 'C'::text OR policy_status::text = 'E'::text)
   AND premium > '$1.00'::money
   AND lob_id <> 34 AND lob_id <> 40;
```

**Explicación:**  
Esta vista filtra las pólizas del mes en curso y las agrupa para obtener los totales de ventas, excluyendo ciertos ramos y aplicando filtros en el estado y valor.

---

# Conclusión

La base de datos utiliza un conjunto de vistas para consolidar y preparar la información de las pólizas de seguros en diversos niveles temporales (día, mes, año) y segmentados por tipo de negocio (New Business, Renewal, Rewrite) o por operaciones (ventas totales, cancelaciones). Estas vistas facilitan:

- La generación de dashboards dinámicos que permiten monitorear el desempeño en tiempo real.
- La comparación de tendencias mensuales y anuales.
- El análisis detallado de cancelaciones y de la eficacia del negocio en cada segmento.

Cada vista implementa filtros específicos (por ejemplo, exclusión de ciertos `lob_id`, mínimos en la prima, estados permitidos, etc.) para garantizar la relevancia y calidad de los datos reportados. Además, las vistas se asignan al usuario `postgres` para su correcto control de acceso y administración.

