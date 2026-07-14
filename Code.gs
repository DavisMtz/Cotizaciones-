/**
 * =================================================================================================
 * Codigo del Sistema de cotizaciones Ventel | David Martinez - Asesor de Ventas telefonicas e internet/ Apoyo
 * Version 1.0
 * =================================================================================================
 * Este script actúa como el backend para una aplicación web de cotizaciones.
 * Gestiona las siguientes funcionalidades principales:
 * 1.  Servicio de páginas HTML: Sirve las diferentes vistas de la aplicación (login, registro, dashboard, etc.).
 * 2.  Gestión de Usuarios: Registro y autenticación de usuarios con roles (Normal/Avanzado).
 * 3.  Operaciones CRUD para Cotizaciones: Crear, leer, actualizar y gestionar cotizaciones.
 * 4.  Almacenamiento de Datos: Utiliza Google Sheets como base de datos.
 * 5.  Generación de PDF: Crea un archivo PDF de la cotización.
 * 6.  Dashboard Analítico: Provee datos para el dashboard de usuarios avanzados.
 * 7.  Notificaciones Webhook: Envía notificaciones a un chat cuando se crea una nueva cotización.
 */

// --- Constantes Globales ---
const REGISTROS_SHEET_NAME = "Registros";
const COTIZACIONES_SHEET_NAME = "Cotizaciones";
const DETALLE_COTIZACIONES_SHEET_NAME = "DetalleCotizaciones";
const HASH_SALT = "vPe/O5s2aG+Bv4cRGCwz+w=="; 
const WEBHOOK_URL = "https://chat.googleapis.com/v1/spaces/AAQAF6OTWgk/messages?key=AIzaSyDdI0hCZtE6vySjMm-WEfRq3CPzqKqqsHI&token=eUUUkEFC28CJYK0au8d5fRWkiZX5h7Zd7T-cAerb5wI";

/**
 * Obtiene la URL base de la aplicación web una vez que ha sido desplegada.
 * Es útil para construir URLs completas dentro del script o en el lado del cliente.
 * @return {string | null} La URL de la aplicación web desplegada, o null si ocurre un error.
 */
function getScriptUrl() {
  try {
  
    return ScriptApp.getService().getUrl();
  } catch (error) {
    Logger.log("Error en getScriptUrl: " + error.message + " Stack: " + error.stack);
    return null;
  }
}

/**
 * Función principal que se ejecuta cuando se accede a la URL de la aplicación web (solicitud GET).
 * Actúa como un enrutador, sirviendo diferentes páginas HTML según el parámetro 'page' en la URL.
 * {object} e - El objeto de evento de la solicitud, que contiene los parámetros de la URL.
 */
function doGet(e) {
  Logger.log("Parámetros doGet: " + JSON.stringify(e.parameter));
  let page = e.parameter.page || 'login';
  let template;

  switch (page) {
    case 'registro':
      template = HtmlService.createTemplateFromFile('registro');
      return template.evaluate().setTitle('Crear Cuenta - Sistema Ventel').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
    
    case 'inicio_avanzado':
      template = HtmlService.createTemplateFromFile('inicio_avanzado');
      return template.evaluate().setTitle('Dashboard Avanzado - Sistema Ventel').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);

    case 'dashboard':
      template = HtmlService.createTemplateFromFile('inicio');
      return template.evaluate().setTitle('Dashboard - Sistema Ventel').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);

    case 'cotizacion':
      template = HtmlService.createTemplateFromFile('cotizacion');
      template.folio = e.parameter.folio || null;
      return template.evaluate().setTitle('Cotización - Sistema Ventel').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);

    case 'cotizado_preview':
      template = HtmlService.createTemplateFromFile('cotizado_preview');
      template.folio = e.parameter.folio || null;
      return template.evaluate().setTitle('Vista Previa de Cotización').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
    
    case 'consulta_cotizacion':
      template = HtmlService.createTemplateFromFile('consulta_cotizacion');
      template.folio = e.parameter.folio || null;
      return template.evaluate().setTitle('Consulta de Cotización').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);

    case 'login':
    default:
      template = HtmlService.createTemplateFromFile('inicioDeSesion');
      return template.evaluate().setTitle('Iniciar Sesión - Sistema Ventel').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
      
      // --- AÑADE ESTE NUEVO BLOQUE ---
    case 'correoventel':
      template = HtmlService.createTemplateFromFile('correoventel');
      return template.evaluate().setTitle('Enviar Correo - Sistema Ventel').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
    // --- FIN DEL BLOQUE A AÑADIR ---
  }
}

