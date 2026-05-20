# Handoff de diseño desde Claude Design

He exportado un nuevo diseño desde Claude Design y lo he añadido al proyecto en: "C:\Users\acastillo\Documents\06 Desarrollos\ReseñasHub_design_package\ReseñaHub"

## Antes de implementar nada, haz esto en orden:

1. **Auditoría del proyecto actual**
   - Revisa la estructura de carpetas y dime qué arquitectura sigue
     (App Router / Pages Router / SPA / etc.).
   - Lista los componentes existentes en /components (o equivalente).
   - Identifica el design system en uso: tokens de color, tipografía,
     espaciado, librería de UI (shadcn, Tailwind config, CSS vars, etc.).
   - Revisa cómo se gestionan los estilos (Tailwind, CSS modules,
     styled-components…).

2. **Análisis del bundle de Claude Design**
   - Lee el README del bundle.
   - Identifica qué componentes nuevos propone y qué patrones visuales usa.
   - Compara con los componentes existentes del proyecto.

3. **Plan de integración (NO ejecutes todavía)**
   Devuélveme un plan que incluya:
   - Qué componentes del bundle ya existen en el proyecto y deben reutilizarse.
   - Qué componentes son realmente nuevos y hay que crear.
   - Qué tokens del bundle no coinciden con el design system actual
     y cómo proponer mapearlos (sin romper consistencia).
   - Dónde va a vivir cada archivo nuevo.
   - Qué dependencias nuevas hace falta instalar, si las hay.
   - Riesgos detectados (conflictos de naming, breaking changes,
     accesibilidad, responsive…).

4. **Espera mi aprobación antes de tocar código.**

## Reglas duras durante la implementación:

- **Reutiliza antes de crear.** Si existe un Button, Card, Input… ÚSALO.
  No crees variantes nuevas salvo que yo lo apruebe.
- **Respeta el design system existente.** Si el bundle trae #3B82F6
  y el proyecto usa `var(--primary)`, usa la variable.
- **Cero código muerto.** No dejes imports sin usar ni componentes
  huérfanos del bundle que no se acaben integrando.
- **Mobile-first y accesible por defecto.** Roles ARIA, contraste,
  focus states, navegación por teclado.
- **No toques nada fuera del scope del diseño.** Si encuentras algo
  que mejorarías en otra parte del proyecto, anótalo en un comentario
  o en un TODO, pero no lo cambies sin pedírmelo.

## Al terminar:

- Resume qué has hecho, qué archivos has tocado y qué decisiones
  has tomado por tu cuenta.
- Indica si quedó algo pendiente o ambiguo del diseño original.
- Sugiere 2-3 mejoras opcionales que detectaste (rendimiento,
  accesibilidad, UX), sin implementarlas.
