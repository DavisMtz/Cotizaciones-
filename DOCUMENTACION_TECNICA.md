# Documentación Técnica — Sistema de Cotizaciones Ventel

> Documento de referencia para desarrollo y mantenimiento. Describe la arquitectura,
> el modelo de datos, la lógica de negocio crítica y las invariantes que **no** deben
> romperse. Versión del código: 1.0 (julio 2026).

---

## 1. Visión general

Aplicación web construida sobre **Google Apps Script (GAS)** que usa **Google Sheets como
base de datos**. Permite a los asesores de Ventel/Liverpool crear, consultar, imprimir y
enviar por correo cotizaciones de productos.

Características arquitectónicas clave:

- **Sin build ni framework.** Todo es HTML + JavaScript vanilla servido por GAS. No hay
  `npm`, ni bundler, ni repositorio git; el despliegue es manual (o vía `clasp`).
- **Backend en `.gs`** (JavaScript ejecutado en los servidores de Google) y **frontend en
  `.html`** (servido dentro de un `<iframe>` sandbox de Apps Script).
- **Comunicación cliente↔servidor** exclusivamente por `google.script.run` (RPC asíncrono).
  No hay endpoints REST; cada función pública de los `.gs` es invocable desde el cliente.
- **Persistencia** en tres hojas de una misma Google Sheet + `PropertiesService` para
  configuración (formatos habilitados).

### 1.1 Diagrama lógico

```
Navegador (iframe sandbox)                 Servidores de Google (Apps Script)
┌───────────────────────────┐              ┌──────────────────────────────────┐
│  Pantallas .html           │  doGet(e)   │  Code.gs   (router, auth, CRUD)   │
│  + includes compartidos    │◀───────────▶│  Formatos.gs (formatos, PDF, CCL) │
│  (app_core / theme / etc.) │ script.run  │  Correos.gs  (HTML correo, envío) │
└───────────────────────────┘              └──────────────┬───────────────────┘
                                                          │
                                     ┌────────────────────┼─────────────────────┐
                                     ▼                     ▼                     ▼
                              Google Sheets (BD)   Drive (PDF/CCL)      Gmail / Webhook
```

---

## 2. Enrutamiento y ciclo de vida de una página

Todo el ruteo vive en **`Code.gs`**:

- `doGet(e)` es el único punto de entrada HTTP. Lee `e.parameter.page` y busca la
  configuración correspondiente en el mapa **`PAGES`** (nombre de archivo + título). Si el
  parámetro falta o es desconocido, cae a `login`.
- Antes de renderizar, **inyecta variables en la plantilla** que el cliente necesita y que
  el sandbox no garantiza:
  - `template.baseUrl = getScriptUrl()` — URL desplegada, para que el cliente construya
    enlaces sin pedirla por red en cada clic.
  - `template.folio`, `template.action`, `template.format` — parámetros de navegación.
- La plantilla se evalúa con `.setXFrameOptionsMode(ALLOWALL)` (necesario para el iframe).
- **`include(filename)`** permite incrustar otros archivos con el scriptlet
  `<?!= include('app_core'); ?>`. Así se comparten CSS/JS entre pantallas.

Cada pantalla define **antes** del include:

```js
window.__APP__ = { baseUrl: <?!= JSON.stringify(baseUrl) ?>, folio: <?!= JSON.stringify(folio) ?>, ... };
```

y a partir de ahí **toda navegación pasa por `AppUrl.go(page, params)`** (nunca se arma la
URL a mano). `AppUrl.go` usa `window.top.location.href` para romper el iframe.

### Páginas registradas (`PAGES`)

| `page`                | Archivo                 | Rol            | Propósito |
|-----------------------|-------------------------|----------------|-----------|
| `login`               | `inicioDeSesion.html`   | público        | Autenticación |
| `registro`            | `registro.html`         | público        | Alta de usuario |
| `dashboard`           | `inicio.html`           | normal         | Panel del asesor |
| `inicio_avanzado`     | `inicio_avanzado.html`  | avanzado       | Panel de supervisión |
| `cotizacion`          | `cotizacion.html`       | sesión         | Formulario crear/editar |
| `cotizado_preview`    | `cotizado_preview.html` | sesión         | Vista previa del formato elegido |
| `consulta_cotizacion` | `consulta_cotizacion.html` | sesión      | Consulta + descarga PDF |
| `correoventel`        | `correoventel.html`     | sesión         | Envío/reenvío por correo |

