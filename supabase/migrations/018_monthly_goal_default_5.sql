-- Cambia el objetivo mensual por defecto de 50 a 5 (más realista para el equipo actual)
-- y actualiza todos los perfiles existentes que aún tengan el valor original 50.

ALTER TABLE profiles
  ALTER COLUMN monthly_goal SET DEFAULT 5;

UPDATE profiles
SET monthly_goal = 5
WHERE monthly_goal = 50;
