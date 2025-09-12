--
-- PostgreSQL database dump
--

-- Dumped from database version 17.5
-- Dumped by pg_dump version 17.5

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: intranet; Type: SCHEMA; Schema: -; Owner: postgres
--

CREATE SCHEMA intranet;


ALTER SCHEMA intranet OWNER TO postgres;

--
-- Name: agency_carriers_last_week_franchise(integer); Type: FUNCTION; Schema: intranet; Owner: postgres
--

CREATE FUNCTION intranet.agency_carriers_last_week_franchise(id_csr integer) RETURNS TABLE(id_company integer, carrier text, policies integer, premium text)
    LANGUAGE sql
    AS $_$
   SELECT c.entity_id as id_company,
   c.display_name as carrier,
    count(p.binder_date) AS policies,
    to_char(sum(p.premium)::numeric, '$FM999,999') AS premium
   FROM qq.policies p
   INNER JOIN qq.contacts c ON p.carrier_id = c.entity_id
     WHERE p.csr_id = id_csr AND p.binder_date >= (date_trunc('week'::text, now()) - '7 days'::interval) AND p.binder_date < date_trunc('week'::text, now()) AND p.business_type::text = 'N'::text
  GROUP BY c.display_name, c.entity_id
  ORDER BY (sum(premium)) DESC
 LIMIT 5;
	
$_$;


ALTER FUNCTION intranet.agency_carriers_last_week_franchise(id_csr integer) OWNER TO postgres;

--
-- Name: agency_company_daily(); Type: FUNCTION; Schema: intranet; Owner: postgres
--

CREATE FUNCTION intranet.agency_company_daily() RETURNS TABLE(business_type character varying, premium money, policies bigint)
    LANGUAGE sql
    AS $_$
  -- New Business
  SELECT 'New Business' AS business_type,
         COALESCE(SUM(p.premium), '$0.00'::money) AS premium,
         COUNT(p.policy_id) AS policies
    FROM qq.policies p
    JOIN qq.contacts c ON c.entity_id = p.customer_id
    JOIN qq.locations l ON c.location_id = l.location_id
   WHERE p.business_type = 'N'
     AND p.lob_id <> 34 AND p.lob_id <> 40
     AND p.binder_date = current_date
     AND l.location_type IN (1,2,4)
     AND (p.policy_status = 'A' OR p.policy_status = 'C' OR p.policy_status = 'P')
     AND p.premium > '$1.00'
UNION
  -- Renewal
  SELECT 'Renewal' AS business_type,
         COALESCE(SUM(p.premium), '$0.00'::money) AS premium,
         COUNT(p.policy_id) AS policies
    FROM qq.policies p
    JOIN qq.contacts c ON c.entity_id = p.customer_id
    JOIN qq.locations l ON c.location_id = l.location_id
   WHERE p.business_type = 'R'
     AND p.lob_id <> 34 AND p.lob_id <> 40
     AND p.binder_date = current_date
     AND l.location_type IN (1,2,4)
     AND (p.policy_status = 'A' OR p.policy_status = 'C' OR p.policy_status = 'P')
     AND p.premium > '$1.00'
UNION
  -- Rewrite
  SELECT 'Rewrite' AS business_type,
         COALESCE(SUM(p.premium), '$0.00'::money) AS premium,
         COUNT(p.policy_id) AS policies
    FROM qq.policies p
    JOIN qq.contacts c ON c.entity_id = p.customer_id
    JOIN qq.locations l ON c.location_id = l.location_id
   WHERE p.business_type = 'W'
     AND p.lob_id <> 34 AND p.lob_id <> 40
     AND p.binder_date = current_date
     AND l.location_type IN (1,2,4)
     AND (p.policy_status = 'A' OR p.policy_status = 'C' OR p.policy_status = 'P')
     AND p.premium > '$1.00'
UNION
  -- Total
  SELECT 'Total' AS business_type,
         COALESCE(SUM(p.premium), '$0.00'::money) AS premium,
         COUNT(p.policy_id) AS policies
    FROM qq.policies p
    JOIN qq.contacts c ON c.entity_id = p.customer_id
    JOIN qq.locations l ON c.location_id = l.location_id
   WHERE p.lob_id <> 34 AND p.lob_id <> 40
     AND p.binder_date = current_date
     AND l.location_type IN (1,2,4)
     AND (p.policy_status = 'A' OR p.policy_status = 'C' OR p.policy_status = 'P')
     AND p.premium > '$1.00';
$_$;


ALTER FUNCTION intranet.agency_company_daily() OWNER TO postgres;

--
-- Name: agency_location_corp_month(date, date); Type: FUNCTION; Schema: intranet; Owner: postgres
--

CREATE FUNCTION intranet.agency_location_corp_month(start_date date, end_date date) RETURNS TABLE(business_type character varying, premium money, policies bigint)
    LANGUAGE sql
    AS $$
select 'New Business' as business_type,
sum (premium) as premium,
count (binder_date) as policies
from
(select *  FROM qq.policies q
             JOIN qq.contacts c ON c.entity_id = q.customer_id
             JOIN qq.locations l ON c.location_id = l.location_id) where business_type = 'N' and lob_id <> 34 and lob_id <> 40  and binder_date >= start_date and binder_date <= end_date and (location_type = 1 or location_type = 4) and (policy_status = 'A' or policy_status = 'C' ) 
union
select 'Renewal' as business_type,
sum (premium) as premium,
count (binder_date) as policies
from
(select *  FROM qq.policies q
             JOIN qq.contacts c ON c.entity_id = q.customer_id
             JOIN qq.locations l ON c.location_id = l.location_id) where business_type = 'R' and lob_id <> 34 and lob_id <> 40  and binder_date >= start_date and binder_date <= end_date and (policy_status = 'A' or policy_status = 'C' ) and (location_type = 1 or location_type = 4)
union
select 'Rewrite' as business_type,
sum (premium) as premium,
count (binder_date) as policies
from
(select *  FROM qq.policies q
             JOIN qq.contacts c ON c.entity_id = q.customer_id
             JOIN qq.locations l ON c.location_id = l.location_id) where business_type = 'W' and lob_id <> 34 and lob_id <> 40  and binder_date >= start_date and binder_date <= end_date and (policy_status = 'A' or policy_status = 'C' ) and (location_type = 1 or location_type = 4) 
union
select 'Total' as business_type,
sum (premium) as premium,
count (binder_date) as policies
from
(select *  FROM qq.policies q
             JOIN qq.contacts c ON c.entity_id = q.customer_id
             JOIN qq.locations l ON c.location_id = l.location_id) where  binder_date >= start_date and binder_date <= end_date and lob_id <> 34 and lob_id <> 40  and (policy_status = 'A' or policy_status = 'C' ) and (location_type = 1 or location_type = 4) 
$$;


ALTER FUNCTION intranet.agency_location_corp_month(start_date date, end_date date) OWNER TO postgres;

--
-- Name: agency_location_daily(integer); Type: FUNCTION; Schema: intranet; Owner: postgres
--

CREATE FUNCTION intranet.agency_location_daily(id_loc integer) RETURNS TABLE(business_type character varying, premium money, policies bigint)
    LANGUAGE sql
    AS $_$
select 'New Business' as business_type,
case when sum (premium) is null then '$0.00' else sum (premium) end  as premium,
case when count (binder_date) is null then '0' else count(binder_date) end  as policies
from(select * from qq.policies q
inner join qq.contacts  c
on c.entity_id = q.customer_id
where q.business_type = 'N' and q.lob_id <> 34 and q.lob_id <> 40 and q.binder_date = current_date and q.premium > '$1.00'
and c.location_id = id_loc  and (q.policy_status = 'A' or q.policy_status = 'C'))
union
select 'Renewal' as business_type,
case when sum (premium) is null then '$0.00' else sum (premium) end  as premium,
case when count (binder_date) is null then '0' else count(binder_date) end  as policies
from(select * from qq.policies q
inner join qq.contacts  c
on c.entity_id = q.customer_id
where q.business_type = 'R' and q.lob_id <> 34 and q.lob_id <> 40 and q.binder_date = current_date and q.premium > '$1.00'
and c.location_id = id_loc  and (q.policy_status = 'A' or q.policy_status = 'C'))
union
select 'Rewrite' as business_type,
case when sum (premium) is null then '$0.00' else sum (premium) end  as premium,
case when count (binder_date) is null then '0' else count(binder_date) end  as policies
from(select * from qq.policies q
inner join qq.contacts  c
on c.entity_id = q.customer_id
where q.business_type = 'W' and q.lob_id <> 34 and q.lob_id <> 40 and q.binder_date = current_date and q.premium > '$1.00'
and c.location_id = id_loc and (q.policy_status = 'A' or q.policy_status = 'C'))
union
select 'Total' as business_type,
case when sum (premium) is null then '$0.00' else sum (premium) end  as premium,
case when count (binder_date) is null then '0' else count(binder_date) end  as policies
from(select * from qq.policies q
inner join qq.contacts  c
on c.entity_id = q.customer_id
where q.lob_id <> 34 and q.lob_id <> 40 and q.binder_date = current_date  and q.premium > '$1.00'
and c.location_id = id_loc and (q.policy_status = 'A' or q.policy_status = 'C'))
$_$;


ALTER FUNCTION intranet.agency_location_daily(id_loc integer) OWNER TO postgres;

--
-- Name: agency_location_month(date, date, integer); Type: FUNCTION; Schema: intranet; Owner: postgres
--

CREATE FUNCTION intranet.agency_location_month(start_date date, end_date date, id_loc integer) RETURNS TABLE(business_type character varying, premium money, policies bigint)
    LANGUAGE sql
    AS $_$
select 'New Business' as business_type,
sum (premium) as premium,
count (binder_date) as policies
from
(select * FROM qq.policies q
 JOIN qq.contacts c ON c.entity_id = q.customer_id
 ) where business_type = 'N' and lob_id <> 34 and lob_id <> 40  and binder_date >= start_date and binder_date <= end_date and location_id = id_loc and (policy_status = 'A' or policy_status = 'C') and premium > '$1.00'
union
select 'Renewal' as business_type,
sum (premium) as premium,
count (binder_date) as policies
from
(select * FROM qq.policies q
             JOIN qq.contacts c ON c.entity_id = q.customer_id
             ) where business_type = 'R' and lob_id <> 34 and lob_id <> 40  and binder_date >= start_date and binder_date <= end_date and (policy_status = 'A' or policy_status = 'C') and location_id= id_loc and premium > '$1.00'
union
select 'Rewrite' as business_type,
sum (premium) as premium,
count (binder_date) as policies
from
(select * FROM qq.policies q
             JOIN qq.contacts c ON c.entity_id = q.customer_id
             ) where business_type = 'W' and lob_id <> 34 and lob_id <> 40  and binder_date >= start_date and binder_date <= end_date and (policy_status = 'A' or policy_status = 'C') and location_id = id_loc and premium > '$1.00'
union
select 'Total' as business_type,
sum (premium) as premium,
count (binder_date) as policies
from
(select * FROM qq.policies q
             JOIN qq.contacts c ON c.entity_id = q.customer_id
             ) where  binder_date >= start_date and binder_date <= end_date and lob_id <> 34 and lob_id <> 40  and (policy_status = 'A' or policy_status = 'C') and location_id = id_loc and premium > '$1.00'
$_$;


ALTER FUNCTION intranet.agency_location_month(start_date date, end_date date, id_loc integer) OWNER TO postgres;

--
-- Name: count_active_policies_by_location(integer); Type: FUNCTION; Schema: intranet; Owner: postgres
--

CREATE FUNCTION intranet.count_active_policies_by_location(p_location_id integer) RETURNS integer
    LANGUAGE sql
    AS $$
  WITH active_labels AS (
    SELECT ARRAY[
      'A',
      'ACTIVE',
      'INFORCE',
      'IN FORCE',
      'IN-FORCE',
      'CURRENT'
    ]::text[] AS labels
  )
  SELECT COALESCE(COUNT(*), 0)::int
  FROM qq.policies p
  JOIN qq.contacts c
    ON c.entity_id = p.customer_id
  CROSS JOIN active_labels al
  WHERE c.location_id = p_location_id
    AND TRIM(UPPER(COALESCE(p.policy_status, ''))) = ANY (al.labels);
$$;


ALTER FUNCTION intranet.count_active_policies_by_location(p_location_id integer) OWNER TO postgres;

--
-- Name: count_clients_with_active_policies(integer, text[]); Type: FUNCTION; Schema: intranet; Owner: postgres
--

CREATE FUNCTION intranet.count_clients_with_active_policies(p_location_id integer, p_active_labels text[] DEFAULT ARRAY['A'::text, 'ACTIVE'::text, 'INFORCE'::text, 'IN FORCE'::text, 'IN-FORCE'::text, 'CURRENT'::text]) RETURNS integer
    LANGUAGE sql STABLE
    AS $$
  SELECT COALESCE(COUNT(DISTINCT p.customer_id), 0)::int
  FROM qq.policies p
  JOIN qq.contacts c
    ON c.entity_id = p.customer_id
  WHERE c.location_id = p_location_id
    AND TRIM(UPPER(COALESCE(p.policy_status, ''))) = ANY (p_active_labels);
$$;


ALTER FUNCTION intranet.count_clients_with_active_policies(p_location_id integer, p_active_labels text[]) OWNER TO postgres;

--
-- Name: dashboard_cn_last_year(integer); Type: FUNCTION; Schema: intranet; Owner: postgres
--

CREATE FUNCTION intranet.dashboard_cn_last_year(id_loc integer) RETURNS TABLE(month text, year text, polcan bigint, premcan money)
    LANGUAGE sql
    AS $_$
SELECT to_char(date_trunc('month'::text, now()) - '1 year'::interval month, 'MM'::text) AS month,
            to_char(date_trunc('month'::text, now()) - '1 year'::interval month, 'yyyy'::text) AS year,
            count(can.cancellation_date) AS policies,
                CASE
                    WHEN sum(can.premium) IS NULL THEN '$0.00'::money
                    ELSE sum(can.premium)
                END AS premium
           FROM intranet.cancellation_last_month can
	    inner join qq.locations l
	  on can.location = l.location_name
          WHERE l.location_id = id_loc and  can.cancellation_date >= (date_trunc('month'::text, now()) - '1 year'::interval month) AND can.cancellation_date < (date_trunc('month'::text, now()) - '11 mons'::interval month)
        UNION
         SELECT to_char(date_trunc('month'::text, now()) - '11 mons'::interval month, 'MM'::text) AS month,
            to_char(date_trunc('month'::text, now()) - '11 mons'::interval month, 'yyyy'::text) AS year,
            count(can.cancellation_date) AS policies,
                CASE
                    WHEN sum(can.premium) IS NULL THEN '$0.00'::money
                    ELSE sum(can.premium)
                END AS premium
           FROM intranet.cancellation_last_month can
	    inner join qq.locations l
	  on can.location = l.location_name
          WHERE l.location_id = id_loc and can.cancellation_date >= (date_trunc('month'::text, now()) - '11 mons'::interval month) AND can.cancellation_date < (date_trunc('month'::text, now()) - '10 mons'::interval month)
        UNION
         SELECT to_char(date_trunc('month'::text, now()) - '10 mons'::interval month, 'MM'::text) AS month,
            to_char(date_trunc('month'::text, now()) - '10 mons'::interval month, 'yyyy'::text) AS year,
            count(can.cancellation_date) AS policies,
                CASE
                    WHEN sum(can.premium) IS NULL THEN '$0.00'::money
                    ELSE sum(can.premium)
                END AS premium
             FROM intranet.cancellation_last_month can
	    inner join qq.locations l
	  on can.location = l.location_name
          WHERE l.location_id = id_loc and  can.cancellation_date >= (date_trunc('month'::text, now()) - '10 mons'::interval month) AND can.cancellation_date < (date_trunc('month'::text, now()) - '9 mons'::interval month)
        UNION
         SELECT to_char(date_trunc('month'::text, now()) - '9 mons'::interval month, 'MM'::text) AS month,
            to_char(date_trunc('month'::text, now()) - '9 mons'::interval month, 'yyyy'::text) AS year,
            count(can.cancellation_date) AS policies,
                CASE
                    WHEN sum(can.premium) IS NULL THEN '$0.00'::money
                    ELSE sum(can.premium)
                END AS premium
             FROM intranet.cancellation_last_month can
	    inner join qq.locations l
	  on can.location = l.location_name
          WHERE l.location_id = id_loc and  can.cancellation_date >= (date_trunc('month'::text, now()) - '9 mons'::interval month) AND can.cancellation_date < (date_trunc('month'::text, now()) - '8 mons'::interval month)
        UNION
         SELECT to_char(date_trunc('month'::text, now()) - '8 mons'::interval month, 'MM'::text) AS month,
            to_char(date_trunc('month'::text, now()) - '8 mons'::interval month, 'yyyy'::text) AS year,
            count(can.cancellation_date) AS policies,
                CASE
                    WHEN sum(can.premium) IS NULL THEN '$0.00'::money
                    ELSE sum(can.premium)
                END AS premium
             FROM intranet.cancellation_last_month can
	    inner join qq.locations l
	  on can.location = l.location_name
          WHERE l.location_id = id_loc and  can.cancellation_date >= (date_trunc('month'::text, now()) - '8 mons'::interval month) AND can.cancellation_date < (date_trunc('month'::text, now()) - '7 mons'::interval month)
        UNION
         SELECT to_char(date_trunc('month'::text, now()) - '7 mons'::interval month, 'MM'::text) AS month,
            to_char(date_trunc('month'::text, now()) - '7 mons'::interval month, 'yyyy'::text) AS year,
            count(can.cancellation_date) AS policies,
                CASE
                    WHEN sum(can.premium) IS NULL THEN '$0.00'::money
                    ELSE sum(can.premium)
                END AS premium
             FROM intranet.cancellation_last_month can
	    inner join qq.locations l
	  on can.location = l.location_name
          WHERE l.location_id = id_loc and  can.cancellation_date >= (date_trunc('month'::text, now()) - '7 mons'::interval month) AND can.cancellation_date < (date_trunc('month'::text, now()) - '6 mons'::interval month)
        UNION
         SELECT to_char(date_trunc('month'::text, now()) - '6 mons'::interval month, 'MM'::text) AS month,
            to_char(date_trunc('month'::text, now()) - '6 mons'::interval month, 'yyyy'::text) AS year,
            count(can.cancellation_date) AS policies,
                CASE
                    WHEN sum(can.premium) IS NULL THEN '$0.00'::money
                    ELSE sum(can.premium)
                END AS premium
           FROM intranet.cancellation_last_month can
	    inner join qq.locations l
	  on can.location = l.location_name
          WHERE l.location_id = id_loc and  can.cancellation_date >= (date_trunc('month'::text, now()) - '6 mons'::interval month) AND can.cancellation_date < (date_trunc('month'::text, now()) - '5 mons'::interval month)
        UNION
         SELECT to_char(date_trunc('month'::text, now()) - '5 mons'::interval month, 'MM'::text) AS month,
            to_char(date_trunc('month'::text, now()) - '5 mons'::interval month, 'yyyy'::text) AS year,
            count(can.cancellation_date) AS policies,
                CASE
                    WHEN sum(can.premium) IS NULL THEN '$0.00'::money
                    ELSE sum(can.premium)
                END AS premium
            FROM intranet.cancellation_last_month can
	    inner join qq.locations l
	  on can.location = l.location_name
          WHERE l.location_id = id_loc and  can.cancellation_date >= (date_trunc('month'::text, now()) - '5 mons'::interval month) AND can.cancellation_date < (date_trunc('month'::text, now()) - '4 mons'::interval month)
        UNION
         SELECT to_char(date_trunc('month'::text, now()) - '4 mons'::interval month, 'MM'::text) AS month,
            to_char(date_trunc('month'::text, now()) - '4 mons'::interval month, 'yyyy'::text) AS year,
            count(can.cancellation_date) AS policies,
                CASE
                    WHEN sum(can.premium) IS NULL THEN '$0.00'::money
                    ELSE sum(can.premium)
                END AS premium
              FROM intranet.cancellation_last_month can
	    inner join qq.locations l
	  on can.location = l.location_name
          WHERE l.location_id = id_loc and  can.cancellation_date >= (date_trunc('month'::text, now()) - '4 mons'::interval month) AND can.cancellation_date < (date_trunc('month'::text, now()) - '3 mons'::interval month)
        UNION
         SELECT to_char(date_trunc('month'::text, now()) - '3 mons'::interval month, 'MM'::text) AS month,
            to_char(date_trunc('month'::text, now()) - '3 mons'::interval month, 'yyyy'::text) AS year,
            count(can.cancellation_date) AS policies,
                CASE
                    WHEN sum(can.premium) IS NULL THEN '$0.00'::money
                    ELSE sum(can.premium)
                END AS premium
            FROM intranet.cancellation_last_month can
	    inner join qq.locations l
	  on can.location = l.location_name
          WHERE l.location_id = id_loc and  can.cancellation_date >= (date_trunc('month'::text, now()) - '3 mons'::interval month) AND can.cancellation_date < (date_trunc('month'::text, now()) - '2 mons'::interval month)
        UNION
         SELECT to_char(date_trunc('month'::text, now()) - '2 mons'::interval month, 'MM'::text) AS month,
            to_char(date_trunc('month'::text, now()) - '2 mons'::interval month, 'yyyy'::text) AS year,
            count(can.cancellation_date) AS policies,
                CASE
                    WHEN sum(can.premium) IS NULL THEN '$0.00'::money
                    ELSE sum(can.premium)
                END AS premium
            FROM intranet.cancellation_last_month can
	    inner join qq.locations l
	  on can.location = l.location_name
          WHERE l.location_id = id_loc and  can.cancellation_date >= (date_trunc('month'::text, now()) - '2 mons'::interval month) AND can.cancellation_date < (date_trunc('month'::text, now()) - '1 mon'::interval month)
        UNION
         SELECT to_char(date_trunc('month'::text, now()) - '1 mon'::interval month, 'MM'::text) AS month,
            to_char(date_trunc('month'::text, now()) - '1 mon'::interval month, 'yyyy'::text) AS year,
            count(can.cancellation_date) AS policies,
                CASE
                    WHEN sum(can.premium) IS NULL THEN '$0.00'::money
                    ELSE sum(can.premium)
                END AS premium
             FROM intranet.cancellation_last_month can
	    inner join qq.locations l
	  on can.location = l.location_name
          WHERE l.location_id = id_loc and  can.cancellation_date >= (date_trunc('month'::text, now()) - '1 mon'::interval month) AND can.cancellation_date < date_trunc('month'::text, now())
        UNION
         SELECT to_char(date_trunc('month'::text, now()), 'MM'::text) AS month,
            to_char(date_trunc('month'::text, now()), 'yyyy'::text) AS year,
            count(can.cancellation_date) AS policies,
                CASE
                    WHEN sum(can.premium) IS NULL THEN '$0.00'::money
                    ELSE sum(can.premium)
                END AS premium
            FROM intranet.cancellation_last_month can
	    inner join qq.locations l
	  on can.location = l.location_name
          WHERE l.location_id = id_loc and  can.cancellation_date >= date_trunc('month'::text, now()) AND can.cancellation_date <= CURRENT_DATE
  ORDER BY 2, 1
$_$;


ALTER FUNCTION intranet.dashboard_cn_last_year(id_loc integer) OWNER TO postgres;

--
-- Name: dashboard_csr_nb_location(date, date, integer); Type: FUNCTION; Schema: intranet; Owner: postgres
--

CREATE FUNCTION intranet.dashboard_csr_nb_location(start_date date, end_date date, id_loc integer) RETURNS TABLE(csr_id integer, csr character varying, policies numeric, premium money)
    LANGUAGE sql
    AS $_$
select
csr_id,
csr,
sum(policies) as policies,
sum(premium) as premium
from
(select
a.csr_id,
b.display_name as csr,
a.policies,
a.premium
from
(select  
case   when qqp.csr_id is null then qqp.agent_id else qqp.csr_id end as csr_id,
count (qqp.binder_date) as policies,
sum (qqp.premium) as premium 
from qq.policies qqp 
inner join qq.contacts c on qqp.customer_id = c.entity_id
where business_type = 'N' and lob_id <> 34 and lob_id <> 40 and (policy_status = 'A' or policy_status =  'C') and binder_date >= start_date and binder_date <= end_date and location_id = any(array[id_loc])  and premium > '$1.00'
group by qqp.agent_id, qqp.csr_id
order by sum(qqp.premium) desc) a
inner join qq.contacts b
on a.csr_id = b.entity_id where b.contact_type = 'E'
order by premium desc)
group by csr_id, csr
order by sum(premium) desc
$_$;


ALTER FUNCTION intranet.dashboard_csr_nb_location(start_date date, end_date date, id_loc integer) OWNER TO postgres;

--
-- Name: dashboard_franchise_company_business_types_periods(date); Type: FUNCTION; Schema: intranet; Owner: postgres
--

CREATE FUNCTION intranet.dashboard_franchise_company_business_types_periods(any_date date) RETURNS TABLE(period text, business_type text, policies numeric, premium money)
    LANGUAGE sql
    AS $_$
-- DÍA
SELECT 'Día' AS period, 'New Business' AS business_type,
       COUNT(p.policy_id), COALESCE(SUM(p.premium), 0::money)
FROM qq.policies p
JOIN qq.contacts c ON c.entity_id = p.customer_id
JOIN qq.locations l ON c.location_id = l.location_id
WHERE p.business_type = 'N' AND p.lob_id <> 34 AND p.lob_id <> 40
  AND (p.policy_status = 'C' OR p.policy_status = 'A')
  AND p.binder_date = any_date
  AND p.premium > '$1.00'
  AND l.location_type IN (2, 4)
UNION ALL
SELECT 'Día', 'Renewal',
       COUNT(p.policy_id), COALESCE(SUM(p.premium), 0::money)
FROM qq.policies p
JOIN qq.contacts c ON c.entity_id = p.customer_id
JOIN qq.locations l ON c.location_id = l.location_id
WHERE p.business_type = 'R' AND p.lob_id <> 34 AND p.lob_id <> 40
  AND (p.policy_status = 'C' OR p.policy_status = 'A')
  AND p.binder_date = any_date
  AND p.premium > '$1.00'
  AND l.location_type IN (2, 4)
UNION ALL
SELECT 'Día', 'Rewrite',
       COUNT(p.policy_id), COALESCE(SUM(p.premium), 0::money)
FROM qq.policies p
JOIN qq.contacts c ON c.entity_id = p.customer_id
JOIN qq.locations l ON c.location_id = l.location_id
WHERE p.business_type = 'W' AND p.lob_id <> 34 AND p.lob_id <> 40
  AND (p.policy_status = 'C' OR p.policy_status = 'A')
  AND p.binder_date = any_date
  AND p.premium > '$1.00'
  AND l.location_type IN (2, 4)
UNION ALL
SELECT 'Día', 'Total',
       COUNT(p.policy_id), COALESCE(SUM(p.premium), 0::money)
FROM qq.policies p
JOIN qq.contacts c ON c.entity_id = p.customer_id
JOIN qq.locations l ON c.location_id = l.location_id
WHERE p.lob_id <> 34 AND p.lob_id <> 40
  AND (p.policy_status = 'C' OR p.policy_status = 'A')
  AND p.binder_date = any_date
  AND p.premium > '$1.00'
  AND l.location_type IN (2, 4)

-- MES
UNION ALL
SELECT 'Mes', 'New Business',
       COUNT(p.policy_id), COALESCE(SUM(p.premium), 0::money)
FROM qq.policies p
JOIN qq.contacts c ON c.entity_id = p.customer_id
JOIN qq.locations l ON c.location_id = l.location_id
WHERE p.business_type = 'N' AND p.lob_id <> 34 AND p.lob_id <> 40
  AND (p.policy_status = 'C' OR p.policy_status = 'A')
  AND p.binder_date >= date_trunc('month', any_date)
  AND p.binder_date <= (date_trunc('month', any_date) + INTERVAL '1 MONTH - 1 day')::date
  AND p.premium > '$1.00'
  AND l.location_type IN (2, 4)
UNION ALL
SELECT 'Mes', 'Renewal',
       COUNT(p.policy_id), COALESCE(SUM(p.premium), 0::money)
FROM qq.policies p
JOIN qq.contacts c ON c.entity_id = p.customer_id
JOIN qq.locations l ON c.location_id = l.location_id
WHERE p.business_type = 'R' AND p.lob_id <> 34 AND p.lob_id <> 40
  AND (p.policy_status = 'C' OR p.policy_status = 'A')
  AND p.binder_date >= date_trunc('month', any_date)
  AND p.binder_date <= (date_trunc('month', any_date) + INTERVAL '1 MONTH - 1 day')::date
  AND p.premium > '$1.00'
  AND l.location_type IN (2, 4)
UNION ALL
SELECT 'Mes', 'Rewrite',
       COUNT(p.policy_id), COALESCE(SUM(p.premium), 0::money)
FROM qq.policies p
JOIN qq.contacts c ON c.entity_id = p.customer_id
JOIN qq.locations l ON c.location_id = l.location_id
WHERE p.business_type = 'W' AND p.lob_id <> 34 AND p.lob_id <> 40
  AND (p.policy_status = 'C' OR p.policy_status = 'A')
  AND p.binder_date >= date_trunc('month', any_date)
  AND p.binder_date <= (date_trunc('month', any_date) + INTERVAL '1 MONTH - 1 day')::date
  AND p.premium > '$1.00'
  AND l.location_type IN (2, 4)
UNION ALL
SELECT 'Mes', 'Total',
       COUNT(p.policy_id), COALESCE(SUM(p.premium), 0::money)
FROM qq.policies p
JOIN qq.contacts c ON c.entity_id = p.customer_id
JOIN qq.locations l ON c.location_id = l.location_id
WHERE p.lob_id <> 34 AND p.lob_id <> 40
  AND (p.policy_status = 'C' OR p.policy_status = 'A')
  AND p.binder_date >= date_trunc('month', any_date)
  AND p.binder_date <= (date_trunc('month', any_date) + INTERVAL '1 MONTH - 1 day')::date
  AND p.premium > '$1.00'
  AND l.location_type IN (2, 4)

-- AÑO
UNION ALL
SELECT 'Año', 'New Business',
       COUNT(p.policy_id), COALESCE(SUM(p.premium), 0::money)
FROM qq.policies p
JOIN qq.contacts c ON c.entity_id = p.customer_id
JOIN qq.locations l ON c.location_id = l.location_id
WHERE p.business_type = 'N' AND p.lob_id <> 34 AND p.lob_id <> 40
  AND (p.policy_status = 'C' OR p.policy_status = 'A')
  AND p.binder_date >= date_trunc('year', any_date)
  AND p.binder_date <= (date_trunc('year', any_date) + INTERVAL '1 year - 1 day')::date
  AND p.premium > '$1.00'
  AND l.location_type IN (2, 4)
UNION ALL
SELECT 'Año', 'Renewal',
       COUNT(p.policy_id), COALESCE(SUM(p.premium), 0::money)
FROM qq.policies p
JOIN qq.contacts c ON c.entity_id = p.customer_id
JOIN qq.locations l ON c.location_id = l.location_id
WHERE p.business_type = 'R' AND p.lob_id <> 34 AND p.lob_id <> 40
  AND (p.policy_status = 'C' OR p.policy_status = 'A')
  AND p.binder_date >= date_trunc('year', any_date)
  AND p.binder_date <= (date_trunc('year', any_date) + INTERVAL '1 year - 1 day')::date
  AND p.premium > '$1.00'
  AND l.location_type IN (2, 4)
UNION ALL
SELECT 'Año', 'Rewrite',
       COUNT(p.policy_id), COALESCE(SUM(p.premium), 0::money)
FROM qq.policies p
JOIN qq.contacts c ON c.entity_id = p.customer_id
JOIN qq.locations l ON c.location_id = l.location_id
WHERE p.business_type = 'W' AND p.lob_id <> 34 AND p.lob_id <> 40
  AND (p.policy_status = 'C' OR p.policy_status = 'A')
  AND p.binder_date >= date_trunc('year', any_date)
  AND p.binder_date <= (date_trunc('year', any_date) + INTERVAL '1 year - 1 day')::date
  AND p.premium > '$1.00'
  AND l.location_type IN (2, 4)
UNION ALL
SELECT 'Año', 'Total',
       COUNT(p.policy_id), COALESCE(SUM(p.premium), 0::money)
FROM qq.policies p
JOIN qq.contacts c ON c.entity_id = p.customer_id
JOIN qq.locations l ON c.location_id = l.location_id
WHERE p.lob_id <> 34 AND p.lob_id <> 40
  AND (p.policy_status = 'C' OR p.policy_status = 'A')
  AND p.binder_date >= date_trunc('year', any_date)
  AND p.binder_date <= (date_trunc('year', any_date) + INTERVAL '1 year - 1 day')::date
  AND p.premium > '$1.00'
  AND l.location_type IN (2, 4)
$_$;


ALTER FUNCTION intranet.dashboard_franchise_company_business_types_periods(any_date date) OWNER TO postgres;

--
-- Name: dashboard_franchise_new_business_by_day(date); Type: FUNCTION; Schema: intranet; Owner: postgres
--

CREATE FUNCTION intranet.dashboard_franchise_new_business_by_day(any_date date) RETURNS TABLE(location_id integer, alias character varying, policies numeric, premium money)
    LANGUAGE sql
    AS $_$
SELECT
    l.location_id,
    l.alias,
    COUNT(p.policy_id) AS policies,
    SUM(p.premium) AS premium
FROM qq.policies p
INNER JOIN qq.contacts c ON p.customer_id = c.entity_id
INNER JOIN qq.locations l ON c.location_id = l.location_id
WHERE
    p.business_type = 'N'
    AND p.lob_id <> 34 AND p.lob_id <> 40
    AND (p.policy_status = 'A' OR p.policy_status = 'C')
    AND p.binder_date = any_date
    AND l.location_type IN (2, 4)
    AND p.premium > '$1.00'
GROUP BY l.location_id, l.alias
ORDER BY SUM(p.premium) DESC
LIMIT 10
$_$;


ALTER FUNCTION intranet.dashboard_franchise_new_business_by_day(any_date date) OWNER TO postgres;

--
-- Name: dashboard_franchise_new_business_by_month(date); Type: FUNCTION; Schema: intranet; Owner: postgres
--

CREATE FUNCTION intranet.dashboard_franchise_new_business_by_month(any_date date) RETURNS TABLE(location_id integer, alias character varying, policies numeric, premium money)
    LANGUAGE sql
    AS $_$
SELECT
    l.location_id,
    l.alias,
    COUNT(p.policy_id) AS policies,
    SUM(p.premium) AS premium
FROM qq.policies p
INNER JOIN qq.contacts c ON p.customer_id = c.entity_id
INNER JOIN qq.locations l ON c.location_id = l.location_id
WHERE
    p.business_type = 'N'
    AND p.lob_id <> 34 AND p.lob_id <> 40
    AND (p.policy_status = 'A' OR p.policy_status = 'C')
    AND p.binder_date >= date_trunc('month', any_date)
    AND p.binder_date <= (date_trunc('month', any_date) + INTERVAL '1 MONTH - 1 day')::date
    AND l.location_type IN (2, 4)
    AND p.premium > '$1.00'
GROUP BY l.location_id, l.alias
ORDER BY SUM(p.premium) DESC
LIMIT 10
$_$;


ALTER FUNCTION intranet.dashboard_franchise_new_business_by_month(any_date date) OWNER TO postgres;

--
-- Name: dashboard_franchise_new_business_by_month_with_percent(date); Type: FUNCTION; Schema: intranet; Owner: postgres
--

CREATE FUNCTION intranet.dashboard_franchise_new_business_by_month_with_percent(any_date date) RETURNS TABLE(alias character varying, policies_current numeric, premium_current money, premium_percent numeric)
    LANGUAGE sql
    AS $_$
