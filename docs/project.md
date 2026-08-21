# Project

## Purpose

SmartPlan is a web application for planning personalized social experiences. It
combines activities and places compatible with a user's budget, location,
available time, outing type, and preferences. Subsequent feedback will improve
recommendations.

It is the 2026 final project for Information Systems Engineering at UTN Facultad
Regional Mendoza.

## Repositories

| Repository | Responsibility | Main technologies |
| --- | --- | --- |
| `SmartPlan-front` | Web application | Next.js 16, React 19, TypeScript, Tailwind CSS 4 |
| `SmartPlan-back` | REST API | NestJS 11, TypeScript, TypeORM, PostgreSQL |

## Functional Scope

The system includes authentication, profiles and preferences, activity search,
plan creation and recommendation, collections and favorites, ratings, place
integration, and administration.

The complete list of 62 use cases and their entities is in the
[domain skill](../skills/01-domain/SKILL.md). That skill preserves the academic
traceability details required for implementation.

## Modules

| Type | Modules |
| --- | --- |
| Cross-cutting | Authentication, users, roles, permissions, security, auditing |
| Functional | Activities, categories, places, plans, recommendations, collections, favorites, ratings |
| Integration | External providers, place synchronization, notifications |
| Administration | Content management, users, metrics, and parameters |

## Team

| Role | Members |
| --- | --- |
| Project lead / QA | Matías Zarandón |
| Scrum Master / Back end / DevOps | Valentín Mathey |
| UX/UI / Front end | Álvaro Ariza |
| Full stack | Ramiro Martínez, Bautista Alós, Matías Zarandón |
| Front end | Luciano Marquesini |
| DBA | Ramiro Martínez |
| AI development | Bautista Alós |

All members also act as functional analysts.

## Management

The team uses GitHub Issues for the backlog and sprints, GitHub for code and
pull requests, and Discord/WhatsApp for communication. The previous academic
document mentions Jira, but it is not the current operational tool.
