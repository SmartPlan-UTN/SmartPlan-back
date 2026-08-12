# Proyecto

## Propósito

SmartPlan es una aplicación web para planificar experiencias sociales
personalizadas. Combina actividades y lugares compatibles con el presupuesto,
la ubicación, el tiempo disponible, el tipo de salida y las preferencias de la
persona usuaria. La retroalimentación posterior se usará para mejorar las
recomendaciones.

Es el Proyecto Final 2026 de Ingeniería en Sistemas de Información de la UTN
Facultad Regional Mendoza.

## Repositorios

| Repositorio       | Responsabilidad | Tecnologías principales                          |
| ----------------- | --------------- | ------------------------------------------------ |
| `SmartPlan-front` | Aplicación web  | Next.js 16, React 19, TypeScript, Tailwind CSS 4 |
| `SmartPlan-back`  | API REST        | NestJS 11, TypeScript, TypeORM, PostgreSQL       |

## Alcance funcional

El sistema contempla autenticación, perfiles y preferencias, búsqueda de
actividades, creación y recomendación de planes, colecciones y favoritos,
valoraciones, integración de lugares y administración.

La lista de los 62 casos de uso y sus entidades está en la
[skill de dominio](../skills/01-dominio/SKILL.md). Esa skill conserva el detalle
necesario para implementar sin inventar vocabulario.

## Módulos

| Tipo           | Módulos                                                                                       |
| -------------- | --------------------------------------------------------------------------------------------- |
| Transversales  | Autenticación, usuarios, roles, permisos, seguridad, auditoría                                |
| Funcionales    | Actividades, categorías, lugares, planes, recomendación, colecciones, favoritos, valoraciones |
| Integración    | Proveedores externos, sincronización de lugares, notificaciones                               |
| Administración | Gestión de contenido, usuarios, métricas y parámetros                                         |

## Equipo

| Rol                              | Integrantes                                     |
| -------------------------------- | ----------------------------------------------- |
| Líder de proyecto / QA           | Matías Zarandón                                 |
| Scrum Master / Back-End / DevOps | Valentín Mathey                                 |
| UX/UI / Front-End                | Álvaro Ariza                                    |
| Full Stack                       | Ramiro Martínez, Bautista Alós, Matías Zarandón |
| Front-End                        | Luciano Marquesini                              |
| DBA                              | Ramiro Martínez                                 |
| Desarrollo de IA                 | Bautista Alós                                   |

Todos los integrantes participan también como analistas funcionales.

## Gestión

El equipo usa GitHub Issues para backlog y sprints, GitHub para código y pull
requests, y Discord/WhatsApp para comunicación. El documento académico previo
menciona Jira, pero no es la herramienta operativa actual.