WITH
params AS (
    SELECT
        date_trunc('month', any_date) AS month_start,
        any_date AS current_day,
        (date_trunc('month', any_date) - INTERVAL '1 month') AS prev_month_start,
        ((date_trunc('month', any_date) - INTERVAL '1 month') + (EXTRACT(DAY FROM any_date)-1) * INTERVAL '1 day')::date AS prev_month_day
),
current AS (
    SELECT
        l.location_id,
        l.alias,
        COUNT(p.policy_id) AS policies,
        COALESCE(SUM(p.premium), '$0.00') AS premium
    FROM qq.policies p
    INNER JOIN qq.contacts c ON p.customer_id = c.entity_id
    INNER JOIN qq.locations l ON c.location_id = l.location_id
    JOIN params pr ON TRUE
    WHERE
        p.business_type = 'N'
        AND p.lob_id <> 34 AND p.lob_id <> 40
        AND (p.policy_status = 'A' OR p.policy_status = 'C')
        AND p.binder_date >= pr.month_start
        AND p.binder_date <= pr.current_day
        AND l.location_type IN (2, 4)
        AND p.premium > '$1.00'
    GROUP BY l.location_id, l.alias
),
prev AS (
    SELECT
        l.location_id,
        l.alias,
        COALESCE(SUM(p.premium), '$0.00') AS premium
    FROM qq.policies p
    INNER JOIN qq.contacts c ON p.customer_id = c.entity_id
    INNER JOIN qq.locations l ON c.location_id = l.location_id
    JOIN params pr ON TRUE
    WHERE
        p.business_type = 'N'
        AND p.lob_id <> 34 AND p.lob_id <> 40
        AND (p.policy_status = 'A' OR p.policy_status = 'C')
        AND p.binder_date >= pr.prev_month_start
        AND p.binder_date <= pr.prev_month_day
        AND l.location_type IN (2, 4)
        AND p.premium > '$1.00'
    GROUP BY l.location_id, l.alias
)
SELECT
    cur.alias,
    cur.policies AS policies_current,
    cur.premium AS premium_current,
    CASE 
        WHEN CAST(prev.premium AS numeric) = 0 THEN NULL
        ELSE ROUND((CAST(cur.premium AS numeric) - CAST(prev.premium AS numeric)) * 100.0 / CAST(prev.premium AS numeric), 2)
    END AS premium_percent
FROM current cur
LEFT JOIN prev ON cur.location_id = prev.location_id
ORDER BY cur.premium DESC
LIMIT 10;
$_$;


ALTER FUNCTION intranet.dashboard_franchise_new_business_by_month_with_percent(any_date date) OWNER TO postgres;

--
-- Name: dashboard_location_daily(integer); Type: FUNCTION; Schema: intranet; Owner: postgres
--

CREATE FUNCTION intranet.dashboard_location_daily(id_loc integer) RETURNS TABLE(business_type character varying, premium money, policies bigint)
    LANGUAGE sql
    AS $_$
select 'New Business' as business_type,
case when sum (premium) is null then '$0.00' else sum (premium) end  as premium,
case when count (binder_date) is null then '0' else count(binder_date) end  as policies
from
(select * from qq.policies s
inner join qq.contacts l
on l.entity_id = s.customer_id) where business_type = 'N' and lob_id <> 34 and lob_id <> 40 and binder_date = current_date and location_id = id_loc and premium > '$1.00'
union
select 'Renewal' as business_type,
case when sum (premium) is null then '$0.00' else sum (premium) end  as premium,
case when count (binder_date) is null then '0' else count(binder_date) end  as policies
from
(select * from qq.policies s
inner join qq.contacts l
on l.entity_id = s.customer_id) where business_type = 'R' and lob_id <> 34 and lob_id <> 40  and binder_date = current_date and location_id = id_loc and premium > '$1.00'
union
select 'Rewrite' as business_type,
case when sum (premium) is null then '$0.00' else sum (premium) end  as premium,
case when count (binder_date) is null then '0' else count(binder_date) end  as policies
from
(select * from qq.policies s
inner join qq.contacts l
on l.entity_id = s.customer_id) where business_type = 'W' and lob_id <> 34 and lob_id <> 40  and binder_date = current_date and location_id = id_loc and premium > '$1.00'
union
select 'Total' as business_type,
case when sum (premium) is null then '$0.00' else sum (premium) end  as premium,
case when count (binder_date) is null then '0' else count(binder_date) end  as policies
from
(select * from qq.policies s
inner join qq.contacts l
on l.entity_id = s.customer_id) where binder_date = current_date and lob_id <> 34 and lob_id <> 40  and  location_id = id_loc and premium > '$1.00'
$_$;


ALTER FUNCTION intranet.dashboard_location_daily(id_loc integer) OWNER TO postgres;

--
-- Name: dashboard_location_month(date, date, integer); Type: FUNCTION; Schema: intranet; Owner: postgres
--

CREATE FUNCTION intranet.dashboard_location_month(start_date date, end_date date, id_loc integer) RETURNS TABLE(business_type character varying, premium money, policies bigint)
    LANGUAGE sql
    AS $_$
select 'New Business' as business_type,
sum (premium) as premium,
count (binder_date) as policies
from
(select * from qq.policies s
inner join qq.contacts l
on l.entity_id = s.customer_id where s.business_type = 'N' and s.lob_id <> 34 and s.lob_id <> 40  and s.binder_date >= start_date and s.binder_date <= end_date and l.location_id = id_loc and (s.policy_status = 'A' or s.policy_status = 'C') and s.premium > '$1.00')
union
select 'Renewal' as business_type,
sum (premium) as premium,
count (binder_date) as policies
from
(select * from qq.policies s
inner join qq.contacts l
on l.entity_id = s.customer_id where s.business_type = 'R' and s.lob_id <> 34 and s.lob_id <> 40  and s.binder_date >= start_date and s.binder_date <= end_date and l.location_id = id_loc and (s.policy_status = 'A' or s.policy_status = 'C') and s.premium > '$1.00')
union
select 'Rewrite' as business_type,
sum (premium) as premium,
count (binder_date) as policies
from
(select * from qq.policies s
inner join qq.contacts l
on l.entity_id = s.customer_id where s.business_type = 'W' and s.lob_id <> 34 and s.lob_id <> 40  and s.binder_date >= start_date and s.binder_date <= end_date and l.location_id = id_loc and (s.policy_status = 'A' or s.policy_status = 'C') and s.premium > '$1.00')
union
select 'Total' as business_type,
sum (premium) as premium,
count (binder_date) as policies
from
(select * from qq.policies s
inner join qq.contacts l
on l.entity_id = s.customer_id where  s.lob_id <> 34 and s.lob_id <> 40  and s.binder_date >= start_date and s.binder_date <= end_date and l.location_id = id_loc and (s.policy_status = 'A' or s.policy_status = 'C') and s.premium > '$1.00')
$_$;


ALTER FUNCTION intranet.dashboard_location_month(start_date date, end_date date, id_loc integer) OWNER TO postgres;

--
-- Name: dashboard_location_year(integer); Type: FUNCTION; Schema: intranet; Owner: postgres
--

CREATE FUNCTION intranet.dashboard_location_year(id_loc integer) RETURNS TABLE(business_type character varying, premium money, policies bigint, premiumtkg money, policiestkg bigint)
    LANGUAGE sql
    AS $_$

select business_type,
premium,
policies,
case    when current_date = Date('2025-01-01') then premium * 365 
        else  (premium/(current_date - Date('2025-01-01'))) * 365 end as premiumtkg,
case    when current_date = '2025-01-01' then policies * 365 
        else  (CAST(policies AS DOUBLE PRECISION)/(current_date - Date('2025-01-01'))) * 365 end as policiestkg		
from
(select 'New Business' as business_type,
sum (premium) as premium,
count (premium) as policies
from
(select * from qq.policies s
inner join qq.contacts l
on l.entity_id = s.customer_id) where business_type = 'N' and lob_id <> 34 and lob_id <> 40  and  binder_date >= '2025-01-01' and binder_date <= now() and location_id = id_loc and (policy_status = 'A' or policy_status = 'C') and premium > '$1.00'
union
select 'Renewal' as business_type,
sum (premium) as premium,
count (binder_date) as policies
from
(select * from qq.policies s
inner join qq.contacts l
on l.entity_id = s.customer_id) where business_type = 'R' and lob_id <> 34 and lob_id <> 40  and  binder_date >= '2025-01-01' and binder_date <= now() and (policy_status = 'A' or policy_status = 'C') and location_id = id_loc and premium > '$1.00'
union
select 'Rewrite' as business_type,
sum (premium) as premium,
count (binder_date) as policies
from
(select * from qq.policies s
inner join qq.contacts  l
on l.entity_id = s.customer_id) where business_type = 'W' and lob_id <> 34 and lob_id <> 40  and binder_date >= '2025-01-01' and binder_date <= now() and (policy_status = 'A' or policy_status = 'C') and location_id = id_loc and premium > '$1.00'
union
select 'Total' as business_type,
sum (premium) as premium,
count (binder_date) as policies
from
(select * from qq.policies s
inner join qq.contacts l
on l.entity_id = s.customer_id) where  binder_date >= '2025-01-01' and binder_date <= now() and lob_id <> 34 and lob_id <> 40  and (policy_status = 'A' or policy_status = 'C') and location_id = id_loc and premium > '$1.00')
$_$;


ALTER FUNCTION intranet.dashboard_location_year(id_loc integer) OWNER TO postgres;

--
-- Name: dashboard_nb_last_quarter(integer); Type: FUNCTION; Schema: intranet; Owner: postgres
--

CREATE FUNCTION intranet.dashboard_nb_last_quarter(id_loc integer) RETURNS TABLE(month text, year text, polnb bigint, premnb money)
    LANGUAGE sql
    AS $_$
SELECT to_char(date_trunc('month'::text, now()) - '6 months'::interval month, 'MM'::text) AS month,
    to_char(date_trunc('month'::text, now()) - '6 months'::interval month, 'yyyy'::text) AS year,
    count(s.binder_date) AS policies,
    sum(s.premium) AS premium
   FROM qq.policies s
   join qq.contacts l
   on l.entity_id = s.customer_id
  WHERE  l.location_id = id_loc and s.binder_date >= (date_trunc('month'::text, now()) - '6 months'::interval month) AND s.binder_date < (date_trunc('month'::text, now()) - '5 mons'::interval month) AND s.business_type::text = 'N'::text AND (s.policy_status::text = 'A'::text OR s.policy_status::text = 'C'::text OR s.policy_status::text = 'E'::text) AND s.premium > '$1.00'::money
UNION
SELECT to_char(date_trunc('month'::text, now()) - '5 months'::interval month, 'MM'::text) AS month,
    to_char(date_trunc('month'::text, now()) - '5 months'::interval month, 'yyyy'::text) AS year,
    count(s.binder_date) AS policies,
    sum(s.premium) AS premium
   FROM qq.policies s
  join qq.contacts l
   on l.entity_id = s.customer_id
  WHERE  l.location_id = id_loc and s.binder_date >= (date_trunc('month'::text, now()) - '5 months'::interval month) AND s.binder_date < (date_trunc('month'::text, now()) - '4 mons'::interval month) AND s.business_type::text = 'N'::text AND (s.policy_status::text = 'A'::text OR s.policy_status::text = 'C'::text OR s.policy_status::text = 'E'::text) AND s.premium > '$1.00'::money
UNION
SELECT to_char(date_trunc('month'::text, now()) - '4 months'::interval month, 'MM'::text) AS month,
    to_char(date_trunc('month'::text, now()) - '4 months'::interval month, 'yyyy'::text) AS year,
    count(s.binder_date) AS policies,
    sum(s.premium) AS premium
   FROM qq.policies s
 join qq.contacts l
   on l.entity_id = s.customer_id
  WHERE  l.location_id = id_loc and s.binder_date >= (date_trunc('month'::text, now()) - '4 months'::interval month) AND s.binder_date < (date_trunc('month'::text, now()) - '3 mons'::interval month) AND s.business_type::text = 'N'::text AND (s.policy_status::text = 'A'::text OR s.policy_status::text = 'C'::text OR s.policy_status::text = 'E'::text) AND s.premium > '$1.00'::money
UNION
SELECT to_char(date_trunc('month'::text, now()) - '3 months'::interval month, 'MM'::text) AS month,
    to_char(date_trunc('month'::text, now()) - '3 months'::interval month, 'yyyy'::text) AS year,
    count(s.binder_date) AS policies,
    sum(s.premium) AS premium
   FROM qq.policies s
   join qq.contacts l
   on l.entity_id = s.customer_id
  WHERE  l.location_id = id_loc and s.binder_date >= (date_trunc('month'::text, now()) - '3 months'::interval month) AND s.binder_date < (date_trunc('month'::text, now()) - '2 mons'::interval month) AND s.business_type::text = 'N'::text AND (s.policy_status::text = 'A'::text OR s.policy_status::text = 'C'::text OR s.policy_status::text = 'E'::text) AND s.premium > '$1.00'::money
UNION
SELECT to_char(date_trunc('month'::text, now()) - '2 months'::interval month, 'MM'::text) AS month,
    to_char(date_trunc('month'::text, now()) - '2 months'::interval month, 'yyyy'::text) AS year,
    count(s.binder_date) AS policies,
    sum(s.premium) AS premium
   FROM qq.policies s
  join qq.contacts l
   on l.entity_id = s.customer_id
  WHERE  l.location_id = id_loc and s.binder_date >= (date_trunc('month'::text, now()) - '2 months'::interval month) AND s.binder_date < (date_trunc('month'::text, now()) - '1 mons'::interval month) AND s.business_type::text = 'N'::text AND (s.policy_status::text = 'A'::text OR s.policy_status::text = 'C'::text OR s.policy_status::text = 'E'::text) AND s.premium > '$1.00'::money
UNION
SELECT to_char(date_trunc('month'::text, now()) - '1 months'::interval month, 'MM'::text) AS month,
    to_char(date_trunc('month'::text, now()) - '1 months'::interval month, 'yyyy'::text) AS year,
    count(s.binder_date) AS policies,
    sum(s.premium) AS premium
   FROM qq.policies s
   join qq.contacts l
   on l.entity_id = s.customer_id
  WHERE  l.location_id = id_loc and s.binder_date >= (date_trunc('month'::text, now()) - '1 months'::interval month) AND s.binder_date < (date_trunc('month'::text, now())) AND s.business_type::text = 'N'::text AND (s.policy_status::text = 'A'::text OR s.policy_status::text = 'C'::text OR s.policy_status::text = 'E'::text) AND s.premium > '$1.00'::money
  ORDER BY 2, 1;
$_$;


ALTER FUNCTION intranet.dashboard_nb_last_quarter(id_loc integer) OWNER TO postgres;

--
-- Name: dashboard_nb_last_week(integer); Type: FUNCTION; Schema: intranet; Owner: postgres
--

CREATE FUNCTION intranet.dashboard_nb_last_week(id_loc integer) RETURNS TABLE(lastwpol bigint, lastwpre money, lastlwpol bigint, lastlwprem money, polper numeric, premper numeric)
    LANGUAGE sql
    AS $_$
SELECT lw.policies AS lastwpol,
    lw.premium AS lastwpre,
    llw.policies AS lastlwpol,
    llw.premium AS lastlwpre,
    round((lw.policies::double precision / llw.policies::double precision * 100::double precision)::numeric, 1) - 100::numeric AS polper,
    round((lw.premium / llw.premium * 100::double precision)::numeric, 1) - 100::numeric AS premper
   FROM ( SELECT count(s.binder_date) AS policies,
            sum(s.premium) AS premium
           FROM qq.policies s
		 inner join qq.contacts l
		 on s.customer_id = l.entity_id
          WHERE l.location_id = id_loc and s.binder_date >= (date_trunc('week'::text, now()) - '7 days'::interval) AND s.binder_date < date_trunc('week'::text, now()) AND (s.policy_status::text = 'A'::text OR s.policy_status::text = 'C'::text OR s.policy_status::text = 'E'::text) AND s.business_type::text = 'N'::text AND s.premium > '$1.00'::money) lw,
    ( SELECT count(d.binder_date) AS policies,
            sum(d.premium) AS premium
           FROM qq.policies d
	       inner join qq.contacts cl
	    on cl.entity_id = d.customer_id
          WHERE  cl.location_id = id_loc and d.binder_date >= (date_trunc('week'::text, now()) - '14 days'::interval) AND d.binder_date < (date_trunc('week'::text, now()) - '7 days'::interval) AND (d.policy_status::text = 'A'::text OR d.policy_status::text = 'C'::text OR d.policy_status::text = 'E'::text) AND d.business_type::text = 'N'::text AND d.premium > '$1.00'::money) llw;
$_$;


ALTER FUNCTION intranet.dashboard_nb_last_week(id_loc integer) OWNER TO postgres;

--
-- Name: dashboard_nb_last_year(integer); Type: FUNCTION; Schema: intranet; Owner: postgres
--

CREATE FUNCTION intranet.dashboard_nb_last_year(id_loc integer) RETURNS TABLE(month text, year text, policies bigint, premium money)
    LANGUAGE sql
    AS $_$
WITH loc AS (
    SELECT location_type 
    FROM qq.locations 
    WHERE location_id = id_loc
),
valid_policies AS (
    SELECT 
        s.binder_date, 
        s.premium
    FROM qq.policies s
    JOIN qq.contacts c ON c.entity_id = s.customer_id
    JOIN qq.locations l ON c.location_id = l.location_id
    CROSS JOIN loc
    WHERE 
        (loc.location_type = 1 AND l.location_type = 1) OR
        (loc.location_type IN (2,4) AND l.location_id = id_loc)
        AND s.business_type = 'N'
        AND s.policy_status IN ('A','C','E')
        AND s.premium > '$1.00'::money
),
months AS (
    SELECT generate_series(
        date_trunc('month', current_date) - interval '11 months',
        date_trunc('month', current_date),
        interval '1 month'
    ) AS month_start
)
SELECT 
    to_char(month_start, 'MM') AS month,
    to_char(month_start, 'yyyy') AS year,
    COUNT(s.binder_date) AS policies,
    COALESCE(SUM(s.premium)::money, 0::money) AS premium
FROM months
LEFT JOIN valid_policies s ON 
    s.binder_date >= month_start AND 
    s.binder_date < CASE 
        WHEN month_start = date_trunc('month', current_date) THEN now() 
        ELSE month_start + interval '1 month' 
    END
GROUP BY month_start
ORDER BY month_start;
$_$;


ALTER FUNCTION intranet.dashboard_nb_last_year(id_loc integer) OWNER TO postgres;

--
-- Name: dashboard_nb_week(integer); Type: FUNCTION; Schema: intranet; Owner: postgres
--

CREATE FUNCTION intranet.dashboard_nb_week(id_loc integer) RETURNS TABLE(date date, policies bigint, premium money)
    LANGUAGE sql
    AS $_$
 SELECT date_trunc('week'::text, now()) AS date,
    count(s.binder_date) AS policies,
    sum(s.premium) AS premium
   FROM qq.policies s
   inner join qq.contacts l
   on l.entity_id = s.customer_id
  WHERE l.location_id = id_loc and s.binder_date = date_trunc('week'::text, now()) AND (s.policy_status::text = 'C'::text OR s.policy_status::text = 'A'::text OR s.policy_status::text = 'E'::text) AND s.business_type::text = 'N'::text AND s.premium > '$1.00'::money
UNION
 SELECT date_trunc('week'::text, now()) + '1 days'::interval AS date,
    count(s.binder_date) AS policies,
    sum(s.premium) AS premium
   FROM qq.policies s
    inner join qq.contacts l
   on l.entity_id = s.customer_id
  WHERE l.location_id = id_loc and s.binder_date =(date_trunc('week'::text, now()) + '1 days'::interval) AND (s.policy_status::text = 'C'::text OR s.policy_status::text = 'A'::text OR s.policy_status::text = 'E'::text) AND s.business_type::text = 'N'::text AND s.premium > '$1.00'::money
UNION
  SELECT date_trunc('week'::text, now()) + '2 days'::interval AS date,
    count(s.binder_date) AS policies,
    sum(s.premium) AS premium
   FROM qq.policies s
    inner join qq.contacts l
   on l.entity_id = s.customer_id
  WHERE l.location_id = id_loc and s.binder_date =(date_trunc('week'::text, now()) + '2 days'::interval) AND (s.policy_status::text = 'C'::text OR s.policy_status::text = 'A'::text OR s.policy_status::text = 'E'::text) AND s.business_type::text = 'N'::text AND s.premium > '$1.00'::money
UNION
  SELECT date_trunc('week'::text, now()) + '3 days'::interval AS date,
    count(s.binder_date) AS policies,
    sum(s.premium) AS premium
   FROM qq.policies s
  inner join qq.contacts l
   on l.entity_id = s.customer_id
  WHERE l.location_id = id_loc and s.binder_date =(date_trunc('week'::text, now()) + '3 days'::interval) AND (s.policy_status::text = 'C'::text OR s.policy_status::text = 'A'::text OR s.policy_status::text = 'E'::text) AND s.business_type::text = 'N'::text AND s.premium > '$1.00'::money
UNION
 SELECT date_trunc('week'::text, now()) + '4 days'::interval AS date,
    count(s.binder_date) AS policies,
    sum(s.premium) AS premium
   FROM qq.policies s
   inner join qq.contacts l
   on l.entity_id = s.customer_id
  WHERE l.location_id = id_loc and s.binder_date =(date_trunc('week'::text, now()) + '4 days'::interval) AND (s.policy_status::text = 'C'::text OR s.policy_status::text = 'A'::text OR s.policy_status::text = 'E'::text) AND s.business_type::text = 'N'::text AND s.premium > '$1.00'::money
UNION
  SELECT date_trunc('week'::text, now()) + '5 days'::interval AS date,
    count(s.binder_date) AS policies,
    sum(s.premium) AS premium
   FROM qq.policies s
   inner join qq.contacts l
   on l.entity_id = s.customer_id
  WHERE l.location_id = id_loc and s.binder_date =(date_trunc('week'::text, now()) + '5 days'::interval) AND (s.policy_status::text = 'C'::text OR s.policy_status::text = 'A'::text OR s.policy_status::text = 'E'::text) AND s.business_type::text = 'N'::text AND s.premium > '$1.00'::money
UNION
  SELECT date_trunc('week'::text, now()) + '6 days'::interval AS date,
    count(s.binder_date) AS policies,
    sum(s.premium) AS premium
   FROM qq.policies s
  inner join qq.contacts l
   on l.entity_id = s.customer_id
  WHERE l.location_id = id_loc and s.binder_date =(date_trunc('week'::text, now()) + '6 days'::interval) AND (s.policy_status::text = 'C'::text OR s.policy_status::text = 'A'::text OR s.policy_status::text = 'E'::text) AND s.business_type::text = 'N'::text AND s.premium > '$1.00'::money
ORDER BY 1;
$_$;


ALTER FUNCTION intranet.dashboard_nb_week(id_loc integer) OWNER TO postgres;

--
-- Name: dashboard_producer_rw_location(date, date, integer); Type: FUNCTION; Schema: intranet; Owner: postgres
--

CREATE FUNCTION intranet.dashboard_producer_rw_location(start_date date, end_date date, id_loc integer) RETURNS TABLE(producer_id integer, producer character varying, policies numeric, premium money)
    LANGUAGE sql
    AS $_$
WITH
policy_producers AS (
    SELECT
        p.policy_id,
        unnest(p.producer_ids) AS producer_id,
        p.business_type,
        p.lob_id,
        p.policy_status,
        p.binder_date,
        p.premium,
        c.location_id AS customer_location_id
    FROM qq.policies p
    INNER JOIN qq.contacts c ON p.customer_id = c.entity_id
    WHERE p.binder_date >= start_date
      AND p.binder_date <= end_date
      AND c.location_id = id_loc
      AND p.premium > '$1.00'
      AND (p.policy_status = 'A' OR p.policy_status = 'C')
      AND p.lob_id <> 34 AND p.lob_id <> 40
),
renewed_producers AS (
    SELECT
        c.entity_id AS producer_id
    FROM qq.contacts c
    JOIN entra.users u ON c.display_name = u.display_name
    WHERE u.department = 'Renewed'
),
renewed_policies AS (
    SELECT
        pp.producer_id,
        pp.premium,
        pp.policy_id
    FROM policy_producers pp
    WHERE pp.producer_id IN (SELECT producer_id FROM renewed_producers)
      AND pp.business_type IN ('N','R','W')
),
rw_policies AS (
    SELECT
        pp.producer_id,
        pp.premium,
        pp.policy_id
    FROM policy_producers pp
    WHERE pp.producer_id NOT IN (SELECT producer_id FROM renewed_producers)
      AND pp.business_type IN ('R','W')
)
SELECT
    pp.producer_id,
    c.display_name AS producer,
    COUNT(*) AS policies,
    SUM(pp.premium) AS premium
FROM (
    SELECT * FROM renewed_policies
    UNION ALL
    SELECT * FROM rw_policies
) pp
JOIN qq.contacts c ON c.entity_id = pp.producer_id
GROUP BY pp.producer_id, c.display_name
ORDER BY SUM(pp.premium) DESC
$_$;


ALTER FUNCTION intranet.dashboard_producer_rw_location(start_date date, end_date date, id_loc integer) OWNER TO postgres;

--
-- Name: dashboard_rn_last_year(integer); Type: FUNCTION; Schema: intranet; Owner: postgres
--

CREATE FUNCTION intranet.dashboard_rn_last_year(id_loc integer) RETURNS TABLE(month text, year text, policies bigint, premium money)
    LANGUAGE sql
    AS $_$
SELECT to_char(date_trunc('month'::text, now()) - '1 year'::interval month, 'MM'::text) AS month,
    to_char(date_trunc('month'::text, now()) - '1 year'::interval month, 'yyyy'::text) AS year,
    count(s.binder_date) AS policies,
    sum(s.premium) AS premium
   FROM qq.policies s
    join qq.contacts l
   on l.entity_id = s.customer_id
  WHERE  l.location_id = id_loc and s.binder_date >= (date_trunc('month'::text, now()) - '1 year'::interval month) AND s.binder_date < (date_trunc('month'::text, now()) - '11 mons'::interval month) AND s.business_type::text = 'R'::text AND (s.policy_status::text = 'A'::text OR s.policy_status::text = 'C'::text OR s.policy_status::text = 'E'::text) AND s.premium > '$1.00'::money
UNION
SELECT to_char(date_trunc('month'::text, now()) - '11 months'::interval month, 'MM'::text) AS month,
    to_char(date_trunc('month'::text, now()) - '11 months'::interval month, 'yyyy'::text) AS year,
    count(s.binder_date) AS policies,
    sum(s.premium) AS premium
   FROM qq.policies s
    join qq.contacts l
   on l.entity_id = s.customer_id
  WHERE  l.location_id = id_loc and s.binder_date >= (date_trunc('month'::text, now()) - '11 months'::interval month) AND s.binder_date < (date_trunc('month'::text, now()) - '10 mons'::interval month) AND s.business_type::text = 'R'::text AND (s.policy_status::text = 'A'::text OR s.policy_status::text = 'C'::text OR s.policy_status::text = 'E'::text) AND s.premium > '$1.00'::money
UNION
 SELECT to_char(date_trunc('month'::text, now()) - '10 months'::interval month, 'MM'::text) AS month,
    to_char(date_trunc('month'::text, now()) - '10 months'::interval month, 'yyyy'::text) AS year,
    count(s.binder_date) AS policies,
    sum(s.premium) AS premium
   FROM qq.policies s
   join qq.contacts l
   on l.entity_id = s.customer_id
  WHERE  l.location_id = id_loc and s.binder_date >= (date_trunc('month'::text, now()) - '10 months'::interval month) AND s.binder_date < (date_trunc('month'::text, now()) - '9 mons'::interval month) AND s.business_type::text = 'R'::text AND (s.policy_status::text = 'A'::text OR s.policy_status::text = 'C'::text OR s.policy_status::text = 'E'::text) AND s.premium > '$1.00'::money
UNION
SELECT to_char(date_trunc('month'::text, now()) - '9 months'::interval month, 'MM'::text) AS month,
    to_char(date_trunc('month'::text, now()) - '9 months'::interval month, 'yyyy'::text) AS year,
    count(s.binder_date) AS policies,
    sum(s.premium) AS premium
   FROM qq.policies s
    join qq.contacts l
   on l.entity_id = s.customer_id
  WHERE  l.location_id = id_loc and s.binder_date >= (date_trunc('month'::text, now()) - '9 months'::interval month) AND s.binder_date < (date_trunc('month'::text, now()) - '8 mons'::interval month) AND s.business_type::text = 'R'::text AND (s.policy_status::text = 'A'::text OR s.policy_status::text = 'C'::text OR s.policy_status::text = 'E'::text) AND s.premium > '$1.00'::money
UNION
SELECT to_char(date_trunc('month'::text, now()) - '8 months'::interval month, 'MM'::text) AS month,
    to_char(date_trunc('month'::text, now()) - '8 months'::interval month, 'yyyy'::text) AS year,
    count(s.binder_date) AS policies,
    sum(s.premium) AS premium
   FROM qq.policies s
    join qq.contacts l
   on l.entity_id = s.customer_id
  WHERE  l.location_id = id_loc and s.binder_date >= (date_trunc('month'::text, now()) - '8 months'::interval month) AND s.binder_date < (date_trunc('month'::text, now()) - '7 mons'::interval month) AND s.business_type::text = 'R'::text AND (s.policy_status::text = 'A'::text OR s.policy_status::text = 'C'::text OR s.policy_status::text = 'E'::text) AND s.premium > '$1.00'::money
UNION
SELECT to_char(date_trunc('month'::text, now()) - '7 months'::interval month, 'MM'::text) AS month,
    to_char(date_trunc('month'::text, now()) - '7 months'::interval month, 'yyyy'::text) AS year,
    count(s.binder_date) AS policies,
    sum(s.premium) AS premium
   FROM qq.policies s
   join qq.contacts l
   on l.entity_id = s.customer_id
  WHERE  l.location_id = id_loc and s.binder_date >= (date_trunc('month'::text, now()) - '7 months'::interval month) AND s.binder_date < (date_trunc('month'::text, now()) - '6 mons'::interval month) AND s.business_type::text = 'R'::text AND (s.policy_status::text = 'A'::text OR s.policy_status::text = 'C'::text OR s.policy_status::text = 'E'::text) AND s.premium > '$1.00'::money
UNION
 SELECT to_char(date_trunc('month'::text, now()) - '6 months'::interval month, 'MM'::text) AS month,
    to_char(date_trunc('month'::text, now()) - '6 months'::interval month, 'yyyy'::text) AS year,
    count(s.binder_date) AS policies,
    sum(s.premium) AS premium
   FROM qq.policies s
   join qq.contacts l
   on l.entity_id = s.customer_id
  WHERE  l.location_id = id_loc and s.binder_date >= (date_trunc('month'::text, now()) - '6 months'::interval month) AND s.binder_date < (date_trunc('month'::text, now()) - '5 mons'::interval month) AND s.business_type::text = 'R'::text AND (s.policy_status::text = 'A'::text OR s.policy_status::text = 'C'::text OR s.policy_status::text = 'E'::text) AND s.premium > '$1.00'::money
UNION
SELECT to_char(date_trunc('month'::text, now()) - '5 months'::interval month, 'MM'::text) AS month,
    to_char(date_trunc('month'::text, now()) - '5 months'::interval month, 'yyyy'::text) AS year,
    count(s.binder_date) AS policies,
    sum(s.premium) AS premium
   FROM qq.policies s
   join qq.contacts l
   on l.entity_id = s.customer_id
  WHERE  l.location_id = id_loc and s.binder_date >= (date_trunc('month'::text, now()) - '5 months'::interval month) AND s.binder_date < (date_trunc('month'::text, now()) - '4 mons'::interval month) AND s.business_type::text = 'R'::text AND (s.policy_status::text = 'A'::text OR s.policy_status::text = 'C'::text OR s.policy_status::text = 'E'::text) AND s.premium > '$1.00'::money
UNION
 SELECT to_char(date_trunc('month'::text, now()) - '4 months'::interval month, 'MM'::text) AS month,
    to_char(date_trunc('month'::text, now()) - '4 months'::interval month, 'yyyy'::text) AS year,
    count(s.binder_date) AS policies,
    sum(s.premium) AS premium
   FROM qq.policies s
    join qq.contacts l
   on l.entity_id = s.customer_id
  WHERE  l.location_id = id_loc and s.binder_date >= (date_trunc('month'::text, now()) - '4 months'::interval month) AND s.binder_date < (date_trunc('month'::text, now()) - '3 mons'::interval month) AND s.business_type::text = 'R'::text AND (s.policy_status::text = 'A'::text OR s.policy_status::text = 'C'::text OR s.policy_status::text = 'E'::text) AND s.premium > '$1.00'::money
UNION
SELECT to_char(date_trunc('month'::text, now()) - '3 months'::interval month, 'MM'::text) AS month,
    to_char(date_trunc('month'::text, now()) - '3 months'::interval month, 'yyyy'::text) AS year,
    count(s.binder_date) AS policies,
    sum(s.premium) AS premium
   FROM qq.policies s
   join qq.contacts l
   on l.entity_id = s.customer_id
  WHERE  l.location_id = id_loc and s.binder_date >= (date_trunc('month'::text, now()) - '3 months'::interval month) AND s.binder_date < (date_trunc('month'::text, now()) - '2 mons'::interval month) AND s.business_type::text = 'R'::text AND (s.policy_status::text = 'A'::text OR s.policy_status::text = 'C'::text OR s.policy_status::text = 'E'::text) AND s.premium > '$1.00'::money
UNION
SELECT to_char(date_trunc('month'::text, now()) - '2 months'::interval month, 'MM'::text) AS month,
    to_char(date_trunc('month'::text, now()) - '2 months'::interval month, 'yyyy'::text) AS year,
    count(s.binder_date) AS policies,
    sum(s.premium) AS premium
   FROM qq.policies s
   join qq.contacts l
   on l.entity_id = s.customer_id
  WHERE  l.location_id = id_loc and s.binder_date >= (date_trunc('month'::text, now()) - '2 months'::interval month) AND s.binder_date < (date_trunc('month'::text, now()) - '1 mons'::interval month) AND s.business_type::text = 'R'::text AND (s.policy_status::text = 'A'::text OR s.policy_status::text = 'C'::text OR s.policy_status::text = 'E'::text) AND s.premium > '$1.00'::money
UNION
SELECT to_char(date_trunc('month'::text, now()) - '1 months'::interval month, 'MM'::text) AS month,
    to_char(date_trunc('month'::text, now()) - '1 months'::interval month, 'yyyy'::text) AS year,
    count(s.binder_date) AS policies,
    sum(s.premium) AS premium
   FROM qq.policies s
   join qq.contacts l
   on l.entity_id = s.customer_id
  WHERE  l.location_id = id_loc and s.binder_date >= (date_trunc('month'::text, now()) - '1 months'::interval month) AND s.binder_date < (date_trunc('month'::text, now())) AND s.business_type::text = 'R'::text AND (s.policy_status::text = 'A'::text OR s.policy_status::text = 'C'::text OR s.policy_status::text = 'E'::text) AND s.premium > '$1.00'::money
UNION
 SELECT to_char(date_trunc('month'::text, now()), 'MM'::text) AS month,
    to_char(date_trunc('month'::text, now()), 'yyyy'::text) AS year,
    count(s.binder_date) AS policies,
    sum(s.premium) AS premium
   FROM qq.policies s
   join qq.contacts l
   on l.entity_id = s.customer_id
  WHERE  l.location_id = id_loc and s.binder_date >= date_trunc('month'::text, CURRENT_DATE::timestamp with time zone) AND s.binder_date <= now() AND s.business_type::text = 'R'::text AND (s.policy_status::text = 'A'::text OR s.policy_status::text = 'C'::text OR s.policy_status::text = 'E'::text) AND s.premium > '$1.00'::money
  ORDER BY 2, 1;
$_$;


ALTER FUNCTION intranet.dashboard_rn_last_year(id_loc integer) OWNER TO postgres;

--
-- Name: dashboard_rw_last_year(integer); Type: FUNCTION; Schema: intranet; Owner: postgres
--

CREATE FUNCTION intranet.dashboard_rw_last_year(id_loc integer) RETURNS TABLE(month text, year text, policies bigint, premium money)
    LANGUAGE sql
    AS $_$
SELECT to_char(date_trunc('month'::text, now()) - '1 year'::interval month, 'MM'::text) AS month,
    to_char(date_trunc('month'::text, now()) - '1 year'::interval month, 'yyyy'::text) AS year,
    count(s.binder_date) AS policies,
    sum(s.premium) AS premium
   FROM qq.policies s
    join qq.contacts l
   on l.entity_id = s.customer_id
  WHERE  l.location_id = id_loc and s.binder_date >= (date_trunc('month'::text, now()) - '1 year'::interval month) AND s.binder_date < (date_trunc('month'::text, now()) - '11 mons'::interval month) AND s.business_type::text = 'W'::text AND (s.policy_status::text = 'A'::text OR s.policy_status::text = 'C'::text OR s.policy_status::text = 'E'::text) AND s.premium > '$1.00'::money
UNION
SELECT to_char(date_trunc('month'::text, now()) - '11 months'::interval month, 'MM'::text) AS month,
    to_char(date_trunc('month'::text, now()) - '11 months'::interval month, 'yyyy'::text) AS year,
    count(s.binder_date) AS policies,
    sum(s.premium) AS premium
   FROM qq.policies s
    join qq.contacts l
   on l.entity_id = s.customer_id
  WHERE  l.location_id = id_loc and s.binder_date >= (date_trunc('month'::text, now()) - '11 months'::interval month) AND s.binder_date < (date_trunc('month'::text, now()) - '10 mons'::interval month) AND s.business_type::text = 'W'::text AND (s.policy_status::text = 'A'::text OR s.policy_status::text = 'C'::text OR s.policy_status::text = 'E'::text) AND s.premium > '$1.00'::money