---

## 3. Modelo de datos (Google Sheets)

La aplicación asume una Google Sheet con **tres pestañas**. Los nombres están fijados como
constantes en `Code.gs`:

```js
const REGISTROS_SHEET_NAME          = "Registros";
const COTIZACIONES_SHEET_NAME       = "Cotizaciones";
const DETALLE_COTIZACIONES_SHEET_NAME = "DetalleCotizaciones";
```

**El código localiza las columnas por su encabezado (`headers.indexOf("...")`), no por
posición.** Esto significa que se pueden reordenar columnas, pero **no** renombrarlas.

### 3.1 Hoja `Registros` (usuarios)

| Columna        | Tipo    | Notas |
|----------------|---------|-------|
| *(timestamp)*  | Date    | Fecha de alta (`appendRow` la escribe en la 1.ª celda) |
| `Nombre`       | Texto   | Nombre completo del asesor |
| `Email`        | Texto   | Identificador único; login/búsquedas lo normalizan a minúsculas |
| `PasswordHash` | Texto   | SHA-256 hex de `password + HASH_SALT` |
| `Avanzado`     | `Si`/`No` | Rol. `Si` = usuario avanzado (supervisión + admin de formatos) |

### 3.2 Hoja `Cotizaciones` (cabecera de cada cotización)

Columnas conocidas: `Folio`, `Timestamp`, `AsesorCorreo`, `AsesorNombre`, `Extencion`
*(sic)*, `ClienteNombre`, `CorreoCliente`, `Numero`, `Subtotal`, `IVA`, `TotalGeneral`,
`Estatus`, `Observaciones`, y columnas **auto-reparables**:

- `Formato` — id del formato usado (`actual` / `ccl_liverpool`). Se crea sola si falta.
- `LinkSheetCCL` — URL del documento Sheets CCL persistente.
- Enlace al PDF: el nombre ha variado entre versiones, así que `getQuoteDetails` prueba una
  lista de candidatos: `["LinkPDF","PDFLink","LinkDrive","PdfLink","LinkArchivo"]`.

### 3.3 Hoja `DetalleCotizaciones` (líneas de producto)

Una fila por producto, ligada por `FolioCotizacion`. Columnas: `FolioCotizacion`, `SKU`,
`DescripcionProducto`, `Cantidad`, `PrecioUnitarioBase`, `CostoPagoUnicoLinea`,
`DescPublicoPorcentaje`, `AplicaDescAdicional` (`Si`/`No`), `PorcentajeDescAdicional`, y
`ImagenUrl` (auto-reparable).

> **Patrón "auto-reparable":** cuando falta una columna esperada, el código la **crea al
> vuelo** (`getRange(1, headers.length+1).setValue("...")`) en lugar de fallar. Aplica a
> `Formato`, `ImagenUrl` y a cualquier columna escrita por `setQuoteColumnValue_`. Permite
> que hojas viejas sigan funcionando sin migración manual.

---

## 4. Backend por archivo

### 4.1 `Code.gs` — núcleo

- **Autenticación**
  - `registerUser(name, email, password)` — valida unicidad de correo y longitud mínima
    (6), guarda hash y marca `Avanzado = No`.
  - `loginUser(email, password)` — recalcula el hash y compara. Devuelve
    `{ success, userName, userEmail, isAdvanced }`.
  - `getUserEmail()` — correo del usuario de Google que ejecuta el script (distinto del
    usuario de la app).
- **Folios** — `generateLvpFolio(sheet)` genera `LVP-AAMMDD-XXXX`; el secuencial se reinicia
  cada día (busca el máximo del prefijo del día y suma 1).
- **CRUD de cotizaciones**
  - `saveQuoteDataToSheets(quoteData, status, pdfLink)` — hace *upsert* en `Cotizaciones` y
    **reemplaza** las líneas en `DetalleCotizaciones` (borra las previas del folio y
    reinserta). En alta nueva dispara el webhook.
  - `saveQuoteAndGoToPreview(quoteDataFromClient)` — orquesta el guardado desde el cliente:
    completa asesor, **valida el formato contra los habilitados**, y bajo **`LockService`**
    genera el folio (evita folios duplicados en concurrencia) con estado `"Folio Generado"`.
  - `getQuotesForUser(email, searchTerm)` — si hay `searchTerm`, busca global (folio /
    cliente / correo); si no, filtra por el correo del asesor. Ordena por folio desc.
  - `getQuoteDetails(folio)` — cabecera + productos + enlaces; **serializa `timestamp` a
    ISO** para transportarlo al cliente sin ambigüedad.
