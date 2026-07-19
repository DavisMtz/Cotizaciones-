# Guía del Administrador — Sistema de Cotizaciones Ventel

> Para quienes **administran** el sistema: usuarios avanzados (supervisión y formatos) y
> quien mantiene la aplicación (configuración, despliegue y soporte). No requiere saber
> programar, salvo la sección de mantenimiento técnico al final.

---

## 1. ¿Qué es el sistema?

Una aplicación web donde los asesores crean cotizaciones de productos Liverpool, las
guardan, las imprimen en PDF y las envían por correo al cliente. Los datos viven en una
**Google Sheet** que funciona como base de datos. No hay servidores propios que mantener:
todo corre en Google Apps Script.

Hay **dos tipos de usuario**:

| Rol | Puede |
|-----|-------|
| **Normal** (asesor) | Crear, consultar, editar y enviar sus propias cotizaciones. |
| **Avanzado** (supervisor) | Todo lo anterior + **panel de supervisión** (ver las cotizaciones de todos, filtrar, exportar) + **administrar los formatos** de impresión. |

---

## 2. Gestión de usuarios

### 2.1 Cómo se registra un usuario

Los asesores se dan de alta solos desde la pantalla **"Crear cuenta"**. Al registrarse
quedan como **Normal** automáticamente.

### 2.2 Cómo convertir a alguien en usuario avanzado

El rol se controla desde la propia base de datos:

1. Abre la Google Sheet del sistema.
2. Ve a la pestaña **`Registros`**.
3. Localiza la fila del usuario por su correo (columna **`Email`**).
4. En la columna **`Avanzado`**, escribe **`Si`** (con esa ortografía exacta: "S" mayúscula,
   sin acento). Para quitarle el permiso, escribe **`No`**.
5. El usuario debe **cerrar sesión y volver a entrar** para que el cambio tome efecto.

> ⚠️ El valor debe ser exactamente `Si` o `No`. Otros valores (`Sí`, `SI`, `x`) se
> interpretan como "No".

### 2.3 Restablecer una contraseña

No existe pantalla de "olvidé mi contraseña". Las contraseñas se guardan **cifradas** y no
se pueden leer. Si un asesor la olvida, la vía práctica es:

- Pedirle que se **registre de nuevo con otro correo**, **o**
- Borrar su fila en `Registros` para que pueda volver a registrarse con el mismo correo.

(Una mejora futura sería añadir recuperación de contraseña; hoy no está.)

---

## 3. Panel de supervisión (solo usuarios avanzados)

Al iniciar sesión, un usuario avanzado entra directamente al **Dashboard Avanzado**. Ahí
encuentra:

- **Indicadores (KPIs)**: cotizaciones del mes actual, comparación con el mes anterior,
  actividad de hoy y de los últimos 7 días.
- **Cotizaciones por asesor**: quién ha generado cuántas cotizaciones en el mes.
- **Últimas cotizaciones**: las más recientes de todo el equipo.
- **Búsqueda global**: por folio, nombre de cliente o correo.
- **Filtros**: por rango de fechas, estatus, asesor y formato.
- **Exportar a CSV**: descarga un reporte de las cotizaciones filtradas para abrir en Excel.

Todo el filtrado y la exportación ocurren **en tu navegador** sobre los datos que trae el
panel, así que son instantáneos una vez cargada la página.

---

## 4. Administración de formatos de impresión

El sistema puede imprimir/enviar la cotización en **dos formatos**:

| Formato | Descripción |
|---------|-------------|
| **Actual** | El formato propio del sistema. Incluye fotos de los productos y el detalle de descuentos. |
| **CCL Liverpool** | El formato **oficial** del Centro de Contacto, generado a partir de una plantilla de Google Sheets. |

Desde el Dashboard Avanzado puedes **habilitar o deshabilitar** cada formato. Reglas:

- Un formato deshabilitado **desaparece** de las opciones que ve el asesor al cotizar.
- **Siempre debe quedar al menos un formato habilitado**; el sistema no te dejará apagar el
  último.
- El formato **CCL** solo aparece disponible si su plantilla de Google Sheets está bien
  configurada y accesible (ver §6). Si no lo está, el panel muestra el motivo.

---

## 5. Estatus de una cotización

Cada cotización tiene un estatus que cambia solo según lo que ocurre:

| Estatus | Significa |
|---------|-----------|
| **Folio Generado** | Se guardó y se le asignó un folio (`LVP-AAMMDD-####`), pero aún no se ha enviado. |
| **Enviada por Correo** | Ya se envió al cliente por correo con el PDF adjunto. |

Los folios tienen el formato **`LVP-` + fecha (AAMMDD) + número del día**. El número se
reinicia cada día (el primero del día es `0001`).

---

## 6. Configuración y mantenimiento técnico

Esta sección es para quien mantiene la aplicación en Google Apps Script.

### 6.1 La base de datos: hojas y columnas

El sistema necesita **una Google Sheet con tres pestañas** con estos nombres exactos:

- **`Registros`** — usuarios. Columnas: fecha, `Nombre`, `Email`, `PasswordHash`, `Avanzado`.
- **`Cotizaciones`** — una fila por cotización (folio, cliente, asesor, totales, estatus…).
- **`DetalleCotizaciones`** — una fila por producto de cada cotización.

> **No renombres las columnas.** El código las busca por su nombre de encabezado. Sí puedes
> reordenarlas. Algunas columnas (`Formato`, `ImagenUrl`, `LinkSheetCCL`) **se crean solas**
> la primera vez que se necesitan; es normal verlas aparecer.

### 6.2 Valores de configuración a revisar

Estos valores están dentro del código y deben apuntar a tus recursos reales:

| Dónde | Valor | Qué hace |
|-------|-------|----------|
| `Code.gs` | `WEBHOOK_URL` | Envía un aviso a un chat de Google cada vez que se crea una cotización. |
| `Code.gs` | `HASH_SALT` | Se usa para cifrar contraseñas. **No lo cambies** una vez haya usuarios registrados: invalidaría todas las contraseñas. |
| `Formatos.gs` | `CCL_TEMPLATE_SHEET_ID` | ID de la Google Sheet plantilla del formato CCL oficial. |
| `Formatos.gs` | `CCL_SHEET_NAME` | Nombre de la pestaña dentro de esa plantilla (`Liverpool`). |
| `Correos.gs` | `MAIL_ALIAS` | Correo institucional desde el que salen las cotizaciones. |

### 6.3 Correo institucional (alias de envío)

Para que las cotizaciones salgan desde **`cotizacion@liverpool.com.mx`** y no desde la
cuenta personal:

1. En la cuenta de Gmail que **ejecuta el script**, ve a
   *Configuración → Cuentas → "Enviar como"* y da de alta ese alias.
2. Asegúrate de que el proyecto tiene el permiso de Gmail y **re-autoriza** el script.

Si el alias no está configurado, **el correo se envía igual**, pero desde la cuenta propia.
Las respuestas del cliente siempre llegan al asesor dueño de la cotización.

### 6.4 Primera puesta en marcha / autorización

Cuando se instala o se agregan permisos nuevos:

1. Abre el proyecto en Google Apps Script.
2. Ejecuta manualmente la función **`probarAccesoCcl`** (menú de funciones → Ejecutar).
3. Acepta los permisos que Google solicite (Drive, Sheets, Gmail).
4. Revisa el registro (*Ver → Registros*): debe decir que el formato CCL ya puede generarse.

### 6.5 Publicar una nueva versión

Cualquier cambio en el código **no** se ve hasta publicar una implementación nueva:

*Implementar → Gestionar implementaciones → editar → Versión: Nueva → Implementar.*

La URL pública se mantiene; solo se actualiza el contenido.

### 6.6 Copias de seguridad

Como toda la información vive en la Google Sheet, la copia de seguridad es simplemente
**duplicar esa hoja** periódicamente (*Archivo → Hacer una copia*) o confiar en el historial
de versiones de Google. Considera respaldar también la carpeta de Drive
**"Cotizaciones CCL generadas"** si necesitas conservar los documentos CCL.

---

## 7. Problemas frecuentes

| Síntoma | Causa probable | Solución |
|---------|----------------|----------|
| Un asesor no ve el panel de supervisión | No tiene `Avanzado = Si`, o no ha vuelto a iniciar sesión | Revisa la columna `Avanzado` en `Registros` y pídele reingresar. |
| El formato **CCL** no aparece al cotizar | Está deshabilitado o la plantilla no es accesible | Habilítalo en el panel; verifica `CCL_TEMPLATE_SHEET_ID` y ejecuta `probarAccesoCcl`. |
| Los correos salen desde la cuenta personal, no del alias | El alias no está dado de alta o falta re-autorizar | Configura "Enviar como" (§6.3) y re-autoriza el script. |
| "Columna no encontrada" al usar el sistema | Se renombró una columna en las hojas | Restablece el nombre original del encabezado. |
| Dos cotizaciones con el mismo folio | Muy raro: el sistema usa un candado para evitarlo | Verifica que no se editó a mano la hoja durante un guardado. |
| Las imágenes de producto no cargan en el correo | El SKU no tiene imagen en los servidores de Liverpool | El sistema intenta varias fuentes automáticamente; si ninguna existe, muestra una imagen genérica. |

---

## 8. Contactos y recursos

- **Base de datos**: Google Sheet con las pestañas `Registros`, `Cotizaciones`,
  `DetalleCotizaciones`.
- **Plantilla del formato oficial**: Google Sheet CCL (pestaña `Liverpool`).
- **Documentos CCL generados**: carpeta de Drive *"Cotizaciones CCL generadas"*.
- **Detalle técnico completo**: ver `DOCUMENTACION_TECNICA.md` en esta misma carpeta.
- **Manual para asesores**: ver `MANUAL_USUARIO.md`.
