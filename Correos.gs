/**
 * ===============================================================================
 * NUEVAS/MODIFICADAS FUNCIONES PARA ENVÍO DE CORREO HTML
 * ===============================================================================
 */

/**
 * Formatea un número como moneda MXN.
 * Función de utilidad para ser usada dentro de Apps Script.
 * @param {number} amount - La cantidad a formatear.
 * @return {string} La cantidad formateada como string (ej. $1,234.50).
 */
function formatCurrencyGS(amount) {
  if (isNaN(parseFloat(amount))) return "$0.00";
  return parseFloat(amount).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
}


/**
 * Genera el cuerpo HTML completo de una cotización para ser incrustado en un correo.
 * @param {string} folio - El folio de la cotización.
 * @return {object} - Objeto con { success: true, html: '...' } o { success: false, message: '...' }.
 */
function generateQuoteHtml(folio) {
  try {
    const quoteResponse = getQuoteDetails(folio);
    if (!quoteResponse.success) {
      return { success: false, message: "No se pudieron obtener los detalles de la cotización para generar el HTML." };
    }
    const data = quoteResponse.quote;

    let productsHtml = '';
    if (data.products && data.products.length > 0) {
      data.products.forEach(p => {
        const unitPrice = parseFloat(p.unitPrice) || 0;
        const quantity = parseInt(p.quantity) || 0;
        const priceVolume = unitPrice * quantity;
        let finalPricePerLine;
        let discountDisplayString = "-";
        const costPaymentUnique = parseFloat(p.costPaymentUnique) || 0;
        let discountPublicPercent = parseFloat(p.discountPublicPercent) || 0;
        const additionalDiscountApplied = p.additionalDiscountApplied === 'Si';
        let additionalDiscountPercent = parseFloat(p.additionalDiscountPercent) || 0;

        if (costPaymentUnique > 0 && quantity > 0 && unitPrice > 0) {
            finalPricePerLine = costPaymentUnique;
        } else {
            let priceAfterPublic = priceVolume * (1 - (discountPublicPercent / 100));
            priceAfterPublic = Math.max(0, priceAfterPublic);
            finalPricePerLine = priceAfterPublic;
            if (additionalDiscountApplied && additionalDiscountPercent > 0) {
                finalPricePerLine = priceAfterPublic * (1 - (additionalDiscountPercent / 100));
            }
            finalPricePerLine = Math.max(0, finalPricePerLine);
        }
        const totalMonetaryDiscount = priceVolume - finalPricePerLine;
        const effectiveTotalPercentage = priceVolume > 0 ? (totalMonetaryDiscount / priceVolume) * 100 : 0;

        if (totalMonetaryDiscount > 0.001) {
            let details = [];
            if (discountPublicPercent > 0.001 && !(costPaymentUnique > 0)) {
               details.push(`Púb: ${discountPublicPercent.toFixed(2)}%`);
            }
            if (additionalDiscountApplied && additionalDiscountPercent > 0.001 && !(costPaymentUnique > 0)) {
               details.push(`Adic: ${additionalDiscountPercent.toFixed(2)}%`);
            }
            if (details.length > 0) {
               discountDisplayString = `${details.join(' + ')}. Total: ${formatCurrencyGS(totalMonetaryDiscount)} (${effectiveTotalPercentage.toFixed(2)}% DesTot.)`;
            } else if (costPaymentUnique > 0) {
               discountDisplayString = `${formatCurrencyGS(totalMonetaryDiscount)} (${effectiveTotalPercentage.toFixed(2)}% DesTot.)`;
            } else {
               discountDisplayString = "-";
            }
        }
        
        productsHtml += `
          <tr>
            <td style="border: 1px solid #dddddd; padding: 6px 8px; text-align: left; vertical-align: top; word-break: break-word;">${p.sku || ''}</td>
            <td style="border: 1px solid #dddddd; padding: 6px 8px; text-align: center; vertical-align: top; word-break: break-word;">${quantity}</td>
            <td style="border: 1px solid #dddddd; padding: 6px 8px; text-align: left; vertical-align: top; word-break: break-word;">${p.description || ''}</td>
            <td style="border: 1px solid #dddddd; padding: 6px 8px; text-align: right; vertical-align: top; word-break: break-word;">${formatCurrencyGS(unitPrice)}</td>
            <td style="border: 1px solid #dddddd; padding: 6px 8px; text-align: right; vertical-align: top; word-break: break-word;">${formatCurrencyGS(priceVolume)}</td>
            <td style="border: 1px solid #dddddd; padding: 6px 8px; text-align: right; vertical-align: top; word-break: break-word;">${discountDisplayString}</td>
            <td style="border: 1px solid #dddddd; padding: 6px 8px; text-align: right; vertical-align: top; word-break: break-word; font-weight: 500;">${formatCurrencyGS(finalPricePerLine)}</td>
          </tr>
        `;
      });
    } else {
      productsHtml = '<tr><td colspan="7" style="text-align: center; padding: 1rem;">No hay productos en esta cotización.</td></tr>';
    }

    const observationsHtml = (data.observations && data.observations.trim() !== '') ? `
      <div style="margin-top: 15px; margin-bottom: 20px; font-size: 10pt; padding: 10px; background-color: #fdfdfd; border-radius: 4px; border: 1px solid #f0f0f0;">
        <h2 style="font-size: 14px; font-weight: 700; color: #E10098; margin-top:0; margin-bottom: 8px; border-bottom: 1px solid #eeeeee; padding-bottom: 4px;">Observaciones Adicionales</h2>
        <p style="white-space: pre-wrap; margin: 0; line-height: 1.5;">${data.observations}</p>
      </div>` : '';

    // HTML robusto para clientes de correo, usando tablas para el layout principal
    const fullHtml = `
      <div style="font-family: Arial, sans-serif; color: #333; background-color: #ffffff; max-width: 800px; margin: auto; border: 1px solid #ddd; padding: 20px;">
        <table width="100%" cellspacing="0" cellpadding="0" style="border-bottom: 2px solid #E10098; padding-bottom: 15px; margin-bottom: 25px;">
          <tr>
            <td valign="top">
              <h1 style="font-size: 24px; font-weight: 700; color: #E10098; margin: 0 0 5px 0;">COTIZACIÓN</h1>
              <p style="font-size: 11px; margin: 2px 0; color: #4A4A4A;"><strong>Folio:</strong> ${data.folio || 'N/A'}</p>
              <p style="font-size: 11px; margin: 2px 0; color: #4A4A4A;"><strong>Fecha de Emisión:</strong> ${data.timestamp ? new Date(data.timestamp).toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' }) : 'N/A'}</p>
            </td>
            <td valign="top" align="right">
              <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/3/35/Liverpool_logo.svg/1280px-Liverpool_logo.svg.png" alt="Logo Liverpool" style="max-height: 42px; width: auto; margin-bottom: 8px;">
              <p style="font-size: 10px; margin: 2px 0; color: #666666; text-align: right;">Centro de Contacto Liverpool</p>
              <p style="font-size: 10px; margin: 2px 0; color: #666666; text-align: right;">postventaomnicanal@liverpool.com.mx</p>
              <p style="font-size: 10px; margin: 2px 0; color: #666666; text-align: right;">Tel: 55 5262 9999, opción 3 (ext: ${data.advisorExt || 'N/A'})</p>
            </td>
          </tr>
        </table>
        <table width="100%" cellspacing="0" cellpadding="0" style="border-spacing: 15px; margin-bottom: 20px; font-size: 11px;">
          <tr>
            <td width="50%" valign="top" style="background-color: #fdfdfd; padding: 10px; border-radius: 4px; border: 1px solid #f0f0f0;">
              <h2 style="margin-top:0; font-size: 14px; font-weight: 700; color: #E10098; margin-bottom: 8px; border-bottom: 1px solid #eeeeee; padding-bottom: 4px;">Información del Asesor</h2>
              <p style="margin: 2px 0; line-height: 1.5;"><strong>Nombre:</strong> ${data.advisorName || 'N/A'}</p>
              <p style="margin: 2px 0; line-height: 1.5;"><strong>Puesto:</strong> Asesor de Ventas</p>
              <p style="margin: 2px 0; line-height: 1.5;"><strong>Extensión:</strong> ${data.advisorExt || 'N/A'}</p>
            </td>
            <td width="50%" valign="top" style="background-color: #fdfdfd; padding: 10px; border-radius: 4px; border: 1px solid #f0f0f0;">
              <h2 style="margin-top:0; font-size: 14px; font-weight: 700; color: #E10098; margin-bottom: 8px; border-bottom: 1px solid #eeeeee; padding-bottom: 4px;">Información del Cliente</h2>
              <p style="margin: 2px 0; line-height: 1.5;"><strong>Dirigida a:</strong> ${data.clientName || 'N/A'}</p>
              <p style="margin: 2px 0; line-height: 1.5;"><strong>Correo:</strong> ${data.clientEmail || 'N/A'}</p>
              <p style="margin: 2px 0; line-height: 1.5;"><strong>Teléfono:</strong> ${data.clientPhone || 'N/A'}</p>
            </td>
          </tr>
        </table>
        <h2 style="font-size: 14px; font-weight: 700; color: #E10098; margin-top: 20px; margin-bottom: 8px; border-bottom: 1px solid #eeeeee; padding-bottom: 4px;">Detalle de Productos</h2>
        <table width="100%" cellspacing="0" cellpadding="0" style="border-collapse: collapse; margin-bottom: 20px; font-size: 9pt;">
          <thead style="background-color: #f5f5f5; font-weight: 700;">
            <tr>
              <th style="width: 14%; border: 1px solid #dddddd; padding: 6px 8px; text-align: left;">SKU</th>
              <th style="width: 7%; text-align: center; border: 1px solid #dddddd; padding: 6px 8px;">Cant.</th>
              <th style="width: 26%; border: 1px solid #dddddd; padding: 6px 8px; text-align: left;">Descripción</th>
              <th style="width: 12%; text-align: right; border: 1px solid #dddddd; padding: 6px 8px;">P. Unitario</th>
              <th style="width: 13%; text-align: right; border: 1px solid #dddddd; padding: 6px 8px;">P. x Volumen</th>
              <th style="width: 14%; text-align: right; border: 1px solid #dddddd; padding: 6px 8px;">Desc. Aplicado</th>
              <th style="width: 14%; text-align: right; border: 1px solid #dddddd; padding: 6px 8px;">Total Fila</th>
            </tr>
          </thead>
          <tbody>${productsHtml}</tbody>
        </table>
        <table width="100%" cellspacing="0" cellpadding="0"><tr><td align="right">
          <table style="width: 45%; font-size: 10pt;">
            <tr><td style="padding: 6px 8px; border-bottom: 1px solid #eeeeee;">SUBTOTAL:</td><td style="padding: 6px 8px; border-bottom: 1px solid #eeeeee; text-align: right; font-weight: 500;">${formatCurrencyGS(data.summarySubtotal)}</td></tr>
            <tr><td style="padding: 6px 8px; border-bottom: 1px solid #eeeeee;">IVA (16%):</td><td style="padding: 6px 8px; border-bottom: 1px solid #eeeeee; text-align: right; font-weight: 500;">${formatCurrencyGS(data.summaryVat)}</td></tr>
            <tr style="font-size: 12pt; font-weight: 700; color: #E10098;"><td style="padding: 8px; border-top: 2px solid #333;">TOTAL A PAGAR:</td><td style="padding: 8px; text-align: right; border-top: 2px solid #333;">${formatCurrencyGS(data.summaryTotal)}</td></tr>
          </table>
        </td></tr></table>
        ${observationsHtml}
        <div style="font-size: 8pt; color: #555555; margin-top: 20px; line-height: 1.3;">
          <p>Precios y promociones sujetos a cambio sin previo aviso. Los precios incluyen IVA. La disponibilidad de los artículos está sujeta a existencias al momento de realizar la compra.</p>
        </div>
        <div style="font-size: 8pt; color: #888888; text-align: center; border-top: 1px solid #eeeeee; padding-top: 10px; margin-top: 25px;">
          <p>Gracias por su preferencia.<br>Liverpool - Es parte de mi vida</p>
        </div>
      </div>
    `;
    return { success: true, html: fullHtml };
  } catch (error) {
    Logger.log(`Error en generateQuoteHtml para folio ${folio}: ${error.message}`);
    return { success: false, message: `Error al generar el HTML de la cotización: ${error.message}` };
  }
}