- **Analítica y supervisión**
  - `getDashboardStats()` — conteos mes actual/anterior, cotizaciones por asesor, actividad
    de hoy y de 7 días, últimas 5. Ojo: construye objetos nuevos para **no** enviar
    `rawDate` (no serializable) al cliente.
  - `getSupervisionQuotes(email)` — devuelve **todas** las cotizaciones con campos crudos
    (fechas ISO) para que el cliente filtre/exporte. **Protegida** por `isAdvancedUser`.
- **Notificaciones** — `sendWebhookNotification(folio)` publica en un Space de Google Chat
  vía `WEBHOOK_URL`. Cualquier fallo se registra y se ignora (no bloquea el guardado).

### 4.2 `Formatos.gs` — formatos e impresión

Dos formatos, catalogados en `QUOTE_FORMATS`:

1. **`actual`** — PDF armado desde el HTML de `generateQuoteHtml` (Correos.gs), convertido
   con `Utilities.newBlob(html).getAs("application/pdf")`.
2. **`ccl_liverpool`** — formato oficial. Se genera **copiando una Google Sheet plantilla**
   (`CCL_TEMPLATE_SHEET_ID`), llenándola y exportándola a PDF con la URL de export de Sheets.
   Este rodeo conserva la fidelidad exacta del documento oficial.

- **Habilitación de formatos** (persistida en `PropertiesService`, clave
  `formatos_habilitados`): `getFormatSettings` / `setQuoteFormatEnabled` (solo avanzados).
  Un formato sin registro se considera habilitado; **nunca** se permite dejar cero
  habilitados. `checkFormatAvailability_` verifica además que la plantilla CCL sea accesible.
- **Generación PDF**: `generateQuotePdfBlob(folio, formatId)` valida el formato contra el
  catálogo (lanza error si es desconocido — no lo tapa) y delega en `generateCclPdfBlob_` o
  en el camino HTML.
- **CCL**: `fillCclSheet_` localiza la tabla por marcadores de texto en la columna A
  (`sku` … `informacion`), **ajusta dinámicamente el número de filas** al de productos
  (inserta/borra copiando formato+fórmulas), escribe con `buildCclProductRow_` y recalcula
  totales con fórmulas `SUM`. La copia temporal **siempre** se borra (bloque `finally`).
- **Documento persistente**: `openQuoteInSheets(folio)` crea/refresca un Sheets CCL
  reutilizable (guarda su URL en `LinkSheetCCL`). Es un **reflejo**, no fuente de verdad:
  se rellena de nuevo en cada apertura, así que las ediciones manuales se pierden.
- **Diagnóstico**: `probarAccesoCcl()` se ejecuta a mano desde el editor para disparar la
  pantalla de autorización y confirmar acceso de lectura/escritura a la plantilla.
- **Descarga**: `downloadQuotePdf(folio, formatId)` devuelve el PDF en **base64** porque
  `google.script.run` no transporta Blobs.

### 4.3 `Correos.gs` — correo al cliente

- `generateQuoteHtml(folio)` — HTML del PDF formal (formato `actual`), maquetado con tablas
  y `@page size: letter`. Contiene los `#E10098` y el logo de Liverpool incrustados.
- `sendQuoteByEmail(emailData)` — genera el PDF, arma un **segundo** HTML (el cuerpo del
  correo, estilo ticket Liverpool con tarjetas de producto e imágenes), lo envía con el PDF
  adjunto y actualiza el estatus a `"Enviada por Correo"`.
  - **Alias institucional**: intenta enviar desde `MAIL_ALIAS`
    (`cotizacion@liverpool.com.mx`) con `GmailApp` **solo si** está dado de alta como
    "Enviar como". Si no, cae a `MailApp` desde la cuenta propia (el correo **siempre**
    sale). `replyTo` apunta al asesor dueño de la cotización.
