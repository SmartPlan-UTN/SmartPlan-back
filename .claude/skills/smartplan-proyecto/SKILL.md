---
name: smartplan-proyecto
description: Qué es SmartPlan, objetivo, alcance, módulos del sistema, equipo y stack. Leer primero, antes de escribir cualquier código.
---

# SmartPlan — Contexto del proyecto

> Núcleo compartido. Este archivo es idéntico en `SmartPlan-front` y `SmartPlan-back`.
> Si lo modificás, replicá el cambio en el otro repositorio.

## Qué es

**Sistema Inteligente de Generación de Experiencias Sociales.** Proyecto Final 2026,
Ingeniería en Sistemas de Información, UTN Facultad Regional Mendoza.

Aplicación **web** que genera automáticamente planes recreativos personalizados,
combinando actividades y lugares compatibles según:

- presupuesto
- ubicación
- tiempo disponible
- tipo de salida
- preferencias personales

El sistema incorpora **retroalimentación posterior** del usuario para mejorar
progresivamente la calidad de las recomendaciones.

## Objetivo general (definitivo)

Desarrollar una aplicación web que permita a los usuarios planificar experiencias
sociales personalizadas mediante la generación automática de planes recreativos,
combinando actividades y lugares compatibles según presupuesto, ubicación, tiempo
disponible, tipo de salida y preferencias personales, incorporando retroalimentación
posterior para mejorar progresivamente la calidad de las recomendaciones y
garantizando seguridad, trazabilidad y administración adecuada de la información
del sistema.

## Repositorios

| Repo | Contenido | Stack |
|---|---|---|
| `SmartPlan-front` | Aplicación web | Next.js 16 + React 19 + TypeScript + Tailwind CSS 4 |
| `SmartPlan-back` | API REST | NestJS 11 + TypeScript + TypeORM + PostgreSQL |

Ambos son **privados**, bajo el usuario `valentinmathey`.

## Stack

**Frontend** — Next.js 16 (App Router), React 19, TypeScript 5, Tailwind CSS 4,
axios para consumo de la API, lucide-react para iconografía.

**Backend** — NestJS 11, TypeScript, API REST, autenticación **JWT** gestionada
desde el backend, **TypeORM** sobre **PostgreSQL** (driver `pg`).

**Infraestructura prevista** — Vercel (frontend), Railway (backend + base de datos),
S3 (almacenamiento de imágenes), RabbitMQ (colas para procesamiento asíncrono).

**Integraciones externas** — Google Maps Platform (direcciones, coordenadas y
distancias usadas por los planes).

> El motor de base de datos es **PostgreSQL con TypeORM** (ver dependencias de
> `SmartPlan-back`). Detalle de por qué y estado del documento entregable en
> `SEGUIMIENTO.md` → Decisiones.

## Módulos del sistema

### Transversales
- Autenticación y control de acceso
- Usuarios, roles y permisos
- Seguridad
- Auditoría y trazabilidad

### Funcionales
- Gestión de datos maestros (actividades, categorías, lugares)
- Procesos del negocio (generación, edición y valoración de planes)
- Búsqueda y filtrado
- Colección
- Notificaciones y alertas
- Integración externa

### Información y control
- Reportes e informes
- Tablero / dashboard
- Configuración y parámetros
- Ayuda y soporte al usuario

## Equipo y roles

| Puesto | Integrante |
|---|---|
| Líder de Proyecto | Zarandón, Matías |
| Scrum Master | Mathey, Valentín |
| Diseñador UX/UI | Ariza, Álvaro |
| Desarrollador Back-End | Mathey, Valentín |
| Desarrollador Full Stack | Martínez, Ramiro · Alós, Bautista · Zarandón, Matías |
| Desarrollador Front-End | Ariza, Álvaro · Marquesini, Luciano |
| QA Tester | Zarandón, Matías |
| DevOps / Responsable de Configuración | Mathey, Valentín |
| DBA | Martínez, Ramiro |
| Desarrollador de IA | Alós, Bautista |

Los seis integrantes actúan además como Analistas Funcionales.

**Gestión:** GitHub Issues (backlog y sprints) · Discord y WhatsApp
(comunicación) · Google Drive (documentación) · GitHub (código).

El documento entregable menciona Jira, pero el equipo migró el seguimiento a
GitHub Issues. Las ramas siguen usando el prefijo `SMART-`, ahora con el
identificador del ticket del sprint en vez del número de Jira (ver
`skills/02-git-flow/`).

## Metodología

Scrum. El trabajo se organiza en sprints con backlog en GitHub Issues. Los casos de uso
(CU) y las historias de usuario (US) están trazados contra entidades y pantallas
en la matriz de trazabilidad (ver `skills/01-dominio/`).

## Estado actual

Ninguno de los dos repos tiene módulos de negocio (0/62 CU finalizados). El
front sigue en scaffold. El back ya tiene configuración y conexión a base de
datos listas. Estado exacto y actualizado en `SEGUIMIENTO.md` de cada repo —
consultalo antes de asumir que algo existe o no existe.

## Fuente

Toda la información de este archivo proviene de `SmartPlan.md` (documento de
Proyecto Final, ~3800 líneas), que es un OCR del PDF entregable. El OCR tiene
ruido: si un dato parece raro, verificalo contra el documento original antes de
tomarlo como cierto.