/**
 * Permite incluir el contenido de otros archivos (como CSS o JS) dentro de una plantilla HTML principal.
 * Se usa en las plantillas con la sintaxis: <?!= include('nombre_archivo.html'); ?>
 * {string} filename - El nombre del archivo a incluir.
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/**
 * Obtiene el correo electrónico del usuario que está ejecutando el script.
 * Se llama desde el lado del cliente para identificar al usuario activo.
 */
function getUserEmail() {
  try {
    return Session.getActiveUser().getEmail();
  } catch (e) {
    Logger.log("Error obteniendo email del usuario: " + e.toString());
    return null; // El cliente debe ser capaz de manejar un valor nulo.
  }
}

/**
 * Registra un nuevo usuario en la hoja 'Registros'.
 * Verifica si el correo ya existe, valida la contraseña y la guarda con un hash.
 * {string} name - El nombre del usuario.
 * {string} email - El correo electrónico del usuario.
 * {string} password - La contraseña en texto plano.
 */
function registerUser(name, email, password) {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(REGISTROS_SHEET_NAME);
    if (!sheet) throw new Error(`Hoja '${REGISTROS_SHEET_NAME}' no encontrada.`);

    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const emailColumnIndex = headers.indexOf("Email");
    if (emailColumnIndex === -1) throw new Error("Columna 'Email' no encontrada.");

    const data = sheet.getDataRange().getValues();
    const emailExists = data.slice(1).some(row => row[emailColumnIndex] === email);
    if (emailExists) return { success: false, message: "El correo electrónico ya está registrado." };

    if (!password || password.length < 6) return { success: false, message: "La contraseña debe tener al menos 6 caracteres." };

    const passwordHash = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, password + HASH_SALT);
    const passwordHashString = passwordHash.map(byte => ('0' + (byte & 0xFF).toString(16)).slice(-2)).join('');

    // Se añade 'No' a la columna 'Avanzado' por defecto en el nuevo registro.
    sheet.appendRow([new Date(), name, email, passwordHashString, 'No']);
    
    Logger.log("Usuario registrado: " + email);
    return { success: true, message: "Usuario registrado exitosamente." };
  } catch (error) {
    Logger.log("Error en registerUser: " + error.message);
    return { success: false, message: "Error interno al registrar usuario: " + error.message };
  }
}

/**
 * Valida las credenciales de un usuario para iniciar sesión y determina su nivel de acceso.
 * {string} email - El correo del usuario.
 * {string} password - La contraseña proporcionada por el usuario.
 */
function loginUser(email, password) {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(REGISTROS_SHEET_NAME);
    if (!sheet) throw new Error(`Hoja '${REGISTROS_SHEET_NAME}' no encontrada.`);

    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const nameColumnIndex = headers.indexOf("Nombre");
    const emailColumnIndex = headers.indexOf("Email");
    const passwordHashColumnIndex = headers.indexOf("PasswordHash");
    const avanzadoColumnIndex = headers.indexOf("Avanzado");

    if (emailColumnIndex === -1 || passwordHashColumnIndex === -1 || nameColumnIndex === -1 || avanzadoColumnIndex === -1) {
      throw new Error("Columnas requeridas no encontradas en '" + REGISTROS_SHEET_NAME + "'. Verifique 'Nombre', 'Email', 'PasswordHash', 'Avanzado'.");
    }

    const data = sheet.getDataRange().getValues();
    const userRow = data.find(row => row[emailColumnIndex] === email);

    if (!userRow) return { success: false, message: "Correo o contraseña incorrectos." };

    const storedHash = userRow[passwordHashColumnIndex];
    const providedHashBytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, password + HASH_SALT);
    const providedHashString = providedHashBytes.map(byte => ('0' + (byte & 0xFF).toString(16)).slice(-2)).join('');

    if (providedHashString === storedHash) {
      const isAdvanced = userRow[avanzadoColumnIndex] === 'Si';
      Logger.log(`Login exitoso para: ${email}. Es avanzado: ${isAdvanced}`);
      
      return { 
        success: true, 
        message: "Inicio de sesión exitoso.", 
        userName: userRow[nameColumnIndex], 
        userEmail: userRow[emailColumnIndex],
        isAdvanced: isAdvanced // El cliente usará esto para redirigir.
      };
    } else {
      Logger.log("Intento de login fallido para: " + email);
      return { success: false, message: "Correo o contraseña incorrectos." };
    }
  } catch (error) {
    Logger.log("Error en loginUser: " + error.message);
    return { success: false, message: "Error interno al iniciar sesión: " + error.message };
  }
}