UNION
 SELECT to_char(date_trunc('month'::text, now()) - '10 months'::interval month, 'MM'::text) AS month,
    to_char(date_trunc('month'::text, now()) - '10 months'::interval month, 'yyyy'::text) AS year,
    count(s.binder_date) AS policies,
    sum(s.premium) AS premium
   FROM qq.policies s
   join qq.contacts l
   on l.entity_id = s.customer_id
  WHERE  l.location_id = id_loc and s.binder_date >= (date_trunc('month'::text, now()) - '10 months'::interval month) AND s.binder_date < (date_trunc('month'::text, now()) - '9 mons'::interval month) AND s.business_type::text = 'W'::text AND (s.policy_status::text = 'A'::text OR s.policy_status::text = 'C'::text OR s.policy_status::text = 'E'::text) AND s.premium > '$1.00'::money
UNION
SELECT to_char(date_trunc('month'::text, now()) - '9 months'::interval month, 'MM'::text) AS month,
    to_char(date_trunc('month'::text, now()) - '9 months'::interval month, 'yyyy'::text) AS year,
    count(s.binder_date) AS policies,
    sum(s.premium) AS premium
   FROM qq.policies s
    join qq.contacts l
   on l.entity_id = s.customer_id
  WHERE  l.location_id = id_loc and s.binder_date >= (date_trunc('month'::text, now()) - '9 months'::interval month) AND s.binder_date < (date_trunc('month'::text, now()) - '8 mons'::interval month) AND s.business_type::text = 'W'::text AND (s.policy_status::text = 'A'::text OR s.policy_status::text = 'C'::text OR s.policy_status::text = 'E'::text) AND s.premium > '$1.00'::money
UNION
SELECT to_char(date_trunc('month'::text, now()) - '8 months'::interval month, 'MM'::text) AS month,
    to_char(date_trunc('month'::text, now()) - '8 months'::interval month, 'yyyy'::text) AS year,
    count(s.binder_date) AS policies,
    sum(s.premium) AS premium
   FROM qq.policies s
    join qq.contacts l
   on l.entity_id = s.customer_id
  WHERE  l.location_id = id_loc and s.binder_date >= (date_trunc('month'::text, now()) - '8 months'::interval month) AND s.binder_date < (date_trunc('month'::text, now()) - '7 mons'::interval month) AND s.business_type::text = 'W'::text AND (s.policy_status::text = 'A'::text OR s.policy_status::text = 'C'::text OR s.policy_status::text = 'E'::text) AND s.premium > '$1.00'::money
UNION
SELECT to_char(date_trunc('month'::text, now()) - '7 months'::interval month, 'MM'::text) AS month,
    to_char(date_trunc('month'::text, now()) - '7 months'::interval month, 'yyyy'::text) AS year,
    count(s.binder_date) AS policies,
    sum(s.premium) AS premium
   FROM qq.policies s
   join qq.contacts l
   on l.entity_id = s.customer_id
  WHERE  l.location_id = id_loc and s.binder_date >= (date_trunc('month'::text, now()) - '7 months'::interval month) AND s.binder_date < (date_trunc('month'::text, now()) - '6 mons'::interval month) AND s.business_type::text = 'W'::text AND (s.policy_status::text = 'A'::text OR s.policy_status::text = 'C'::text OR s.policy_status::text = 'E'::text) AND s.premium > '$1.00'::money
UNION
 SELECT to_char(date_trunc('month'::text, now()) - '6 months'::interval month, 'MM'::text) AS month,
    to_char(date_trunc('month'::text, now()) - '6 months'::interval month, 'yyyy'::text) AS year,
    count(s.binder_date) AS policies,
    sum(s.premium) AS premium
   FROM qq.policies s
   join qq.contacts l
   on l.entity_id = s.customer_id
  WHERE  l.location_id = id_loc and s.binder_date >= (date_trunc('month'::text, now()) - '6 months'::interval month) AND s.binder_date < (date_trunc('month'::text, now()) - '5 mons'::interval month) AND s.business_type::text = 'W'::text AND (s.policy_status::text = 'A'::text OR s.policy_status::text = 'C'::text OR s.policy_status::text = 'E'::text) AND s.premium > '$1.00'::money
UNION
SELECT to_char(date_trunc('month'::text, now()) - '5 months'::interval month, 'MM'::text) AS month,
    to_char(date_trunc('month'::text, now()) - '5 months'::interval month, 'yyyy'::text) AS year,
    count(s.binder_date) AS policies,
    sum(s.premium) AS premium
   FROM qq.policies s
   join qq.contacts l
   on l.entity_id = s.customer_id
  WHERE  l.location_id = id_loc and s.binder_date >= (date_trunc('month'::text, now()) - '5 months'::interval month) AND s.binder_date < (date_trunc('month'::text, now()) - '4 mons'::interval month) AND s.business_type::text = 'W'::text AND (s.policy_status::text = 'A'::text OR s.policy_status::text = 'C'::text OR s.policy_status::text = 'E'::text) AND s.premium > '$1.00'::money
UNION
 SELECT to_char(date_trunc('month'::text, now()) - '4 months'::interval month, 'MM'::text) AS month,
    to_char(date_trunc('month'::text, now()) - '4 months'::interval month, 'yyyy'::text) AS year,
    count(s.binder_date) AS policies,
    sum(s.premium) AS premium
   FROM qq.policies s
    join qq.contacts l
   on l.entity_id = s.customer_id
  WHERE  l.location_id = id_loc and s.binder_date >= (date_trunc('month'::text, now()) - '4 months'::interval month) AND s.binder_date < (date_trunc('month'::text, now()) - '3 mons'::interval month) AND s.business_type::text = 'W'::text AND (s.policy_status::text = 'A'::text OR s.policy_status::text = 'C'::text OR s.policy_status::text = 'E'::text) AND s.premium > '$1.00'::money
UNION
SELECT to_char(date_trunc('month'::text, now()) - '3 months'::interval month, 'MM'::text) AS month,
    to_char(date_trunc('month'::text, now()) - '3 months'::interval month, 'yyyy'::text) AS year,
    count(s.binder_date) AS policies,
    sum(s.premium) AS premium
   FROM qq.policies s
   join qq.contacts l
   on l.entity_id = s.customer_id
  WHERE  l.location_id = id_loc and s.binder_date >= (date_trunc('month'::text, now()) - '3 months'::interval month) AND s.binder_date < (date_trunc('month'::text, now()) - '2 mons'::interval month) AND s.business_type::text = 'W'::text AND (s.policy_status::text = 'A'::text OR s.policy_status::text = 'C'::text OR s.policy_status::text = 'E'::text) AND s.premium > '$1.00'::money
UNION
SELECT to_char(date_trunc('month'::text, now()) - '2 months'::interval month, 'MM'::text) AS month,
    to_char(date_trunc('month'::text, now()) - '2 months'::interval month, 'yyyy'::text) AS year,
    count(s.binder_date) AS policies,
    sum(s.premium) AS premium
   FROM qq.policies s
   join qq.contacts l
   on l.entity_id = s.customer_id
  WHERE  l.location_id = id_loc and s.binder_date >= (date_trunc('month'::text, now()) - '2 months'::interval month) AND s.binder_date < (date_trunc('month'::text, now()) - '1 mons'::interval month) AND s.business_type::text = 'W'::text AND (s.policy_status::text = 'A'::text OR s.policy_status::text = 'C'::text OR s.policy_status::text = 'E'::text) AND s.premium > '$1.00'::money
UNION
SELECT to_char(date_trunc('month'::text, now()) - '1 months'::interval month, 'MM'::text) AS month,
    to_char(date_trunc('month'::text, now()) - '1 months'::interval month, 'yyyy'::text) AS year,
    count(s.binder_date) AS policies,
    sum(s.premium) AS premium
   FROM qq.policies s
   join qq.contacts l
   on l.entity_id = s.customer_id
  WHERE  l.location_id = id_loc and s.binder_date >= (date_trunc('month'::text, now()) - '1 months'::interval month) AND s.binder_date < (date_trunc('month'::text, now())) AND s.business_type::text = 'W'::text AND (s.policy_status::text = 'A'::text OR s.policy_status::text = 'C'::text OR s.policy_status::text = 'E'::text) AND s.premium > '$1.00'::money
UNION
 SELECT to_char(date_trunc('month'::text, now()), 'MM'::text) AS month,
    to_char(date_trunc('month'::text, now()), 'yyyy'::text) AS year,
    count(s.binder_date) AS policies,
    sum(s.premium) AS premium
   FROM qq.policies s
   join qq.contacts l
   on l.entity_id = s.customer_id
  WHERE  l.location_id = id_loc and s.binder_date >= date_trunc('month'::text, CURRENT_DATE::timestamp with time zone) AND s.binder_date <= now() AND s.business_type::text = 'W'::text AND (s.policy_status::text = 'A'::text OR s.policy_status::text = 'C'::text OR s.policy_status::text = 'E'::text) AND s.premium > '$1.00'::money
  ORDER BY 2, 1;
$_$;


ALTER FUNCTION intranet.dashboard_rw_last_year(id_loc integer) OWNER TO postgres;

--
-- Name: dashboard_sales_last_year(integer); Type: FUNCTION; Schema: intranet; Owner: postgres
--

CREATE FUNCTION intranet.dashboard_sales_last_year(id_loc integer) RETURNS TABLE(month text, year text, policies bigint, premium money)
    LANGUAGE sql
    AS $_$
 SELECT to_char(date_trunc('month'::text, now()) - '1 year'::interval month, 'MM'::text) AS month,
    to_char(date_trunc('month'::text, now()) - '1 year'::interval month, 'yyyy'::text) AS year,
    count(s.binder_date) AS policies,
    sum(s.premium) AS premium
   FROM qq.policies s
   join qq.contacts l
   on l.entity_id = s.customer_id
  WHERE  l.location_id = id_loc and s.binder_date >= (date_trunc('month'::text, now()) - '1 year'::interval month) AND s.binder_date < (date_trunc('month'::text, now()) - '11 mons'::interval month)  AND (s.policy_status::text = 'A'::text OR s.policy_status::text = 'C'::text OR s.policy_status::text = 'E'::text) AND s.premium > '$1.00'::money
UNION
SELECT to_char(date_trunc('month'::text, now()) - '11 months'::interval month, 'MM'::text) AS month,
    to_char(date_trunc('month'::text, now()) - '11 months'::interval month, 'yyyy'::text) AS year,
    count(s.binder_date) AS policies,
    sum(s.premium) AS premium
   FROM qq.policies s
   join qq.contacts l
   on l.entity_id = s.customer_id
  WHERE  l.location_id = id_loc and s.binder_date >= (date_trunc('month'::text, now()) - '11 months'::interval month) AND s.binder_date < (date_trunc('month'::text, now()) - '10 mons'::interval month)  AND (s.policy_status::text = 'A'::text OR s.policy_status::text = 'C'::text OR s.policy_status::text = 'E'::text) AND s.premium > '$1.00'::money
UNION
 SELECT to_char(date_trunc('month'::text, now()) - '10 months'::interval month, 'MM'::text) AS month,
    to_char(date_trunc('month'::text, now()) - '10 months'::interval month, 'yyyy'::text) AS year,
    count(s.binder_date) AS policies,
    sum(s.premium) AS premium
   FROM qq.policies s
    join qq.contacts l
   on l.entity_id = s.customer_id
  WHERE  l.location_id = id_loc and s.binder_date >= (date_trunc('month'::text, now()) - '10 months'::interval month) AND s.binder_date < (date_trunc('month'::text, now()) - '9 mons'::interval month)  AND (s.policy_status::text = 'A'::text OR s.policy_status::text = 'C'::text OR s.policy_status::text = 'E'::text) AND s.premium > '$1.00'::money
UNION
SELECT to_char(date_trunc('month'::text, now()) - '9 months'::interval month, 'MM'::text) AS month,
    to_char(date_trunc('month'::text, now()) - '9 months'::interval month, 'yyyy'::text) AS year,
    count(s.binder_date) AS policies,
    sum(s.premium) AS premium
   FROM qq.policies s
    join qq.contacts l
   on l.entity_id = s.customer_id
  WHERE  l.location_id = id_loc and s.binder_date >= (date_trunc('month'::text, now()) - '9 months'::interval month) AND s.binder_date < (date_trunc('month'::text, now()) - '8 mons'::interval month)  AND (s.policy_status::text = 'A'::text OR s.policy_status::text = 'C'::text OR s.policy_status::text = 'E'::text) AND s.premium > '$1.00'::money
UNION
SELECT to_char(date_trunc('month'::text, now()) - '8 months'::interval month, 'MM'::text) AS month,
    to_char(date_trunc('month'::text, now()) - '8 months'::interval month, 'yyyy'::text) AS year,
    count(s.binder_date) AS policies,
    sum(s.premium) AS premium
   FROM qq.policies s
   join qq.contacts l
   on l.entity_id = s.customer_id
  WHERE  l.location_id = id_loc and s.binder_date >= (date_trunc('month'::text, now()) - '8 months'::interval month) AND s.binder_date < (date_trunc('month'::text, now()) - '7 mons'::interval month)  AND (s.policy_status::text = 'A'::text OR s.policy_status::text = 'C'::text OR s.policy_status::text = 'E'::text) AND s.premium > '$1.00'::money
UNION
SELECT to_char(date_trunc('month'::text, now()) - '7 months'::interval month, 'MM'::text) AS month,
    to_char(date_trunc('month'::text, now()) - '7 months'::interval month, 'yyyy'::text) AS year,
    count(s.binder_date) AS policies,
    sum(s.premium) AS premium
   FROM qq.policies s
   join qq.contacts l
   on l.entity_id = s.customer_id
  WHERE  l.location_id = id_loc and s.binder_date >= (date_trunc('month'::text, now()) - '7 months'::interval month) AND s.binder_date < (date_trunc('month'::text, now()) - '6 mons'::interval month)  AND (s.policy_status::text = 'A'::text OR s.policy_status::text = 'C'::text OR s.policy_status::text = 'E'::text) AND s.premium > '$1.00'::money
UNION
 SELECT to_char(date_trunc('month'::text, now()) - '6 months'::interval month, 'MM'::text) AS month,
    to_char(date_trunc('month'::text, now()) - '6 months'::interval month, 'yyyy'::text) AS year,
    count(s.binder_date) AS policies,
    sum(s.premium) AS premium
   FROM qq.policies s
    join qq.contacts l
   on l.entity_id = s.customer_id
  WHERE  l.location_id = id_loc and s.binder_date >= (date_trunc('month'::text, now()) - '6 months'::interval month) AND s.binder_date < (date_trunc('month'::text, now()) - '5 mons'::interval month)  AND (s.policy_status::text = 'A'::text OR s.policy_status::text = 'C'::text OR s.policy_status::text = 'E'::text) AND s.premium > '$1.00'::money
UNION
SELECT to_char(date_trunc('month'::text, now()) - '5 months'::interval month, 'MM'::text) AS month,
    to_char(date_trunc('month'::text, now()) - '5 months'::interval month, 'yyyy'::text) AS year,
    count(s.binder_date) AS policies,
    sum(s.premium) AS premium
   FROM qq.policies s
    join qq.contacts l
   on l.entity_id = s.customer_id
  WHERE  l.location_id = id_loc and s.binder_date >= (date_trunc('month'::text, now()) - '5 months'::interval month) AND s.binder_date < (date_trunc('month'::text, now()) - '4 mons'::interval month) AND (s.policy_status::text = 'A'::text OR s.policy_status::text = 'C'::text OR s.policy_status::text = 'E'::text) AND s.premium > '$1.00'::money
UNION
 SELECT to_char(date_trunc('month'::text, now()) - '4 months'::interval month, 'MM'::text) AS month,
    to_char(date_trunc('month'::text, now()) - '4 months'::interval month, 'yyyy'::text) AS year,
    count(s.binder_date) AS policies,
    sum(s.premium) AS premium
   FROM qq.policies s
   join qq.contacts l
   on l.entity_id = s.customer_id
  WHERE  l.location_id = id_loc and s.binder_date >= (date_trunc('month'::text, now()) - '4 months'::interval month) AND s.binder_date < (date_trunc('month'::text, now()) - '3 mons'::interval month)  AND (s.policy_status::text = 'A'::text OR s.policy_status::text = 'C'::text OR s.policy_status::text = 'E'::text) AND s.premium > '$1.00'::money
UNION
SELECT to_char(date_trunc('month'::text, now()) - '3 months'::interval month, 'MM'::text) AS month,
    to_char(date_trunc('month'::text, now()) - '3 months'::interval month, 'yyyy'::text) AS year,
    count(s.binder_date) AS policies,
    sum(s.premium) AS premium
   FROM qq.policies s
    join qq.contacts l
   on l.entity_id = s.customer_id
  WHERE  l.location_id = id_loc and s.binder_date >= (date_trunc('month'::text, now()) - '3 months'::interval month) AND s.binder_date < (date_trunc('month'::text, now()) - '2 mons'::interval month)  AND (s.policy_status::text = 'A'::text OR s.policy_status::text = 'C'::text OR s.policy_status::text = 'E'::text) AND s.premium > '$1.00'::money
UNION
SELECT to_char(date_trunc('month'::text, now()) - '2 months'::interval month, 'MM'::text) AS month,
    to_char(date_trunc('month'::text, now()) - '2 months'::interval month, 'yyyy'::text) AS year,
    count(s.binder_date) AS policies,
    sum(s.premium) AS premium
   FROM qq.policies s
    join qq.contacts l
   on l.entity_id = s.customer_id
  WHERE  l.location_id = id_loc and s.binder_date >= (date_trunc('month'::text, now()) - '2 months'::interval month) AND s.binder_date < (date_trunc('month'::text, now()) - '1 mons'::interval month)  AND (s.policy_status::text = 'A'::text OR s.policy_status::text = 'C'::text OR s.policy_status::text = 'E'::text) AND s.premium > '$1.00'::money
UNION
SELECT to_char(date_trunc('month'::text, now()) - '1 months'::interval month, 'MM'::text) AS month,
    to_char(date_trunc('month'::text, now()) - '1 months'::interval month, 'yyyy'::text) AS year,
    count(s.binder_date) AS policies,
    sum(s.premium) AS premium
   FROM qq.policies s
    join qq.contacts l
   on l.entity_id = s.customer_id
  WHERE  l.location_id = id_loc and s.binder_date >= (date_trunc('month'::text, now()) - '1 months'::interval month) AND s.binder_date < (date_trunc('month'::text, now()))  AND (s.policy_status::text = 'A'::text OR s.policy_status::text = 'C'::text OR s.policy_status::text = 'E'::text) AND s.premium > '$1.00'::money
UNION
 SELECT to_char(date_trunc('month'::text, now()), 'MM'::text) AS month,
    to_char(date_trunc('month'::text, now()), 'yyyy'::text) AS year,
    count(s.binder_date) AS policies,
    sum(s.premium) AS premium
   FROM qq.policies s
   join qq.contacts l
   on l.entity_id = s.customer_id
  WHERE  l.location_id = id_loc and s.binder_date >= date_trunc('month'::text, CURRENT_DATE::timestamp with time zone) AND s.binder_date <= now()  AND (s.policy_status::text = 'A'::text OR s.policy_status::text = 'C'::text OR s.policy_status::text = 'E'::text) AND s.premium > '$1.00'::money
  ORDER BY 2, 1;
$_$;


ALTER FUNCTION intranet.dashboard_sales_last_year(id_loc integer) OWNER TO postgres;

--
-- Name: dashboard_sales_month_total_by_type_tkg(date, date); Type: FUNCTION; Schema: intranet; Owner: postgres
--

CREATE FUNCTION intranet.dashboard_sales_month_total_by_type_tkg(start_date date, end_date date) RETURNS TABLE(business_type text, premium money, policies bigint)
    LANGUAGE sql
    AS $_$
select business_type,
premium,
policies
from
(select 'New Business'  as Business_Type,
sum (premium) as premium,
count (binder_date) as policies
from qq.policies
where binder_date >= start_date and binder_date <= current_date and business_type = 'N' AND premium >= '$1.00'::money AND policy_status::text !~~ '%D%'::text AND policy_status::text !~~ '%V%'::text AND lob_id <> 34 AND lob_id <> 40
union
select 'Renewal'  as Business_Type,
sum (premium),
count (binder_date)
from qq.policies
where binder_date >= start_date and binder_date <= current_date and business_type = 'R' AND premium >= '$1.00'::money AND policy_status::text !~~ '%D%'::text AND policy_status::text !~~ '%V%'::text AND lob_id <> 34 AND lob_id <> 40
union
select 'Rewrite'  as Business_Type,
sum (premium),
count (binder_date)
from qq.policies
where binder_date >= start_date and binder_date <= current_date and business_type = 'W' AND premium >= '$1.00'::money AND policy_status::text !~~ '%D%'::text AND policy_status::text !~~ '%V%'::text AND lob_id <> 34 AND lob_id <> 40
union
select 'TOTAL'  as Business_Type, 
sum (premium),
count (binder_date)
from qq.policies
where binder_date >= start_date and binder_date <= current_date  AND premium >= '$1.00'::money AND policy_status::text !~~ '%D%'::text AND policy_status::text !~~ '%V%'::text AND lob_id <> 34 AND lob_id <> 40) a1
$_$;


ALTER FUNCTION intranet.dashboard_sales_month_total_by_type_tkg(start_date date, end_date date) OWNER TO postgres;

--
-- Name: enqueue_kpi_refresh(date); Type: FUNCTION; Schema: intranet; Owner: postgres
--

CREATE FUNCTION intranet.enqueue_kpi_refresh(p_date date) RETURNS boolean
    LANGUAGE plpgsql
    AS $$
DECLARE
  enqueued boolean := false;
BEGIN
  BEGIN
    INSERT INTO intranet.kpi_refresh_jobs(date1, status)
    VALUES (p_date, 'queued');
    enqueued := true;
  EXCEPTION WHEN unique_violation THEN
    enqueued := false; -- ya existe queued/running para esa fecha
  END;

  RETURN enqueued;
END;
$$;


ALTER FUNCTION intranet.enqueue_kpi_refresh(p_date date) OWNER TO postgres;

--
-- Name: expired_not_renewals_totals(date, integer); Type: FUNCTION; Schema: intranet; Owner: postgres
--

CREATE FUNCTION intranet.expired_not_renewals_totals(date1 date, loc_id integer) RETURNS TABLE(line character varying, premium money, policies integer)
    LANGUAGE sql
    AS $$

SELECT t.line, SUM(t.premium) AS premium, CAST(COUNT(t.premium) AS integer) AS policies
FROM (SELECT * from intranet.renewals_lost_front( date1, loc_id)) t
GROUP BY t.line

$$;


ALTER FUNCTION intranet.expired_not_renewals_totals(date1 date, loc_id integer) OWNER TO postgres;

--
-- Name: fn_expired_policies_this_month(integer, date); Type: FUNCTION; Schema: intranet; Owner: postgres
--

CREATE FUNCTION intranet.fn_expired_policies_this_month(p_location_id integer, p_exp_date date) RETURNS TABLE(policy_number text, customer_name text, customer_phone text, customer_email text, carrier_name text, line_of_business text, exp_date date, premium numeric, csr_name text, producer_name text, is_renewed boolean)
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_location_type integer;
    v_month_start   date := date_trunc('month', p_exp_date)::date;
    v_month_end     date := (v_month_start + INTERVAL '1 month')::date;
BEGIN
    SELECT location_type INTO v_location_type
    FROM qq.locations
    WHERE location_id = p_location_id;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Ubicación % no existe', p_location_id;
    END IF;

    RETURN QUERY
    SELECT 
        p.policy_number::text,
        c.display_name::text AS customer_name,
        c.phone::text AS customer_phone,
        c.email::text AS customer_email,
        carrier.display_name::text AS carrier_name,
        lob.display_name::text AS line_of_business,
        p.exp_date,
        p.premium::numeric,
        csr.display_name::text AS csr_name,
        (
            SELECT STRING_AGG(prod.display_name, ', ')
            FROM unnest(p.producer_ids) AS pid(producer_id)
            JOIN qq.contacts prod ON prod.entity_id = pid.producer_id
        )::text AS producer_name,
        -- Verificar si tiene renovación
        EXISTS (
            SELECT 1 
            FROM qq.policies r 
            WHERE r.prior_policy_id = p.policy_id
            AND r.business_type IN ('R','W')
            AND r.policy_status = 'A'
            AND r.exp_date >= v_month_start
            AND r.exp_date < v_month_end
        ) AS is_renewed
    FROM qq.policies p
    JOIN qq.contacts c ON p.customer_id = c.entity_id
    JOIN qq.contacts carrier ON p.carrier_id = carrier.entity_id
    JOIN qq.lob lob ON p.lob_id = lob.lob_id
    JOIN qq.contacts csr ON p.csr_id = csr.entity_id
    JOIN qq.locations l ON c.location_id = l.location_id
    WHERE 
        (
            (v_location_type = 1 AND l.location_type = 1)
            OR (v_location_type IN (2,4) AND l.location_id = p_location_id)
        )
        AND p.lob_id NOT IN (34, 40)
        AND p.policy_status = 'A'
        AND p.exp_date >= v_month_start
        AND p.exp_date <= p_exp_date  -- Solo hasta la fecha de corte
        AND p.exp_date < v_month_end
        -- Filtrar solo no renovadas
        AND NOT EXISTS (
            SELECT 1 
            FROM qq.policies r 
            WHERE r.prior_policy_id = p.policy_id
            AND r.business_type IN ('R','W')
            AND r.policy_status = 'A'
            AND r.exp_date >= v_month_start
            AND r.exp_date < v_month_end
        )
    ORDER BY p.exp_date;
END;
$$;


ALTER FUNCTION intranet.fn_expired_policies_this_month(p_location_id integer, p_exp_date date) OWNER TO postgres;

--
-- Name: fn_expiring_policies(integer, date); Type: FUNCTION; Schema: intranet; Owner: postgres
--

CREATE FUNCTION intranet.fn_expiring_policies(p_location_id integer, p_exp_date date) RETURNS TABLE(policy_number text, customer_name text, customer_phone text, customer_email text, carrier_name text, line_of_business text, exp_date date, premium numeric, csr_name text, producer_name text, is_renewed boolean)
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_location_type integer;
BEGIN
    SELECT location_type INTO v_location_type
    FROM qq.locations
    WHERE location_id = p_location_id;
    
    RETURN QUERY
    WITH polizas_base AS (
        SELECT 
            p.policy_id,
            p.policy_number::text,
            p.exp_date,
            p.premium::numeric,
            p.prior_policy_id,
            p.business_type,
            c.display_name::text AS customer_name,
            c.phone::text AS customer_phone,
            c.email::text AS customer_email,
            carrier.display_name::text AS carrier_name,
            lob.display_name::text AS line_of_business,
            csr.display_name::text AS csr_name,
            (
                SELECT STRING_AGG(prod.display_name, ', ')
                FROM unnest(p.producer_ids) AS pid(producer_id)
                JOIN qq.contacts prod ON prod.entity_id = pid.producer_id
            ) AS producer_name
        FROM qq.policies p
        JOIN qq.contacts c ON p.customer_id = c.entity_id
        JOIN qq.contacts carrier ON p.carrier_id = carrier.entity_id
        JOIN qq.lob lob ON p.lob_id = lob.lob_id
        JOIN qq.contacts csr ON p.csr_id = csr.entity_id
        JOIN qq.locations l ON c.location_id = l.location_id
        WHERE 
            (
                (v_location_type = 1 AND l.location_type = 1)
                OR (v_location_type IN (2,4) AND l.location_id = p_location_id)
            )
            AND p.lob_id NOT IN (34, 40)
            AND p.policy_status = 'A'
            AND p.exp_date >= date_trunc('month', p_exp_date)::date
            AND p.exp_date < (date_trunc('month', p_exp_date) + INTERVAL '1 month')::date
    ),
    renovadas AS (
        SELECT 
            pb.policy_id,
            EXISTS (
                SELECT 1 
                FROM qq.policies r 
                WHERE r.prior_policy_id = pb.policy_id
                AND r.business_type IN ('R','W')
                AND r.policy_status = 'A'
                AND r.exp_date >= date_trunc('month', p_exp_date)::date
                AND r.exp_date < (date_trunc('month', p_exp_date) + INTERVAL '1 month')::date
            ) AS is_renewed
        FROM polizas_base pb
    )
    SELECT 
        pb.policy_number,
        pb.customer_name,
        pb.customer_phone,
        pb.customer_email,
        pb.carrier_name,
        pb.line_of_business,
        pb.exp_date,
        pb.premium,
        pb.csr_name,
        pb.producer_name,
        r.is_renewed
    FROM polizas_base pb
    JOIN renovadas r ON pb.policy_id = r.policy_id
    ORDER BY pb.exp_date;
END;
$$;


ALTER FUNCTION intranet.fn_expiring_policies(p_location_id integer, p_exp_date date) OWNER TO postgres;

--
-- Name: fn_lost_renewals_by_line(integer, date); Type: FUNCTION; Schema: intranet; Owner: postgres
--

CREATE FUNCTION intranet.fn_lost_renewals_by_line(p_location_id integer, p_exp_date date) RETURNS TABLE(total_policies integer, total_premium numeric, line1_policies integer, line1_premium numeric, line2_policies integer, line2_premium numeric, line3_policies integer, line3_premium numeric)
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_location_type smallint;
    v_month_start   date := date_trunc('month', p_exp_date)::date;
    v_next_month    date := (v_month_start + INTERVAL '1 month')::date;
    v_cutoff_date   date := p_exp_date;
BEGIN
    -- Validación estricta de ubicación
    SELECT location_type INTO STRICT v_location_type
    FROM qq.locations
    WHERE location_id = p_location_id;
    
    RETURN QUERY
    WITH polizas_mes AS (
        -- Consulta para corporativo (tipo 1)
        SELECT 
            p.policy_id,
            p.exp_date,
            p.premium::numeric AS premium,
            lob.id_line,
            EXISTS (
                SELECT 1 
                FROM qq.policies r 
                WHERE r.prior_policy_id = p.policy_id
                AND r.business_type IN ('R','W')
                AND r.policy_status = 'A'
                AND r.exp_date >= v_month_start
                AND r.exp_date < v_next_month
            ) AS is_renewed
        FROM qq.policies p
        JOIN qq.contacts c ON p.customer_id = c.entity_id
        JOIN qq.locations l ON c.location_id = l.location_id
        JOIN admin.lob lob ON p.lob_id = lob.lob_id
        WHERE p.exp_date >= v_month_start
          AND p.exp_date < v_next_month
          AND p.policy_status = 'A'
          AND p.lob_id NOT IN (34, 40)
          AND lob.id_line IN (1,2,3)  -- Solo líneas relevantes
          AND v_location_type = 1
          AND l.location_type = 1
        
        UNION ALL
        
        -- Consulta para agencias (tipos 2,4)
        SELECT 
            p.policy_id,
            p.exp_date,
            p.premium::numeric AS premium,
            lob.id_line,
            EXISTS (
                SELECT 1 
                FROM qq.policies r 
                WHERE r.prior_policy_id = p.policy_id
                AND r.business_type IN ('R','W')
                AND r.policy_status = 'A'
                AND r.exp_date >= v_month_start
                AND r.exp_date < v_next_month
            ) AS is_renewed
        FROM qq.policies p
        JOIN qq.contacts c ON p.customer_id = c.entity_id
        JOIN qq.locations l ON c.location_id = l.location_id
        JOIN admin.lob lob ON p.lob_id = lob.lob_id
        WHERE p.exp_date >= v_month_start
          AND p.exp_date < v_next_month
          AND p.policy_status = 'A'
          AND p.lob_id NOT IN (34, 40)
          AND lob.id_line IN (1,2,3)
          AND v_location_type IN (2,4)
          AND l.location_id = p_location_id
    ),
    perdidas AS (
        SELECT 
            policy_id,
            premium,
            id_line
        FROM polizas_mes
        WHERE exp_date <= v_cutoff_date
          AND NOT is_renewed
    )
    SELECT
        COUNT(*)::integer,
        COALESCE(SUM(premium), 0)::numeric,
        COUNT(*) FILTER (WHERE id_line = 1)::integer,
        COALESCE(SUM(premium) FILTER (WHERE id_line = 1), 0)::numeric,
        COUNT(*) FILTER (WHERE id_line = 2)::integer,
        COALESCE(SUM(premium) FILTER (WHERE id_line = 2), 0)::numeric,
        COUNT(*) FILTER (WHERE id_line = 3)::integer,
        COALESCE(SUM(premium) FILTER (WHERE id_line = 3), 0)::numeric
    FROM perdidas;
EXCEPTION 
    WHEN NO_DATA_FOUND THEN
        RAISE EXCEPTION 'Ubicación % no existe', p_location_id;
    WHEN OTHERS THEN
        RAISE;
END;
$$;


ALTER FUNCTION intranet.fn_lost_renewals_by_line(p_location_id integer, p_exp_date date) OWNER TO postgres;

--
-- Name: franchise_cache_meta(date, integer); Type: FUNCTION; Schema: intranet; Owner: postgres
--

