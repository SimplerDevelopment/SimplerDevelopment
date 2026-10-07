# Correcciones del CRM y evidencia de validación — 7 de octubre de 2026

Estado: cambios preparados para revisión. La validación completa de lanzamiento sigue pendiente; esta publicación no autoriza integrar ni desplegar en producción.

Base local de revisión: `e004fd3`. Rama: `codex/security-payment-reliability-20261006`.

## Hallazgos, correcciones y comprobaciones

| Área | Fallo corregido | Validación y límite |
| --- | --- | --- |
| Cron y autenticación | Cabeceras de cron falsificables, bypass en producción y registro de ejecuciones no autorizadas | Secret obligatorio, comprobación antes del registro de salud; pruebas de autenticación y cron pasan |
| MFA | Código TOTP reutilizable entre acceso web y móvil | Consumo atómico compartido y contador monotónico; pruebas de seguridad con PostgreSQL y gate de tenancy pasan |
| Permisos y aislamiento | Credenciales con permisos excesivos, membresías obsoletas y herramientas sin comprobar sus scopes | Guardas REST/MCP/extensión/móvil y herramientas de IA; 524 casos del gate completo de tenancy pasan |
| Archivos privados y CMS | Adjuntos accesibles por proxy público, pérdida de protección tras borrar referencias y contenido de bloques inseguro | Prefijo privado, autorización, marcadores persistentes y sanitización; requiere backfill de adjuntos históricos antes de servir la versión nueva |
| Editor y entradas CMS | Hidratación dependiente de la zona horaria y CSP que bloqueaba la previsualización local en el editor | Fechas estables en el primer render y preview same-origin con token preservado; 89 pruebas focalizadas pasan y las rutas de entradas/edición pasan en el gate de producción |
| Checkout y pagos | Doble débito de existencias/crédito, webhooks repetidos y liberación prematura de reservas | Reservas transaccionales, registro único de eventos, reconciliación y cancelación del PaymentIntent antes de liberar; pruebas de comercio y 13 casos de pedidos con PostgreSQL pasan |
| Gestión de pedidos | Estados incoherentes, envío de pedidos no pagados y cancelación de pagos capturados sin reembolso | Transiciones limitadas, bloqueo de fila, reembolso acumulado y efectos durables; 83 pruebas focalizadas de comercio pasan tras la extracción final |
| Workflows | Reintentos que no recuperaban el paso correcto y tabla de pasos ausente de las migraciones | Reencolado de pasos y migración registrada; harness aplica migraciones oficiales sin reparar el esquema por fuera |
| Créditos e IA | Carreras de saldo, llamadas sin reserva previa, concesiones duplicadas y texto sin verificar enviado por SSE | Reservas/balance atómicos, liquidación de consumo, deduplicación y emisión después de verificar; voz de plataforma requiere BYOK hasta disponer de medición acotada |
| Email | Falsos estados de enviado, destinatarios y payload cambiantes en reintentos, promoción A/B transitoria | Recibos por destinatario, cohorte congelada, intención de entrega persistente, reanudación y cola durable; 9 casos finales de transacción/evento pasan con PostgreSQL |
| Chat y canales | Doble inserción después de errores, pérdida de idempotencia y referencias de otro tenant | Persistencia inbound transaccional, claves estables, comprobación del payload, reclamación de outbox y recepción basada en datos reales; 8 casos finales con PostgreSQL pasan |
| Reservas e interfaz | Horarios con capacidad cero seleccionables y formato monetario dependiente del idioma del host | Capacidad explícita y formato USD estable; pruebas de reservas en inglés/español y envío del valor numérico del deslizador pasan |
| Calendario y contactos | Error de hidratación por fecha/idioma distintos y pantallas de CRM rotas con nombres nulos | Primer render de calendario estable, inicio en navegador y nombres opcionales con fallback; 52 pruebas de calendario y 124 de CRM pasan, incluyendo las regresiones |
| Herramientas locales | Invocaciones de pruebas incompatibles con Windows, URL de login incorrecta en E2E y migraciones omitidas | Runner Bun/Git Bash, aislamiento por ejecución, URL de autenticación del servidor de pruebas y journal de migraciones completo |

## Resultado de las comprobaciones