/**
 * Genera un folio único para una nueva cotización con el formato LVP-AAMMDD-XXXX.
 * El número secuencial (XXXX) se reinicia cada día.
 * {GoogleAppsScript.Spreadsheet.Sheet} sheet - La hoja de 'Cotizaciones'.
 */
function generateLvpFolio(sheet) {
  const HOY = new Date();
  const ANIO = HOY.getFullYear().toString().slice(-2); // Últimos 2 dígitos del año
  const MES = (HOY.getMonth() + 1).toString().padStart(2, '0'); // Mes con 2 dígitos
  const DIA = HOY.getDate().toString().padStart(2, '0'); // Día con 2 dígitos

  let newFolioNumber = 1; // El número secuencial empieza en 1.
  const lastRow = sheet.getLastRow();

  if (lastRow > 1) { // Si hay cotizaciones existentes.
    const folios = sheet.getRange(2, 1, lastRow - 1, 1).getValues().map(r => r[0].toString());
    const prefix = `LVP-${ANIO}${MES}${DIA}-`; // Prefijo para los folios del día de hoy.
    const foliosDelDia = folios.filter(f => f.startsWith(prefix));

    if (foliosDelDia.length > 0) {
      // Si ya hay folios para hoy, encuentra el número más alto y le suma 1.
      const numerosSecuenciales = foliosDelDia.map(f => parseInt(f.substring(prefix.length)) || 0);
      newFolioNumber = Math.max(...numerosSecuenciales) + 1;
    }
  }
  // Construye y retorna el nuevo folio completo, rellenando el número con ceros a la izquierda.
  return `LVP-${ANIO}${MES}${DIA}-${newFolioNumber.toString().padStart(4, '0')}`;
}

/**
 * Guarda o actualiza los datos de una cotización en las hojas 'Cotizaciones' y 'DetalleCotizaciones'.
 * quoteData - El objeto con todos los datos de la cotización.
 * status - El estado de la cotización (ej. "Folio Generado").
 */