- `getMailSenderInfo()` — informa al cliente qué remitente se usará.
- `getVerifiedImageUrl(sku, preferredUrl)` — evita imágenes rotas: verifica la URL preferida
  (HTTP 200) y, si falla, recorre subdominios conocidos de imágenes de Liverpool
  (`ss628`, `ss224`, …) probando `/xl/{SKU}.jpg`.

> **Invariante:** los formatos de documento y de correo **replican documentos oficiales**.
> El markup HTML de `generateQuoteHtml` / `sendQuoteByEmail` (Correos.gs) y el markup CCL
> de los previews **no deben rediseñarse**.

---

## 5. Includes compartidos (frontend)

| Include              | Expone | Notas |
|----------------------|--------|-------|
| `app_core.html`      | `AppUrl`, `AppSession`, `requireSession`, `formatMoney`, `AppCache` | JS base. Requiere `window.__APP__` definido antes. |
| `app_theme.html`     | Tokens CSS + componentes `v-btn`, `v-card`, `v-input`, `v-badge`, `v-modal`, toasts | Marca `--brand = #E10098`. |
| `app_motion.html`    | `AppMotion` (GSAP 3.13) | Entradas escalonadas, count-up, modales, toasts, shake. **Degrada sin animar si el CDN no carga.** |
| `app_icons.html`     | `Icons.render()`, `Icons.svg(nombre, clase)` | Set único de iconos de trazo 24×24 con `currentColor`. Los formatos oficiales **no** lo usan. |
| `app_support.html`   | `AppSupport.open` | Modal "Contacta al equipo de Ventel" (disparado por `[data-support-link]`). |

**`AppSession`** guarda `userName`/`userEmail`/`isAdvanced` en `localStorage`.
**`AppUrl`** centraliza construcción y navegación; `goHome()` respeta el rol (`dashboard`
vs `inicio_avanzado`); `param(name)` lee primero el valor inyectado por el servidor y luego
el query string del iframe. **`AppCache`** implementa *stale-while-revalidate* sobre
`localStorage` (prefijo `ventel-cache-`): pinta al instante y **siempre** revalida contra
el servidor.

---

## 6. Lógica de precios y descuentos (crítica)

Cada línea de producto puede llevar tres tipos de ajuste, con esta **precedencia**:

1. **Pago único (`costPaymentUnique`)** — si es > 0, **fija** el precio final de la línea e
   **ignora** los porcentajes de descuento. Es un precio de promoción cerrado.
2. **Descuento público (`discountPublicPercent`)** — porcentaje sobre el precio por volumen.
3. **Descuento adicional (`additionalDiscountPercent`)** — se aplica **encima** del público,
   solo si `AplicaDescAdicional = Si`.

Los porcentajes se guardan de **0 a 100** en la hoja; el formato CCL los espera como
**fracción de 0 a 1**.

Fórmula (línea):

```
priceVolume        = cantidad × precioUnitario
priceAfterPublic   = priceVolume × (1 − público/100)
finalLine          = priceAfterPublic × (1 − adicional/100)   // si aplica adicional
finalLine          = costPaymentUnique                        // si pago único > 0 (pisa todo)
subtotalSinIVA     = finalLine / 1.16
IVA                = finalLine − subtotalSinIVA
```

### 6.1 Tres implementaciones que deben concordar

La **misma** lógica está escrita en tres lugares. Si cambia una, deben cambiar las tres:

- **`cotizacion.html` → `calculateRow()`** — cálculo en vivo del formulario. Además, cuando
  el asesor teclea el pago único, **deriva** el % de descuento equivalente y lo escribe en
  la columna pública o en la adicional según el selector.
- **`Correos.gs` → `generateQuoteHtml()`** (y el cuerpo de `sendQuoteByEmail`) — recomponen
  el mismo cálculo para el PDF/correo.
- **`Formatos.gs` → `buildCclProductRow_()`** y su réplica **`cotizado_preview.html` →
  `computeCclRow()`** — traducen el producto a la fila de 16 columnas (A..P) del CCL.

> **Bug corregido (jul 2026):** cuando había **pago único + descuento adicional**, el CCL
> forzaba `Adicional=No` y metía el ajuste en la columna pública (J). Corregido: si el asesor
> marcó `Adicional=Si`, el pago único se traduce a la **columna O** (fracción adicional),
> conservando "Aplica descuento adicional = Si". `buildCclProductRow_` y `computeCclRow`
> **deben mantenerse idénticas**.

---

## 7. Seguridad y robustez

