# WAMERCIO 2.1.3 Convergencia Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Incorporar al WAMERCIO 2.1.3 actual los patrones operativos seleccionados del proyecto anterior, preservando su UI y arquitectura conversacional.

**Architecture:** Extender la base PostgreSQL actual con configuración central, usuarios internos y catálogos SaaS mínimos; añadir endpoints REST en el API Go existente; incorporar nuevas páginas reutilizando SuperAdminShell/StoreShell; mantener las entidades `users`, `stores`, `customers`, `orders`, `plans`, `subscriptions` como fuente de verdad.

**Tech Stack:** Go + Chi + pgx, PostgreSQL, Next.js 14, React 18, TypeScript, Tailwind.

**Spec:** `docs/superpowers/specs/2026-09-13-wamercio-convergencia-colmapro-design.md`

## Global Constraints
- WAMERCIO 2.1.3 sigue siendo la base oficial.
- Sin nuevas dependencias frontend.
- Mantener patrón visual actual.
- Mantener WhatsApp/conversaciones como núcleo.
- Migraciones compatibles con instalaciones existentes.

---

### Task 1: Base SaaS central
- [ ] Crear migración para settings, bancos, usuarios de negocio y auditoría.
- [ ] Añadir endpoints de página comercial, Centro SaaS, propietarios, clientes globales y usuarios SaaS.
- [ ] Añadir pruebas de rutas y contratos.

### Task 2: Superadmin
- [ ] Rediseñar navegación manteniendo `SuperAdminShell`.
- [ ] Crear Página comercial, Propietarios, Clientes globales, Usuarios SaaS y Centro SaaS.
- [ ] Integrar Planes y suscripciones de forma coherente.

### Task 3: Operación de negocio
- [ ] Añadir Punto de Venta con creación de venta local.
- [ ] Añadir Usuarios internos del negocio.
- [ ] Evolucionar Entregas y Métodos de pago.
- [ ] Mantener Configuración como gestión multi-negocio.

### Task 4: Integración y regresión
- [ ] Conectar la landing con la configuración comercial pública.
- [ ] Ejecutar gofmt, pruebas Go, typecheck/build frontend si el entorno lo permite.
- [ ] Empaquetar ZIP final y documentar migración/despliegue.