function saveQuoteDataToSheets(quoteData, status, pdfLink = null) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const cotizacionesSheet = ss.getSheetByName(COTIZACIONES_SHEET_NAME);
  const detalleSheet = ss.getSheetByName(DETALLE_COTIZACIONES_SHEET_NAME);

  if (!cotizacionesSheet) throw new Error(`Hoja "${COTIZACIONES_SHEET_NAME}" no encontrada.`);
  if (!detalleSheet) throw new Error(`Hoja "${DETALLE_COTIZACIONES_SHEET_NAME}" no encontrada.`);

  const mainQuoteRowData = [
    quoteData.folio,
    quoteData.timestamp || new Date(),
    quoteData.advisorEmail || (Session.getActiveUser() ? Session.getActiveUser().getEmail() : null),
    quoteData.advisorName || '',
    quoteData.advisorExt || '',
    quoteData.clientName || '',
    quoteData.clientEmail || '',
    quoteData.clientPhone || '',
    parseFloat(quoteData.summarySubtotal) || 0,
    parseFloat(quoteData.summaryVat) || 0,
    parseFloat(quoteData.summaryTotal) || 0,
    status,
    quoteData.observations || '',
    pdfLink || ''
  ];

  const cotHeaders = cotizacionesSheet.getRange(1, 1, 1, cotizacionesSheet.getLastColumn()).getValues()[0];
  const folioColIdxCot = cotHeaders.indexOf("Folio");
  if (folioColIdxCot === -1) throw new Error("Columna 'Folio' no encontrada en la hoja 'Cotizaciones'.");

  let existingRowIndexCot = -1;
  const cotDataValues = cotizacionesSheet.getDataRange().getValues();
  for (let i = 1; i < cotDataValues.length; i++) {
    if (cotDataValues[i][folioColIdxCot] == quoteData.folio) {
      existingRowIndexCot = i + 1;
      break;
    }
  }

  if (existingRowIndexCot > 0) {
    cotizacionesSheet.getRange(existingRowIndexCot, 1, 1, mainQuoteRowData.length).setValues([mainQuoteRowData]);
    Logger.log(`Cotización principal actualizada en hoja: ${quoteData.folio}`);
  } else {
    // Este bloque solo se ejecuta para una cotización NUEVA.
    cotizacionesSheet.appendRow(mainQuoteRowData);
    Logger.log(`Cotización principal guardada en hoja: ${quoteData.folio}`);

    sendWebhookNotification(quoteData.folio);
  }

  const detHeaders = detalleSheet.getRange(1, 1, 1, detalleSheet.getLastColumn()).getValues()[0];
  const folioColIdxDet = detHeaders.indexOf("FolioCotizacion");
  if (folioColIdxDet === -1) throw new Error("Columna 'FolioCotizacion' no encontrada en la hoja 'DetalleCotizaciones'.");

  const detDataValues = detalleSheet.getDataRange().getValues();
  const rowsToDelete = [];
  for (let i = detDataValues.length - 1; i >= 1; i--) {
    if (detDataValues[i][folioColIdxDet] == quoteData.folio) {
      rowsToDelete.push(i + 1);
    }
  }
  rowsToDelete.sort((a, b) => b - a).forEach(rowIndex => detalleSheet.deleteRow(rowIndex));

  if (quoteData.products && quoteData.products.length > 0) {
    const productDetailsRows = quoteData.products.map(p => [
      quoteData.folio,
      p.sku || '',
      p.description || '',
      parseInt(p.quantity) || 0,
      parseFloat(p.unitPrice) || 0,
      parseFloat(p.costPaymentUnique) || 0,
      parseFloat(p.discountPublicPercent) || 0,
      p.additionalDiscountApplied || 'No',
      parseFloat(p.additionalDiscountPercent) || 0
    ]);
    detalleSheet.getRange(detalleSheet.getLastRow() + 1, 1, productDetailsRows.length, productDetailsRows[0].length)
                .setValues(productDetailsRows);
    Logger.log(`Detalles de productos guardados para folio ${quoteData.folio}: ${productDetailsRows.length} productos.`);
  }
}
/**
 * Guarda los datos de la cotización con estado "Folio Generado" para la vista previa.
 * quoteDataFromClient - Los datos de la cotización enviados desde el cliente.
 */
function saveQuoteAndGoToPreview(quoteDataFromClient) {
  Logger.log("saveQuoteAndGoToPreview - Datos recibidos: " + JSON.stringify(quoteDataFromClient));
  try {
    if (!quoteDataFromClient) throw new Error("No se recibieron datos de la cotización.");
    
    if (!quoteDataFromClient.advisorEmail) {
      quoteDataFromClient.advisorEmail = Session.getActiveUser() ? Session.getActiveUser().getEmail() : null;
    }
    if (!quoteDataFromClient.advisorName && quoteDataFromClient.advisorEmail) {
        const registrosSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(REGISTROS_SHEET_NAME);
        if (registrosSheet) {
            const regHeaders = registrosSheet.getRange(1,1,1,registrosSheet.getLastColumn()).getValues()[0];
            const emailIdx = regHeaders.indexOf("Email");
            const nameIdx = regHeaders.indexOf("Nombre");
            if (emailIdx > -1 && nameIdx > -1) {
                const regData = registrosSheet.getDataRange().getValues();
                const advisorRow = regData.find(row => row[emailIdx] === quoteDataFromClient.advisorEmail);
                if (advisorRow) quoteDataFromClient.advisorName = advisorRow[nameIdx];
            }
        }
    }

    if (!quoteDataFromClient.folio) {
      const cotizacionesSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(COTIZACIONES_SHEET_NAME);
      if (!cotizacionesSheet) throw new Error(`Hoja "${COTIZACIONES_SHEET_NAME}" no encontrada.`);
      quoteDataFromClient.folio = generateLvpFolio(cotizacionesSheet);
      Logger.log("Nuevo folio generado para vista previa: " + quoteDataFromClient.folio);
    } else {
      Logger.log("Actualizando cotización para vista previa con folio: " + quoteDataFromClient.folio);
    }
    
    quoteDataFromClient.timestamp = new Date();
    saveQuoteDataToSheets(quoteDataFromClient, "Folio Generado");

    return {
      success: true,
      folio: quoteDataFromClient.folio,
      message: `Datos de cotización ${quoteDataFromClient.folio} preparados.`
    };

  } catch (error) {
    Logger.log("Error en saveQuoteAndGoToPreview: " + error.message);
    return { success: false, message: "Error del servidor: " + error.message, folio: quoteDataFromClient ? quoteDataFromClient.folio : null };
  }
}