- Suite unitaria completa final: **28.616 pasan, 0 fallan y 12 se omiten**; 885 archivos pasan y 2 se omiten. Se ejecutó sin cobertura; este recuento no acredita los umbrales de cobertura.
- Los 26 fallos heredados de admin/clientes, contrato, configuración de IA, BookingFormInline, miembros de proyecto, solicitud de servicio y rutas del CLI se reprodujeron en `e004fd3` y se corrigieron conservando assertions exactas: idioma del host, fechas y rutas nativas de Windows. Se añadieron comprobaciones de capacidad cero y del valor numérico enviado por el deslizador.
- Pruebas focalizadas finales de IA/email/UI/MCP/SSE: **862 de 862 pasan en 23 suites**. Pruebas finales de chat/canales: **80 de 80 pasan**. Estos conjuntos se solapan con la suite global; sus recuentos no se suman.
- TypeScript pasa. Build optimizado de Next.js pasa; ese build omite la comprobación de tipos por configuración y se complementa con el typecheck independiente.
- Presupuesto de tamaño de archivos pasa. Límites de arquitectura: 0 errores y advertencias heredadas. ESLint de fuentes finales focalizadas pasa.
- Fallow, comparado con `e004fd3` y sus baselines: sin nuevos hallazgos de código muerto ni complejidad. Resultado `warn`; persisten grupos de duplicación atribuidos al diff pendientes de revisión. No se ha rebaselined el código nuevo para ocultarlos.
- `drizzle-kit check` pasa. Se comprobó la aplicación de las 33 entradas del journal a una base aislada y la actualización aditiva de una base anterior mediante 47 sentencias, conservando una fila existente. No se ha aplicado ni verificado la migración en una base de producción.
- Gate completo de tenancy: **524 pasan en 65 archivos**, sin fallos; 152 casos quedan fuera de la selección por etiqueta. Se corrigió el harness MCP para resolver la membresía real también en credenciales de una sola empresa y el fixture POD para crear pedidos pagados reales de cada cliente.
- Integración focalizada final: **46 de 46 casos pasan** en comercio, canales, seguridad, email e IA. Una limpieza de comercio agotó el timeout en el primer intento; su archivo completo se repitió después con **13 de 13 y teardown aprobados**. Los otros cinco archivos finalizaron correctamente.
- Los **9 casos finales de email pasan con PostgreSQL**, incluyendo rollback del evento durable, finalización única y recuperación sin reenviar al proveedor.
- Los escenarios de navegador con preparación SQL usan ahora Bun/Postgres sin shell ni dependencia de `psql`, con destino obligatorio local y dentro del namespace de test. Las pruebas positivas de cron usan Bearer desde `CRON_SECRET`; las cabeceras falsificadas se comprueban como rechazo 401.
- Las sesiones de prueba se preparan mediante dos accesos reales verificados y se clonan por escenario; los contextos anónimos y las pruebas de login conservan su autenticación real. El límite de producción sigue activo. Se corrigieron los fixtures de CMS para usar bloques autorizados, la selección de experimentos por ID y las carreras de onboarding causadas por reiniciar la misma fila en paralelo. El smoke de rutas mantiene ejecución secuencial y continúa tras un fallo individual. Gate E2E crítico sobre build de producción: **679 pasan, 39 se omiten, 0 fallan, 0 flaky y 0 quedan sin ejecutar**. De las omitidas, 20 requieren capacidades/dependencias fuera de este entorno y 19 rutas dinámicas no recibieron un ID en el fixture; esas rutas siguen sin cobertura. Las rutas de entradas y edición CMS pasan.
- El escaneo interno de secretos sobre el commit pasó. El check externo GitGuardian del PR #223 reportó **2 detecciones** en el análisis inicial de 12 commits; la API de GitHub no expone sus ubicaciones. Una revisión local sin imprimir valores encontró credenciales de desarrollo por defecto en URLs de Compose y literales de fixtures de prueba, pero no permite correlacionarlos con esas dos detecciones. Deben revisarse en el panel de GitGuardian antes de integrar.
- El cliente móvil recibió los cambios de MFA y permisos; su compilación completa con Expo no se ha validado en esta máquina.

## Condiciones antes de integrar o desplegar

1. Completar la cobertura de las 19 rutas dinámicas del smoke que no recibieron ID y validar los flujos con proveedores reales en HTTPS, conservando el límite de autenticación.
2. Revisar las duplicaciones atribuidas por Fallow y comprobar los umbrales de cobertura en CI. No ampliar esta rama con refactorizaciones masivas de deuda histórica sin revisión.
3. Sincronizar el PR borrador #223 con el `main` remoto y resolver los conflictos observados; repetir los gates tras la sincronización. En la publicación, el checkout tenía 13 commits exclusivos y le faltaban 188 commits remotos.
4. Revisar y resolver las dos detecciones de GitGuardian desde su panel. El check de Vercel falló porque el fork no tiene autorización para desplegar; no se publicó ningún despliegue.
5. Verificar destino, copia de seguridad, esquema y registro de migraciones del entorno de despliegue. Aplicar las migraciones necesarias y ejecutar el backfill idempotente de medios privados **antes de servir el código que requiere esas columnas y marcadores**.
6. Validar proveedores reales de pagos/email, permisos entre tenants, acceso móvil y flujo completo con los datos del candidato final.

La protección nueva evita futuras descargas públicas de adjuntos registrados. No puede revocar archivos ya descargados ni bytes servidos previamente con caché pública prolongada.

Los cambios locales previos de Docker y del README de expansión se preservan fuera de este commit. Las credenciales, bases de prueba, logs completos y artefactos locales de QA no se publican.

Configuración de esta QA: PostgreSQL aislado en `127.0.0.1:55435`, `max_locks_per_transaction=512` y uno/dos workers de integración. Se desactivó `fsync` en ese contenedor temporal para evitar sincronizaciones de cientos de tablas por cada limpieza. Esta comprobación acredita transacciones, recuperación lógica y permisos; no simula pérdida de energía ni acredita durabilidad física de almacenamiento. Al terminar se restauraron `fsync` y `max_locks_per_transaction` a sus valores predeterminados y se detuvo el contenedor sin borrar su volumen. No se modificó la configuración de ninguna base de producción.