CREATE FUNCTION intranet.franchise_cache_meta(p_date date, p_stale_minutes integer DEFAULT 15) RETURNS TABLE(requested_date date, used_date date, as_of timestamp with time zone, is_stale boolean, refreshing boolean)
    LANGUAGE sql
    AS $$
  WITH base AS (
    SELECT
      max(date1) AS used_date,
      max(updated_at) AS as_of
    FROM intranet.franchise_cache
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
    b.used_date,
    b.as_of,
    CASE
      WHEN b.as_of IS NULL THEN true
      ELSE now() - b.as_of > make_interval(mins => p_stale_minutes)
    END AS is_stale,
    j.refreshing
  FROM base b, job j;
$$;


ALTER FUNCTION intranet.franchise_cache_meta(p_date date, p_stale_minutes integer) OWNER TO postgres;

--
-- Name: franchise_dashboard_fast(date); Type: FUNCTION; Schema: intranet; Owner: postgres
--

CREATE FUNCTION intranet.franchise_dashboard_fast(p_date date) RETURNS TABLE(location_id integer, franchise text, premium text, policies text, renewed_premium text, renewed_policies text, lost_premium text, lost_policies text, renewed_percent text, max_percent text)
    LANGUAGE sql STABLE
    AS $$
  WITH pick AS (
    SELECT COALESCE(
      (SELECT max(date1) FROM intranet.franchise_cache WHERE date1 <= p_date),
      (SELECT max(date1) FROM intranet.franchise_cache)
    ) AS use_date
  )
  SELECT
    c.location_id,
    c.franchise,
    to_char(ROUND(c.premium)::bigint,         'FM9,999,999,999,999') AS premium,
    to_char(c.policies,                       'FM9,999,999,999,999') AS policies,
    to_char(ROUND(c.renewed_premium)::bigint, 'FM9,999,999,999,999') AS renewed_premium,
    to_char(c.renewed_policies,               'FM9,999,999,999,999') AS renewed_policies,
    to_char(ROUND(c.lost_premium)::bigint,    'FM9,999,999,999,999') AS lost_premium,
    to_char(c.lost_policies,                  'FM9,999,999,999,999') AS lost_policies,
    to_char(ROUND(c.renewed_percent, 1),      'FM990.0') || '%'      AS renewed_percent,
    to_char(ROUND(c.max_percent, 1),          'FM990.0') || '%'      AS max_percent
  FROM intranet.franchise_cache c
  JOIN pick p ON c.date1 = p.use_date
  ORDER BY c.location_id;
$$;


ALTER FUNCTION intranet.franchise_dashboard_fast(p_date date) OWNER TO postgres;

--
-- Name: franchise_error_totals(integer, date, date); Type: FUNCTION; Schema: intranet; Owner: postgres
--

CREATE FUNCTION intranet.franchise_error_totals(p_location_id integer, p_start_date date DEFAULT NULL::date, p_end_date date DEFAULT NULL::date) RETURNS TABLE(location_id integer, franchise text, active_police integer, "Active clients" integer, "Total errors" integer, "Binder errors" integer, "Missing CSR" integer, "Missing Producer" integer, "Missing (any)" integer, "Missing Contact Info" integer, start_date date, end_date date)
    LANGUAGE sql
    AS $$
  WITH param AS (
    SELECT COALESCE(
             (SELECT q.location_type
              FROM qq.locations q
              WHERE q.location_id = p_location_id),
             1
           ) AS p_location_type
  )
  SELECT
    l.location_id,
    COALESCE(l.alias, l.location_name)::text AS franchise,

    -- Active policies (policy_status = 'A') por franquicia (vía contacts.location_id)
    COALESCE(ap.cnt, 0) AS "active_police",

    -- Active clients (clientes distintos con al menos una póliza activa)
    COALESCE(ac.cnt, 0) AS "Active clients",

    -- Totales de errores
    COALESCE(bc.cnt, 0) + COALESCE(cp.missing_any_total, 0) + COALESCE(cinfo.cnt, 0) AS "Total errors",
    COALESCE(bc.cnt, 0) AS "Binder errors",
    COALESCE(cp.csr_total, 0) AS "Missing CSR",
    COALESCE(cp.producer_total, 0) AS "Missing Producer",
    COALESCE(cp.missing_any_total, 0) AS "Missing (any)",
    COALESCE(cinfo.cnt, 0) AS "Missing Contact Info",

    p_start_date AS start_date,
    p_end_date   AS end_date
  FROM qq.locations l
  CROSS JOIN param

  -- Total de pólizas activas (policy_status = 'A'), uniendo vía contactos
  LEFT JOIN LATERAL (
    SELECT COUNT(*)::int AS cnt
    FROM qq.policies p
    JOIN qq.contacts c ON c.entity_id = p.customer_id
    WHERE p.policy_status = 'A'
      AND c.location_id = l.location_id
      AND (
            p_start_date IS NULL
            OR (p.effective_date IS NOT NULL AND p.effective_date >= p_start_date)
          )
      AND (
            p_end_date IS NULL
            OR (p.effective_date IS NOT NULL AND p.effective_date <= p_end_date)
          )
  ) ap ON TRUE

  -- Total de clientes con pólizas activas (DISTINCT por customer_id), mismo criterio de fechas
  LEFT JOIN LATERAL (
    SELECT COUNT(DISTINCT p.customer_id)::int AS cnt
    FROM qq.policies p
    JOIN qq.contacts c ON c.entity_id = p.customer_id
    WHERE p.policy_status = 'A'
      AND c.location_id = l.location_id
      AND (
            p_start_date IS NULL
            OR (p.effective_date IS NOT NULL AND p.effective_date >= p_start_date)
          )
      AND (
            p_end_date IS NULL
            OR (p.effective_date IS NOT NULL AND p.effective_date <= p_end_date)
          )
  ) ac ON TRUE

  -- Errores por binder
  LEFT JOIN LATERAL (
    SELECT COUNT(*)::int AS cnt
    FROM intranet.get_policy_report_by_location(l.location_id, p_start_date, p_end_date)
  ) bc ON TRUE

  -- Errores por CSR y Producer
  LEFT JOIN LATERAL (
    SELECT
      COUNT(*) FILTER (WHERE t.missing_fields LIKE '%CSR%')::int       AS csr_total,
      COUNT(*) FILTER (WHERE t.missing_fields LIKE '%Producer%')::int  AS producer_total,
      COUNT(*)::int                                                    AS missing_any_total
    FROM intranet.get_policies_missing_csr_or_producer(l.location_id, p_start_date, p_end_date) t
  ) cp ON TRUE

  -- Missing Contact Info: sin email + sin teléfono + email inválido
  LEFT JOIN LATERAL (
    SELECT
      COALESCE(cnt_email, 0)
    + COALESCE(cnt_phone, 0)
    + COALESCE(cnt_invalid_email, 0) AS cnt
    FROM (
      SELECT
        (SELECT COUNT(*) FROM intranet.get_active_customers_without_email(l.location_id))      AS cnt_email,
        (SELECT COUNT(*) FROM intranet.get_active_customers_without_phone(l.location_id))      AS cnt_phone,
        (SELECT COUNT(*) FROM intranet.get_active_customers_with_invalid_email(l.location_id)) AS cnt_invalid_email
    ) x
  ) cinfo ON TRUE

  WHERE
      -- Si el location_id es tipo 1, mostrar todas las franquicias (tipo 2)
      (param.p_location_type = 1 AND l.location_type = 2)
      -- Si es tipo 2, solo ese location_id
      OR (param.p_location_type = 2 AND l.location_id = p_location_id)

  ORDER BY
    (COALESCE(bc.cnt, 0) + COALESCE(cp.missing_any_total, 0) + COALESCE(cinfo.cnt, 0)) DESC,
    franchise;
$$;


ALTER FUNCTION intranet.franchise_error_totals(p_location_id integer, p_start_date date, p_end_date date) OWNER TO postgres;

--
-- Name: franchise_error_totals_active(integer, date, date); Type: FUNCTION; Schema: intranet; Owner: postgres
--

CREATE FUNCTION intranet.franchise_error_totals_active(p_location_id integer, p_start_date date DEFAULT NULL::date, p_end_date date DEFAULT NULL::date) RETURNS TABLE(location_id integer, franchise text, active_police integer, "Active clients" integer, "Total errors" integer, "Binder errors" integer, "Missing CSR" integer, "Missing Producer" integer, "Missing (any)" integer, "Missing Contact Info" integer, start_date date, end_date date)
    LANGUAGE sql
    AS $$
  WITH param AS (
    SELECT COALESCE(
             (SELECT q.location_type
              FROM qq.locations q
              WHERE q.location_id = p_location_id),
             1
           ) AS p_location_type
  ),
  -- Ajusta esta lista a las etiquetas "activas" reales de tu sistema.
  active_labels AS (
    SELECT ARRAY[
      'A',
      'ACTIVE',
      'INFORCE',
      'IN FORCE',
      'IN-FORCE',
      'CURRENT'
    ]::text[] AS labels
  )
  SELECT
    l.location_id,
    COALESCE(l.alias, l.location_name)::text AS franchise,

    -- Active policies (policy_status ∈ active_labels) por franquicia (vía contacts.location_id)
    COALESCE(ap.cnt, 0) AS "active_police",

    -- Active clients (clientes distintos con al menos una póliza activa)
    COALESCE(ac.cnt, 0) AS "Active clients",

    -- Totales de errores
    COALESCE(bc.cnt, 0)
    + COALESCE(cp.missing_any_total, 0)
    + COALESCE(cinfo.cnt, 0) AS "Total errors",

    COALESCE(bc.cnt, 0) AS "Binder errors",
    COALESCE(cp.csr_total, 0) AS "Missing CSR",
    COALESCE(cp.producer_total, 0) AS "Missing Producer",
    COALESCE(cp.missing_any_total, 0) AS "Missing (any)",
    COALESCE(cinfo.cnt, 0) AS "Missing Contact Info",

    p_start_date AS start_date,
    p_end_date   AS end_date

  FROM qq.locations l
  CROSS JOIN param
  CROSS JOIN active_labels al

  -- Active policies count (filtra por etiquetas activas y fecha efectiva si se provee)
  LEFT JOIN LATERAL (
    SELECT COUNT(*)::int AS cnt
    FROM qq.policies p
    JOIN qq.contacts c ON c.entity_id = p.customer_id
    WHERE TRIM(UPPER(COALESCE(p.policy_status, ''))) = ANY (al.labels)
      AND c.location_id = l.location_id
      AND (
            p_start_date IS NULL
            OR (p.effective_date IS NOT NULL AND p.effective_date >= p_start_date)
          )
      AND (
            p_end_date IS NULL
            OR (p.effective_date IS NOT NULL AND p.effective_date <= p_end_date)
          )
  ) ap ON TRUE

  -- Active clients (DISTINCT por customer_id) con etiquetas activas y mismo criterio de fechas
  LEFT JOIN LATERAL (
    SELECT COUNT(DISTINCT p.customer_id)::int AS cnt
    FROM qq.policies p
    JOIN qq.contacts c ON c.entity_id = p.customer_id
    WHERE TRIM(UPPER(COALESCE(p.policy_status, ''))) = ANY (al.labels)
      AND c.location_id = l.location_id
      AND (
            p_start_date IS NULL
            OR (p.effective_date IS NOT NULL AND p.effective_date >= p_start_date)
          )
      AND (
            p_end_date IS NULL
            OR (p.effective_date IS NOT NULL AND p.effective_date <= p_end_date)
          )
  ) ac ON TRUE

  -- Binder errors (filtrar activos)
  LEFT JOIN LATERAL (
    SELECT COUNT(*)::int AS cnt
    FROM intranet.get_policy_report_by_location(l.location_id, p_start_date, p_end_date) x
    WHERE TRIM(UPPER(COALESCE(x.policy_status, ''))) = ANY (al.labels)
  ) bc ON TRUE

  -- Missing CSR/Producer (filtrar activos)
  LEFT JOIN LATERAL (
    SELECT
      COUNT(*) FILTER (WHERE t.missing_fields LIKE '%CSR%')::int      AS csr_total,
      COUNT(*) FILTER (WHERE t.missing_fields LIKE '%Producer%')::int AS producer_total,
      COUNT(*)::int                                                   AS missing_any_total
    FROM intranet.get_policies_missing_csr_or_producer(l.location_id, p_start_date, p_end_date) t
    WHERE TRIM(UPPER(COALESCE(t.policy_status, ''))) = ANY (al.labels)
  ) cp ON TRUE

  -- Missing Contact Info (estas 3 funciones ya devuelven activos)
  LEFT JOIN LATERAL (
    SELECT
      COALESCE(cnt_email, 0)
    + COALESCE(cnt_phone, 0)
    + COALESCE(cnt_invalid_email, 0) AS cnt
    FROM (
      SELECT
        (SELECT COUNT(*) FROM intranet.get_active_customers_without_email(l.location_id))      AS cnt_email,
        (SELECT COUNT(*) FROM intranet.get_active_customers_without_phone(l.location_id))      AS cnt_phone,
        (SELECT COUNT(*) FROM intranet.get_active_customers_with_invalid_email(l.location_id)) AS cnt_invalid_email
    ) x
  ) cinfo ON TRUE

  WHERE
    (param.p_location_type = 1 AND l.location_type = 2)
    OR (param.p_location_type = 2 AND l.location_id = p_location_id)

  ORDER BY
    (COALESCE(bc.cnt, 0)
     + COALESCE(cp.missing_any_total, 0)
     + COALESCE(cinfo.cnt, 0)) DESC,
    franchise;
$$;


ALTER FUNCTION intranet.franchise_error_totals_active(p_location_id integer, p_start_date date, p_end_date date) OWNER TO postgres;

--
-- Name: franchise_kpis_dashboard(date); Type: FUNCTION; Schema: intranet; Owner: postgres
--

CREATE FUNCTION intranet.franchise_kpis_dashboard(date1 date) RETURNS TABLE(location_id integer, franchise text, premium text, policies text, renewed_premium text, renewed_policies text, lost_premium text, lost_policies text, renewed_percent text, max_percent text)
    LANGUAGE plpgsql
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    l.location_id,
    COALESCE(l.alias, l.location_name)::text AS franchise,

    -- Montos/cantidades: miles con coma, sin decimales
    to_char(ROUND(COALESCE(CAST(tot.premium AS numeric), 0))::bigint,  'FM9,999,999,999,999') AS premium,
    to_char(COALESCE(tot.policies, 0),                                 'FM9,999,999,999,999') AS policies,
    to_char(ROUND(COALESCE(CAST(ren.premium AS numeric), 0))::bigint,  'FM9,999,999,999,999') AS renewed_premium,
    to_char(COALESCE(ren.policies, 0),                                 'FM9,999,999,999,999') AS renewed_policies,
    to_char(ROUND(COALESCE(CAST(lost.premium AS numeric), 0))::bigint, 'FM9,999,999,999,999') AS lost_premium,
    to_char(COALESCE(lost.policies, 0),                                'FM9,999,999,999,999') AS lost_policies,

    -- Porcentajes: 1 decimal y símbolo %
    to_char(COALESCE(ROUND(COALESCE(perc.renewed_percent, 0)::numeric, 1), 0.0), 'FM990.0') || '%' AS renewed_percent,
    to_char(COALESCE(ROUND(COALESCE(perc.max_percent, 0)::numeric, 1), 0.0),     'FM990.0') || '%' AS max_percent

  FROM qq.locations l
  LEFT JOIN LATERAL intranet.renewals_upcoming_totals(date1, l.location_id)       AS tot  ON TRUE
  LEFT JOIN LATERAL intranet.renewals_renewed_totals(date1, l.location_id)        AS ren  ON TRUE
  LEFT JOIN LATERAL intranet.renewals_lost_totals(date1, l.location_id)           AS lost ON TRUE
  LEFT JOIN LATERAL intranet.renewals_upcoming_percents(date1, l.location_id)     AS perc ON TRUE
  WHERE l.location_type IN (2);
END;
$$;


ALTER FUNCTION intranet.franchise_kpis_dashboard(date1 date) OWNER TO postgres;

--
-- Name: franchise_kpis_totals(date); Type: FUNCTION; Schema: intranet; Owner: postgres
--

CREATE FUNCTION intranet.franchise_kpis_totals(date1 date) RETURNS TABLE(premium_and_policies text, renewed_and_policies text, lost_and_policies text, percent_and_max text)
    LANGUAGE sql STABLE
    AS $_$
  WITH pick AS (
    SELECT COALESCE(
             (SELECT max(date1) FROM intranet.franchise_cache WHERE date1 <= $1),
             (SELECT max(date1) FROM intranet.franchise_cache)
           ) AS use_date
  ),
  agg AS (
    SELECT
      COALESCE(SUM(c.premium),           0)::numeric AS total_premium,
      COALESCE(SUM(c.policies),          0)::bigint  AS total_policies,
      COALESCE(SUM(c.renewed_premium),   0)::numeric AS total_renewed_premium,
      COALESCE(SUM(c.renewed_policies),  0)::bigint  AS total_renewed_policies,
      COALESCE(SUM(c.lost_premium),      0)::numeric AS total_lost_premium,
      COALESCE(SUM(c.lost_policies),     0)::bigint  AS total_lost_policies
    FROM pick p
    LEFT JOIN intranet.franchise_cache c
      ON c.date1 = p.use_date
  ),
  perc AS (
    SELECT
      CASE
        WHEN a.total_policies = 0 THEN 0.0
        ELSE ROUND(100.0 * a.total_renewed_policies::numeric / a.total_policies::numeric, 1)
      END AS sum_renewed_percent,
      CASE
        WHEN a.total_policies = 0 THEN 0.0
        ELSE ROUND(100.0 - (100.0 * a.total_lost_policies::numeric / a.total_policies::numeric), 1)
      END AS sum_max_percent,
      a.*
    FROM agg a
  )
  SELECT
    to_char(ROUND(total_premium)::bigint,          'FM9,999,999,999,999') || ' / ' ||
    to_char(total_policies,                        'FM9,999,999,999,999') AS premium_and_policies,
    to_char(ROUND(total_renewed_premium)::bigint,  'FM9,999,999,999,999') || ' / ' ||
    to_char(total_renewed_policies,                'FM9,999,999,999,999') AS renewed_and_policies,
    to_char(ROUND(total_lost_premium)::bigint,     'FM9,999,999,999,999') || ' / ' ||
    to_char(total_lost_policies,                   'FM9,999,999,999,999') AS lost_and_policies,
    to_char(sum_renewed_percent, 'FM990.0') || '% / ' ||
    to_char(sum_max_percent,     'FM990.0') || '%'  AS percent_and_max
  FROM perc;
$_$;


ALTER FUNCTION intranet.franchise_kpis_totals(date1 date) OWNER TO postgres;

--
-- Name: get_active_customers_with_invalid_email(integer); Type: FUNCTION; Schema: intranet; Owner: postgres
--

CREATE FUNCTION intranet.get_active_customers_with_invalid_email(p_location_id integer DEFAULT NULL::integer) RETURNS TABLE(email text, customer_id integer, customer_display_name text, phone text, type_display text, location_alias text, email_status text)
    LANGUAGE sql
    AS $$
WITH base AS (
  SELECT
    c.email,
    p.customer_id,
    c.display_name AS customer_display_name,
    c.phone,
    c.type_display,
    l.alias AS location_alias,
    ce.email_status,
    p.effective_date,
    p.policy_id
  FROM qq.policies AS p
  JOIN qq.contacts AS c
    ON p.customer_id = c.entity_id
  JOIN qq.locations AS l
    ON c.location_id = l.location_id
  LEFT JOIN intranet.contact_email_checks AS ce
    ON ce.contact_id = c.entity_id
  WHERE p.policy_status = 'A'
    AND p.lob_id NOT IN (34, 40, 100)
    AND c.email IS NOT NULL
    AND btrim(c.email) <> ''

    -- Excluir NULL/''/error y todo lo "ok" (tratando ok_for_all como ok)
    AND ce.email_status IS NOT NULL
    AND btrim(ce.email_status) <> ''
    AND lower(btrim(ce.email_status)) NOT IN ('ok', 'ok_for_all', 'ok for all', 'error')

    AND (
      p_location_id IS NULL
      OR (
        EXISTS (
          SELECT 1
          FROM qq.locations lp
          WHERE lp.location_id = p_location_id
            AND lp.location_type = 1
        )
        AND l.location_type = 1
      )
      OR (
        NOT EXISTS (
          SELECT 1
          FROM qq.locations lp
          WHERE lp.location_id = p_location_id
            AND lp.location_type = 1
        )
        AND l.location_id = p_location_id
      )
    )
)
SELECT
  email,
  customer_id,
  customer_display_name,
  phone,
  type_display,
  location_alias,
  email_status
FROM base
ORDER BY effective_date DESC, policy_id DESC;
$$;


ALTER FUNCTION intranet.get_active_customers_with_invalid_email(p_location_id integer) OWNER TO postgres;

--
-- Name: get_active_customers_without_email(integer); Type: FUNCTION; Schema: intranet; Owner: postgres
--

CREATE FUNCTION intranet.get_active_customers_without_email(p_location_id integer DEFAULT NULL::integer) RETURNS TABLE(email text, customer_id integer, customer_display_name text, phone text, type_display text, location_alias text)
    LANGUAGE sql
    AS $$
WITH base AS (
  SELECT
    c.email,
    p.customer_id,
    c.display_name AS customer_display_name,
    c.phone,
    c.type_display,
    l.alias AS location_alias,
    p.effective_date,
    p.policy_id,
    ROW_NUMBER() OVER (
      PARTITION BY p.customer_id
      ORDER BY p.effective_date DESC, p.policy_id DESC
    ) AS rn
  FROM qq.policies AS p
  JOIN qq.contacts AS c
    ON p.customer_id = c.entity_id
  JOIN qq.locations AS l
    ON c.location_id = l.location_id
  WHERE p.policy_status::text = 'A'::text
    AND p.lob_id NOT IN (34, 40, 100)
    AND (c.email IS NULL OR btrim(c.email) = '')
    AND (
      p_location_id IS NULL
      OR (
        EXISTS (
          SELECT 1
          FROM qq.locations lp
          WHERE lp.location_id = p_location_id
            AND lp.location_type = 1
        )
        AND l.location_type = 1
      )
      OR (
        NOT EXISTS (
          SELECT 1
          FROM qq.locations lp
          WHERE lp.location_id = p_location_id
            AND lp.location_type = 1
        )
        AND l.location_id = p_location_id
      )
    )
)
SELECT
  email,
  customer_id,
  customer_display_name,
  phone,
  type_display,
  location_alias
FROM base
WHERE rn = 1
ORDER BY effective_date DESC, policy_id DESC;
$$;


ALTER FUNCTION intranet.get_active_customers_without_email(p_location_id integer) OWNER TO postgres;

--
-- Name: get_active_customers_without_phone(integer); Type: FUNCTION; Schema: intranet; Owner: postgres
--

CREATE FUNCTION intranet.get_active_customers_without_phone(p_location_id integer DEFAULT NULL::integer) RETURNS TABLE(email text, customer_id integer, customer_display_name text, phone text, type_display text, location_alias text)
    LANGUAGE sql
    AS $$
WITH base AS (
  SELECT
    c.email,
    p.customer_id,
    c.display_name AS customer_display_name,
    c.phone,
    c.type_display,
    l.alias AS location_alias,
    p.effective_date,
    p.policy_id,
    ROW_NUMBER() OVER (
      PARTITION BY p.customer_id
      ORDER BY p.effective_date DESC, p.policy_id DESC
    ) AS rn
  FROM qq.policies AS p
  JOIN qq.contacts AS c
    ON p.customer_id = c.entity_id
  JOIN qq.locations AS l
    ON c.location_id = l.location_id
  WHERE p.policy_status::text = 'A'::text
    AND p.lob_id NOT IN (34, 40, 100)
    AND (c.phone IS NULL OR btrim(c.phone) = '')
    AND (
      p_location_id IS NULL
      OR (
        EXISTS (
          SELECT 1
          FROM qq.locations lp
          WHERE lp.location_id = p_location_id
            AND lp.location_type = 1
        )
        AND l.location_type = 1
      )
      OR (
        NOT EXISTS (
          SELECT 1
          FROM qq.locations lp
          WHERE lp.location_id = p_location_id
            AND lp.location_type = 1
        )
        AND l.location_id = p_location_id
      )
    )
)
SELECT
  email,
  customer_id,
  customer_display_name,
  phone,
  type_display,
  location_alias
FROM base
WHERE rn = 1
ORDER BY effective_date DESC, policy_id DESC;
$$;


ALTER FUNCTION intranet.get_active_customers_without_phone(p_location_id integer) OWNER TO postgres;

--
-- Name: get_agents_by_location(integer); Type: FUNCTION; Schema: intranet; Owner: postgres
--

CREATE FUNCTION intranet.get_agents_by_location(p_location_id integer) RETURNS TABLE(licensed_agent_id integer, name character varying, email character varying, job_title character varying, license_number character varying, issue_date date, exp_date date, status boolean)
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_location_type integer;
BEGIN
    -- Obtiene el tipo del location solicitado
    SELECT location_type INTO v_location_type FROM qq.locations WHERE location_id = p_location_id;

    IF v_location_type = 1 THEN
        -- Si es tipo 1: mostrar todos los agentes licenciados con location_type = 1
        RETURN QUERY
        SELECT 
            l.licensed_agent_id,
            l.display_name AS name,
            l.mail AS email,
            l.job_title,
            l.license_number,
            l.issue_date,
            l.exp_date,
            l.active AS status
        FROM intranet.licensed l
        JOIN qq.locations lo ON l.location_id = lo.location_id
        WHERE lo.location_type = 1;
    ELSIF v_location_type IN (2,4) THEN
        -- Si es tipo 2 o 4: mostrar solo los agentes licenciados de ese location_id
        RETURN QUERY
        SELECT 
            l.licensed_agent_id,
            l.display_name AS name,
            l.mail AS email,
            l.job_title,
            l.license_number,
            l.issue_date,
            l.exp_date,
            l.active AS status
        FROM intranet.licensed l
        WHERE l.location_id = p_location_id;
    ELSE
        -- Si es otro tipo, no devuelve nada
        RETURN QUERY SELECT NULL::integer, NULL::character varying, NULL::character varying, NULL::character varying, NULL::character varying, NULL::date, NULL::date, NULL::boolean WHERE FALSE;
    END IF;
END;
$$;


ALTER FUNCTION intranet.get_agents_by_location(p_location_id integer) OWNER TO postgres;

--
-- Name: get_codes_by_location(integer); Type: FUNCTION; Schema: intranet; Owner: postgres
--

CREATE FUNCTION intranet.get_codes_by_location(p_location_id integer) RETURNS TABLE(agency character varying, company character varying, code character varying, login character varying, password character varying, location_id integer)
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_location_type integer;
  v_agency_alias varchar;
BEGIN
  SELECT l.location_type, l.alias
    INTO v_location_type, v_agency_alias
  FROM qq.locations l
  WHERE l.location_id = p_location_id;

  IF v_location_type IS NULL OR v_agency_alias IS NULL THEN
    RETURN;
  END IF;

  IF v_location_type = 1 THEN
    -- Corporativo: devuelve TODOS los códigos activos por cada location (match por alias y location)
    RETURN QUERY
    SELECT 
      l.alias AS agency,
      c.company,
      c.code,
      c.login,
      c.password,
      c.location_id      -- ¡calificado!
    FROM qq.locations l
    JOIN intranet.code c
      ON REPLACE(TRIM(LOWER(c.agency)), ' ', '') = REPLACE(TRIM(LOWER(l.alias)), ' ', '')
     AND c.location_id = l.location_id           -- ¡calificado!
    WHERE l.location_type = 1
      AND c.enabled = true
    ORDER BY l.alias, c.company, c.code;

  ELSIF v_location_type IN (2,4) THEN
    -- Franchise/Office: solo los códigos activos de su propia location
    RETURN QUERY
    SELECT 
      c.agency,
      c.company,
      c.code,
      c.login,
      c.password,
      c.location_id      -- ¡calificado!
    FROM intranet.code c
    WHERE REPLACE(TRIM(LOWER(c.agency)), ' ', '') = REPLACE(TRIM(LOWER(v_agency_alias)), ' ', '')
      AND c.location_id = p_location_id          -- ¡calificado!
      AND c.enabled = true
    ORDER BY c.company, c.code;

  ELSE
    RETURN;
  END IF;
END;
$$;


ALTER FUNCTION intranet.get_codes_by_location(p_location_id integer) OWNER TO postgres;

--
-- Name: get_corporate_nb_sales_by_date(date, integer); Type: FUNCTION; Schema: intranet; Owner: postgres
--

CREATE FUNCTION intranet.get_corporate_nb_sales_by_date(input_date date DEFAULT CURRENT_DATE, location_id_param integer DEFAULT NULL::integer) RETURNS TABLE(sales_date date, location_name character varying, total_premium money)
    LANGUAGE plpgsql
    AS $_$
DECLARE
    v_location_type integer;
    v_location_alias varchar;
BEGIN
    -- Obtener el tipo y alias del location_id_param
    SELECT loc.location_type, loc.alias
      INTO v_location_type, v_location_alias
      FROM qq.locations loc
     WHERE loc.location_id = location_id_param;

    IF v_location_type = 1 THEN
        -- CORPORATIVO: mostrar solo los 3 alias corporativos Y el total
        RETURN QUERY
        SELECT 
            input_date AS sales_date,
            loc.alias::VARCHAR AS location_name,
            COALESCE(SUM(p.premium), '$0.00'::MONEY) AS total_premium
        FROM qq.policies p
        JOIN qq.contacts c ON p.customer_id = c.entity_id
        JOIN qq.locations loc ON c.location_id = loc.location_id
        WHERE
            p.business_type = 'N'
            AND p.policy_status = 'A'
            AND p.premium > '$1.00'::money
            AND p.binder_date::DATE = input_date
            AND loc.alias IN ('Bent Tree', 'Headquarters', 'Hialeah')
        GROUP BY loc.alias

        UNION ALL

        SELECT 
            input_date AS sales_date,
            'Total'::VARCHAR AS location_name,
            COALESCE(SUM(p.premium), '$0.00'::MONEY) AS total_premium
        FROM qq.policies p
        JOIN qq.contacts c ON p.customer_id = c.entity_id
        JOIN qq.locations loc ON c.location_id = loc.location_id
        WHERE
            p.business_type = 'N'
            AND p.policy_status = 'A'
            AND p.premium > '$1.00'::money
            AND p.binder_date::DATE = input_date
            AND loc.alias IN ('Bent Tree', 'Headquarters', 'Hialeah');

    ELSE
        -- FRANQUICIA: mostrar solo el location/alias de ese location_id_param
        RETURN QUERY
        SELECT
            input_date AS sales_date,
            loc.alias::VARCHAR AS location_name,
            COALESCE(SUM(p.premium), '$0.00'::MONEY) AS total_premium
        FROM qq.policies p
        JOIN qq.contacts c ON p.customer_id = c.entity_id
        JOIN qq.locations loc ON c.location_id = loc.location_id
        WHERE
            p.business_type = 'N'
            AND p.policy_status = 'A'
            AND p.premium > '$1.00'::money
            AND p.binder_date::DATE = input_date
            AND loc.location_id = location_id_param
        GROUP BY loc.alias;
    END IF;
END;
$_$;


ALTER FUNCTION intranet.get_corporate_nb_sales_by_date(input_date date, location_id_param integer) OWNER TO postgres;

--
-- Name: get_policies_missing_csr_or_producer(integer, date, date); Type: FUNCTION; Schema: intranet; Owner: postgres
--

CREATE FUNCTION intranet.get_policies_missing_csr_or_producer(p_location_id integer, p_start_date date DEFAULT NULL::date, p_end_date date DEFAULT NULL::date) RETURNS TABLE(policy_number character varying, line_of_business text, csr text, producer text, location text, business_type character varying, binder_date date, effective_date date, missing_fields text, policy_status character varying)
    LANGUAGE sql
    AS $$
    SELECT
        p.policy_number,
        lob.display_name AS line_of_business,
        COALESCE(
            ucsr.display_name,
            CONCAT_WS(' ', ucsr.first_name, ucsr.last_name),
            ucsr.business_name,
            ''
        ) AS csr,
        COALESCE(prod.producers, '') AS producer,
        loc.location_name AS location,
        p.business_type,
        p.binder_date,
        p.effective_date,
        concat_ws(', ',
            CASE WHEN p.csr_id IS NULL THEN 'CSR' END,
            CASE WHEN p.producer_ids IS NULL OR COALESCE(array_length(p.producer_ids, 1), 0) = 0 THEN 'Producer' END
        ) AS missing_fields,
        p.policy_status
    FROM qq.policies AS p
    JOIN qq.contacts AS a
      ON a.entity_id = p.agent_id
    LEFT JOIN qq.locations AS loc
      ON loc.location_id = a.location_id
    LEFT JOIN qq.lob AS lob
      ON lob.lob_id = p.lob_id
    LEFT JOIN qq.contacts AS ucsr
      ON ucsr.entity_id = p.csr_id
    LEFT JOIN LATERAL (
        SELECT string_agg(
                   COALESCE(u.display_name,
                            CONCAT_WS(' ', u.first_name, u.last_name),
                            u.business_name),
                   ', '
                   ORDER BY COALESCE(u.display_name, u.business_name, u.last_name, u.first_name)
               ) AS producers
        FROM unnest(COALESCE(p.producer_ids, '{}')) AS pid
        JOIN qq.contacts u ON u.entity_id = pid
    ) prod ON true
    WHERE a.location_id = p_location_id
      AND p.lob_id NOT IN (34, 40) 
      AND (
            p.csr_id IS NULL
            OR p.producer_ids IS NULL
            OR COALESCE(array_length(p.producer_ids, 1), 0) = 0
          )
      AND (
            (p_start_date IS NULL AND p_end_date IS NULL)
            OR (
                 (p.effective_date >= COALESCE(p_start_date, p.effective_date)
                  AND p.effective_date <= COALESCE(p_end_date, p.effective_date))
                 OR
                 (p.binder_date   >= COALESCE(p_start_date, p.binder_date)
                  AND p.binder_date   <= COALESCE(p_end_date, p.binder_date))
               )
          )
    ORDER BY p.effective_date DESC, p.policy_id;
$$;


ALTER FUNCTION intranet.get_policies_missing_csr_or_producer(p_location_id integer, p_start_date date, p_end_date date) OWNER TO postgres;

--
-- Name: get_policy_report_by_location(integer, date, date); Type: FUNCTION; Schema: intranet; Owner: postgres
--

CREATE FUNCTION intranet.get_policy_report_by_location(p_location_id integer, p_start_date date DEFAULT NULL::date, p_end_date date DEFAULT NULL::date) RETURNS TABLE(policy_number character varying, line_of_business text, csr text, producer text, location text, business_type character varying, binder_date date, effective_date date, policy_status character varying)
    LANGUAGE sql
    AS $$
    SELECT
        p.policy_number,
        lob.display_name AS line_of_business,
        COALESCE(ucsr.display_name,
                 CONCAT_WS(' ', ucsr.first_name, ucsr.last_name),
                 ucsr.business_name) AS csr,
        COALESCE(prod.producers, '') AS producer,
        COALESCE(loc.location_name, '') AS location,      -- <--- SIEMPRE presente
        p.business_type,
        p.binder_date,
        p.effective_date,
        COALESCE(p.policy_status, '') AS policy_status    -- <--- SIEMPRE presente
    FROM qq.policies AS p
    JOIN qq.contacts AS a
      ON a.entity_id = p.agent_id
    LEFT JOIN qq.locations AS loc
      ON loc.location_id = a.location_id
    LEFT JOIN qq.lob AS lob
      ON lob.lob_id = p.lob_id
    LEFT JOIN qq.contacts AS ucsr
      ON ucsr.entity_id = p.csr_id
    LEFT JOIN LATERAL (
        SELECT string_agg(
                   COALESCE(u.display_name,
                            CONCAT_WS(' ', u.first_name, u.last_name),
                            u.business_name),
                   ', '
                   ORDER BY COALESCE(u.display_name, u.business_name, u.last_name, u.first_name)
               ) AS producers
        FROM unnest(COALESCE(p.producer_ids, '{}')) AS pid
        JOIN qq.contacts u ON u.entity_id = pid
    ) prod ON true
    WHERE a.location_id = p_location_id
      AND p.lob_id NOT IN (34, 40)
      AND (
            (
              abs(p.effective_date - p.binder_date) > 90
              AND p.effective_date >= (date_trunc('month', now()) - interval '1 month')::date
            )
            OR p.binder_date > current_date
            OR p.binder_date IS NULL
          )
      AND (
            (p_start_date IS NULL AND p_end_date IS NULL)
            OR (
                 (p.effective_date >= COALESCE(p_start_date, p.effective_date)
                  AND p.effective_date <= COALESCE(p_end_date, p.effective_date))
                 OR
                 (p.binder_date   >= COALESCE(p_start_date, p.binder_date)
                  AND p.binder_date   <= COALESCE(p_end_date, p.binder_date))
               )
          )
    ORDER BY p.effective_date DESC, p.policy_id;
$$;


ALTER FUNCTION intranet.get_policy_report_by_location(p_location_id integer, p_start_date date, p_end_date date) OWNER TO postgres;

--
-- Name: refresh_franchise_cache(date, boolean); Type: FUNCTION; Schema: intranet; Owner: postgres
--

CREATE FUNCTION intranet.refresh_franchise_cache(p_date date, p_full boolean DEFAULT true) RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
  -- Elimina completamente la snapshot anterior
  TRUNCATE intranet.franchise_cache;

  -- Inserta la nueva snapshot
  INSERT INTO intranet.franchise_cache (
    date1,
    location_id,
    franchise,
    premium,
    policies,
    renewed_premium,
    renewed_policies,
    lost_premium,
    lost_policies,
    renewed_percent,
    max_percent,
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
    COALESCE(NULLIF(regexp_replace(s.renewed_percent, '[^0-9.\\-]', '', 'g'), '')::numeric, 0),
    COALESCE(NULLIF(regexp_replace(s.max_percent,     '[^0-9.\\-]', '', 'g'), '')::numeric, 0),
    now()
  FROM intranet.franchise_kpis_dashboard(p_date) s;
END;
$$;


ALTER FUNCTION intranet.refresh_franchise_cache(p_date date, p_full boolean) OWNER TO postgres;

--
-- Name: renewals_lost_front(date, integer); Type: FUNCTION; Schema: intranet; Owner: postgres
--

CREATE FUNCTION intranet.renewals_lost_front(date1 date, loc_id integer) RETURNS TABLE(policy_id integer, exp_date date, premium money, customer character varying, phone character varying, policy_number character varying, carrier character varying, line character varying, csr character varying)
    LANGUAGE plpgsql
    AS $$

BEGIN

IF date1 < DATE_TRUNC('MONTH', NOW()) + INTERVAL '1 MONTH'
THEN
	RETURN QUERY
		SELECT ur.policy_id, ur.exp_date, ur.premium, ur.customer, ur.phone, ur.policy_number, ur.carrier, ur.line, ur.csr
		FROM intranet.renewals_upcoming_details_asof(date1, loc_id) ur 
		WHERE NOT EXISTS (
			SELECT rd.prior_policy_id
			FROM intranet.renewals_renewed_details(date1, loc_id) rd
			WHERE ur.policy_id = rd.prior_policy_id
			);
ELSE
	RETURN QUERY
		SELECT ur.policy_id, ur.exp_date, ur.premium, ur.customer, ur.phone, ur.policy_number, ur.carrier, ur.line, ur.csr
		FROM intranet.renewals_upcoming_details_asof(date1, loc_id) ur 
		WHERE false;
END IF;

END

$$;


ALTER FUNCTION intranet.renewals_lost_front(date1 date, loc_id integer) OWNER TO postgres;

--
-- Name: renewals_lost_totals(date, integer); Type: FUNCTION; Schema: intranet; Owner: postgres
--

CREATE FUNCTION intranet.renewals_lost_totals(date1 date, loc_id integer) RETURNS TABLE(premium money, policies integer)
    LANGUAGE sql
    AS $$

SELECT SUM(ur.premium) AS premium, CAST(COUNT(ur.policy_id) AS integer) AS policies
FROM intranet.renewals_lost_front(date1, loc_id) ur 

$$;


ALTER FUNCTION intranet.renewals_lost_totals(date1 date, loc_id integer) OWNER TO postgres;

--
-- Name: renewals_renewed_details(date, integer); Type: FUNCTION; Schema: intranet; Owner: postgres
--

CREATE FUNCTION intranet.renewals_renewed_details(date1 date, loc_id integer) RETURNS TABLE(policy_id integer, prior_policy_id integer)
    LANGUAGE sql
    AS $$

SELECT p.policy_id, p.prior_policy_id
FROM qq.policies p
WHERE p.business_type IN ('R', 'W') AND p.policy_status IN ('A', 'C') AND EXISTS
 (	SELECT 1
  	FROM(SELECT * from intranet.renewals_upcoming_details_asof(
		CAST(date_trunc('MONTH', date1) + INTERVAL '1 MONTH - 1 DAY' AS DATE),
		loc_id
	)) ruid
	WHERE ruid.policy_id = p.prior_policy_id AND ABS(ruid.exp_date - p.effective_date) < 50
 )

$$;


ALTER FUNCTION intranet.renewals_renewed_details(date1 date, loc_id integer) OWNER TO postgres;

--
-- Name: renewals_renewed_totals(date, integer); Type: FUNCTION; Schema: intranet; Owner: postgres
--

CREATE FUNCTION intranet.renewals_renewed_totals(date1 date, loc_id integer) RETURNS TABLE(premium money, policies integer)
    LANGUAGE sql
    AS $$

SELECT SUM(premium) AS premium, CAST(COUNT(premium) AS integer) AS policies
FROM qq.policies p
WHERE p.business_type IN ('R', 'W') AND p.policy_status IN ('A', 'C') AND EXISTS
 (	SELECT 1
  	FROM(SELECT * from intranet.renewals_upcoming_details_asof(
		CAST(date_trunc('MONTH', date1) + INTERVAL '1 MONTH - 1 DAY' AS DATE),
		loc_id
	)) ruid
	WHERE ruid.policy_id = p.prior_policy_id AND ABS(ruid.exp_date - p.effective_date) < 50
 )

$$;


ALTER FUNCTION intranet.renewals_renewed_totals(date1 date, loc_id integer) OWNER TO postgres;

--
-- Name: renewals_upcoming_details_asof(date, integer); Type: FUNCTION; Schema: intranet; Owner: postgres
--

CREATE FUNCTION intranet.renewals_upcoming_details_asof(date1 date, loc_id integer) RETURNS TABLE(policy_id integer, exp_date date, premium money, customer character varying, phone character varying, policy_number character varying, carrier character varying, line character varying, csr character varying)
    LANGUAGE plpgsql
    AS $$
DECLARE
    location_type INT;
BEGIN
    SELECT l.location_type INTO location_type FROM qq.locations l WHERE l.location_id = loc_id;

    IF location_type > 1 THEN
        RETURN QUERY     
            SELECT p.policy_id, p.exp_date, p.premium, 
                   c.display_name AS customer, c.phone, p.policy_number, 
                   c1.display_name AS carrier,
                   lob.line,
                   CASE 
                      WHEN p.producer_ids[1] IS NULL THEN c3.display_name
                      ELSE c2.display_name
                   END AS csr
            FROM qq.policies p
            INNER JOIN qq.contacts c ON p.customer_id = c.entity_id  -- Mantenido (obligatorio)
            
            
            LEFT OUTER JOIN qq.contacts c1 ON p.carrier_id = c1.entity_id  -- Cambiado a LEFT
            LEFT OUTER JOIN admin.lob lob ON lob.lob_id = p.lob_id          -- Cambiado a LEFT
            
           
            FULL OUTER JOIN qq.contacts c2 ON p.producer_ids[1] = c2.entity_id
            FULL OUTER JOIN qq.contacts c3 ON p.csr_id = c3.entity_id
            WHERE c.location_id = loc_id 
              AND p.premium IS NOT NULL
              AND (p.policy_status IN ('A', 'E') OR 
                   (p.policy_status = 'C' AND ABS(p.exp_date - p.cancellation_date) < 30))
              AND p.exp_date >= DATE_TRUNC('MONTH', date1) 
              AND p.exp_date <= date1;
    ELSE
        RETURN QUERY    
            SELECT p.policy_id, p.exp_date, p.premium, 
                   c.display_name AS customer, c.phone, p.policy_number, 
                   c1.display_name AS carrier,
                   lob.line,
                   CASE 
                      WHEN p.producer_ids[1] IS NULL THEN c3.display_name
                      ELSE c2.display_name
                   END AS csr
            FROM qq.policies p
            INNER JOIN qq.contacts c ON p.customer_id = c.entity_id  -- Mantenido
            
           
            LEFT OUTER JOIN qq.contacts c1 ON p.carrier_id = c1.entity_id  -- Cambiado a LEFT
            LEFT OUTER JOIN admin.lob lob ON lob.lob_id = p.lob_id          -- Cambiado a LEFT
            
           
            FULL OUTER JOIN qq.contacts c2 ON p.producer_ids[1] = c2.entity_id
            FULL OUTER JOIN qq.contacts c3 ON p.csr_id = c3.entity_id
            LEFT OUTER JOIN qq.locations l ON c.location_id = l.location_id
            WHERE l.location_type = 1 
              AND p.premium IS NOT NULL
              AND (p.policy_status IN ('A', 'E') OR 
                   (p.policy_status = 'C' AND ABS(p.exp_date - p.cancellation_date) < 30))
              AND p.exp_date >= DATE_TRUNC('MONTH', date1) 
              AND p.exp_date <= date1; 
    END IF;
END
$$;


ALTER FUNCTION intranet.renewals_upcoming_details_asof(date1 date, loc_id integer) OWNER TO postgres;

--
-- Name: renewals_upcoming_details_front(date, integer); Type: FUNCTION; Schema: intranet; Owner: postgres
--

CREATE FUNCTION intranet.renewals_upcoming_details_front(date1 date, loc_id integer) RETURNS TABLE(policy_id integer, exp_date date, premium money, customer character varying, phone character varying, policy_number character varying, carrier character varying, line character varying, csr character varying, renewed boolean)
    LANGUAGE sql
    AS $$

SELECT policy_id, exp_date, premium, customer, phone, policy_number, carrier, line, csr,
CASE WHEN t.prior_policy_id IS NULL THEN FALSE
ELSE TRUE
END AS renewed
FROM  intranet.renewals_upcoming_details_asof(CAST(DATE_TRUNC('MONTH', date1) + INTERVAL '1 MONTH - 1 DAY' AS date), loc_id) ud
LEFT OUTER JOIN (SELECT rd.prior_policy_id FROM intranet.renewals_renewed_details(date1, loc_id) rd) t ON ud.policy_id = t.prior_policy_id

$$;


ALTER FUNCTION intranet.renewals_upcoming_details_front(date1 date, loc_id integer) OWNER TO postgres;

--
-- Name: renewals_upcoming_percents(date, integer); Type: FUNCTION; Schema: intranet; Owner: postgres
--

CREATE FUNCTION intranet.renewals_upcoming_percents(date1 date, loc_id integer) RETURNS TABLE(renewed_percent numeric, max_percent numeric)
    LANGUAGE sql
    AS $$
SELECT
    CASE WHEN t1.policies = 0 THEN 0
         ELSE 100.0 * t2.policies::numeric / t1.policies END as renewed_percent,
    CASE WHEN t1.policies = 0 THEN 0
         ELSE 100.0 - 100.0 * t3.policies::numeric / t1.policies END as max_percent
FROM
    (SELECT policies FROM intranet.renewals_upcoming_totals(date1, loc_id)) t1,
    (SELECT policies FROM intranet.renewals_renewed_totals(date1, loc_id)) t2,
    (SELECT policies FROM intranet.renewals_lost_totals(date1, loc_id)) t3
$$;


ALTER FUNCTION intranet.renewals_upcoming_percents(date1 date, loc_id integer) OWNER TO postgres;

--
-- Name: renewals_upcoming_totals(date, integer); Type: FUNCTION; Schema: intranet; Owner: postgres
--

CREATE FUNCTION intranet.renewals_upcoming_totals(date1 date, loc_id integer) RETURNS TABLE(premium money, policies integer)
    LANGUAGE plpgsql
    AS $$

DECLARE
    location_type INT;
BEGIN
    SELECT l.location_type INTO location_type FROM qq.locations l WHERE l.location_id = loc_id;

    IF location_type > 1 THEN
        RETURN QUERY 	SELECT SUM(p.premium) AS premium, CAST(COUNT(p.premium) AS integer) AS policies
						FROM qq.policies p
						INNER JOIN qq.contacts c ON p.customer_id = c.entity_id 
						WHERE c.location_id = loc_id AND (p.policy_status IN ('A', 'E') OR (p.policy_status = 'C' AND ABS(p.exp_date - p.cancellation_date) < 30))
						AND p.exp_date >= DATE_TRUNC('MONTH', date1) AND p.exp_date <= DATE_TRUNC('MONTH', date1) + INTERVAL '1 MONTH - 1 DAY';
    ELSE
        RETURN QUERY  	SELECT SUM(p.premium) AS premium, CAST(COUNT(p.premium) AS integer) AS policies
						FROM qq.policies p
						INNER JOIN qq.contacts c ON p.customer_id = c.entity_id
						LEFT OUTER JOIN qq.locations l ON c.location_id = l.location_id
						WHERE l.location_type = 1 AND (p.policy_status IN ('A', 'E') OR (p.policy_status = 'C' AND ABS(p.exp_date - p.cancellation_date) < 30))
						AND p.exp_date >= DATE_TRUNC('MONTH', date1) AND p.exp_date <= DATE_TRUNC('MONTH', date1) + INTERVAL '1 MONTH - 1 DAY' ;
    END IF;
		
END

$$;


ALTER FUNCTION intranet.renewals_upcoming_totals(date1 date, loc_id integer) OWNER TO postgres;

--
-- Name: run_kpi_refresh_worker(); Type: FUNCTION; Schema: intranet; Owner: postgres
--

CREATE FUNCTION intranet.run_kpi_refresh_worker() RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_id    bigint;
  v_date  date;
BEGIN
  -- Toma un job en cola y lo marca running
  WITH picked AS (
    SELECT id, date1
    FROM intranet.kpi_refresh_jobs
    WHERE status = 'queued'
    ORDER BY created_at
    FOR UPDATE SKIP LOCKED
    LIMIT 1
  )
  UPDATE intranet.kpi_refresh_jobs j
  SET status = 'running', started_at = now()
  FROM picked p
  WHERE j.id = p.id
  RETURNING j.id, j.date1 INTO v_id, v_date;

  IF v_id IS NULL THEN
    RETURN; -- no hay trabajos
  END IF;

  BEGIN
    PERFORM intranet.refresh_franchise_cache(v_date, true);

    UPDATE intranet.kpi_refresh_jobs
    SET status = 'done', finished_at = now()
    WHERE id = v_id;
  EXCEPTION WHEN OTHERS THEN
    UPDATE intranet.kpi_refresh_jobs
    SET status = 'failed', finished_at = now(), last_error = SQLERRM
    WHERE id = v_id;
  END;
END;
$$;


ALTER FUNCTION intranet.run_kpi_refresh_worker() OWNER TO postgres;

--
-- Name: stats_csr_ranking(integer[], character varying[], text, date, date, character varying[], character varying[], character varying[]); Type: FUNCTION; Schema: intranet; Owner: postgres
--

CREATE FUNCTION intranet.stats_csr_ranking(main_location_ids integer[], in_business_types character varying[], in_date_column text, in_date_start date, in_date_end date, in_policy_status character varying[], in_group_by character varying[], in_lines character varying[]) RETURNS TABLE(grp_id character varying, grp_alias character varying, location_alias character varying, premium money, count integer)
    LANGUAGE plpgsql
    AS $_$
DECLARE
    group_by_value text;
    join_sql text;
    id_sql text;
    alias_sql text;
    group_by_sql text;
    premium_sql text;
    count_sql text;
BEGIN
    group_by_value := lower(in_group_by[1]); -- Siempre toma el primer valor

    IF group_by_value = 'csr' OR group_by_value = 'csr_id' THEN
        join_sql := 'LEFT JOIN qq.contacts csr ON p.csr_id = csr.entity_id';
        id_sql := 'COALESCE(csr.entity_id::varchar, ''No CSR Assigned'')';
        alias_sql := 'COALESCE(csr.display_name, ''No CSR Assigned'')';
        group_by_sql := 'COALESCE(csr.entity_id::varchar, ''No CSR Assigned''), COALESCE(csr.display_name, ''No CSR Assigned''), COALESCE(l.alias, ''No Location'')';
    ELSIF group_by_value = 'agent' OR group_by_value = 'agent_id' THEN
        join_sql := 'LEFT JOIN qq.contacts agent ON p.agent_id = agent.entity_id';
        id_sql := 'COALESCE(agent.entity_id::varchar, ''No Agent Assigned'')';
        alias_sql := 'COALESCE(agent.display_name, ''No Agent Assigned'')';
        group_by_sql := 'COALESCE(agent.entity_id::varchar, ''No Agent Assigned''), COALESCE(agent.display_name, ''No Agent Assigned''), COALESCE(l.alias, ''No Location'')';
    ELSIF group_by_value = 'producer' OR group_by_value = 'producer_id' THEN
        join_sql := 'LEFT JOIN qq.contacts producer ON producer.entity_id = p.producer_ids[1]';
        id_sql := 'COALESCE(producer.entity_id::varchar, ''No Producer Assigned'')';
        alias_sql := 'COALESCE(producer.display_name, ''No Producer Assigned'')';
        group_by_sql := 'COALESCE(producer.entity_id::varchar, ''No Producer Assigned''), COALESCE(producer.display_name, ''No Producer Assigned''), COALESCE(l.alias, ''No Location'')';
    ELSE
        join_sql := 'LEFT JOIN qq.contacts csr ON p.csr_id = csr.entity_id';
        id_sql := 'COALESCE(csr.entity_id::varchar, ''No CSR Assigned'')';
        alias_sql := 'COALESCE(csr.display_name, ''No CSR Assigned'')';
        group_by_sql := 'COALESCE(csr.entity_id::varchar, ''No CSR Assigned''), COALESCE(csr.display_name, ''No CSR Assigned''), COALESCE(l.alias, ''No Location'')';
    END IF;

    premium_sql := 'COALESCE(SUM(p.premium), ''$0.00''::money)';
    count_sql := 'COUNT(*)::integer';

    RETURN QUERY EXECUTE format(
        $f$
        SELECT
            %s AS grp_id,
            %s AS grp_alias,
            COALESCE(l.alias, 'No Location') AS location_alias,
            %s AS premium,
            %s AS count
        FROM qq.policies p
        JOIN qq.contacts c ON p.customer_id = c.entity_id
        JOIN qq.locations l ON c.location_id = l.location_id
        JOIN qq.contacts carrier ON p.carrier_id = carrier.entity_id
        JOIN admin.lob lob ON p.lob_id = lob.lob_id
        %s
        WHERE
            p.lob_id NOT IN (34, 40)
            AND l.location_id = ANY($1)
            AND p.business_type = ANY($2)
            AND p.policy_status = ANY($3)
            AND lob.line = ANY($6)
            AND lob.line <> 'Other Lines'
            AND p.%I BETWEEN $4 AND $5
        GROUP BY %s
        ORDER BY premium DESC
        $f$,
        id_sql,
        alias_sql,
        premium_sql,
        count_sql,
        join_sql,
        in_date_column,
        group_by_sql
    )
    USING main_location_ids, in_business_types, in_policy_status, in_date_start, in_date_end, in_lines;
END;
$_$;


ALTER FUNCTION intranet.stats_csr_ranking(main_location_ids integer[], in_business_types character varying[], in_date_column text, in_date_start date, in_date_end date, in_policy_status character varying[], in_group_by character varying[], in_lines character varying[]) OWNER TO postgres;

--
-- Name: stats_location_search_v4(integer[], character varying[], text, date, date, character varying[], character varying[]); Type: FUNCTION; Schema: intranet; Owner: postgres
--

CREATE FUNCTION intranet.stats_location_search_v4(main_location_ids integer[], in_business_types character varying[], in_date_column text, in_date_start date, in_date_end date, in_policy_status character varying[], in_lines character varying[]) RETURNS TABLE(customer character varying, policy_number character varying, location_alias character varying, business_type character varying, carrier character varying, premium money, binder_date date, effective_date date, exp_date date, cancellation_date date, csr character varying, producer character varying, policy_status character varying, product_line character varying)
    LANGUAGE plpgsql
    AS $_$
BEGIN
    RETURN QUERY EXECUTE format(
        $f$
        SELECT
            c.display_name AS customer,
            p.policy_number,
            l.alias AS location_alias,
            p.business_type,
            carrier.display_name AS carrier,
            p.premium,
            p.binder_date,
            p.effective_date,
            p.exp_date,
            p.cancellation_date,      -- <--- AGREGADO
            csr.display_name AS csr,
            COALESCE((
                SELECT STRING_AGG(prod.display_name, ', ')
                FROM unnest(p.producer_ids) AS pid(producer_id)
                JOIN qq.contacts prod ON prod.entity_id = pid.producer_id
            ), '')::character varying AS producer,
            p.policy_status,
            lob.line AS product_line
        FROM qq.policies p
        JOIN qq.contacts c ON p.customer_id = c.entity_id
        JOIN qq.locations l ON c.location_id = l.location_id
        JOIN qq.contacts carrier ON p.carrier_id = carrier.entity_id
        LEFT JOIN qq.contacts csr ON p.csr_id = csr.entity_id
        LEFT JOIN admin.lob lob ON p.lob_id = lob.lob_id
        WHERE
            p.lob_id NOT IN (34, 40)
            AND l.location_id = ANY($1)
            AND p.business_type = ANY($2)
            AND p.policy_status = ANY($3)
            AND (%L IS NULL OR lob.line = ANY($4))
            AND (lob.line IS NULL OR lob.line <> 'Other Lines')
            AND p.%I BETWEEN $5 AND $6
        ORDER BY c.display_name, p.policy_number
        $f$,
        in_lines, in_date_column
    )
    USING main_location_ids, in_business_types, in_policy_status, in_lines, in_date_start, in_date_end;
END;
$_$;


ALTER FUNCTION intranet.stats_location_search_v4(main_location_ids integer[], in_business_types character varying[], in_date_column text, in_date_start date, in_date_end date, in_policy_status character varying[], in_lines character varying[]) OWNER TO postgres;

--
-- Name: stats_policies_by_csr(integer[], character varying[], text, date, date, character varying[], character varying[], text, text); Type: FUNCTION; Schema: intranet; Owner: postgres
--

CREATE FUNCTION intranet.stats_policies_by_csr(main_location_ids integer[], in_business_types character varying[], in_date_column text, in_date_start date, in_date_end date, in_policy_status character varying[], in_lines character varying[], group_by_type text, group_name text) RETURNS TABLE(customer character varying, policy_number character varying, location_alias character varying, business_type character varying, carrier character varying, premium money, binder_date date, effective_date date, exp_date date, csr character varying, producer character varying, agent character varying, policy_status character varying, product_line character varying)
    LANGUAGE plpgsql
    AS $_$
BEGIN
    RETURN QUERY EXECUTE format(
        $f$
        SELECT
            c.display_name AS customer,
            p.policy_number,
            l.alias AS location_alias,
            p.business_type,
            carrier.display_name AS carrier,
            p.premium,
            p.binder_date,
            p.effective_date,
            p.exp_date,
            csr.display_name AS csr,
            COALESCE((
                SELECT STRING_AGG(prod.display_name, ', ')
                FROM unnest(p.producer_ids) AS pid(producer_id)
                JOIN qq.contacts prod ON prod.entity_id = pid.producer_id
            ), '')::character varying AS producer,
            agent.display_name AS agent,
            p.policy_status,
            lob.line AS product_line
        FROM qq.policies p
        JOIN qq.contacts c ON p.customer_id = c.entity_id
        JOIN qq.locations l ON c.location_id = l.location_id
        JOIN qq.contacts carrier ON p.carrier_id = carrier.entity_id
        LEFT JOIN qq.contacts csr ON p.csr_id = csr.entity_id
        LEFT JOIN qq.contacts agent ON p.agent_id = agent.entity_id
        JOIN admin.lob lob ON p.lob_id = lob.lob_id
        WHERE
            p.lob_id NOT IN (34, 40)
            AND l.location_id = ANY($1)
            AND p.business_type = ANY($2)
            AND p.policy_status = ANY($3)
            AND lob.line = ANY($4)
            AND lob.line <> 'Other Lines'
            AND p.%I BETWEEN $5 AND $6
            AND (
                ($7 = 'csr' AND (
                    (csr.entity_id::text = $8)
                    OR ($8 = 'No CSR Assigned' AND p.csr_id IS NULL)
                ))
                OR ($7 = 'agent' AND (
                    (agent.entity_id::text = $8)
                    OR ($8 = 'No Agent Assigned' AND p.agent_id IS NULL)
                ))
                OR ($7 = 'producer' AND (
                    (EXISTS (SELECT 1 FROM unnest(p.producer_ids) pid WHERE pid::text = $8))
                    OR ($8 = 'No Producer Assigned' AND (p.producer_ids IS NULL OR array_length(p.producer_ids, 1) IS NULL))
                ))
            )
        ORDER BY c.display_name, p.policy_number
        $f$,
        in_date_column
    )
    USING main_location_ids, in_business_types, in_policy_status, in_lines, in_date_start, in_date_end, group_by_type, group_name;
END;
$_$;


ALTER FUNCTION intranet.stats_policies_by_csr(main_location_ids integer[], in_business_types character varying[], in_date_column text, in_date_start date, in_date_end date, in_policy_status character varying[], in_lines character varying[], group_by_type text, group_name text) OWNER TO postgres;

--
-- Name: agency_company_today; Type: VIEW; Schema: intranet; Owner: postgres
--

CREATE VIEW intranet.agency_company_today AS
 SELECT 'New Business'::text AS business_type,
    sum(p.premium) AS premium,
    count(p.policy_id) AS policies
   FROM ((qq.policies p
     JOIN qq.contacts c ON ((c.entity_id = p.customer_id)))
     JOIN qq.locations l ON ((c.location_id = l.location_id)))
  WHERE (((p.business_type)::text = 'N'::text) AND (p.lob_id <> 34) AND (p.lob_id <> 40) AND (((p.policy_status)::text = 'C'::text) OR ((p.policy_status)::text = 'A'::text)) AND (p.binder_date = CURRENT_DATE) AND (p.premium > '$1.00'::money) AND (l.location_type = ANY (ARRAY[1, 2, 4])))
UNION
 SELECT 'Renewal'::text AS business_type,
    sum(p.premium) AS premium,
    count(p.policy_id) AS policies
   FROM ((qq.policies p
     JOIN qq.contacts c ON ((c.entity_id = p.customer_id)))
     JOIN qq.locations l ON ((c.location_id = l.location_id)))
  WHERE (((p.business_type)::text = 'R'::text) AND (p.lob_id <> 34) AND (p.lob_id <> 40) AND (((p.policy_status)::text = 'C'::text) OR ((p.policy_status)::text = 'A'::text)) AND (p.binder_date = CURRENT_DATE) AND (p.premium > '$1.00'::money) AND (l.location_type = ANY (ARRAY[1, 2, 4])))
UNION
 SELECT 'Rewrite'::text AS business_type,
    sum(p.premium) AS premium,
    count(p.policy_id) AS policies
   FROM ((qq.policies p
     JOIN qq.contacts c ON ((c.entity_id = p.customer_id)))
     JOIN qq.locations l ON ((c.location_id = l.location_id)))
  WHERE (((p.business_type)::text = 'W'::text) AND (p.lob_id <> 34) AND (p.lob_id <> 40) AND (((p.policy_status)::text = 'C'::text) OR ((p.policy_status)::text = 'A'::text)) AND (p.binder_date = CURRENT_DATE) AND (p.premium > '$1.00'::money) AND (l.location_type = ANY (ARRAY[1, 2, 4])))
UNION
 SELECT 'Total'::text AS business_type,
    sum(p.premium) AS premium,
    count(p.policy_id) AS policies
   FROM ((qq.policies p
     JOIN qq.contacts c ON ((c.entity_id = p.customer_id)))
     JOIN qq.locations l ON ((c.location_id = l.location_id)))
  WHERE ((p.lob_id <> 34) AND (p.lob_id <> 40) AND (((p.policy_status)::text = 'C'::text) OR ((p.policy_status)::text = 'A'::text)) AND (p.binder_date = CURRENT_DATE) AND (p.premium > '$1.00'::money) AND (l.location_type = ANY (ARRAY[1, 2, 4])));


ALTER VIEW intranet.agency_company_today OWNER TO postgres;

--
-- Name: agency_csr_last_week; Type: VIEW; Schema: intranet; Owner: postgres
--

CREATE VIEW intranet.agency_csr_last_week AS
 SELECT u.display_name AS csr,
    count(p.binder_date) AS policies,
    to_char((sum(p.premium))::numeric, '$FM999,999'::text) AS premium,
    u.entity_id AS id_user,
    l.alias AS location
   FROM ((qq.policies p
     JOIN qq.contacts u ON ((p.csr_id = u.entity_id)))
     JOIN qq.locations l ON ((l.location_id = u.location_id)))
  WHERE (((u.contact_type)::text = 'E'::text) AND ((u.status)::text = 'A'::text) AND (p.binder_date >= (date_trunc('week'::text, now()) - '7 days'::interval)) AND (p.binder_date < date_trunc('week'::text, now())) AND (p.lob_id <> 34) AND (p.lob_id <> 40) AND ((p.business_type)::text = 'N'::text))
  GROUP BY l.alias, u.entity_id
  ORDER BY (sum(p.premium)) DESC
 LIMIT 3;


ALTER VIEW intranet.agency_csr_last_week OWNER TO postgres;

--
-- Name: agency_dashboard_agencies; Type: VIEW; Schema: intranet; Owner: postgres
--

CREATE VIEW intranet.agency_dashboard_agencies AS
 SELECT l.location_id AS id_location,
    nbl.location,
    nbl.policies,
    nbl.premium,
        CASE
            WHEN (nbl.lmpremium = '$0.00'::money) THEN '0'::numeric
            ELSE (round((((nbl.premium / nbl.lmpremium) * (100)::double precision))::numeric, 1) - (100)::numeric)
        END AS percent
   FROM (( SELECT tm.location,
            tm.policies,
            tm.premium,
            llm.lmpolicies,
            llm.lmpremium
           FROM (( SELECT l_1.alias AS location,
                    count(qq_policies.binder_date) AS policies,
                    sum(qq_policies.premium) AS premium
                   FROM ((qq.policies qq_policies
                     JOIN qq.contacts c ON ((c.entity_id = qq_policies.customer_id)))
                     JOIN qq.locations l_1 ON ((c.location_id = l_1.location_id)))
                  WHERE (((qq_policies.business_type)::text = 'N'::text) AND (date_trunc('month'::text, (qq_policies.binder_date)::timestamp with time zone) = date_trunc('month'::text, (CURRENT_DATE)::timestamp with time zone)) AND (qq_policies.premium > '$0.05'::money) AND (((qq_policies.policy_status)::text = 'A'::text) OR ((qq_policies.policy_status)::text = 'C'::text)))
                  GROUP BY l_1.alias) tm
             LEFT JOIN ( SELECT l_1.alias AS location,
                    count(qq_policies.binder_date) AS lmpolicies,
                    sum(qq_policies.premium) AS lmpremium
                   FROM ((qq.policies qq_policies
                     JOIN qq.contacts c ON ((c.entity_id = qq_policies.customer_id)))
                     JOIN qq.locations l_1 ON ((c.location_id = l_1.location_id)))
                  WHERE (((qq_policies.business_type)::text = 'N'::text) AND (qq_policies.binder_date >= (date_trunc('month'::text, now()) - '1 mon'::interval month)) AND (qq_policies.binder_date <= (CURRENT_DATE - '1 mon'::interval)) AND (qq_policies.premium > '$0.05'::money) AND (((qq_policies.policy_status)::text = 'A'::text) OR ((qq_policies.policy_status)::text = 'C'::text)))
                  GROUP BY l_1.alias) llm ON (((llm.location)::text = (tm.location)::text)))) nbl
     LEFT JOIN qq.locations l ON ((initcap(TRIM(BOTH FROM (l.alias)::text)) = initcap(TRIM(BOTH FROM (nbl.location)::text)))))
  ORDER BY nbl.premium DESC;


ALTER VIEW intranet.agency_dashboard_agencies OWNER TO postgres;

--
-- Name: agency_location_corp_daily; Type: VIEW; Schema: intranet; Owner: postgres
--

CREATE VIEW intranet.agency_location_corp_daily AS
 SELECT 'New Business'::text AS business_type,
        CASE
            WHEN (sum(unnamed_subquery.premium) IS NULL) THEN '$0.00'::money
            ELSE sum(unnamed_subquery.premium)
        END AS premium,
        CASE
            WHEN (count(unnamed_subquery.binder_date) IS NULL) THEN '0'::bigint
            ELSE count(unnamed_subquery.binder_date)
        END AS policies
   FROM ( SELECT q.policy_id,
            q.policy_number,
            q.customer_id,
            q.agent_id,
            q.effective_date,
            q.exp_date,
            q.carrier_id,
            q.mga_id,
            q.lob_id,
            q.binder_date,
            q.business_type,
            q.policy_status,
            q.term,
            q.prior_policy_id,
            q.producer_ids,
            q.csr_id,
            q.premium,
            q.created_on,
            q.date_last_modified,
            q.cancellation_date,
            c.entity_id,
            c.is_a_person,
            c.created_on,
            c.date_last_modified,
            c.dob,
            c.location_id,
            c.business_name,
            c.display_name,
            c.type_display,
            c.agent_name,
            c.phone_type,
            c.primary_contact,
            c.first_name,
            c.middle_name,
            c.last_name,
            c.phone,
            c.email,
            c.line1,
            c.line2,
            c.city,
            c.state,
            c.county,
            c.zip,
            c.country,
            c.status,
            c.contact_type,
            l.location_id,
            l.location_name,
            l.is_default,
            l.qq_id,
            l.alias,
            l.street_address_line1,
            l.street_address_line2,
            l.city,
            l.state,
            l.zip,
            l.phone_number,
            l.fax,
            l.email_address,
            l.default_employee_id,
            l.contact_first_name,
            l.contact_last_name,
            l.main_client_id,
            l.default_state_code,
            l.business_fein,
            l.location_type,
            l.date_last_modified,
            l.comm
           FROM ((qq.policies q
             JOIN qq.contacts c ON ((c.entity_id = q.customer_id)))
             JOIN qq.locations l ON ((c.location_id = l.location_id)))) unnamed_subquery(policy_id, policy_number, customer_id, agent_id, effective_date, exp_date, carrier_id, mga_id, lob_id, binder_date, business_type, policy_status, term, prior_policy_id, producer_ids, csr_id, premium, created_on, date_last_modified, cancellation_date, entity_id, is_a_person, created_on_1, date_last_modified_1, dob, location_id, business_name, display_name, type_display, agent_name, phone_type, primary_contact, first_name, middle_name, last_name, phone, email, line1, line2, city, state, county, zip, country, status, contact_type, location_id_1, location_name, is_default, qq_id, alias, street_address_line1, street_address_line2, city_1, state_1, zip_1, phone_number, fax, email_address, default_employee_id, contact_first_name, contact_last_name, main_client_id, default_state_code, business_fein, location_type, date_last_modified_2, comm)
  WHERE (((unnamed_subquery.business_type)::text = 'N'::text) AND (unnamed_subquery.lob_id <> 34) AND (unnamed_subquery.lob_id <> 40) AND (unnamed_subquery.binder_date = CURRENT_DATE) AND ((unnamed_subquery.location_type = 1) OR (unnamed_subquery.location_type = 4)) AND (unnamed_subquery.premium > '$1.00'::money))
UNION
 SELECT 'Renewal'::text AS business_type,
        CASE
            WHEN (sum(unnamed_subquery.premium) IS NULL) THEN '$0.00'::money
            ELSE sum(unnamed_subquery.premium)
        END AS premium,
        CASE
            WHEN (count(unnamed_subquery.binder_date) IS NULL) THEN '0'::bigint
            ELSE count(unnamed_subquery.binder_date)
        END AS policies
   FROM ( SELECT q.policy_id,
            q.policy_number,
            q.customer_id,
            q.agent_id,
            q.effective_date,
            q.exp_date,
            q.carrier_id,
            q.mga_id,
            q.lob_id,
            q.binder_date,
            q.business_type,
            q.policy_status,
            q.term,
            q.prior_policy_id,
            q.producer_ids,
            q.csr_id,
            q.premium,
            q.created_on,
            q.date_last_modified,
            q.cancellation_date,
            c.entity_id,
            c.is_a_person,
            c.created_on,
            c.date_last_modified,
            c.dob,
            c.location_id,
            c.business_name,
            c.display_name,
            c.type_display,
            c.agent_name,
            c.phone_type,
            c.primary_contact,
            c.first_name,
            c.middle_name,
            c.last_name,
            c.phone,
            c.email,
            c.line1,
            c.line2,
            c.city,
            c.state,
            c.county,
            c.zip,
            c.country,
            c.status,
            c.contact_type,
            l.location_id,
            l.location_name,
            l.is_default,
            l.qq_id,
            l.alias,
            l.street_address_line1,
            l.street_address_line2,
            l.city,
            l.state,
            l.zip,
            l.phone_number,
            l.fax,
            l.email_address,
            l.default_employee_id,
            l.contact_first_name,
            l.contact_last_name,
            l.main_client_id,
            l.default_state_code,
            l.business_fein,
            l.location_type,
            l.date_last_modified,
            l.comm
           FROM ((qq.policies q
             JOIN qq.contacts c ON ((c.entity_id = q.customer_id)))
             JOIN qq.locations l ON ((c.location_id = l.location_id)))) unnamed_subquery(policy_id, policy_number, customer_id, agent_id, effective_date, exp_date, carrier_id, mga_id, lob_id, binder_date, business_type, policy_status, term, prior_policy_id, producer_ids, csr_id, premium, created_on, date_last_modified, cancellation_date, entity_id, is_a_person, created_on_1, date_last_modified_1, dob, location_id, business_name, display_name, type_display, agent_name, phone_type, primary_contact, first_name, middle_name, last_name, phone, email, line1, line2, city, state, county, zip, country, status, contact_type, location_id_1, location_name, is_default, qq_id, alias, street_address_line1, street_address_line2, city_1, state_1, zip_1, phone_number, fax, email_address, default_employee_id, contact_first_name, contact_last_name, main_client_id, default_state_code, business_fein, location_type, date_last_modified_2, comm)
  WHERE (((unnamed_subquery.business_type)::text = 'R'::text) AND (unnamed_subquery.lob_id <> 34) AND (unnamed_subquery.lob_id <> 40) AND (unnamed_subquery.binder_date = CURRENT_DATE) AND ((unnamed_subquery.location_type = 1) OR (unnamed_subquery.location_type = 4)) AND (unnamed_subquery.premium > '$1.00'::money))
UNION
 SELECT 'Rewrite'::text AS business_type,
        CASE
            WHEN (sum(unnamed_subquery.premium) IS NULL) THEN '$0.00'::money
            ELSE sum(unnamed_subquery.premium)
        END AS premium,
        CASE
            WHEN (count(unnamed_subquery.binder_date) IS NULL) THEN '0'::bigint
            ELSE count(unnamed_subquery.binder_date)
        END AS policies
   FROM ( SELECT q.policy_id,
            q.policy_number,
            q.customer_id,
            q.agent_id,
            q.effective_date,
            q.exp_date,
            q.carrier_id,
            q.mga_id,
            q.lob_id,
            q.binder_date,
            q.business_type,
            q.policy_status,
            q.term,
            q.prior_policy_id,
            q.producer_ids,
            q.csr_id,
            q.premium,
            q.created_on,
            q.date_last_modified,
            q.cancellation_date,
            c.entity_id,
            c.is_a_person,
            c.created_on,
            c.date_last_modified,
            c.dob,
            c.location_id,
            c.business_name,
            c.display_name,
            c.type_display,
            c.agent_name,
            c.phone_type,
            c.primary_contact,
            c.first_name,
            c.middle_name,
            c.last_name,
            c.phone,
            c.email,
            c.line1,
            c.line2,
            c.city,
            c.state,
            c.county,
            c.zip,
            c.country,
            c.status,
            c.contact_type,
            l.location_id,
            l.location_name,
            l.is_default,
            l.qq_id,
            l.alias,
            l.street_address_line1,
            l.street_address_line2,
            l.city,
            l.state,
            l.zip,
            l.phone_number,
            l.fax,
            l.email_address,
            l.default_employee_id,
            l.contact_first_name,
            l.contact_last_name,
            l.main_client_id,
            l.default_state_code,
            l.business_fein,
            l.location_type,
            l.date_last_modified,
            l.comm
           FROM ((qq.policies q
             JOIN qq.contacts c ON ((c.entity_id = q.customer_id)))
             JOIN qq.locations l ON ((c.location_id = l.location_id)))) unnamed_subquery(policy_id, policy_number, customer_id, agent_id, effective_date, exp_date, carrier_id, mga_id, lob_id, binder_date, business_type, policy_status, term, prior_policy_id, producer_ids, csr_id, premium, created_on, date_last_modified, cancellation_date, entity_id, is_a_person, created_on_1, date_last_modified_1, dob, location_id, business_name, display_name, type_display, agent_name, phone_type, primary_contact, first_name, middle_name, last_name, phone, email, line1, line2, city, state, county, zip, country, status, contact_type, location_id_1, location_name, is_default, qq_id, alias, street_address_line1, street_address_line2, city_1, state_1, zip_1, phone_number, fax, email_address, default_employee_id, contact_first_name, contact_last_name, main_client_id, default_state_code, business_fein, location_type, date_last_modified_2, comm)
  WHERE (((unnamed_subquery.business_type)::text = 'W'::text) AND (unnamed_subquery.lob_id <> 34) AND (unnamed_subquery.lob_id <> 40) AND (unnamed_subquery.binder_date = CURRENT_DATE) AND ((unnamed_subquery.location_type = 1) OR (unnamed_subquery.location_type = 4)) AND (unnamed_subquery.premium > '$1.00'::money))
UNION
 SELECT 'Total'::text AS business_type,
        CASE
            WHEN (sum(unnamed_subquery.premium) IS NULL) THEN '$0.00'::money
            ELSE sum(unnamed_subquery.premium)
        END AS premium,
        CASE
            WHEN (count(unnamed_subquery.binder_date) IS NULL) THEN '0'::bigint
            ELSE count(unnamed_subquery.binder_date)
        END AS policies
   FROM ( SELECT q.policy_id,
            q.policy_number,
            q.customer_id,
            q.agent_id,
            q.effective_date,
            q.exp_date,
            q.carrier_id,
            q.mga_id,
            q.lob_id,
            q.binder_date,
            q.business_type,
            q.policy_status,
            q.term,
            q.prior_policy_id,
            q.producer_ids,
            q.csr_id,
            q.premium,
            q.created_on,
            q.date_last_modified,
            q.cancellation_date,
            c.entity_id,
            c.is_a_person,
            c.created_on,
            c.date_last_modified,
            c.dob,
            c.location_id,
            c.business_name,
            c.display_name,
            c.type_display,
            c.agent_name,
            c.phone_type,
            c.primary_contact,
            c.first_name,
            c.middle_name,
            c.last_name,
            c.phone,
            c.email,
            c.line1,
            c.line2,
            c.city,
            c.state,
            c.county,
            c.zip,
            c.country,
            c.status,
            c.contact_type,
            l.location_id,
            l.location_name,
            l.is_default,
            l.qq_id,
            l.alias,
            l.street_address_line1,
            l.street_address_line2,
            l.city,
            l.state,
            l.zip,
            l.phone_number,
            l.fax,
            l.email_address,
            l.default_employee_id,
            l.contact_first_name,
            l.contact_last_name,
            l.main_client_id,
            l.default_state_code,
            l.business_fein,
            l.location_type,
            l.date_last_modified,
            l.comm
           FROM ((qq.policies q
             JOIN qq.contacts c ON ((c.entity_id = q.customer_id)))
             JOIN qq.locations l ON ((c.location_id = l.location_id)))) unnamed_subquery(policy_id, policy_number, customer_id, agent_id, effective_date, exp_date, carrier_id, mga_id, lob_id, binder_date, business_type, policy_status, term, prior_policy_id, producer_ids, csr_id, premium, created_on, date_last_modified, cancellation_date, entity_id, is_a_person, created_on_1, date_last_modified_1, dob, location_id, business_name, display_name, type_display, agent_name, phone_type, primary_contact, first_name, middle_name, last_name, phone, email, line1, line2, city, state, county, zip, country, status, contact_type, location_id_1, location_name, is_default, qq_id, alias, street_address_line1, street_address_line2, city_1, state_1, zip_1, phone_number, fax, email_address, default_employee_id, contact_first_name, contact_last_name, main_client_id, default_state_code, business_fein, location_type, date_last_modified_2, comm)
  WHERE ((unnamed_subquery.binder_date = CURRENT_DATE) AND (unnamed_subquery.lob_id <> 34) AND (unnamed_subquery.lob_id <> 40) AND ((unnamed_subquery.location_type = 1) OR (unnamed_subquery.location_type = 4)) AND (unnamed_subquery.premium > '$1.00'::money));


ALTER VIEW intranet.agency_location_corp_daily OWNER TO postgres;

--
-- Name: agency_total_sales_daily_by_locations; Type: VIEW; Schema: intranet; Owner: postgres
--

CREATE VIEW intranet.agency_total_sales_daily_by_locations AS
 SELECT l.location_id AS id_location,
    l.alias AS location,
    sum(q.premium) AS premium,
    count(q.policy_id) AS policies
   FROM ((qq.policies q
     JOIN qq.contacts c ON ((c.entity_id = q.customer_id)))
     JOIN qq.locations l ON ((c.location_id = l.location_id)))
  WHERE ((q.lob_id <> 34) AND (q.lob_id <> 40) AND (q.binder_date = CURRENT_DATE) AND (((q.policy_status)::text = 'A'::text) OR ((q.policy_status)::text = 'C'::text)) AND ((q.business_type)::text = 'N'::text))
  GROUP BY l.location_id, l.alias
  ORDER BY (sum(q.premium)) DESC;


ALTER VIEW intranet.agency_total_sales_daily_by_locations OWNER TO postgres;

--
-- Name: cancellation_last_month; Type: VIEW; Schema: intranet; Owner: postgres
--

CREATE VIEW intranet.cancellation_last_month AS
 SELECT name,
    line_of_business,
    csr,
    location,
    premium,
    cancellation_date
   FROM ( SELECT c.display_name AS name,
            c.entity_id,
            l.display_name AS line_of_business,
            csr.display_name AS csr,
            loc.location_name AS location,
                CASE
                    WHEN ((policies.term)::text ~~ '%S%'::text) THEN (policies.premium - (((policies.cancellation_date - policies.effective_date) * policies.premium) / 183))
                    ELSE (policies.premium - (((policies.cancellation_date - policies.effective_date) * policies.premium) / 365))
                END AS premium,
            policies.cancellation_date
           FROM ((((qq.policies policies
             JOIN qq.contacts c ON ((c.entity_id = policies.customer_id)))
             JOIN qq.lob l ON ((policies.lob_id = l.lob_id)))
             JOIN qq.contacts csr ON ((csr.entity_id = policies.csr_id)))
             JOIN qq.locations loc ON ((loc.location_id = c.location_id)))
          WHERE ((policies.cancellation_date >= date_trunc('month'::text, (now() - '1 year'::interval))) AND ((policies.policy_status)::text = 'C'::text) AND (policies.premium > '$1.00'::money))) can
  WHERE (NOT (EXISTS ( SELECT NULL::text AS text
           FROM ( SELECT c.display_name AS name,
                    c.entity_id,
                    l.display_name AS line_of_business,
                    csr.display_name AS csr,
                    loc.location_name AS location,
                    policies.effective_date
                   FROM ((((qq.policies policies
                     JOIN qq.contacts c ON ((c.entity_id = policies.customer_id)))
                     JOIN qq.lob l ON ((l.lob_id = policies.lob_id)))
                     JOIN qq.contacts csr ON ((policies.producer_ids[1] = csr.entity_id)))
                     JOIN qq.locations loc ON ((c.location_id = loc.location_id)))
                  WHERE ((policies.binder_date >= date_trunc('month'::text, (now() - '1 year'::interval))) AND (((policies.business_type)::text = 'W'::text) OR ((policies.business_type)::text = 'N'::text)) AND (policies.premium > '$1.00'::money))) rw
          WHERE ((can.entity_id = rw.entity_id) AND ((can.line_of_business)::text = (rw.line_of_business)::text)))))
  ORDER BY premium DESC;


ALTER VIEW intranet.cancellation_last_month OWNER TO postgres;

--
-- Name: carrier_dashboard_sales; Type: VIEW; Schema: intranet; Owner: postgres
--

CREATE VIEW intranet.carrier_dashboard_sales AS
 SELECT nbl.carrier_id AS id_carrier,
    c.display_name AS carrier_name,
    nbl.policies,
    nbl.premium,
        CASE
            WHEN (nbl.lmpremium = '$0.00'::money) THEN '0'::numeric
            ELSE round(((((nbl.premium / nbl.lmpremium) * (100)::double precision) - (100)::double precision))::numeric, 1)
        END AS percent_premium_growth,
        CASE
            WHEN (nbl.lmpolicies = 0) THEN (0)::numeric
            ELSE round(((((nbl.policies)::numeric / (nbl.lmpolicies)::numeric) * (100)::numeric) - (100)::numeric), 1)
        END AS percent_policies_growth
   FROM (( SELECT tm.carrier_id,
            tm.policies,
            tm.premium,
            llm.lmpolicies,
            llm.lmpremium
           FROM (( SELECT p.carrier_id,
                    count(p.policy_id) AS policies,
                    sum(p.premium) AS premium
                   FROM qq.policies p
                  WHERE ((date_trunc('month'::text, (p.binder_date)::timestamp with time zone) = date_trunc('month'::text, (CURRENT_DATE)::timestamp with time zone)) AND (p.premium > '$0.05'::money) AND (((p.policy_status)::text = 'A'::text) OR ((p.policy_status)::text = 'C'::text)))
                  GROUP BY p.carrier_id) tm
             LEFT JOIN ( SELECT p.carrier_id,
                    count(p.policy_id) AS lmpolicies,
                    sum(p.premium) AS lmpremium
                   FROM qq.policies p
                  WHERE ((date_trunc('month'::text, (p.binder_date)::timestamp with time zone) = (date_trunc('month'::text, (CURRENT_DATE)::timestamp with time zone) - '1 mon'::interval)) AND (p.premium > '$0.05'::money) AND (((p.policy_status)::text = 'A'::text) OR ((p.policy_status)::text = 'C'::text)))
                  GROUP BY p.carrier_id) llm ON ((llm.carrier_id = tm.carrier_id)))) nbl
     LEFT JOIN qq.contacts c ON ((c.entity_id = nbl.carrier_id)))
  ORDER BY nbl.premium DESC;


ALTER VIEW intranet.carrier_dashboard_sales OWNER TO postgres;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: code; Type: TABLE; Schema: intranet; Owner: postgres
--

CREATE TABLE intranet.code (
    location_id integer NOT NULL,
    agency character varying(80) NOT NULL,
    company character varying(100) NOT NULL,
    code character varying(50) NOT NULL,
    login character varying(100) NOT NULL,
    password character varying(100) NOT NULL,
    enabled boolean DEFAULT true NOT NULL
);


ALTER TABLE intranet.code OWNER TO postgres;

--
-- Name: contact_email_checks; Type: TABLE; Schema: intranet; Owner: postgres
--

CREATE TABLE intranet.contact_email_checks (
    contact_id integer NOT NULL,
    email character varying,
    email_status character varying(20),
    email_checked_on timestamp without time zone
);


ALTER TABLE intranet.contact_email_checks OWNER TO postgres;

--
-- Name: corporate_month; Type: VIEW; Schema: intranet; Owner: postgres
--

CREATE VIEW intranet.corporate_month AS
 SELECT 'New Business'::text AS business_type,
    count(p.policy_id) AS policies,
    COALESCE(sum(p.premium), (0)::money) AS premium
   FROM ((qq.policies p
     JOIN qq.contacts c ON ((p.customer_id = c.entity_id)))
     JOIN qq.locations l ON ((c.location_id = l.location_id)))
  WHERE (((p.business_type)::text = 'N'::text) AND (p.lob_id <> 34) AND (p.lob_id <> 40) AND (l.location_type = ANY (ARRAY[1, 4])) AND ((p.policy_status)::text = ANY (ARRAY['A'::text, 'E'::text])) AND (p.binder_date >= date_trunc('month'::text, (CURRENT_DATE)::timestamp with time zone)) AND (p.binder_date < (date_trunc('month'::text, (CURRENT_DATE)::timestamp with time zone) + '1 mon'::interval)))
UNION
 SELECT 'Renewal'::text AS business_type,
    count(p.policy_id) AS policies,
    COALESCE(sum(p.premium), (0)::money) AS premium
   FROM ((qq.policies p
     JOIN qq.contacts c ON ((p.customer_id = c.entity_id)))
     JOIN qq.locations l ON ((c.location_id = l.location_id)))
  WHERE (((p.business_type)::text = 'R'::text) AND (p.lob_id <> 34) AND (p.lob_id <> 40) AND (l.location_type = 1) AND ((p.policy_status)::text = ANY (ARRAY['A'::text, 'E'::text])) AND (p.binder_date >= date_trunc('month'::text, (CURRENT_DATE)::timestamp with time zone)) AND (p.binder_date < (date_trunc('month'::text, (CURRENT_DATE)::timestamp with time zone) + '1 mon'::interval)))
UNION
 SELECT 'Rewrite'::text AS business_type,
    count(p.policy_id) AS policies,
    COALESCE(sum(p.premium), (0)::money) AS premium
   FROM ((qq.policies p
     JOIN qq.contacts c ON ((p.customer_id = c.entity_id)))
     JOIN qq.locations l ON ((c.location_id = l.location_id)))
  WHERE (((p.business_type)::text = 'W'::text) AND (p.lob_id <> 34) AND (p.lob_id <> 40) AND (l.location_type = 1) AND ((p.policy_status)::text = ANY (ARRAY['A'::text, 'E'::text])) AND (p.binder_date >= date_trunc('month'::text, (CURRENT_DATE)::timestamp with time zone)) AND (p.binder_date < (date_trunc('month'::text, (CURRENT_DATE)::timestamp with time zone) + '1 mon'::interval)))
UNION
 SELECT 'Total'::text AS business_type,
    count(p.policy_id) AS policies,
    COALESCE(sum(p.premium), (0)::money) AS premium
   FROM ((qq.policies p
     JOIN qq.contacts c ON ((p.customer_id = c.entity_id)))
     JOIN qq.locations l ON ((c.location_id = l.location_id)))
  WHERE (((((p.business_type)::text = 'N'::text) AND (p.lob_id <> 34) AND (p.lob_id <> 40) AND (l.location_type = ANY (ARRAY[1, 4]))) OR (((p.business_type)::text = ANY (ARRAY['R'::text, 'W'::text])) AND (l.location_type = 1))) AND ((p.policy_status)::text = ANY (ARRAY['A'::text, 'E'::text])) AND (p.binder_date >= date_trunc('month'::text, (CURRENT_DATE)::timestamp with time zone)) AND (p.binder_date < (date_trunc('month'::text, (CURRENT_DATE)::timestamp with time zone) + '1 mon'::interval)));


ALTER VIEW intranet.corporate_month OWNER TO postgres;

--
-- Name: corporate_nb_sales_by_location; Type: VIEW; Schema: intranet; Owner: postgres
--

CREATE VIEW intranet.corporate_nb_sales_by_location AS
 SELECT loc.alias AS location_name,
    COALESCE(sum(p.premium), '$0.00'::money) AS total_premium,
    count(p.policy_id) AS total_policies
   FROM (((qq.policies p
     JOIN qq.contacts c ON ((p.customer_id = c.entity_id)))
     JOIN qq.locations loc ON ((c.location_id = loc.location_id)))
     JOIN admin.location_types lt ON ((loc.location_type = lt.location_type_id)))
  WHERE (((lt.location_type)::text = 'Corporate'::text) AND ((loc.alias)::text = ANY ((ARRAY['Bent Tree'::character varying, 'Headquarters'::character varying, 'Hialeah'::character varying])::text[])) AND ((p.business_type)::text = 'N'::text) AND ((p.policy_status)::text = 'A'::text) AND (p.premium > '$1.00'::money))
  GROUP BY loc.alias;


ALTER VIEW intranet.corporate_nb_sales_by_location OWNER TO postgres;

--
-- Name: corporate_nb_today_summary; Type: VIEW; Schema: intranet; Owner: postgres
--

CREATE VIEW intranet.corporate_nb_today_summary AS
 SELECT 'DETAIL'::text AS record_type,
    loc.alias AS location_name,
    COALESCE(sum(p.premium), '$0.00'::money) AS total_premium
   FROM (((qq.policies p
     JOIN qq.contacts c ON ((p.customer_id = c.entity_id)))
     JOIN qq.locations loc ON ((c.location_id = loc.location_id)))
     JOIN admin.location_types lt ON ((loc.location_type = lt.location_type_id)))
  WHERE (((lt.location_type)::text = 'Corporate'::text) AND ((loc.alias)::text = ANY (ARRAY[('Bent Tree'::character varying)::text, ('Headquarters'::character varying)::text, ('Hialeah'::character varying)::text])) AND ((p.business_type)::text = 'N'::text) AND ((p.policy_status)::text = 'A'::text) AND (p.premium > '$1.00'::money) AND (p.binder_date = CURRENT_DATE))
  GROUP BY loc.alias
UNION ALL
 SELECT 'TOTAL'::text AS record_type,
    NULL::character varying AS location_name,
    COALESCE(sum(p.premium), '$0.00'::money) AS total_premium
   FROM (((qq.policies p
     JOIN qq.contacts c ON ((p.customer_id = c.entity_id)))
     JOIN qq.locations loc ON ((c.location_id = loc.location_id)))
     JOIN admin.location_types lt ON ((loc.location_type = lt.location_type_id)))
  WHERE (((lt.location_type)::text = 'Corporate'::text) AND ((loc.alias)::text = ANY (ARRAY[('Bent Tree'::character varying)::text, ('Headquarters'::character varying)::text, ('Hialeah'::character varying)::text])) AND ((p.business_type)::text = 'N'::text) AND ((p.policy_status)::text = 'A'::text) AND (p.premium > '$1.00'::money) AND (p.binder_date = CURRENT_DATE));


ALTER VIEW intranet.corporate_nb_today_summary OWNER TO postgres;

--
-- Name: corporate_nb_today_total; Type: VIEW; Schema: intranet; Owner: postgres
--

CREATE VIEW intranet.corporate_nb_today_total AS
 SELECT COALESCE(sum(p.premium), '$0.00'::money) AS total_premium
   FROM (((qq.policies p
     JOIN qq.contacts c ON ((p.customer_id = c.entity_id)))
     JOIN qq.locations loc ON ((c.location_id = loc.location_id)))
     JOIN admin.location_types lt ON ((loc.location_type = lt.location_type_id)))
  WHERE (((lt.location_type)::text = 'Corporate'::text) AND ((loc.alias)::text = ANY (ARRAY[('Bent Tree'::character varying)::text, ('Headquarters'::character varying)::text, ('Hialeah'::character varying)::text])) AND ((p.business_type)::text = 'N'::text) AND ((p.policy_status)::text = 'A'::text) AND (p.premium > '$1.00'::money) AND (p.binder_date = CURRENT_DATE));


ALTER VIEW intranet.corporate_nb_today_total OWNER TO postgres;

--
-- Name: corporate_today; Type: VIEW; Schema: intranet; Owner: postgres
--

CREATE VIEW intranet.corporate_today AS
 SELECT 'New Business'::text AS business_type,
    count(p.policy_id) AS policies,
    COALESCE(sum(p.premium), (0)::money) AS premium
   FROM ((qq.policies p
     JOIN qq.contacts c ON ((p.customer_id = c.entity_id)))
     JOIN qq.locations l ON ((c.location_id = l.location_id)))
  WHERE (((p.business_type)::text = 'N'::text) AND (p.lob_id <> 34) AND (p.lob_id <> 40) AND (l.location_type = ANY (ARRAY[1, 4])) AND ((p.policy_status)::text = ANY (ARRAY['A'::text, 'C'::text])) AND (p.binder_date = CURRENT_DATE))
UNION
 SELECT 'Renewal'::text AS business_type,
    count(p.policy_id) AS policies,
    COALESCE(sum(p.premium), (0)::money) AS premium
   FROM ((qq.policies p
     JOIN qq.contacts c ON ((p.customer_id = c.entity_id)))
     JOIN qq.locations l ON ((c.location_id = l.location_id)))
  WHERE (((p.business_type)::text = 'R'::text) AND (p.lob_id <> 34) AND (p.lob_id <> 40) AND (l.location_type = 1) AND ((p.policy_status)::text = ANY (ARRAY['A'::text, 'C'::text])) AND (p.binder_date = CURRENT_DATE))
UNION
 SELECT 'Rewrite'::text AS business_type,
    count(p.policy_id) AS policies,
    COALESCE(sum(p.premium), (0)::money) AS premium
   FROM ((qq.policies p
     JOIN qq.contacts c ON ((p.customer_id = c.entity_id)))
     JOIN qq.locations l ON ((c.location_id = l.location_id)))
  WHERE (((p.business_type)::text = 'W'::text) AND (p.lob_id <> 34) AND (p.lob_id <> 40) AND (l.location_type = 1) AND ((p.policy_status)::text = ANY (ARRAY['A'::text, 'E'::text])) AND (p.binder_date = CURRENT_DATE))
UNION
 SELECT 'Total'::text AS business_type,
    count(p.policy_id) AS policies,
    COALESCE(sum(p.premium), (0)::money) AS premium
   FROM ((qq.policies p
     JOIN qq.contacts c ON ((p.customer_id = c.entity_id)))
     JOIN qq.locations l ON ((c.location_id = l.location_id)))
  WHERE (((((p.business_type)::text = 'N'::text) AND (p.lob_id <> 34) AND (p.lob_id <> 40) AND (l.location_type = ANY (ARRAY[1, 4]))) OR (((p.business_type)::text = ANY (ARRAY['R'::text, 'W'::text])) AND (l.location_type = 1))) AND ((p.policy_status)::text = ANY (ARRAY['A'::text, 'C'::text])) AND (p.binder_date = CURRENT_DATE));


ALTER VIEW intranet.corporate_today OWNER TO postgres;

--
-- Name: dashboard_company; Type: VIEW; Schema: intranet; Owner: postgres
--

CREATE VIEW intranet.dashboard_company AS
 SELECT l.entity_id AS id_company,
    nbc.company,
    nbc.policies,
    nbc.premium,
        CASE
            WHEN (nbc.lmpremium = '$0.00'::money) THEN '0'::numeric
            ELSE (round((((nbc.premium / nbc.lmpremium) * (100)::double precision))::numeric, 1) - (100)::numeric)
        END AS percent
   FROM (( SELECT tm.company,
            tm.policies,
            tm.premium,
            llm.lmpolicies,
            llm.lmpremium
           FROM (( SELECT c.display_name AS company,
                    count(qq_policies.binder_date) AS policies,
                    sum(qq_policies.premium) AS premium
                   FROM (qq.policies qq_policies
                     JOIN qq.contacts c ON ((c.entity_id = qq_policies.carrier_id)))
                  WHERE (((qq_policies.business_type)::text = 'N'::text) AND (date_trunc('month'::text, (qq_policies.binder_date)::timestamp with time zone) = date_trunc('month'::text, (CURRENT_DATE)::timestamp with time zone)) AND (qq_policies.lob_id <> 34) AND (qq_policies.lob_id <> 40) AND (qq_policies.premium > '$0.05'::money) AND (((qq_policies.policy_status)::text = 'A'::text) OR ((qq_policies.policy_status)::text = 'C'::text)))
                  GROUP BY c.display_name) tm
             LEFT JOIN ( SELECT c.display_name AS company,
                    count(qq_policies.binder_date) AS lmpolicies,
                    sum(qq_policies.premium) AS lmpremium
                   FROM (qq.policies qq_policies
                     JOIN qq.contacts c ON ((c.entity_id = qq_policies.carrier_id)))
                  WHERE (((qq_policies.business_type)::text = 'N'::text) AND (qq_policies.binder_date >= (date_trunc('month'::text, now()) - '1 mon'::interval month)) AND (qq_policies.binder_date <= (CURRENT_DATE - '1 mon'::interval)) AND (qq_policies.lob_id <> 34) AND (qq_policies.lob_id <> 40) AND (qq_policies.premium > '$0.05'::money) AND (((qq_policies.policy_status)::text = 'A'::text) OR ((qq_policies.policy_status)::text = 'C'::text)))
                  GROUP BY c.display_name) llm ON (((llm.company)::text = (tm.company)::text)))) nbc
     LEFT JOIN qq.contacts l ON ((initcap(TRIM(BOTH FROM l.display_name)) = initcap(TRIM(BOTH FROM (nbc.company)::text)))))
  WHERE ((l.status)::text = 'A'::text)
  ORDER BY nbc.premium DESC;


ALTER VIEW intranet.dashboard_company OWNER TO postgres;

--
-- Name: dashboard_company_today; Type: VIEW; Schema: intranet; Owner: postgres
--

CREATE VIEW intranet.dashboard_company_today AS
 SELECT 'New Business'::text AS business_type,
    sum(s.premium) AS premium,
    count(s.policy_id) AS policies
   FROM ((qq.policies s
     JOIN qq.contacts c ON ((c.entity_id = s.customer_id)))
     JOIN qq.locations l ON ((c.location_id = l.location_id)))
  WHERE (((s.business_type)::text = 'N'::text) AND (s.lob_id <> 34) AND (s.lob_id <> 40) AND (((s.policy_status)::text = 'C'::text) OR ((s.policy_status)::text = 'A'::text)) AND (s.binder_date = CURRENT_DATE) AND (s.premium > '$1.00'::money) AND (l.location_type = ANY (ARRAY[1, 2, 4])))
UNION
 SELECT 'Renewal'::text AS business_type,
    sum(s.premium) AS premium,
    count(s.policy_id) AS policies
   FROM ((qq.policies s
     JOIN qq.contacts c ON ((c.entity_id = s.customer_id)))
     JOIN qq.locations l ON ((c.location_id = l.location_id)))
  WHERE (((s.business_type)::text = 'R'::text) AND (s.lob_id <> 34) AND (s.lob_id <> 40) AND (((s.policy_status)::text = 'C'::text) OR ((s.policy_status)::text = 'A'::text)) AND (s.binder_date = CURRENT_DATE) AND (s.premium > '$1.00'::money) AND (l.location_type = ANY (ARRAY[1, 2, 4])))
UNION
 SELECT 'Rewrite'::text AS business_type,
    sum(s.premium) AS premium,
    count(s.policy_id) AS policies
   FROM ((qq.policies s
     JOIN qq.contacts c ON ((c.entity_id = s.customer_id)))
     JOIN qq.locations l ON ((c.location_id = l.location_id)))
  WHERE (((s.business_type)::text = 'W'::text) AND (s.lob_id <> 34) AND (s.lob_id <> 40) AND (((s.policy_status)::text = 'C'::text) OR ((s.policy_status)::text = 'A'::text)) AND (s.binder_date = CURRENT_DATE) AND (s.premium > '$1.00'::money) AND (l.location_type = ANY (ARRAY[1, 2, 4])))
UNION
 SELECT 'Total'::text AS business_type,
    sum(s.premium) AS premium,
    count(s.policy_id) AS policies
   FROM ((qq.policies s
     JOIN qq.contacts c ON ((c.entity_id = s.customer_id)))
     JOIN qq.locations l ON ((c.location_id = l.location_id)))
  WHERE ((s.lob_id <> 34) AND (s.lob_id <> 40) AND (((s.policy_status)::text = 'C'::text) OR ((s.policy_status)::text = 'A'::text)) AND (s.binder_date = CURRENT_DATE) AND (s.premium > '$1.00'::money) AND (l.location_type = ANY (ARRAY[1, 2, 4])));


ALTER VIEW intranet.dashboard_company_today OWNER TO postgres;

--
-- Name: dashboard_company_year; Type: VIEW; Schema: intranet; Owner: postgres
--

CREATE VIEW intranet.dashboard_company_year AS
 SELECT business_type,
    premium,
    policies,
        CASE
            WHEN (CURRENT_DATE = make_date((EXTRACT(year FROM CURRENT_DATE))::integer, 1, 1)) THEN (premium * 365)
            ELSE ((premium / (CURRENT_DATE - make_date((EXTRACT(year FROM CURRENT_DATE))::integer, 1, 1))) * 365)
        END AS premiumtkg,
        CASE
            WHEN (CURRENT_DATE = make_date((EXTRACT(year FROM CURRENT_DATE))::integer, 1, 1)) THEN round((((policies * 365))::double precision)::numeric, 0)
            ELSE round(((((policies)::double precision / ((CURRENT_DATE - make_date((EXTRACT(year FROM CURRENT_DATE))::integer, 1, 1)))::double precision) * (365)::double precision))::numeric, 0)
        END AS policiestkg
   FROM ( SELECT 'New Business'::text AS business_type,
            sum(policies.premium) AS premium,
            count(policies.binder_date) AS policies
           FROM qq.policies
          WHERE ((policies.binder_date >= make_date((EXTRACT(year FROM CURRENT_DATE))::integer, 1, 1)) AND (policies.binder_date <= CURRENT_DATE) AND ((policies.business_type)::text = 'N'::text) AND (policies.premium >= '$1.00'::money) AND ((policies.policy_status)::text !~~ '%D%'::text) AND ((policies.policy_status)::text !~~ '%V%'::text) AND (policies.lob_id <> 34) AND (policies.lob_id <> 40))
        UNION
         SELECT 'Renewal'::text AS business_type,
            sum(policies.premium) AS sum,
            count(policies.binder_date) AS count
           FROM qq.policies
          WHERE ((policies.binder_date >= make_date((EXTRACT(year FROM CURRENT_DATE))::integer, 1, 1)) AND (policies.binder_date <= CURRENT_DATE) AND ((policies.business_type)::text = 'R'::text) AND (policies.premium >= '$1.00'::money) AND ((policies.policy_status)::text !~~ '%D%'::text) AND ((policies.policy_status)::text !~~ '%V%'::text) AND (policies.lob_id <> 34) AND (policies.lob_id <> 40))
        UNION
         SELECT 'Rewrite'::text AS business_type,
            sum(policies.premium) AS sum,
            count(policies.binder_date) AS count
           FROM qq.policies
          WHERE ((policies.binder_date >= make_date((EXTRACT(year FROM CURRENT_DATE))::integer, 1, 1)) AND (policies.binder_date <= CURRENT_DATE) AND ((policies.business_type)::text = 'W'::text) AND (policies.premium >= '$1.00'::money) AND ((policies.policy_status)::text !~~ '%D%'::text) AND ((policies.policy_status)::text !~~ '%V%'::text) AND (policies.lob_id <> 34) AND (policies.lob_id <> 40))
        UNION
         SELECT 'TOTAL'::text AS business_type,
            sum(policies.premium) AS sum,
            count(policies.binder_date) AS count
           FROM qq.policies
          WHERE ((policies.binder_date >= make_date((EXTRACT(year FROM CURRENT_DATE))::integer, 1, 1)) AND (policies.binder_date <= CURRENT_DATE) AND (policies.premium >= '$1.00'::money) AND ((policies.policy_status)::text !~~ '%D%'::text) AND ((policies.policy_status)::text !~~ '%V%'::text) AND (policies.lob_id <> 34) AND (policies.lob_id <> 40))) unnamed_subquery;


ALTER VIEW intranet.dashboard_company_year OWNER TO postgres;

--
-- Name: dashboard_sales_last_year; Type: VIEW; Schema: intranet; Owner: postgres
--

CREATE VIEW intranet.dashboard_sales_last_year AS
 SELECT to_char((date_trunc('month'::text, now()) - '1 year'::interval month), 'MM'::text) AS month,
    to_char((date_trunc('month'::text, now()) - '1 year'::interval month), 'yyyy'::text) AS year,
    count(policies.binder_date) AS policies,
    sum(policies.premium) AS premium
   FROM qq.policies
  WHERE ((policies.binder_date >= (date_trunc('month'::text, now()) - '1 year'::interval month)) AND (policies.lob_id <> 34) AND (policies.lob_id <> 40) AND (policies.binder_date < (date_trunc('month'::text, now()) - '11 mons'::interval month)) AND (((policies.policy_status)::text = 'A'::text) OR ((policies.policy_status)::text = 'C'::text) OR ((policies.policy_status)::text = 'E'::text)) AND (policies.premium > '$1.00'::money))
UNION
 SELECT to_char((date_trunc('month'::text, now()) - '11 mons'::interval month), 'MM'::text) AS month,
    to_char((date_trunc('month'::text, now()) - '11 mons'::interval month), 'yyyy'::text) AS year,
    count(policies.binder_date) AS policies,
    sum(policies.premium) AS premium
   FROM qq.policies
  WHERE ((policies.binder_date >= (date_trunc('month'::text, now()) - '11 mons'::interval month)) AND (policies.lob_id <> 34) AND (policies.lob_id <> 40) AND (policies.binder_date < (date_trunc('month'::text, now()) - '10 mons'::interval month)) AND (((policies.policy_status)::text = 'A'::text) OR ((policies.policy_status)::text = 'C'::text) OR ((policies.policy_status)::text = 'E'::text)) AND (policies.premium > '$1.00'::money))
UNION
 SELECT to_char((date_trunc('month'::text, now()) - '10 mons'::interval month), 'MM'::text) AS month,
    to_char((date_trunc('month'::text, now()) - '10 mons'::interval month), 'yyyy'::text) AS year,
    count(policies.binder_date) AS policies,
    sum(policies.premium) AS premium
   FROM qq.policies
  WHERE ((policies.binder_date >= (date_trunc('month'::text, now()) - '10 mons'::interval month)) AND (policies.lob_id <> 34) AND (policies.lob_id <> 40) AND (policies.binder_date < (date_trunc('month'::text, now()) - '9 mons'::interval month)) AND (((policies.policy_status)::text = 'A'::text) OR ((policies.policy_status)::text = 'C'::text) OR ((policies.policy_status)::text = 'E'::text)) AND (policies.premium > '$1.00'::money))
UNION
 SELECT to_char((date_trunc('month'::text, now()) - '9 mons'::interval month), 'MM'::text) AS month,
    to_char((date_trunc('month'::text, now()) - '9 mons'::interval month), 'yyyy'::text) AS year,
    count(policies.binder_date) AS policies,
    sum(policies.premium) AS premium
   FROM qq.policies
  WHERE ((policies.binder_date >= (date_trunc('month'::text, now()) - '9 mons'::interval month)) AND (policies.lob_id <> 34) AND (policies.lob_id <> 40) AND (policies.binder_date < (date_trunc('month'::text, now()) - '8 mons'::interval month)) AND (((policies.policy_status)::text = 'A'::text) OR ((policies.policy_status)::text = 'C'::text) OR ((policies.policy_status)::text = 'E'::text)) AND (policies.premium > '$1.00'::money))
UNION
 SELECT to_char((date_trunc('month'::text, now()) - '8 mons'::interval month), 'MM'::text) AS month,
    to_char((date_trunc('month'::text, now()) - '8 mons'::interval month), 'yyyy'::text) AS year,
    count(policies.binder_date) AS policies,
    sum(policies.premium) AS premium
   FROM qq.policies
  WHERE ((policies.binder_date >= (date_trunc('month'::text, now()) - '8 mons'::interval month)) AND (policies.lob_id <> 34) AND (policies.lob_id <> 40) AND (policies.binder_date < (date_trunc('month'::text, now()) - '7 mons'::interval month)) AND (((policies.policy_status)::text = 'A'::text) OR ((policies.policy_status)::text = 'C'::text) OR ((policies.policy_status)::text = 'E'::text)) AND (policies.premium > '$1.00'::money))
UNION
 SELECT to_char((date_trunc('month'::text, now()) - '7 mons'::interval month), 'MM'::text) AS month,
    to_char((date_trunc('month'::text, now()) - '7 mons'::interval month), 'yyyy'::text) AS year,
    count(policies.binder_date) AS policies,
    sum(policies.premium) AS premium
   FROM qq.policies
  WHERE ((policies.binder_date >= (date_trunc('month'::text, now()) - '7 mons'::interval month)) AND (policies.lob_id <> 34) AND (policies.lob_id <> 40) AND (policies.binder_date < (date_trunc('month'::text, now()) - '6 mons'::interval month)) AND (((policies.policy_status)::text = 'A'::text) OR ((policies.policy_status)::text = 'C'::text) OR ((policies.policy_status)::text = 'E'::text)) AND (policies.premium > '$1.00'::money))
UNION
 SELECT to_char((date_trunc('month'::text, now()) - '6 mons'::interval month), 'MM'::text) AS month,
    to_char((date_trunc('month'::text, now()) - '6 mons'::interval month), 'yyyy'::text) AS year,
    count(policies.binder_date) AS policies,
    sum(policies.premium) AS premium
   FROM qq.policies
  WHERE ((policies.binder_date >= (date_trunc('month'::text, now()) - '6 mons'::interval month)) AND (policies.lob_id <> 34) AND (policies.lob_id <> 40) AND (policies.binder_date < (date_trunc('month'::text, now()) - '5 mons'::interval month)) AND (((policies.policy_status)::text = 'A'::text) OR ((policies.policy_status)::text = 'C'::text) OR ((policies.policy_status)::text = 'E'::text)) AND (policies.premium > '$1.00'::money))
UNION
 SELECT to_char((date_trunc('month'::text, now()) - '5 mons'::interval month), 'MM'::text) AS month,
    to_char((date_trunc('month'::text, now()) - '5 mons'::interval month), 'yyyy'::text) AS year,
    count(policies.binder_date) AS policies,
    sum(policies.premium) AS premium
   FROM qq.policies
  WHERE ((policies.binder_date >= (date_trunc('month'::text, now()) - '5 mons'::interval month)) AND (policies.lob_id <> 34) AND (policies.lob_id <> 40) AND (policies.binder_date < (date_trunc('month'::text, now()) - '4 mons'::interval month)) AND (((policies.policy_status)::text = 'A'::text) OR ((policies.policy_status)::text = 'C'::text) OR ((policies.policy_status)::text = 'E'::text)) AND (policies.premium > '$1.00'::money))
UNION
 SELECT to_char((date_trunc('month'::text, now()) - '4 mons'::interval month), 'MM'::text) AS month,
    to_char((date_trunc('month'::text, now()) - '4 mons'::interval month), 'yyyy'::text) AS year,
    count(policies.binder_date) AS policies,
    sum(policies.premium) AS premium
   FROM qq.policies
  WHERE ((policies.binder_date >= (date_trunc('month'::text, now()) - '4 mons'::interval month)) AND (policies.lob_id <> 34) AND (policies.lob_id <> 40) AND (policies.binder_date < (date_trunc('month'::text, now()) - '3 mons'::interval month)) AND (((policies.policy_status)::text = 'A'::text) OR ((policies.policy_status)::text = 'C'::text) OR ((policies.policy_status)::text = 'E'::text)) AND (policies.premium > '$1.00'::money))
UNION
 SELECT to_char((date_trunc('month'::text, now()) - '3 mons'::interval month), 'MM'::text) AS month,
    to_char((date_trunc('month'::text, now()) - '3 mons'::interval month), 'yyyy'::text) AS year,
    count(policies.binder_date) AS policies,
    sum(policies.premium) AS premium
   FROM qq.policies
  WHERE ((policies.binder_date >= (date_trunc('month'::text, now()) - '3 mons'::interval month)) AND (policies.lob_id <> 34) AND (policies.lob_id <> 40) AND (policies.binder_date < (date_trunc('month'::text, now()) - '2 mons'::interval month)) AND (((policies.policy_status)::text = 'A'::text) OR ((policies.policy_status)::text = 'C'::text) OR ((policies.policy_status)::text = 'E'::text)) AND (policies.premium > '$1.00'::money))
UNION
 SELECT to_char((date_trunc('month'::text, now()) - '2 mons'::interval month), 'MM'::text) AS month,
    to_char((date_trunc('month'::text, now()) - '2 mons'::interval month), 'yyyy'::text) AS year,
    count(policies.binder_date) AS policies,
    sum(policies.premium) AS premium
   FROM qq.policies
  WHERE ((policies.binder_date >= (date_trunc('month'::text, now()) - '2 mons'::interval month)) AND (policies.lob_id <> 34) AND (policies.lob_id <> 40) AND (policies.binder_date < (date_trunc('month'::text, now()) - '1 mon'::interval month)) AND (((policies.policy_status)::text = 'A'::text) OR ((policies.policy_status)::text = 'C'::text) OR ((policies.policy_status)::text = 'E'::text)) AND (policies.premium > '$1.00'::money))
UNION
 SELECT to_char((date_trunc('month'::text, now()) - '1 mon'::interval month), 'MM'::text) AS month,
    to_char((date_trunc('month'::text, now()) - '1 mon'::interval month), 'yyyy'::text) AS year,
    count(policies.binder_date) AS policies,
    sum(policies.premium) AS premium
   FROM qq.policies
  WHERE ((policies.binder_date >= (date_trunc('month'::text, now()) - '1 mon'::interval month)) AND (policies.lob_id <> 34) AND (policies.lob_id <> 40) AND (policies.binder_date < date_trunc('month'::text, now())) AND (((policies.policy_status)::text = 'A'::text) OR ((policies.policy_status)::text = 'C'::text) OR ((policies.policy_status)::text = 'E'::text)) AND (policies.premium > '$1.00'::money))
UNION
 SELECT to_char(date_trunc('month'::text, now()), 'MM'::text) AS month,
    to_char(date_trunc('month'::text, now()), 'yyyy'::text) AS year,
    count(policies.binder_date) AS policies,
    sum(policies.premium) AS premium
   FROM qq.policies
  WHERE ((policies.binder_date >= date_trunc('month'::text, (CURRENT_DATE)::timestamp with time zone)) AND (policies.binder_date <= CURRENT_DATE) AND (policies.premium >= '$1.00'::money) AND ((policies.policy_status)::text !~~ '%D%'::text) AND ((policies.policy_status)::text !~~ '%V%'::text) AND (policies.lob_id <> 34) AND (policies.lob_id <> 40))
  ORDER BY 2, 1;


ALTER VIEW intranet.dashboard_sales_last_year OWNER TO postgres;

--
-- Name: dashboard_sales_last_year_cn; Type: VIEW; Schema: intranet; Owner: postgres
--

CREATE VIEW intranet.dashboard_sales_last_year_cn AS
 SELECT to_char((date_trunc('month'::text, now()) - '1 year'::interval month), 'MM'::text) AS month,
    to_char((date_trunc('month'::text, now()) - '1 year'::interval month), 'yyyy'::text) AS year,
    count(cancellation_last_month.cancellation_date) AS polcan,
        CASE
            WHEN (sum(cancellation_last_month.premium) IS NULL) THEN '$0.00'::money
            ELSE sum(cancellation_last_month.premium)
        END AS premcan
   FROM intranet.cancellation_last_month
  WHERE ((cancellation_last_month.cancellation_date >= (date_trunc('month'::text, now()) - '1 year'::interval month)) AND (cancellation_last_month.cancellation_date < (date_trunc('month'::text, now()) - '11 mons'::interval month)))
UNION
 SELECT to_char((date_trunc('month'::text, now()) - '11 mons'::interval month), 'MM'::text) AS month,
    to_char((date_trunc('month'::text, now()) - '11 mons'::interval month), 'yyyy'::text) AS year,
    count(cancellation_last_month.cancellation_date) AS polcan,
        CASE
            WHEN (sum(cancellation_last_month.premium) IS NULL) THEN '$0.00'::money
            ELSE sum(cancellation_last_month.premium)
        END AS premcan
   FROM intranet.cancellation_last_month
  WHERE ((cancellation_last_month.cancellation_date >= (date_trunc('month'::text, now()) - '11 mons'::interval month)) AND (cancellation_last_month.cancellation_date < (date_trunc('month'::text, now()) - '10 mons'::interval month)))
UNION
 SELECT to_char((date_trunc('month'::text, now()) - '10 mons'::interval month), 'MM'::text) AS month,
    to_char((date_trunc('month'::text, now()) - '10 mons'::interval month), 'yyyy'::text) AS year,
    count(cancellation_last_month.cancellation_date) AS polcan,
        CASE
            WHEN (sum(cancellation_last_month.premium) IS NULL) THEN '$0.00'::money
            ELSE sum(cancellation_last_month.premium)
        END AS premcan
   FROM intranet.cancellation_last_month
  WHERE ((cancellation_last_month.cancellation_date >= (date_trunc('month'::text, now()) - '10 mons'::interval month)) AND (cancellation_last_month.cancellation_date < (date_trunc('month'::text, now()) - '9 mons'::interval month)))
UNION
 SELECT to_char((date_trunc('month'::text, now()) - '9 mons'::interval month), 'MM'::text) AS month,
    to_char((date_trunc('month'::text, now()) - '9 mons'::interval month), 'yyyy'::text) AS year,
    count(cancellation_last_month.cancellation_date) AS polcan,
        CASE
            WHEN (sum(cancellation_last_month.premium) IS NULL) THEN '$0.00'::money
            ELSE sum(cancellation_last_month.premium)
        END AS premcan
   FROM intranet.cancellation_last_month
  WHERE ((cancellation_last_month.cancellation_date >= (date_trunc('month'::text, now()) - '9 mons'::interval month)) AND (cancellation_last_month.cancellation_date < (date_trunc('month'::text, now()) - '8 mons'::interval month)))
UNION
 SELECT to_char((date_trunc('month'::text, now()) - '8 mons'::interval month), 'MM'::text) AS month,
    to_char((date_trunc('month'::text, now()) - '8 mons'::interval month), 'yyyy'::text) AS year,
    count(cancellation_last_month.cancellation_date) AS polcan,
        CASE
            WHEN (sum(cancellation_last_month.premium) IS NULL) THEN '$0.00'::money
            ELSE sum(cancellation_last_month.premium)
        END AS premcan
   FROM intranet.cancellation_last_month
  WHERE ((cancellation_last_month.cancellation_date >= (date_trunc('month'::text, now()) - '8 mons'::interval month)) AND (cancellation_last_month.cancellation_date < (date_trunc('month'::text, now()) - '7 mons'::interval month)))
UNION
 SELECT to_char((date_trunc('month'::text, now()) - '7 mons'::interval month), 'MM'::text) AS month,
    to_char((date_trunc('month'::text, now()) - '7 mons'::interval month), 'yyyy'::text) AS year,
    count(cancellation_last_month.cancellation_date) AS polcan,
        CASE
            WHEN (sum(cancellation_last_month.premium) IS NULL) THEN '$0.00'::money
            ELSE sum(cancellation_last_month.premium)
        END AS premcan
   FROM intranet.cancellation_last_month
  WHERE ((cancellation_last_month.cancellation_date >= (date_trunc('month'::text, now()) - '7 mons'::interval month)) AND (cancellation_last_month.cancellation_date < (date_trunc('month'::text, now()) - '6 mons'::interval month)))
UNION
 SELECT to_char((date_trunc('month'::text, now()) - '6 mons'::interval month), 'MM'::text) AS month,
    to_char((date_trunc('month'::text, now()) - '6 mons'::interval month), 'yyyy'::text) AS year,
    count(cancellation_last_month.cancellation_date) AS polcan,
        CASE
            WHEN (sum(cancellation_last_month.premium) IS NULL) THEN '$0.00'::money
            ELSE sum(cancellation_last_month.premium)
        END AS premcan
   FROM intranet.cancellation_last_month
  WHERE ((cancellation_last_month.cancellation_date >= (date_trunc('month'::text, now()) - '6 mons'::interval month)) AND (cancellation_last_month.cancellation_date < (date_trunc('month'::text, now()) - '5 mons'::interval month)))
UNION
 SELECT to_char((date_trunc('month'::text, now()) - '5 mons'::interval month), 'MM'::text) AS month,
    to_char((date_trunc('month'::text, now()) - '5 mons'::interval month), 'yyyy'::text) AS year,
    count(cancellation_last_month.cancellation_date) AS polcan,
        CASE
            WHEN (sum(cancellation_last_month.premium) IS NULL) THEN '$0.00'::money
            ELSE sum(cancellation_last_month.premium)
        END AS premcan
   FROM intranet.cancellation_last_month
  WHERE ((cancellation_last_month.cancellation_date >= (date_trunc('month'::text, now()) - '5 mons'::interval month)) AND (cancellation_last_month.cancellation_date < (date_trunc('month'::text, now()) - '4 mons'::interval month)))
UNION
 SELECT to_char((date_trunc('month'::text, now()) - '4 mons'::interval month), 'MM'::text) AS month,
    to_char((date_trunc('month'::text, now()) - '4 mons'::interval month), 'yyyy'::text) AS year,
    count(cancellation_last_month.cancellation_date) AS polcan,
        CASE
            WHEN (sum(cancellation_last_month.premium) IS NULL) THEN '$0.00'::money
            ELSE sum(cancellation_last_month.premium)
        END AS premcan
   FROM intranet.cancellation_last_month
  WHERE ((cancellation_last_month.cancellation_date >= (date_trunc('month'::text, now()) - '4 mons'::interval month)) AND (cancellation_last_month.cancellation_date < (date_trunc('month'::text, now()) - '3 mons'::interval month)))
UNION
 SELECT to_char((date_trunc('month'::text, now()) - '3 mons'::interval month), 'MM'::text) AS month,
    to_char((date_trunc('month'::text, now()) - '3 mons'::interval month), 'yyyy'::text) AS year,
    count(cancellation_last_month.cancellation_date) AS polcan,
        CASE
            WHEN (sum(cancellation_last_month.premium) IS NULL) THEN '$0.00'::money
            ELSE sum(cancellation_last_month.premium)
        END AS premcan
   FROM intranet.cancellation_last_month
  WHERE ((cancellation_last_month.cancellation_date >= (date_trunc('month'::text, now()) - '3 mons'::interval month)) AND (cancellation_last_month.cancellation_date < (date_trunc('month'::text, now()) - '2 mons'::interval month)))
UNION
 SELECT to_char((date_trunc('month'::text, now()) - '2 mons'::interval month), 'MM'::text) AS month,
    to_char((date_trunc('month'::text, now()) - '2 mons'::interval month), 'yyyy'::text) AS year,
    count(cancellation_last_month.cancellation_date) AS polcan,
        CASE
            WHEN (sum(cancellation_last_month.premium) IS NULL) THEN '$0.00'::money
            ELSE sum(cancellation_last_month.premium)
        END AS premcan
   FROM intranet.cancellation_last_month
  WHERE ((cancellation_last_month.cancellation_date >= (date_trunc('month'::text, now()) - '2 mons'::interval month)) AND (cancellation_last_month.cancellation_date < (date_trunc('month'::text, now()) - '1 mon'::interval month)))
UNION
 SELECT to_char((date_trunc('month'::text, now()) - '1 mon'::interval month), 'MM'::text) AS month,
    to_char((date_trunc('month'::text, now()) - '1 mon'::interval month), 'yyyy'::text) AS year,
    count(cancellation_last_month.cancellation_date) AS polcan,
        CASE
            WHEN (sum(cancellation_last_month.premium) IS NULL) THEN '$0.00'::money
            ELSE sum(cancellation_last_month.premium)
        END AS premcan
   FROM intranet.cancellation_last_month
  WHERE ((cancellation_last_month.cancellation_date >= (date_trunc('month'::text, now()) - '1 mon'::interval month)) AND (cancellation_last_month.cancellation_date < date_trunc('month'::text, now())))
UNION
 SELECT to_char(date_trunc('month'::text, now()), 'MM'::text) AS month,
    to_char(date_trunc('month'::text, now()), 'yyyy'::text) AS year,
    count(cancellation_last_month.cancellation_date) AS polcan,
        CASE
            WHEN (sum(cancellation_last_month.premium) IS NULL) THEN '$0.00'::money
            ELSE sum(cancellation_last_month.premium)
        END AS premcan
   FROM intranet.cancellation_last_month
  WHERE ((cancellation_last_month.cancellation_date >= date_trunc('month'::text, now())) AND (cancellation_last_month.cancellation_date <= CURRENT_DATE))
  ORDER BY 2, 1;


ALTER VIEW intranet.dashboard_sales_last_year_cn OWNER TO postgres;

--
-- Name: dashboard_sales_last_year_nb; Type: VIEW; Schema: intranet; Owner: postgres
--

CREATE VIEW intranet.dashboard_sales_last_year_nb AS
 SELECT to_char((date_trunc('month'::text, now()) - '1 year'::interval month), 'MM'::text) AS month,
    to_char((date_trunc('month'::text, now()) - '1 year'::interval month), 'yyyy'::text) AS year,
    count(policies.binder_date) AS policies,
    sum(policies.premium) AS premium
   FROM qq.policies
  WHERE ((policies.binder_date >= (date_trunc('month'::text, now()) - '1 year'::interval month)) AND (policies.binder_date < (date_trunc('month'::text, now()) - '11 mons'::interval month)) AND ((policies.business_type)::text = 'N'::text) AND (((policies.policy_status)::text = 'A'::text) OR ((policies.policy_status)::text = 'C'::text) OR ((policies.policy_status)::text = 'E'::text)) AND (policies.premium > '$1.00'::money))
UNION
 SELECT to_char((date_trunc('month'::text, now()) - '11 mons'::interval month), 'MM'::text) AS month,
    to_char((date_trunc('month'::text, now()) - '11 mons'::interval month), 'yyyy'::text) AS year,
    count(policies.binder_date) AS policies,
    sum(policies.premium) AS premium
   FROM qq.policies
  WHERE ((policies.binder_date >= (date_trunc('month'::text, now()) - '11 mons'::interval month)) AND (policies.binder_date < (date_trunc('month'::text, now()) - '10 mons'::interval month)) AND ((policies.business_type)::text = 'N'::text) AND (((policies.policy_status)::text = 'A'::text) OR ((policies.policy_status)::text = 'C'::text) OR ((policies.policy_status)::text = 'E'::text)) AND (policies.premium > '$1.00'::money))
UNION
 SELECT to_char((date_trunc('month'::text, now()) - '10 mons'::interval month), 'MM'::text) AS month,
    to_char((date_trunc('month'::text, now()) - '10 mons'::interval month), 'yyyy'::text) AS year,
    count(policies.binder_date) AS policies,
    sum(policies.premium) AS premium
   FROM qq.policies
  WHERE ((policies.binder_date >= (date_trunc('month'::text, now()) - '10 mons'::interval month)) AND (policies.binder_date < (date_trunc('month'::text, now()) - '9 mons'::interval month)) AND ((policies.business_type)::text = 'N'::text) AND (((policies.policy_status)::text = 'A'::text) OR ((policies.policy_status)::text = 'C'::text) OR ((policies.policy_status)::text = 'E'::text)) AND (policies.premium > '$1.00'::money))
UNION
 SELECT to_char((date_trunc('month'::text, now()) - '9 mons'::interval month), 'MM'::text) AS month,
    to_char((date_trunc('month'::text, now()) - '9 mons'::interval month), 'yyyy'::text) AS year,
    count(policies.binder_date) AS policies,
    sum(policies.premium) AS premium
   FROM qq.policies
  WHERE ((policies.binder_date >= (date_trunc('month'::text, now()) - '9 mons'::interval month)) AND (policies.binder_date < (date_trunc('month'::text, now()) - '8 mons'::interval month)) AND ((policies.business_type)::text = 'N'::text) AND (((policies.policy_status)::text = 'A'::text) OR ((policies.policy_status)::text = 'C'::text) OR ((policies.policy_status)::text = 'E'::text)) AND (policies.premium > '$1.00'::money))
UNION
 SELECT to_char((date_trunc('month'::text, now()) - '8 mons'::interval month), 'MM'::text) AS month,
    to_char((date_trunc('month'::text, now()) - '8 mons'::interval month), 'yyyy'::text) AS year,
    count(policies.binder_date) AS policies,
    sum(policies.premium) AS premium
   FROM qq.policies
  WHERE ((policies.binder_date >= (date_trunc('month'::text, now()) - '8 mons'::interval month)) AND (policies.binder_date < (date_trunc('month'::text, now()) - '7 mons'::interval month)) AND ((policies.business_type)::text = 'N'::text) AND (((policies.policy_status)::text = 'A'::text) OR ((policies.policy_status)::text = 'C'::text) OR ((policies.policy_status)::text = 'E'::text)) AND (policies.premium > '$1.00'::money))
UNION
 SELECT to_char((date_trunc('month'::text, now()) - '7 mons'::interval month), 'MM'::text) AS month,
    to_char((date_trunc('month'::text, now()) - '7 mons'::interval month), 'yyyy'::text) AS year,
    count(policies.binder_date) AS policies,
    sum(policies.premium) AS premium
   FROM qq.policies
  WHERE ((policies.binder_date >= (date_trunc('month'::text, now()) - '7 mons'::interval month)) AND (policies.binder_date < (date_trunc('month'::text, now()) - '6 mons'::interval month)) AND ((policies.business_type)::text = 'N'::text) AND (((policies.policy_status)::text = 'A'::text) OR ((policies.policy_status)::text = 'C'::text) OR ((policies.policy_status)::text = 'E'::text)) AND (policies.premium > '$1.00'::money))
UNION
 SELECT to_char((date_trunc('month'::text, now()) - '6 mons'::interval month), 'MM'::text) AS month,
    to_char((date_trunc('month'::text, now()) - '6 mons'::interval month), 'yyyy'::text) AS year,
    count(policies.binder_date) AS policies,
    sum(policies.premium) AS premium
   FROM qq.policies
  WHERE ((policies.binder_date >= (date_trunc('month'::text, now()) - '6 mons'::interval month)) AND (policies.binder_date < (date_trunc('month'::text, now()) - '5 mons'::interval month)) AND ((policies.business_type)::text = 'N'::text) AND (((policies.policy_status)::text = 'A'::text) OR ((policies.policy_status)::text = 'C'::text) OR ((policies.policy_status)::text = 'E'::text)) AND (policies.premium > '$1.00'::money))
UNION
 SELECT to_char((date_trunc('month'::text, now()) - '5 mons'::interval month), 'MM'::text) AS month,
    to_char((date_trunc('month'::text, now()) - '5 mons'::interval month), 'yyyy'::text) AS year,
    count(policies.binder_date) AS policies,
    sum(policies.premium) AS premium
   FROM qq.policies
  WHERE ((policies.binder_date >= (date_trunc('month'::text, now()) - '5 mons'::interval month)) AND (policies.binder_date < (date_trunc('month'::text, now()) - '4 mons'::interval month)) AND ((policies.business_type)::text = 'N'::text) AND (((policies.policy_status)::text = 'A'::text) OR ((policies.policy_status)::text = 'C'::text) OR ((policies.policy_status)::text = 'E'::text)) AND (policies.premium > '$1.00'::money))
UNION
 SELECT to_char((date_trunc('month'::text, now()) - '4 mons'::interval month), 'MM'::text) AS month,
    to_char((date_trunc('month'::text, now()) - '4 mons'::interval month), 'yyyy'::text) AS year,
    count(policies.binder_date) AS policies,
    sum(policies.premium) AS premium
   FROM qq.policies
  WHERE ((policies.binder_date >= (date_trunc('month'::text, now()) - '4 mons'::interval month)) AND (policies.binder_date < (date_trunc('month'::text, now()) - '3 mons'::interval month)) AND ((policies.business_type)::text = 'N'::text) AND (((policies.policy_status)::text = 'A'::text) OR ((policies.policy_status)::text = 'C'::text) OR ((policies.policy_status)::text = 'E'::text)) AND (policies.premium > '$1.00'::money))
UNION
 SELECT to_char((date_trunc('month'::text, now()) - '3 mons'::interval month), 'MM'::text) AS month,
    to_char((date_trunc('month'::text, now()) - '3 mons'::interval month), 'yyyy'::text) AS year,
    count(policies.binder_date) AS policies,
    sum(policies.premium) AS premium
   FROM qq.policies
  WHERE ((policies.binder_date >= (date_trunc('month'::text, now()) - '3 mons'::interval month)) AND (policies.binder_date < (date_trunc('month'::text, now()) - '2 mons'::interval month)) AND ((policies.business_type)::text = 'N'::text) AND (((policies.policy_status)::text = 'A'::text) OR ((policies.policy_status)::text = 'C'::text) OR ((policies.policy_status)::text = 'E'::text)) AND (policies.premium > '$1.00'::money))
UNION
 SELECT to_char((date_trunc('month'::text, now()) - '2 mons'::interval month), 'MM'::text) AS month,
    to_char((date_trunc('month'::text, now()) - '2 mons'::interval month), 'yyyy'::text) AS year,
    count(policies.binder_date) AS policies,
    sum(policies.premium) AS premium
   FROM qq.policies
  WHERE ((policies.binder_date >= (date_trunc('month'::text, now()) - '2 mons'::interval month)) AND (policies.binder_date < (date_trunc('month'::text, now()) - '1 mon'::interval month)) AND ((policies.business_type)::text = 'N'::text) AND (((policies.policy_status)::text = 'A'::text) OR ((policies.policy_status)::text = 'C'::text) OR ((policies.policy_status)::text = 'E'::text)) AND (policies.premium > '$1.00'::money))
UNION
 SELECT to_char((date_trunc('month'::text, now()) - '1 mon'::interval month), 'MM'::text) AS month,
    to_char((date_trunc('month'::text, now()) - '1 mon'::interval month), 'yyyy'::text) AS year,
    count(policies.binder_date) AS policies,
    sum(policies.premium) AS premium
   FROM qq.policies
  WHERE ((policies.binder_date >= (date_trunc('month'::text, now()) - '1 mon'::interval month)) AND (policies.binder_date < date_trunc('month'::text, now())) AND ((policies.business_type)::text = 'N'::text) AND (((policies.policy_status)::text = 'A'::text) OR ((policies.policy_status)::text = 'C'::text) OR ((policies.policy_status)::text = 'E'::text)) AND (policies.premium > '$1.00'::money))
UNION
 SELECT to_char(date_trunc('month'::text, now()), 'MM'::text) AS month,
    to_char(date_trunc('month'::text, now()), 'yyyy'::text) AS year,
    count(policies.binder_date) AS policies,
    sum(policies.premium) AS premium
   FROM qq.policies
  WHERE ((policies.binder_date >= date_trunc('month'::text, (CURRENT_DATE)::timestamp with time zone)) AND (policies.binder_date <= now()) AND ((policies.business_type)::text = 'N'::text) AND (((policies.policy_status)::text = 'A'::text) OR ((policies.policy_status)::text = 'C'::text) OR ((policies.policy_status)::text = 'E'::text)) AND (policies.premium > '$1.00'::money))
  ORDER BY 2, 1;


ALTER VIEW intranet.dashboard_sales_last_year_nb OWNER TO postgres;

--
-- Name: dashboard_sales_last_year_rn; Type: VIEW; Schema: intranet; Owner: postgres
--

CREATE VIEW intranet.dashboard_sales_last_year_rn AS
 SELECT to_char((date_trunc('month'::text, now()) - '1 year'::interval month), 'MM'::text) AS month,
    to_char((date_trunc('month'::text, now()) - '1 year'::interval month), 'yyyy'::text) AS year,
    count(policies.binder_date) AS policies,
    sum(policies.premium) AS premium
   FROM qq.policies
  WHERE (((policies.business_type)::text = 'R'::text) AND (policies.binder_date >= (date_trunc('month'::text, now()) - '1 year'::interval month)) AND (policies.lob_id <> 34) AND (policies.lob_id <> 40) AND (policies.binder_date < (date_trunc('month'::text, now()) - '11 mons'::interval month)) AND (((policies.policy_status)::text = 'A'::text) OR ((policies.policy_status)::text = 'C'::text) OR ((policies.policy_status)::text = 'E'::text)) AND (policies.premium > '$1.00'::money))
UNION
 SELECT to_char((date_trunc('month'::text, now()) - '11 mons'::interval month), 'MM'::text) AS month,
    to_char((date_trunc('month'::text, now()) - '11 mons'::interval month), 'yyyy'::text) AS year,
    count(policies.binder_date) AS policies,
    sum(policies.premium) AS premium
   FROM qq.policies
  WHERE (((policies.business_type)::text = 'R'::text) AND (policies.binder_date >= (date_trunc('month'::text, now()) - '11 mons'::interval month)) AND (policies.lob_id <> 34) AND (policies.lob_id <> 40) AND (policies.binder_date < (date_trunc('month'::text, now()) - '10 mons'::interval month)) AND (((policies.policy_status)::text = 'A'::text) OR ((policies.policy_status)::text = 'C'::text) OR ((policies.policy_status)::text = 'E'::text)) AND (policies.premium > '$1.00'::money))
UNION
 SELECT to_char((date_trunc('month'::text, now()) - '10 mons'::interval month), 'MM'::text) AS month,
    to_char((date_trunc('month'::text, now()) - '10 mons'::interval month), 'yyyy'::text) AS year,
    count(policies.binder_date) AS policies,
    sum(policies.premium) AS premium
   FROM qq.policies
  WHERE (((policies.business_type)::text = 'R'::text) AND (policies.binder_date >= (date_trunc('month'::text, now()) - '10 mons'::interval month)) AND (policies.lob_id <> 34) AND (policies.lob_id <> 40) AND (policies.binder_date < (date_trunc('month'::text, now()) - '9 mons'::interval month)) AND (((policies.policy_status)::text = 'A'::text) OR ((policies.policy_status)::text = 'C'::text) OR ((policies.policy_status)::text = 'E'::text)) AND (policies.premium > '$1.00'::money))
UNION
 SELECT to_char((date_trunc('month'::text, now()) - '9 mons'::interval month), 'MM'::text) AS month,
    to_char((date_trunc('month'::text, now()) - '9 mons'::interval month), 'yyyy'::text) AS year,
    count(policies.binder_date) AS policies,
    sum(policies.premium) AS premium
   FROM qq.policies
  WHERE (((policies.business_type)::text = 'R'::text) AND (policies.binder_date >= (date_trunc('month'::text, now()) - '9 mons'::interval month)) AND (policies.lob_id <> 34) AND (policies.lob_id <> 40) AND (policies.binder_date < (date_trunc('month'::text, now()) - '8 mons'::interval month)) AND (((policies.policy_status)::text = 'A'::text) OR ((policies.policy_status)::text = 'C'::text) OR ((policies.policy_status)::text = 'E'::text)) AND (policies.premium > '$1.00'::money))
UNION
 SELECT to_char((date_trunc('month'::text, now()) - '8 mons'::interval month), 'MM'::text) AS month,
    to_char((date_trunc('month'::text, now()) - '8 mons'::interval month), 'yyyy'::text) AS year,
    count(policies.binder_date) AS policies,
    sum(policies.premium) AS premium
   FROM qq.policies
  WHERE (((policies.business_type)::text = 'R'::text) AND (policies.binder_date >= (date_trunc('month'::text, now()) - '8 mons'::interval month)) AND (policies.lob_id <> 34) AND (policies.lob_id <> 40) AND (policies.binder_date < (date_trunc('month'::text, now()) - '7 mons'::interval month)) AND (((policies.policy_status)::text = 'A'::text) OR ((policies.policy_status)::text = 'C'::text) OR ((policies.policy_status)::text = 'E'::text)) AND (policies.premium > '$1.00'::money))
UNION
 SELECT to_char((date_trunc('month'::text, now()) - '7 mons'::interval month), 'MM'::text) AS month,
    to_char((date_trunc('month'::text, now()) - '7 mons'::interval month), 'yyyy'::text) AS year,
    count(policies.binder_date) AS policies,
    sum(policies.premium) AS premium
   FROM qq.policies
  WHERE (((policies.business_type)::text = 'R'::text) AND (policies.binder_date >= (date_trunc('month'::text, now()) - '7 mons'::interval month)) AND (policies.lob_id <> 34) AND (policies.lob_id <> 40) AND (policies.binder_date < (date_trunc('month'::text, now()) - '6 mons'::interval month)) AND (((policies.policy_status)::text = 'A'::text) OR ((policies.policy_status)::text = 'C'::text) OR ((policies.policy_status)::text = 'E'::text)) AND (policies.premium > '$1.00'::money))
UNION
 SELECT to_char((date_trunc('month'::text, now()) - '6 mons'::interval month), 'MM'::text) AS month,
    to_char((date_trunc('month'::text, now()) - '6 mons'::interval month), 'yyyy'::text) AS year,
    count(policies.binder_date) AS policies,
    sum(policies.premium) AS premium
   FROM qq.policies
  WHERE (((policies.business_type)::text = 'R'::text) AND (policies.binder_date >= (date_trunc('month'::text, now()) - '6 mons'::interval month)) AND (policies.lob_id <> 34) AND (policies.lob_id <> 40) AND (policies.binder_date < (date_trunc('month'::text, now()) - '5 mons'::interval month)) AND (((policies.policy_status)::text = 'A'::text) OR ((policies.policy_status)::text = 'C'::text) OR ((policies.policy_status)::text = 'E'::text)) AND (policies.premium > '$1.00'::money))
UNION
 SELECT to_char((date_trunc('month'::text, now()) - '5 mons'::interval month), 'MM'::text) AS month,
    to_char((date_trunc('month'::text, now()) - '5 mons'::interval month), 'yyyy'::text) AS year,
    count(policies.binder_date) AS policies,
    sum(policies.premium) AS premium
   FROM qq.policies
  WHERE (((policies.business_type)::text = 'R'::text) AND (policies.binder_date >= (date_trunc('month'::text, now()) - '5 mons'::interval month)) AND (policies.lob_id <> 34) AND (policies.lob_id <> 40) AND (policies.binder_date < (date_trunc('month'::text, now()) - '4 mons'::interval month)) AND (((policies.policy_status)::text = 'A'::text) OR ((policies.policy_status)::text = 'C'::text) OR ((policies.policy_status)::text = 'E'::text)) AND (policies.premium > '$1.00'::money))
UNION
 SELECT to_char((date_trunc('month'::text, now()) - '4 mons'::interval month), 'MM'::text) AS month,
    to_char((date_trunc('month'::text, now()) - '4 mons'::interval month), 'yyyy'::text) AS year,
    count(policies.binder_date) AS policies,
    sum(policies.premium) AS premium
   FROM qq.policies
  WHERE (((policies.business_type)::text = 'R'::text) AND (policies.binder_date >= (date_trunc('month'::text, now()) - '4 mons'::interval month)) AND (policies.lob_id <> 34) AND (policies.lob_id <> 40) AND (policies.binder_date < (date_trunc('month'::text, now()) - '3 mons'::interval month)) AND (((policies.policy_status)::text = 'A'::text) OR ((policies.policy_status)::text = 'C'::text) OR ((policies.policy_status)::text = 'E'::text)) AND (policies.premium > '$1.00'::money))
UNION
 SELECT to_char((date_trunc('month'::text, now()) - '3 mons'::interval month), 'MM'::text) AS month,
    to_char((date_trunc('month'::text, now()) - '3 mons'::interval month), 'yyyy'::text) AS year,
    count(policies.binder_date) AS policies,
    sum(policies.premium) AS premium
   FROM qq.policies
  WHERE (((policies.business_type)::text = 'R'::text) AND (policies.binder_date >= (date_trunc('month'::text, now()) - '3 mons'::interval month)) AND (policies.lob_id <> 34) AND (policies.lob_id <> 40) AND (policies.binder_date < (date_trunc('month'::text, now()) - '2 mons'::interval month)) AND (((policies.policy_status)::text = 'A'::text) OR ((policies.policy_status)::text = 'C'::text) OR ((policies.policy_status)::text = 'E'::text)) AND (policies.premium > '$1.00'::money))
UNION
 SELECT to_char((date_trunc('month'::text, now()) - '2 mons'::interval month), 'MM'::text) AS month,
    to_char((date_trunc('month'::text, now()) - '2 mons'::interval month), 'yyyy'::text) AS year,
    count(policies.binder_date) AS policies,
    sum(policies.premium) AS premium
   FROM qq.policies
  WHERE (((policies.business_type)::text = 'R'::text) AND (policies.binder_date >= (date_trunc('month'::text, now()) - '2 mons'::interval month)) AND (policies.lob_id <> 34) AND (policies.lob_id <> 40) AND (policies.binder_date < (date_trunc('month'::text, now()) - '1 mon'::interval month)) AND (((policies.policy_status)::text = 'A'::text) OR ((policies.policy_status)::text = 'C'::text) OR ((policies.policy_status)::text = 'E'::text)) AND (policies.premium > '$1.00'::money))
UNION
 SELECT to_char((date_trunc('month'::text, now()) - '1 mon'::interval month), 'MM'::text) AS month,
    to_char((date_trunc('month'::text, now()) - '1 mon'::interval month), 'yyyy'::text) AS year,
    count(policies.binder_date) AS policies,
    sum(policies.premium) AS premium
   FROM qq.policies
  WHERE (((policies.business_type)::text = 'R'::text) AND (policies.binder_date >= (date_trunc('month'::text, now()) - '1 mon'::interval month)) AND (policies.lob_id <> 34) AND (policies.lob_id <> 40) AND (policies.binder_date < date_trunc('month'::text, now())) AND (((policies.policy_status)::text = 'A'::text) OR ((policies.policy_status)::text = 'C'::text) OR ((policies.policy_status)::text = 'E'::text)) AND (policies.premium > '$1.00'::money))
UNION
 SELECT to_char(date_trunc('month'::text, now()), 'MM'::text) AS month,
    to_char(date_trunc('month'::text, now()), 'yyyy'::text) AS year,
    count(policies.binder_date) AS policies,
    sum(policies.premium) AS premium
   FROM qq.policies
  WHERE (((policies.business_type)::text = 'R'::text) AND (policies.binder_date >= date_trunc('month'::text, (CURRENT_DATE)::timestamp with time zone)) AND (policies.lob_id <> 34) AND (policies.lob_id <> 40) AND (policies.binder_date <= now()) AND (((policies.policy_status)::text = 'A'::text) OR ((policies.policy_status)::text = 'C'::text) OR ((policies.policy_status)::text = 'Expired'::text)) AND (policies.premium > '$1.00'::money))
  ORDER BY 2, 1;


ALTER VIEW intranet.dashboard_sales_last_year_rn OWNER TO postgres;

--
-- Name: dashboard_sales_last_year_rw; Type: VIEW; Schema: intranet; Owner: postgres
--

CREATE VIEW intranet.dashboard_sales_last_year_rw AS
 SELECT to_char((date_trunc('month'::text, now()) - '1 year'::interval month), 'MM'::text) AS month,
    to_char((date_trunc('month'::text, now()) - '1 year'::interval month), 'yyyy'::text) AS year,
    count(policies.binder_date) AS policies,
    sum(policies.premium) AS premium
   FROM qq.policies
  WHERE (((policies.business_type)::text = 'W'::text) AND (policies.binder_date >= (date_trunc('month'::text, now()) - '1 year'::interval month)) AND (policies.lob_id <> 34) AND (policies.lob_id <> 40) AND (policies.binder_date < (date_trunc('month'::text, now()) - '11 mons'::interval month)) AND (((policies.policy_status)::text = 'A'::text) OR ((policies.policy_status)::text = 'C'::text) OR ((policies.policy_status)::text = 'E'::text)) AND (policies.premium > '$1.00'::money))
UNION
 SELECT to_char((date_trunc('month'::text, now()) - '11 mons'::interval month), 'MM'::text) AS month,
    to_char((date_trunc('month'::text, now()) - '11 mons'::interval month), 'yyyy'::text) AS year,
    count(policies.binder_date) AS policies,
    sum(policies.premium) AS premium
   FROM qq.policies
  WHERE (((policies.business_type)::text = 'W'::text) AND (policies.binder_date >= (date_trunc('month'::text, now()) - '11 mons'::interval month)) AND (policies.lob_id <> 34) AND (policies.lob_id <> 40) AND (policies.binder_date < (date_trunc('month'::text, now()) - '10 mons'::interval month)) AND (((policies.policy_status)::text = 'A'::text) OR ((policies.policy_status)::text = 'C'::text) OR ((policies.policy_status)::text = 'E'::text)) AND (policies.premium > '$1.00'::money))
UNION
 SELECT to_char((date_trunc('month'::text, now()) - '10 mons'::interval month), 'MM'::text) AS month,
    to_char((date_trunc('month'::text, now()) - '10 mons'::interval month), 'yyyy'::text) AS year,
    count(policies.binder_date) AS policies,
    sum(policies.premium) AS premium
   FROM qq.policies
  WHERE (((policies.business_type)::text = 'W'::text) AND (policies.binder_date >= (date_trunc('month'::text, now()) - '10 mons'::interval month)) AND (policies.lob_id <> 34) AND (policies.lob_id <> 40) AND (policies.binder_date < (date_trunc('month'::text, now()) - '9 mons'::interval month)) AND (((policies.policy_status)::text = 'A'::text) OR ((policies.policy_status)::text = 'C'::text) OR ((policies.policy_status)::text = 'E'::text)) AND (policies.premium > '$1.00'::money))
UNION
 SELECT to_char((date_trunc('month'::text, now()) - '9 mons'::interval month), 'MM'::text) AS month,
    to_char((date_trunc('month'::text, now()) - '9 mons'::interval month), 'yyyy'::text) AS year,
    count(policies.binder_date) AS policies,
    sum(policies.premium) AS premium
   FROM qq.policies
  WHERE (((policies.business_type)::text = 'W'::text) AND (policies.binder_date >= (date_trunc('month'::text, now()) - '9 mons'::interval month)) AND (policies.lob_id <> 34) AND (policies.lob_id <> 40) AND (policies.binder_date < (date_trunc('month'::text, now()) - '8 mons'::interval month)) AND (((policies.policy_status)::text = 'A'::text) OR ((policies.policy_status)::text = 'C'::text) OR ((policies.policy_status)::text = 'E'::text)) AND (policies.premium > '$1.00'::money))
UNION
 SELECT to_char((date_trunc('month'::text, now()) - '8 mons'::interval month), 'MM'::text) AS month,
    to_char((date_trunc('month'::text, now()) - '8 mons'::interval month), 'yyyy'::text) AS year,
    count(policies.binder_date) AS policies,
    sum(policies.premium) AS premium
   FROM qq.policies
  WHERE (((policies.business_type)::text = 'W'::text) AND (policies.binder_date >= (date_trunc('month'::text, now()) - '8 mons'::interval month)) AND (policies.lob_id <> 34) AND (policies.lob_id <> 40) AND (policies.binder_date < (date_trunc('month'::text, now()) - '7 mons'::interval month)) AND (((policies.policy_status)::text = 'A'::text) OR ((policies.policy_status)::text = 'C'::text) OR ((policies.policy_status)::text = 'E'::text)) AND (policies.premium > '$1.00'::money))
UNION
 SELECT to_char((date_trunc('month'::text, now()) - '7 mons'::interval month), 'MM'::text) AS month,
    to_char((date_trunc('month'::text, now()) - '7 mons'::interval month), 'yyyy'::text) AS year,
    count(policies.binder_date) AS policies,
    sum(policies.premium) AS premium
   FROM qq.policies
  WHERE (((policies.business_type)::text = 'W'::text) AND (policies.binder_date >= (date_trunc('month'::text, now()) - '7 mons'::interval month)) AND (policies.lob_id <> 34) AND (policies.lob_id <> 40) AND (policies.binder_date < (date_trunc('month'::text, now()) - '6 mons'::interval month)) AND (((policies.policy_status)::text = 'A'::text) OR ((policies.policy_status)::text = 'C'::text) OR ((policies.policy_status)::text = 'E'::text)) AND (policies.premium > '$1.00'::money))
UNION
 SELECT to_char((date_trunc('month'::text, now()) - '6 mons'::interval month), 'MM'::text) AS month,
    to_char((date_trunc('month'::text, now()) - '6 mons'::interval month), 'yyyy'::text) AS year,
    count(policies.binder_date) AS policies,
    sum(policies.premium) AS premium
   FROM qq.policies
  WHERE (((policies.business_type)::text = 'W'::text) AND (policies.binder_date >= (date_trunc('month'::text, now()) - '6 mons'::interval month)) AND (policies.lob_id <> 34) AND (policies.lob_id <> 40) AND (policies.binder_date < (date_trunc('month'::text, now()) - '5 mons'::interval month)) AND (((policies.policy_status)::text = 'A'::text) OR ((policies.policy_status)::text = 'C'::text) OR ((policies.policy_status)::text = 'E'::text)) AND (policies.premium > '$1.00'::money))
UNION
 SELECT to_char((date_trunc('month'::text, now()) - '5 mons'::interval month), 'MM'::text) AS month,
    to_char((date_trunc('month'::text, now()) - '5 mons'::interval month), 'yyyy'::text) AS year,
    count(policies.binder_date) AS policies,
    sum(policies.premium) AS premium
   FROM qq.policies
  WHERE (((policies.business_type)::text = 'W'::text) AND (policies.binder_date >= (date_trunc('month'::text, now()) - '5 mons'::interval month)) AND (policies.lob_id <> 34) AND (policies.lob_id <> 40) AND (policies.binder_date < (date_trunc('month'::text, now()) - '4 mons'::interval month)) AND (((policies.policy_status)::text = 'A'::text) OR ((policies.policy_status)::text = 'C'::text) OR ((policies.policy_status)::text = 'E'::text)) AND (policies.premium > '$1.00'::money))
UNION
 SELECT to_char((date_trunc('month'::text, now()) - '4 mons'::interval month), 'MM'::text) AS month,
    to_char((date_trunc('month'::text, now()) - '4 mons'::interval month), 'yyyy'::text) AS year,
    count(policies.binder_date) AS policies,
    sum(policies.premium) AS premium
   FROM qq.policies
  WHERE (((policies.business_type)::text = 'W'::text) AND (policies.binder_date >= (date_trunc('month'::text, now()) - '4 mons'::interval month)) AND (policies.lob_id <> 34) AND (policies.lob_id <> 40) AND (policies.binder_date < (date_trunc('month'::text, now()) - '3 mons'::interval month)) AND (((policies.policy_status)::text = 'A'::text) OR ((policies.policy_status)::text = 'C'::text) OR ((policies.policy_status)::text = 'E'::text)) AND (policies.premium > '$1.00'::money))
UNION
 SELECT to_char((date_trunc('month'::text, now()) - '3 mons'::interval month), 'MM'::text) AS month,
    to_char((date_trunc('month'::text, now()) - '3 mons'::interval month), 'yyyy'::text) AS year,
    count(policies.binder_date) AS policies,
    sum(policies.premium) AS premium
   FROM qq.policies
  WHERE (((policies.business_type)::text = 'W'::text) AND (policies.binder_date >= (date_trunc('month'::text, now()) - '3 mons'::interval month)) AND (policies.lob_id <> 34) AND (policies.lob_id <> 40) AND (policies.binder_date < (date_trunc('month'::text, now()) - '2 mons'::interval month)) AND (((policies.policy_status)::text = 'A'::text) OR ((policies.policy_status)::text = 'C'::text) OR ((policies.policy_status)::text = 'E'::text)) AND (policies.premium > '$1.00'::money))
UNION
 SELECT to_char((date_trunc('month'::text, now()) - '2 mons'::interval month), 'MM'::text) AS month,
    to_char((date_trunc('month'::text, now()) - '2 mons'::interval month), 'yyyy'::text) AS year,
    count(policies.binder_date) AS policies,
    sum(policies.premium) AS premium
   FROM qq.policies
  WHERE (((policies.business_type)::text = 'W'::text) AND (policies.binder_date >= (date_trunc('month'::text, now()) - '2 mons'::interval month)) AND (policies.lob_id <> 34) AND (policies.lob_id <> 40) AND (policies.binder_date < (date_trunc('month'::text, now()) - '1 mon'::interval month)) AND (((policies.policy_status)::text = 'A'::text) OR ((policies.policy_status)::text = 'C'::text) OR ((policies.policy_status)::text = 'E'::text)) AND (policies.premium > '$1.00'::money))
UNION
 SELECT to_char((date_trunc('month'::text, now()) - '1 mon'::interval month), 'MM'::text) AS month,
    to_char((date_trunc('month'::text, now()) - '1 mon'::interval month), 'yyyy'::text) AS year,
    count(policies.binder_date) AS policies,
    sum(policies.premium) AS premium
   FROM qq.policies
  WHERE (((policies.business_type)::text = 'W'::text) AND (policies.binder_date >= (date_trunc('month'::text, now()) - '1 mon'::interval month)) AND (policies.lob_id <> 34) AND (policies.lob_id <> 40) AND (policies.binder_date < date_trunc('month'::text, now())) AND (((policies.policy_status)::text = 'A'::text) OR ((policies.policy_status)::text = 'C'::text) OR ((policies.policy_status)::text = 'E'::text)) AND (policies.premium > '$1.00'::money))
UNION
 SELECT to_char(date_trunc('month'::text, now()), 'MM'::text) AS month,
    to_char(date_trunc('month'::text, now()), 'yyyy'::text) AS year,
    count(policies.binder_date) AS policies,
    sum(policies.premium) AS premium
   FROM qq.policies
  WHERE (((policies.business_type)::text = 'W'::text) AND (policies.binder_date >= date_trunc('month'::text, (CURRENT_DATE)::timestamp with time zone)) AND (policies.lob_id <> 34) AND (policies.lob_id <> 40) AND (policies.binder_date <= now()) AND (((policies.policy_status)::text = 'A'::text) OR ((policies.policy_status)::text = 'C'::text) OR ((policies.policy_status)::text = 'E'::text)) AND (policies.premium > '$1.00'::money))
  ORDER BY 2, 1;


ALTER VIEW intranet.dashboard_sales_last_year_rw OWNER TO postgres;

--
-- Name: dashboard_sales_nb_last_quarter; Type: VIEW; Schema: intranet; Owner: postgres
--

CREATE VIEW intranet.dashboard_sales_nb_last_quarter AS
 SELECT to_char((date_trunc('month'::text, now()) - '6 mons'::interval month), 'MM'::text) AS month,
    to_char((date_trunc('month'::text, now()) - '6 mons'::interval month), 'yyyy'::text) AS year,
    count(policies.binder_date) AS polnb,
    sum(policies.premium) AS premnb
   FROM qq.policies
  WHERE (((policies.business_type)::text = 'N'::text) AND (policies.binder_date >= (date_trunc('month'::text, now()) - '6 mons'::interval month)) AND (policies.binder_date < (date_trunc('month'::text, now()) - '5 mons'::interval month)) AND ((policies.policy_status)::text !~~ '%D%'::text) AND ((policies.policy_status)::text !~~ '%V%'::text) AND (policies.lob_id <> 34) AND (policies.lob_id <> 40) AND (policies.premium > '$1.00'::money))
UNION
 SELECT to_char((date_trunc('month'::text, now()) - '5 mons'::interval month), 'MM'::text) AS month,
    to_char((date_trunc('month'::text, now()) - '5 mons'::interval month), 'yyyy'::text) AS year,
    count(policies.binder_date) AS polnb,
    sum(policies.premium) AS premnb
   FROM qq.policies
  WHERE (((policies.business_type)::text = 'N'::text) AND (policies.binder_date >= (date_trunc('month'::text, now()) - '5 mons'::interval month)) AND (policies.binder_date < (date_trunc('month'::text, now()) - '4 mons'::interval month)) AND ((policies.policy_status)::text !~~ '%D%'::text) AND ((policies.policy_status)::text !~~ '%V%'::text) AND (policies.lob_id <> 34) AND (policies.lob_id <> 40) AND (policies.premium > '$1.00'::money))
UNION
 SELECT to_char((date_trunc('month'::text, now()) - '4 mons'::interval month), 'MM'::text) AS month,
    to_char((date_trunc('month'::text, now()) - '4 mons'::interval month), 'yyyy'::text) AS year,
    count(policies.binder_date) AS polnb,
    sum(policies.premium) AS premnb
   FROM qq.policies
  WHERE (((policies.business_type)::text = 'N'::text) AND (policies.binder_date >= (date_trunc('month'::text, now()) - '4 mons'::interval month)) AND (policies.binder_date < (date_trunc('month'::text, now()) - '3 mons'::interval month)) AND ((policies.policy_status)::text !~~ '%D%'::text) AND ((policies.policy_status)::text !~~ '%V%'::text) AND (policies.lob_id <> 34) AND (policies.lob_id <> 40) AND (policies.premium > '$1.00'::money))
UNION
 SELECT to_char((date_trunc('month'::text, now()) - '3 mons'::interval month), 'MM'::text) AS month,
    to_char((date_trunc('month'::text, now()) - '3 mons'::interval month), 'yyyy'::text) AS year,
    count(policies.binder_date) AS polnb,
    sum(policies.premium) AS premnb
   FROM qq.policies
  WHERE (((policies.business_type)::text = 'N'::text) AND (policies.binder_date >= (date_trunc('month'::text, now()) - '3 mons'::interval month)) AND (policies.binder_date < (date_trunc('month'::text, now()) - '2 mons'::interval month)) AND ((policies.policy_status)::text !~~ '%D%'::text) AND ((policies.policy_status)::text !~~ '%V%'::text) AND (policies.lob_id <> 34) AND (policies.lob_id <> 40) AND (policies.premium > '$1.00'::money))
UNION
 SELECT to_char((date_trunc('month'::text, now()) - '2 mons'::interval month), 'MM'::text) AS month,
    to_char((date_trunc('month'::text, now()) - '2 mons'::interval month), 'yyyy'::text) AS year,
    count(policies.binder_date) AS polnb,
    sum(policies.premium) AS premnb
   FROM qq.policies
  WHERE (((policies.business_type)::text = 'N'::text) AND (policies.binder_date >= (date_trunc('month'::text, now()) - '2 mons'::interval month)) AND (policies.binder_date < (date_trunc('month'::text, now()) - '1 mon'::interval month)) AND ((policies.policy_status)::text !~~ '%D%'::text) AND ((policies.policy_status)::text !~~ '%V%'::text) AND (policies.lob_id <> 34) AND (policies.lob_id <> 40) AND (policies.premium > '$1.00'::money))
UNION
 SELECT to_char((date_trunc('month'::text, now()) - '1 mon'::interval month), 'MM'::text) AS month,
    to_char((date_trunc('month'::text, now()) - '1 mon'::interval month), 'yyyy'::text) AS year,
    count(policies.binder_date) AS polnb,
    sum(policies.premium) AS premnb
   FROM qq.policies
  WHERE (((policies.business_type)::text = 'N'::text) AND (policies.binder_date >= (date_trunc('month'::text, now()) - '1 mon'::interval month)) AND (policies.binder_date < date_trunc('month'::text, now())) AND ((policies.policy_status)::text !~~ '%D%'::text) AND ((policies.policy_status)::text !~~ '%V%'::text) AND (policies.lob_id <> 34) AND (policies.lob_id <> 40) AND (policies.premium > '$1.00'::money))
  ORDER BY 2, 1;


ALTER VIEW intranet.dashboard_sales_nb_last_quarter OWNER TO postgres;

--
-- Name: dashboard_sales_nb_last_week; Type: VIEW; Schema: intranet; Owner: postgres
--

CREATE VIEW intranet.dashboard_sales_nb_last_week AS
 SELECT lw.policies AS lastwpol,
    lw.premium AS lastwpre,
    llw.policies AS lastlwpol,
    llw.premium AS lastlwpre,
    (round(((((lw.policies)::double precision / (llw.policies)::double precision) * (100)::double precision))::numeric, 1) - (100)::numeric) AS polper,
    (round((((lw.premium / llw.premium) * (100)::double precision))::numeric, 1) - (100)::numeric) AS premper
   FROM ( SELECT count(policies.binder_date) AS policies,
            sum(policies.premium) AS premium
           FROM qq.policies
          WHERE ((policies.binder_date >= (date_trunc('week'::text, now()) - '7 days'::interval)) AND (policies.binder_date < date_trunc('week'::text, now())) AND (((policies.policy_status)::text = 'A'::text) OR ((policies.policy_status)::text = 'C'::text) OR ((policies.policy_status)::text = 'E'::text)) AND ((policies.business_type)::text = 'N'::text) AND (policies.premium > '$1.00'::money))) lw,
    ( SELECT count(policies.binder_date) AS policies,
            sum(policies.premium) AS premium
           FROM qq.policies
          WHERE ((policies.binder_date >= (date_trunc('week'::text, now()) - '14 days'::interval)) AND (policies.binder_date < (date_trunc('week'::text, now()) - '7 days'::interval)) AND (((policies.policy_status)::text = 'A'::text) OR ((policies.policy_status)::text = 'C'::text) OR ((policies.policy_status)::text = 'E'::text)) AND ((policies.business_type)::text = 'N'::text) AND (policies.premium > '$1.00'::money))) llw;


ALTER VIEW intranet.dashboard_sales_nb_last_week OWNER TO postgres;

--
-- Name: dashboard_sales_nb_week; Type: VIEW; Schema: intranet; Owner: postgres
--

CREATE VIEW intranet.dashboard_sales_nb_week AS
 SELECT date_trunc('week'::text, now()) AS date,
    count(policies.binder_date) AS policies,
    sum(policies.premium) AS premium
   FROM qq.policies
  WHERE ((policies.lob_id <> 34) AND (policies.lob_id <> 40) AND (policies.binder_date = date_trunc('week'::text, now())) AND (((policies.policy_status)::text = 'C'::text) OR ((policies.policy_status)::text = 'A'::text) OR ((policies.policy_status)::text = 'E'::text)) AND ((policies.business_type)::text = 'N'::text) AND (policies.premium > '$1.00'::money))
UNION
 SELECT (date_trunc('week'::text, now()) + '1 day'::interval) AS date,
    count(policies.binder_date) AS policies,
    sum(policies.premium) AS premium
   FROM qq.policies
  WHERE ((policies.lob_id <> 34) AND (policies.lob_id <> 40) AND (policies.binder_date = (date_trunc('week'::text, now()) + '1 day'::interval)) AND (((policies.policy_status)::text = 'C'::text) OR ((policies.policy_status)::text = 'A'::text) OR ((policies.policy_status)::text = 'E'::text)) AND ((policies.business_type)::text = 'N'::text) AND (policies.premium > '$1.00'::money))
UNION
 SELECT (date_trunc('week'::text, now()) + '2 days'::interval) AS date,
    count(policies.binder_date) AS policies,
    sum(policies.premium) AS premium
   FROM qq.policies
  WHERE ((policies.lob_id <> 34) AND (policies.lob_id <> 40) AND (policies.binder_date = (date_trunc('week'::text, now()) + '2 days'::interval)) AND (((policies.policy_status)::text = 'C'::text) OR ((policies.policy_status)::text = 'A'::text) OR ((policies.policy_status)::text = 'E'::text)) AND ((policies.business_type)::text = 'N'::text) AND (policies.premium > '$1.00'::money))
UNION
 SELECT (date_trunc('week'::text, now()) + '3 days'::interval) AS date,
    count(policies.binder_date) AS policies,
    sum(policies.premium) AS premium
   FROM qq.policies
  WHERE ((policies.lob_id <> 34) AND (policies.lob_id <> 40) AND (policies.binder_date = (date_trunc('week'::text, now()) + '3 days'::interval)) AND (((policies.policy_status)::text = 'C'::text) OR ((policies.policy_status)::text = 'A'::text) OR ((policies.policy_status)::text = 'E'::text)) AND ((policies.business_type)::text = 'N'::text) AND (policies.premium > '$1.00'::money))
UNION
 SELECT (date_trunc('week'::text, now()) + '4 days'::interval) AS date,
    count(policies.binder_date) AS policies,
    sum(policies.premium) AS premium
   FROM qq.policies
  WHERE ((policies.lob_id <> 34) AND (policies.lob_id <> 40) AND (policies.binder_date = (date_trunc('week'::text, now()) + '4 days'::interval)) AND (((policies.policy_status)::text = 'C'::text) OR ((policies.policy_status)::text = 'A'::text) OR ((policies.policy_status)::text = 'E'::text)) AND ((policies.business_type)::text = 'N'::text) AND (policies.premium > '$1.00'::money))
UNION
 SELECT (date_trunc('week'::text, now()) + '5 days'::interval) AS date,
    count(policies.binder_date) AS policies,
    sum(policies.premium) AS premium
   FROM qq.policies
  WHERE ((policies.lob_id <> 34) AND (policies.lob_id <> 40) AND (policies.binder_date = (date_trunc('week'::text, now()) + '5 days'::interval)) AND (((policies.policy_status)::text = 'C'::text) OR ((policies.policy_status)::text = 'A'::text) OR ((policies.policy_status)::text = 'E'::text)) AND ((policies.business_type)::text = 'N'::text) AND (policies.premium > '$1.00'::money))
UNION
 SELECT (date_trunc('week'::text, now()) + '6 days'::interval) AS date,
    count(policies.binder_date) AS policies,
    sum(policies.premium) AS premium
   FROM qq.policies
  WHERE ((policies.lob_id <> 34) AND (policies.lob_id <> 40) AND (policies.binder_date = (date_trunc('week'::text, now()) + '6 days'::interval)) AND (((policies.policy_status)::text = 'C'::text) OR ((policies.policy_status)::text = 'A'::text) OR ((policies.policy_status)::text = 'E'::text)) AND ((policies.business_type)::text = 'N'::text) AND (policies.premium > '$1.00'::money))
  ORDER BY 1;


ALTER VIEW intranet.dashboard_sales_nb_week OWNER TO postgres;

--
-- Name: franchise_cache; Type: TABLE; Schema: intranet; Owner: postgres
--

CREATE TABLE intranet.franchise_cache (
    date1 date NOT NULL,
    location_id integer NOT NULL,
    franchise text NOT NULL,
    premium numeric NOT NULL,
    policies bigint NOT NULL,
    renewed_premium numeric NOT NULL,
    renewed_policies bigint NOT NULL,
    lost_premium numeric NOT NULL,
    lost_policies bigint NOT NULL,
    renewed_percent numeric NOT NULL,
    max_percent numeric NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE intranet.franchise_cache OWNER TO postgres;

--
-- Name: goals; Type: TABLE; Schema: intranet; Owner: postgres
--

CREATE TABLE intranet.goals (
    id integer NOT NULL,
    goal_amount numeric(18,2) NOT NULL,
    changed_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE intranet.goals OWNER TO postgres;

--
-- Name: goals_id_seq; Type: SEQUENCE; Schema: intranet; Owner: postgres
--

CREATE SEQUENCE intranet.goals_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE intranet.goals_id_seq OWNER TO postgres;

--
-- Name: goals_id_seq; Type: SEQUENCE OWNED BY; Schema: intranet; Owner: postgres
--

ALTER SEQUENCE intranet.goals_id_seq OWNED BY intranet.goals.id;


--
-- Name: kpi_refresh_jobs; Type: TABLE; Schema: intranet; Owner: postgres
--

CREATE TABLE intranet.kpi_refresh_jobs (
    id bigint NOT NULL,
    date1 date NOT NULL,
    status text DEFAULT 'queued'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    started_at timestamp with time zone,
    finished_at timestamp with time zone,
    last_error text
);


ALTER TABLE intranet.kpi_refresh_jobs OWNER TO postgres;

--
-- Name: kpi_refresh_jobs_id_seq; Type: SEQUENCE; Schema: intranet; Owner: postgres
--

CREATE SEQUENCE intranet.kpi_refresh_jobs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE intranet.kpi_refresh_jobs_id_seq OWNER TO postgres;

--
-- Name: kpi_refresh_jobs_id_seq; Type: SEQUENCE OWNED BY; Schema: intranet; Owner: postgres
--

ALTER SEQUENCE intranet.kpi_refresh_jobs_id_seq OWNED BY intranet.kpi_refresh_jobs.id;


--
-- Name: licensed; Type: TABLE; Schema: intranet; Owner: postgres
--

CREATE TABLE intranet.licensed (
    licensed_agent_id integer NOT NULL,
    user_id character varying NOT NULL,
    display_name character varying,
    mail character varying,
    job_title character varying,
    license_number character varying NOT NULL,
    issue_date date NOT NULL,
    exp_date date NOT NULL,
    active boolean DEFAULT true NOT NULL,
    location_id integer,
    updated_at timestamp without time zone DEFAULT now(),
    updated_by_display_name character varying,
    updated_by_user_id character varying
);


ALTER TABLE intranet.licensed OWNER TO postgres;

--
-- Name: TABLE licensed; Type: COMMENT; Schema: intranet; Owner: postgres
--

COMMENT ON TABLE intranet.licensed IS 'Agentes con licencia para vender pólizas de seguros';


--
-- Name: COLUMN licensed.license_number; Type: COMMENT; Schema: intranet; Owner: postgres
--

COMMENT ON COLUMN intranet.licensed.license_number IS 'Número de licencia del agente';


--
-- Name: COLUMN licensed.issue_date; Type: COMMENT; Schema: intranet; Owner: postgres
--

COMMENT ON COLUMN intranet.licensed.issue_date IS 'Fecha de emisión de la licencia';


--
-- Name: COLUMN licensed.exp_date; Type: COMMENT; Schema: intranet; Owner: postgres
--

COMMENT ON COLUMN intranet.licensed.exp_date IS 'Fecha de expiración de la licencia';


--
-- Name: COLUMN licensed.active; Type: COMMENT; Schema: intranet; Owner: postgres
--

COMMENT ON COLUMN intranet.licensed.active IS 'Estado de la licencia: true=activo, false=inactivo';


--
-- Name: COLUMN licensed.location_id; Type: COMMENT; Schema: intranet; Owner: postgres
--

COMMENT ON COLUMN intranet.licensed.location_id IS 'ID de la ubicación del agente (relacionada con la tabla qq.locations)';


--
-- Name: COLUMN licensed.updated_by_display_name; Type: COMMENT; Schema: intranet; Owner: postgres
--

COMMENT ON COLUMN intranet.licensed.updated_by_display_name IS 'Nombre visible del usuario que realizó la última operación (inserción o actualización)';


--
-- Name: COLUMN licensed.updated_by_user_id; Type: COMMENT; Schema: intranet; Owner: postgres
--

COMMENT ON COLUMN intranet.licensed.updated_by_user_id IS 'ID del usuario que realizó la última operación (inserción o actualización)';


--
-- Name: licensed_licensed_agent_id_seq; Type: SEQUENCE; Schema: intranet; Owner: postgres
--

ALTER TABLE intranet.licensed ALTER COLUMN licensed_agent_id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME intranet.licensed_licensed_agent_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: mail; Type: TABLE; Schema: intranet; Owner: postgres
--

CREATE TABLE intranet.mail (
    user_id character varying NOT NULL,
    display_name character varying,
    mail character varying,
    location_id integer
);


ALTER TABLE intranet.mail OWNER TO postgres;

--
-- Name: nbtv_total_sales_month; Type: VIEW; Schema: intranet; Owner: postgres
--

CREATE VIEW intranet.nbtv_total_sales_month AS
 SELECT
        CASE
            WHEN (sum(premium) IS NULL) THEN '$0.00'::money
            ELSE sum(premium)
        END AS premium,
    count(binder_date) AS policies
   FROM qq.policies
  WHERE ((binder_date >= date_trunc('month'::text, (CURRENT_DATE)::timestamp with time zone)) AND (binder_date <= CURRENT_DATE) AND (((policy_status)::text = 'A'::text) OR ((policy_status)::text = 'C'::text) OR ((policy_status)::text = 'E'::text)) AND (premium > '$1.00'::money) AND (lob_id <> 34) AND (lob_id <> 40));


ALTER VIEW intranet.nbtv_total_sales_month OWNER TO postgres;

--
-- Name: renewals_table; Type: VIEW; Schema: intranet; Owner: postgres
--

CREATE VIEW intranet.renewals_table AS
 SELECT p.policy_number,
    p.exp_date,
    p.premium,
    c.display_name AS customer_name,
    carrier.display_name AS carrier_name,
    lob.display_name AS line_of_business,
    csr.display_name AS csr_name,
    producer.display_name AS producer_name,
    csr.location_id,
    l.alias AS location_alias
   FROM (((((((qq.policies p
     JOIN qq.contacts c ON ((p.customer_id = c.entity_id)))
     JOIN qq.contacts carrier ON ((p.carrier_id = carrier.entity_id)))
     JOIN qq.lob lob ON ((p.lob_id = lob.lob_id)))
     JOIN qq.contacts csr ON ((p.csr_id = csr.entity_id)))
     CROSS JOIN LATERAL unnest(p.producer_ids) producer_id(producer_id))
     JOIN qq.contacts producer ON ((producer.entity_id = producer_id.producer_id)))
     JOIN qq.locations l ON ((csr.location_id = l.location_id)))
  WHERE ((p.exp_date >= date_trunc('month'::text, now())) AND (p.exp_date < (date_trunc('month'::text, now()) + '3 mons'::interval)))
  ORDER BY p.exp_date;


ALTER VIEW intranet.renewals_table OWNER TO postgres;

--
-- Name: renewals_table_per_month; Type: VIEW; Schema: intranet; Owner: postgres
--

CREATE VIEW intranet.renewals_table_per_month AS
 SELECT p.policy_number,
    p.exp_date,
    p.premium,
    c.display_name AS customer_name,
    c.phone AS customer_phone,
    c.email AS customer_email,
    carrier.display_name AS carrier_name,
    lob.display_name AS line_of_business,
    csr.display_name AS csr_name,
    producer.display_name AS producer_name,
    (EXISTS ( SELECT 1
           FROM qq.policies r
          WHERE ((r.prior_policy_id = p.policy_id) AND ((r.business_type)::text = ANY ((ARRAY['R'::character varying, 'W'::character varying])::text[]))))) AS renovada
   FROM ((((((qq.policies p
     JOIN qq.contacts c ON ((p.customer_id = c.entity_id)))
     JOIN qq.contacts carrier ON ((p.carrier_id = carrier.entity_id)))
     JOIN qq.lob lob ON ((p.lob_id = lob.lob_id)))
     JOIN qq.contacts csr ON ((p.csr_id = csr.entity_id)))
     CROSS JOIN LATERAL unnest(p.producer_ids) producer_id(producer_id))
     JOIN qq.contacts producer ON ((producer.entity_id = producer_id.producer_id)))
  WHERE ((p.exp_date >= date_trunc('month'::text, (p.exp_date)::timestamp with time zone)) AND (p.exp_date < (date_trunc('month'::text, (p.exp_date)::timestamp with time zone) + '1 mon'::interval)));


ALTER VIEW intranet.renewals_table_per_month OWNER TO postgres;

--
-- Name: goals id; Type: DEFAULT; Schema: intranet; Owner: postgres
--

ALTER TABLE ONLY intranet.goals ALTER COLUMN id SET DEFAULT nextval('intranet.goals_id_seq'::regclass);


--
-- Name: kpi_refresh_jobs id; Type: DEFAULT; Schema: intranet; Owner: postgres
--

ALTER TABLE ONLY intranet.kpi_refresh_jobs ALTER COLUMN id SET DEFAULT nextval('intranet.kpi_refresh_jobs_id_seq'::regclass);


--
-- Name: code code_pkey; Type: CONSTRAINT; Schema: intranet; Owner: postgres
--

ALTER TABLE ONLY intranet.code
    ADD CONSTRAINT code_pkey PRIMARY KEY (agency, company, code, location_id);


--
-- Name: contact_email_checks contact_email_checks_pkey; Type: CONSTRAINT; Schema: intranet; Owner: postgres
--

ALTER TABLE ONLY intranet.contact_email_checks
    ADD CONSTRAINT contact_email_checks_pkey PRIMARY KEY (contact_id);


--
-- Name: franchise_cache franchise_cache_pkey; Type: CONSTRAINT; Schema: intranet; Owner: postgres
--

ALTER TABLE ONLY intranet.franchise_cache
    ADD CONSTRAINT franchise_cache_pkey PRIMARY KEY (date1, location_id);


--
-- Name: goals goals_pkey; Type: CONSTRAINT; Schema: intranet; Owner: postgres
--

ALTER TABLE ONLY intranet.goals
    ADD CONSTRAINT goals_pkey PRIMARY KEY (id);


--
-- Name: kpi_refresh_jobs kpi_refresh_jobs_pkey; Type: CONSTRAINT; Schema: intranet; Owner: postgres
--

ALTER TABLE ONLY intranet.kpi_refresh_jobs
    ADD CONSTRAINT kpi_refresh_jobs_pkey PRIMARY KEY (id);


--
-- Name: licensed licensed_pkey; Type: CONSTRAINT; Schema: intranet; Owner: postgres
--

ALTER TABLE ONLY intranet.licensed
    ADD CONSTRAINT licensed_pkey PRIMARY KEY (licensed_agent_id);


--
-- Name: mail mail_pkey; Type: CONSTRAINT; Schema: intranet; Owner: postgres
--

ALTER TABLE ONLY intranet.mail
    ADD CONSTRAINT mail_pkey PRIMARY KEY (user_id);


--
-- Name: franchise_cache_date1_idx; Type: INDEX; Schema: intranet; Owner: postgres
--

CREATE INDEX franchise_cache_date1_idx ON intranet.franchise_cache USING btree (date1);


--
-- Name: idx_contact_email_checks_status; Type: INDEX; Schema: intranet; Owner: postgres
--

CREATE INDEX idx_contact_email_checks_status ON intranet.contact_email_checks USING btree (email_status);


--
-- Name: intranet_kpi_refresh_jobs_status_idx; Type: INDEX; Schema: intranet; Owner: postgres
--

CREATE INDEX intranet_kpi_refresh_jobs_status_idx ON intranet.kpi_refresh_jobs USING btree (status, created_at);


--
-- Name: intranet_kpi_refresh_jobs_unique_active; Type: INDEX; Schema: intranet; Owner: postgres
--

CREATE UNIQUE INDEX intranet_kpi_refresh_jobs_unique_active ON intranet.kpi_refresh_jobs USING btree (date1) WHERE (status = ANY (ARRAY['queued'::text, 'running'::text]));


--
-- Name: kpi_refresh_jobs_active_uniq; Type: INDEX; Schema: intranet; Owner: postgres
--

CREATE UNIQUE INDEX kpi_refresh_jobs_active_uniq ON intranet.kpi_refresh_jobs USING btree (date1) WHERE (status = ANY (ARRAY['queued'::text, 'running'::text]));


--
-- Name: contact_email_checks contact_email_checks_contact_id_fkey; Type: FK CONSTRAINT; Schema: intranet; Owner: postgres
--

ALTER TABLE ONLY intranet.contact_email_checks
    ADD CONSTRAINT contact_email_checks_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES qq.contacts(entity_id) ON DELETE CASCADE;


--
-- Name: licensed licensed_user_id_fkey; Type: FK CONSTRAINT; Schema: intranet; Owner: postgres
--

ALTER TABLE ONLY intranet.licensed
    ADD CONSTRAINT licensed_user_id_fkey FOREIGN KEY (user_id) REFERENCES entra.users(user_id);


--
-- PostgreSQL database dump complete
--