/**
 * Obtiene las cotizaciones para el usuario o realiza una búsqueda general.
 * @param {string} callingUserEmail - El email del usuario que llama la función (asesor).
 * @param {string} searchTerm - El término de búsqueda.
 */
function getQuotesForUser(callingUserEmail, searchTerm) {
  Logger.log(`getQuotesForUser - Email: ${callingUserEmail}, SearchTerm: ${searchTerm}`);
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(COTIZACIONES_SHEET_NAME);
    if (!sheet) {
      return { success: false, quotes: null, message: `Hoja '${COTIZACIONES_SHEET_NAME}' no encontrada.` };
    }

    const allSheetData = sheet.getDataRange().getValues();
    if (allSheetData.length <= 1) {
      return { success: true, quotes: [], message: "No hay cotizaciones registradas." };
    }
    
    const headers = allSheetData.shift() || [];
    const folioIdx = headers.indexOf("Folio");
    const clienteNombreIdx = headers.indexOf("ClienteNombre");
    const timestampIdx = headers.indexOf("Timestamp");
    const totalIdx = headers.indexOf("TotalGeneral");
    const statusIdx = headers.indexOf("Estatus");
    const advisorCorreoIdx = headers.indexOf("AsesorCorreo");
    const clienteCorreoIdx = headers.indexOf("CorreoCliente");

    const requiredCols = ["Folio", "ClienteNombre", "Timestamp", "TotalGeneral", "Estatus", "AsesorCorreo"];
    const missingCols = requiredCols.filter(col => headers.indexOf(col) === -1);
    if (missingCols.length > 0) {
      const errorMsg = `Columnas requeridas no encontradas en '${COTIZACIONES_SHEET_NAME}': ${missingCols.join(", ")}.`;
      return { success: false, quotes: null, message: errorMsg };
    }
    
    let resultingQuotes = [];
    if (searchTerm && searchTerm.trim() !== "") {
      const lowerSearchTerm = searchTerm.trim().toLowerCase();
      resultingQuotes = allSheetData.filter(row => {
        const folio = String(row[folioIdx] || '').toLowerCase();
        const clienteNombre = String(row[clienteNombreIdx] || '').toLowerCase();
        const clienteCorreo = String(row[clienteCorreoIdx] || '').toLowerCase();
        return folio.includes(lowerSearchTerm) || clienteNombre.includes(lowerSearchTerm) || clienteCorreo.includes(lowerSearchTerm);
      });
    } else if (callingUserEmail) {
      const lowerCallingUserEmail = callingUserEmail.trim().toLowerCase();
      resultingQuotes = allSheetData.filter(row => String(row[advisorCorreoIdx] || '').toLowerCase() === lowerCallingUserEmail);
    } else {
      return { success: true, quotes: [], message: "Inicia sesión para ver tus cotizaciones o realiza una búsqueda." };
    }

    const formattedQuotes = resultingQuotes.map(row => ({
      folio: row[folioIdx],
      cliente: row[clienteNombreIdx],
      fecha: (row[timestampIdx] instanceof Date) 
                ? row[timestampIdx].toLocaleDateString('es-MX', {day:'2-digit', month:'short', year:'numeric'}) 
                : (row[timestampIdx] ? new Date(row[timestampIdx]).toLocaleDateString('es-MX', {day:'2-digit', month:'short', year:'numeric'}) : 'N/A'),
      total: parseFloat(row[totalIdx]) || 0,
      estatus: row[statusIdx] || "Pendiente"
    }));
    
    formattedQuotes.sort((a, b) => (String(b.folio) || '').localeCompare(String(a.folio) || ''));
    return { success: true, quotes: formattedQuotes, message: null };

  } catch (error) {
    Logger.log(`Error en getQuotesForUser: ${error.message} Stack: ${error.stack}`);
    return { success: false, quotes: null, message: `Error interno al obtener cotizaciones: ${error.message}` };
  }
}

/**
 * Obtiene todos los detalles de una cotización específica (datos principales y lista de productos).
 * @param {string} folio - El folio de la cotización a buscar.
 */