- **Contraseñas**: SHA-256 de `password + HASH_SALT`. ⚠️ *Limitaciones*: SHA-256 simple (sin
  bcrypt/scrypt, sin salt por usuario) es débil frente a fuerza bruta/tablas; `HASH_SALT`
  está **hardcodeado** en el fuente. Aceptable para una herramienta interna, pero es el
  punto a endurecer si el ámbito crece.
- **Autorización**: `getSupervisionQuotes`, `getFormatSettings` y `setQuoteFormatEnabled`
  verifican rol con `isAdvancedUser(email)`. **El resto de funciones RPC no exige sesión en
  el servidor** — la protección de las pantallas normales es de cliente (`requireSession`).
  Cualquiera con la URL desplegada podría invocar funciones no protegidas; tenerlo en cuenta.
- **Concurrencia**: `LockService` (30 s) alrededor de la generación de folio evita
  duplicados cuando dos asesores cotizan a la vez.
- **Validación de formato**: en guardado se cae al predeterminado ante un formato inválido;
  en generación de PDF se **lanza error** ante un formato desconocido (para detectar basura
  del cliente, no ocultarla).
- **Secretos en el repo**: `WEBHOOK_URL` (con `key`+`token`) y `HASH_SALT` viven en
  `Code.gs`. No publicar el fuente en un repositorio abierto sin rotarlos.

---

## 8. Configuración a revisar antes de desplegar

| Constante | Archivo | Qué es |
|-----------|---------|--------|
| `HASH_SALT` | `Code.gs` | Sal del hash de contraseñas. **No cambiar** tras registrar usuarios (invalidaría todos los logins). |
| `WEBHOOK_URL` | `Code.gs` | Webhook de Google Chat para avisos de nuevas cotizaciones. |
| `CCL_TEMPLATE_SHEET_ID` | `Formatos.gs` | ID de la Google Sheet plantilla del formato CCL. |
| `CCL_SHEET_NAME` | `Formatos.gs` | Pestaña dentro de la plantilla (`"Liverpool"`). |
| `CCL_EXPORT_OPTIONS` / `CCL_CONFIG` | `Formatos.gs` | Parámetros de export a PDF y celdas de datos. Ajustar si se rediseña la plantilla. |
| `MAIL_ALIAS` | `Correos.gs` | Alias "Enviar como" institucional del correo. |

Los nombres de las tres hojas (`REGISTROS_SHEET_NAME`, etc.) también deben coincidir con las
pestañas reales.

---

## 9. Despliegue y autorización

1. Subir los archivos al proyecto de Apps Script (editor web o `clasp push`).
2. **Publicar** como aplicación web (`Implementar > Nueva implementación > Aplicación web`),
   ejecutándose como el propietario y accesible según la política interna.
3. La primera vez, ejecutar **`probarAccesoCcl()`** desde el editor para disparar la pantalla
   de permisos (Drive/Sheets) y confirmar acceso a la plantilla CCL.
4. Para el envío desde el alias institucional se requiere el scope de **Gmail**
   (`https://mail.google.com/` en `appsscript.json`); tras agregarlo hay que **re-autorizar**.
5. Cada cambio en el código requiere **una nueva versión de la implementación** para que
   surta efecto en la URL pública.

---

## 10. Deuda técnica y riesgos conocidos

- **Lógica de precios triplicada** (§6.1): riesgo de divergencia. Idealmente se centraliza
  en un único módulo compartido servidor/cliente.
- **Hash de contraseñas débil** (§7). Migrar a un esquema con sal por usuario si el uso se
  amplía.
- **Falta de autorización servidor** en varias funciones RPC (§7).
- **Sheets como BD**: sin índices ni transacciones reales; el rendimiento degrada con
  decenas de miles de filas (cada consulta hace `getDataRange().getValues()`).
- **Dependencia de CDN** para GSAP: mitigada por degradación elegante en `app_motion`.
- **Verificación de imágenes** (`getVerifiedImageUrl`) hace múltiples `UrlFetchApp.fetch`
  secuenciales por producto sin imagen: puede alargar el envío en cotizaciones grandes.
- La integración con el **Portal Ventel** descrita en notas internas **no** está presente en
  esta carpeta (no hay `Index.html`, `Portal.gs`, `app_shell.html`). Este documento describe
  únicamente lo que existe en disco.
