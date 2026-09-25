---
name: smartplan-project
description: SmartPlan's purpose, scope, modules, team, and stack. Read first, before writing code.
---

# SmartPlan - Project Context

> Shared core. This file is identical in `SmartPlan-front` and `SmartPlan-back`.
> Replicate any change in the other repository.

## Code Language

All new or modified code is English. This includes file and directory names,
classes, types, interfaces, variables, functions, properties, endpoints, technical
routes, tables, columns, enums, constants, events, internal messages, code comments,
and test descriptions. User-visible text may remain in Spanish.

Use one consistent English technical equivalent across frontend, backend, API, and
database. For example: `usuario` -> `user`, `actividad` -> `activity`, and
`DetallePlan` -> `PlanDetail`.

## Purpose

**Intelligent Social Experience Generation System.** Final Project 2026,
Information Systems Engineering, UTN Facultad Regional Mendoza.

A **web application** that automatically generates personalized recreational plans
by combining compatible activities and places based on:

- budget
- location
- available time
- outing type
- personal preferences

The system incorporates user **post-experience feedback** to progressively improve
recommendation quality.

## General Objective

Develop a web application that enables users to plan personalized social experiences
through automatically generated recreational plans, combining compatible activities
and places according to budget, location, available time, outing type, and personal
preferences, while incorporating feedback to improve recommendations and ensuring
security, traceability, and appropriate information management.

## Repositories

| Repository         | Contents        | Stack                                               |
| ------------------ | --------------- | --------------------------------------------------- |
| `SmartPlan-front` | Web application | Next.js 16 + React 19 + TypeScript + Tailwind CSS 4 |
| `SmartPlan-back`  | REST API        | NestJS 11 + TypeScript + TypeORM + PostgreSQL       |

Both are private under the `valentinmathey` account.

## Stack

**Frontend:** Next.js 16 (App Router), React 19, TypeScript 5, Tailwind CSS 4,
axios for API consumption, and lucide-react for icons.

**Backend:** NestJS 11, TypeScript, REST API, backend-managed **JWT** authentication,
and **TypeORM** with **PostgreSQL** (the `pg` driver).

**Planned infrastructure:** Vercel (frontend), Railway (backend and database), S3
(image storage), and RabbitMQ (asynchronous processing queues).

**External integrations:** Google Maps Platform for directions, coordinates, and
distances used by plans.

> The project documentation only says "relational database" without selecting an
> engine. **PostgreSQL with TypeORM is already decided in code**: `SmartPlan-back`
> includes `@nestjs/typeorm`, `typeorm`, and `pg`. Make this explicit in any updated
> delivery document.

## System Modules

### Cross-Cutting

- Authentication and access control
- Users, roles, and permissions
- Security
- Audit and traceability

### Functional

- Master-data management (activities, categories, places)
- Business processes (plan generation, editing, and rating)
- Search and filtering
- Collections
- Notifications and alerts
- External integration

### Information and Control

- Reports
- Dashboard
- Configuration and parameters
- User help and support

## Team and Roles

| Role                                  | Member                                               |
| ------------------------------------- | ---------------------------------------------------- |
| Project Lead                          | Zarandón, Matías                                     |
| Scrum Master                          | Mathey, Valentín                                     |
| UX/UI Designer                        | Ariza, Álvaro                                        |
| Backend Developer                     | Mathey, Valentín                                     |
| Full-Stack Developer                  | Martínez, Ramiro · Alós, Bautista · Zarandón, Matías |
| Frontend Developer                    | Ariza, Álvaro · Marquesini, Luciano                  |
| QA Tester                             | Zarandón, Matías                                     |
| DevOps / Configuration Manager        | Mathey, Valentín                                     |
| DBA                                   | Martínez, Ramiro                                     |
| AI Developer                          | Alós, Bautista                                       |

All six members also act as Functional Analysts.

**Management:** GitHub Issues (backlog and sprints), Discord and WhatsApp
(communication), Google Drive (documentation), and GitHub (code).

The delivery document references Jira, but the team moved tracking to GitHub Issues.
Branches retain the `SMART-` prefix and now use the sprint ticket identifier instead
of a Jira number. See `skills/02-git-flow/`.

## Methodology

Scrum. Work is organized in sprints with the backlog in GitHub Issues. Use cases
(CU) and user stories (US) are traceable to entities and screens in the traceability
matrix. See `skills/01-domain/`.

## Current Status

Both repositories began as scaffolds. Verify capabilities in code before assuming
they exist.

## Source

This file is based on `SmartPlan.md`, an OCR of the Final Project delivery PDF. OCR
can be noisy; verify unusual information against the original document.