function getQuoteDetails(folio) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const cotizacionesSheet = ss.getSheetByName(COTIZACIONES_SHEET_NAME);
    const detalleSheet = ss.getSheetByName(DETALLE_COTIZACIONES_SHEET_NAME);

    if (!cotizacionesSheet) throw new Error(`Hoja "${COTIZACIONES_SHEET_NAME}" no encontrada.`);
    if (!detalleSheet) throw new Error(`Hoja "${DETALLE_COTIZACIONES_SHEET_NAME}" no encontrada.`);
    
    const cotAllData = cotizacionesSheet.getDataRange().getValues();
    if (cotAllData.length === 0) return { success: false, message: "Hoja de cotizaciones vacía." };
    const cotHeaders = cotAllData.shift() || [];
    const folioColIdxCot = cotHeaders.indexOf("Folio");
    if (folioColIdxCot === -1) throw new Error("Columna 'Folio' no encontrada en 'Cotizaciones'.");
    
    const quoteRow = cotAllData.find(row => row[folioColIdxCot] == folio);
    if (!quoteRow) return { success: false, message: "Cotización no encontrada." };

    const quoteDetails = {
      folio: quoteRow[cotHeaders.indexOf("Folio")],
      timestamp: quoteRow[cotHeaders.indexOf("Timestamp")],
      advisorEmail: quoteRow[cotHeaders.indexOf("AsesorCorreo")],
      advisorName: quoteRow[cotHeaders.indexOf("AsesorNombre")],
      advisorExt: quoteRow[cotHeaders.indexOf("Extencion")],
      clientName: quoteRow[cotHeaders.indexOf("ClienteNombre")],
      clientEmail: quoteRow[cotHeaders.indexOf("CorreoCliente")],
      clientPhone: quoteRow[cotHeaders.indexOf("Numero")],
      summarySubtotal: quoteRow[cotHeaders.indexOf("Subtotal")],
      summaryVat: quoteRow[cotHeaders.indexOf("IVA")],
      summaryTotal: quoteRow[cotHeaders.indexOf("TotalGeneral")],
      status: quoteRow[cotHeaders.indexOf("Estatus")],
      observations: quoteRow[cotHeaders.indexOf("Observaciones")]
    };

    if (quoteDetails.timestamp && quoteDetails.timestamp instanceof Date) {
        quoteDetails.timestamp = quoteDetails.timestamp.toISOString();
    } else if (quoteDetails.timestamp) { 
        const parsedDate = new Date(quoteDetails.timestamp);
        if (!isNaN(parsedDate)) quoteDetails.timestamp = parsedDate.toISOString();
    }
    
    quoteDetails.products = [];
    const detAllData = detalleSheet.getDataRange().getValues();
    if (detAllData.length > 1) {
        const detHeaders = detAllData.shift() || [];
        const folioColIdxDet = detHeaders.indexOf("FolioCotizacion");
        const productRows = detAllData.filter(row => row[folioColIdxDet] == folio);
        
        quoteDetails.products = productRows.map(productRow => ({
          sku: productRow[detHeaders.indexOf("SKU")] || '',
          description: productRow[detHeaders.indexOf("DescripcionProducto")] || '',
          quantity: parseInt(productRow[detHeaders.indexOf("Cantidad")]) || 0,
          unitPrice: parseFloat(productRow[detHeaders.indexOf("PrecioUnitarioBase")]) || 0,
          costPaymentUnique: parseFloat(productRow[detHeaders.indexOf("CostoPagoUnicoLinea")]) || 0,
          discountPublicPercent: parseFloat(productRow[detHeaders.indexOf("DescPublicoPorcentaje")]) || 0,
          additionalDiscountApplied: productRow[detHeaders.indexOf("AplicaDescAdicional")] || 'No',
          additionalDiscountPercent: parseFloat(productRow[detHeaders.indexOf("PorcentajeDescAdicional")]) || 0
        }));
    }
    
    Logger.log(`Detalles recuperados para folio ${folio}: ${quoteDetails.products.length} productos.`);
    return { success: true, quote: quoteDetails };

  } catch (error) {
    Logger.log("Error en getQuoteDetails para folio " + folio + ": " + error.message + " Stack: " + error.stack);
    return { success: false, message: "Error al obtener detalles de cotización: " + error.message };
  }
}


/**
 * Obtiene todas las estadísticas necesarias para el dashboard avanzado.
 * @return {object} Un objeto con todas las métricas calculadas.
 */