/**
 * Obtiene los detalles básicos de una cotización para rellenar el formulario de correo.
 * @param {string} folio - El folio de la cotización a buscar.
 * @return {object} Un objeto con los datos del cliente.
 */
function getQuoteDetailsForEmail(folio) {
  try {
    if (!folio) throw new Error("El folio es requerido.");

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const cotizacionesSheet = ss.getSheetByName(COTIZACIONES_SHEET_NAME);
    if (!cotizacionesSheet) throw new Error(`Hoja "${COTIZACIONES_SHEET_NAME}" no encontrada.`);

    const cotAllData = cotizacionesSheet.getDataRange().getValues();
    if (cotAllData.length <= 1) return { success: false, message: "No hay cotizaciones en la hoja." };

    const cotHeaders = cotAllData.shift();
    const folioColIdx = cotHeaders.indexOf("Folio");
    const clientNameColIdx = cotHeaders.indexOf("ClienteNombre");
    const clientEmailColIdx = cotHeaders.indexOf("CorreoCliente");

    if ([folioColIdx, clientNameColIdx, clientEmailColIdx].includes(-1)) {
        throw new Error("Faltan columnas requeridas en la hoja 'Cotizaciones'. Verifica: Folio, ClienteNombre, CorreoCliente.");
    }

    const quoteRow = cotAllData.find(row => row[folioColIdx] == folio);
    if (!quoteRow) return { success: false, message: `No se encontró la cotización con el folio ${folio}.` };
    
    const details = {
      folio: quoteRow[folioColIdx],
      clientName: quoteRow[clientNameColIdx],
      clientEmail: quoteRow[clientEmailColIdx]
    };

    Logger.log(`Detalles para formulario de correo recuperados para folio ${folio}`);
    return { success: true, data: details };

  } catch (error) {
    Logger.log(`Error en getQuoteDetailsForEmail para folio ${folio}: ${error.message}`);
    return { success: false, message: `Error del servidor: ${error.message}` };
  }
}

