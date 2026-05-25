-- ReseñaHub — migration 011
-- Añade el valor 'office_director' al enum `role_enum`. ESTA migración SOLO
-- toca el enum; las policies RLS, constraints y helpers viven en la 012.
--
-- ¿Por qué dos archivos? Postgres no deja usar un nuevo valor de enum como
-- literal en la misma transacción en que se añadió:
--
--   ERROR: 55P04 unsafe use of new value "office_director" of enum type
--   HINT: New enum values must be committed before they can be used.
--
-- Supabase SQL Editor envuelve cada ejecución en UNA transacción, así que
-- esta migración tiene que correr aislada (commit) ANTES que la 012.
--
-- Apply after 010_review_soft_delete.sql. Después, ejecutar 012.

alter type role_enum add value if not exists 'office_director';
