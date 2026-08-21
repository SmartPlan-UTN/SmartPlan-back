# Documentación de SmartPlan Back

Esta carpeta contiene información estable del proyecto. Las instrucciones para
ejecutar tareas están en [`../skills/`](../skills/README.md); el estado dinámico
se registra en [`../TRACKING.md`](../TRACKING.md) y en GitHub Issues.

| Documento                       | Contenido                                                           |
| ------------------------------- | ------------------------------------------------------------------- |
| [Proyecto](proyecto.md)         | Objetivo, alcance, equipo, stack y módulos                          |
| [Dominio](dominio.md)           | Vocabulario, entidades, casos de uso y trazabilidad                 |
| [Arquitectura](arquitectura.md) | Componentes, dependencias, integraciones y estado de implementación |
| [Desarrollo](desarrollo.md)     | Requisitos locales, configuración, ejecución y API                  |
| [Calidad](calidad.md)           | Formato, análisis estático, pruebas y criterios de aceptación       |
| [Testing](testing.md)           | Pruebas unitarias, e2e y base aislada                               |
| [Despliegue](despliegue.md)     | Entornos y lineamientos de publicación                              |
| [Contribución](contribucion.md) | Flujo Git, commits, PRs y actualización documental                  |
| [Decisiones](decisiones.md)     | Decisiones técnicas vigentes y pendientes de confirmar              |
| [API de exploración](exploration-api.md) | Contrato de búsqueda, filtros, detalles y mapa (CU9-CU14, CU16) |

## Criterio de mantenimiento

- Actualizá esta carpeta cuando cambie una decisión, contrato o comportamiento
  estable del sistema.
- Actualizá una skill cuando cambie la forma de trabajar sobre ese tema.
- Actualizá `TRACKING.md` al cerrar trabajo relevante, detectar un bloqueo o
  dejar un pendiente operativo.
- No documentes como implementado algo que solo está previsto. Indicá su estado
  explícitamente.