/**
 * Envía un correo electrónico con la cotización en formato HTML incrustada en el cuerpo.
 * @param {object} emailData - Objeto con {to, subject, body, folio}.
 * @return {object} Un objeto indicando el resultado del envío.
 */
function sendQuoteByEmail(emailData) {
  try {
    if (!emailData.to || !emailData.subject || !emailData.body || !emailData.folio) {
      throw new Error("Faltan datos para enviar el correo (to, subject, body, folio).");
    }
    
    // 1. Generar el HTML de la cotización
    const quoteHtmlResponse = generateQuoteHtml(emailData.folio);
    if (!quoteHtmlResponse.success) {
      throw new Error(quoteHtmlResponse.message);
    }
    const quoteHtml = quoteHtmlResponse.html;

    // 2. Combinar el mensaje del usuario con la cotización
    const userMessageHtml = emailData.body.replace(/\n/g, '<br>');
    const finalHtmlBody = `
      <div style="font-family: Arial, sans-serif; font-size: 14px; color: #333;">
        ${userMessageHtml}
        <hr style="border: none; border-top: 1px solid #ccc; margin: 20px 0;">
        ${quoteHtml}
      </div>
    `;

    // 3. Enviar el correo
    const options = {
      htmlBody: finalHtmlBody,
      name: 'Sistema de Cotizaciones Ventel' // Nombre del remitente que verá el cliente
    };

    MailApp.sendEmail(emailData.to, emailData.subject, '', options);
    Logger.log(`Correo HTML enviado a ${emailData.to} para el folio ${emailData.folio}`);

    // 4. Actualizar el estatus de la cotización a "Enviada por Correo"
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const cotizacionesSheet = ss.getSheetByName(COTIZACIONES_SHEET_NAME);
    const cotHeaders = cotizacionesSheet.getRange(1, 1, 1, cotizacionesSheet.getLastColumn()).getValues()[0];
    const folioColIdx = cotHeaders.indexOf("Folio");
    const statusColIdx = cotHeaders.indexOf("Estatus");
    
    if (folioColIdx > -1 && statusColIdx > -1) {
      const cotDataValues = cotizacionesSheet.getDataRange().getValues();
      for (let i = 1; i < cotDataValues.length; i++) {
          if (cotDataValues[i][folioColIdx] == emailData.folio) {
              cotizacionesSheet.getRange(i + 1, statusColIdx + 1).setValue("Enviada por Correo");
              break;
          }
      }
    }

    return { success: true, message: "Correo enviado exitosamente." };

  } catch (error) {
    Logger.log(`Error al enviar correo para folio ${emailData.folio}: ${error.message} Stack: ${error.stack}`);
    return { success: false, message: `No se pudo enviar el correo: ${error.message}` };
  }
}