function getDashboardStats() {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(COTIZACIONES_SHEET_NAME);
    if (!sheet) throw new Error(`Hoja '${COTIZACIONES_SHEET_NAME}' no encontrada.`);

    const values = sheet.getDataRange().getValues();
    if (values.length <= 1) {
      return { success: true, stats: { currentMonthCount: 0, previousMonthCount: 0, quotesPerUser: [], last7Days: [], today: [], lastQuotes: [] } };
    }
    
    const headers = values.shift();
    const colMap = {};
    headers.forEach((h, i) => colMap[h] = i);

    const now = new Date();
    const firstDayCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const firstDayNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const firstDayPreviousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(now.getDate() - 7);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    let currentMonthCount = 0;
    let previousMonthCount = 0;
    const quotesPerUserCurrentMonth = {};
    const activityQuotes = [];

    values.forEach(row => {
      const quoteDate = new Date(row[colMap["Timestamp"]]);
      if (isNaN(quoteDate.getTime())) return;

      const advisorName = row[colMap["AsesorNombre"]] || 'No asignado';

      if (quoteDate >= firstDayCurrentMonth && quoteDate < firstDayNextMonth) {
        currentMonthCount++;
        quotesPerUserCurrentMonth[advisorName] = (quotesPerUserCurrentMonth[advisorName] || 0) + 1;
      }
      
      if (quoteDate >= firstDayPreviousMonth && quoteDate < firstDayCurrentMonth) {
        previousMonthCount++;
      }
      
      activityQuotes.push({
          rawDate: quoteDate,
          advisorName: advisorName,
          clientName: row[colMap["ClienteNombre"]] || 'N/A',
          folio: row[colMap["Folio"]] || 'N/A'
      });
    });

    // --- CORRECCIÓN AQUÍ ---
    // Se construyen objetos nuevos explícitamente para evitar enviar el objeto 'rawDate' (que no es serializable) al cliente.
    // Esto evita que la función devuelva 'null' y cause el error en el frontend.
    const today = activityQuotes
      .filter(q => q.rawDate >= todayStart)
      .sort((a,b) => b.rawDate - a.rawDate)
      .map(q => ({
          advisorName: q.advisorName,
          clientName: q.clientName,
          folio: q.folio
      }));

    const last7Days = activityQuotes
      .filter(q => q.rawDate >= sevenDaysAgo)
      .sort((a,b) => b.rawDate - a.rawDate)
      .map(q => ({
          advisorName: q.advisorName,
          clientName: q.clientName,
          folio: q.folio
      }));


    const sortedValues = values
        .slice()
        .sort((a, b) => new Date(b[colMap["Timestamp"]]) - new Date(a[colMap["Timestamp"]]));

    const lastQuotes = sortedValues.slice(0, 5).map(row => ({
        folio: row[colMap["Folio"]],
        cliente: row[colMap["ClienteNombre"]],
        fecha: new Date(row[colMap["Timestamp"]]).toLocaleDateString('es-MX'),
        total: parseFloat(row[colMap["TotalGeneral"]]) || 0,
        estatus: row[colMap["Estatus"]]
    }));

    const quotesPerUserArray = Object.entries(quotesPerUserCurrentMonth)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count);

    return {
      success: true,
      stats: {
        currentMonthCount,
        previousMonthCount,
        quotesPerUser: quotesPerUserArray,
        last7Days,
        today,
        lastQuotes
      }
    };
  } catch (error) {
    Logger.log("Error en getDashboardStats: " + error.message + " Stack: " + error.stack);
    return { success: false, message: "Error al obtener estadísticas: " + error.message };
  }
}

/**
 * Envía una notificación a Google Chat a través de un Webhook.
 * @param {string} folio - El folio de la cotización recién creada.
 */
function sendWebhookNotification(folio) {
  if (!WEBHOOK_URL) {
    Logger.log("URL de Webhook no configurada. Omitiendo notificación.");
    return;
  }
  
  try {
    const message = `Se ha generado una nueva cotización con el folio *${folio}*. Es importante que se realice la revisión.`;
    const payload = { 'text': message };
    
    const options = {
      'method': 'post',
      'contentType': 'application/json',
      'payload': JSON.stringify(payload)
    };
    
    UrlFetchApp.fetch(WEBHOOK_URL, options);
    Logger.log(`Notificación de webhook enviada para el folio: ${folio}`);
  } catch (error) {
    Logger.log(`Error al enviar la notificación de webhook para el folio ${folio}: ${error.message}`);
  }
}

