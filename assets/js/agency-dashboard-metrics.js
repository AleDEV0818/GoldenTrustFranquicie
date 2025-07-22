/**
 * Actualizador de Métricas del Dashboard de Agencia
 * -------------------------------------------------
 * Este script gestiona la actualización automática y manual de los paneles de métricas en el dashboard de una agencia.
 * Obtiene datos desde un endpoint API, valida la estructura de los datos y actualiza varios paneles de métricas en la página,
 * tanto a intervalos regulares como en ciertos eventos.
 *
 * Características:
 * - Control de tiempo de espera y manejo de errores.
 * - Valida la respuesta de la API antes de actualizar la interfaz.
 * - Actualiza cuatro paneles principales y un total opcional de agencias.
 * - Muestra estado de carga durante las actualizaciones.
 * - Actualiza automáticamente por intervalo, visibilidad de la página y descarga.
 *
 */

document.addEventListener('DOMContentLoaded', function() {
  // ===== CONFIGURACIÓN =====
  const UPDATE_INTERVAL = 10 * 60 * 1000; // Actualiza cada 10 minutos
  const API_ENDPOINT = '/api/agency-dashboard-metrics'; // Endpoint API para las métricas
  const FETCH_TIMEOUT = 15000; // Tiempo máximo de espera para la solicitud (15 segundos)

  // ===== REFERENCIAS DE LOS PANELES =====
  // Lista de IDs de los paneles a actualizar
  const PANEL_IDS = [
    'agency-today-panel',
    'company-today-panel',
    'agency-month-panel',
    'company-month-panel'
  ];
  
  // Objeto para almacenar los paneles encontrados
  const PANELS = {};
  let allPanelsExist = true;
  
  // Verifica que todos los paneles requeridos existan en el DOM
  PANEL_IDS.forEach(id => {
    const panelElement = document.getElementById(id);
    if (panelElement) {
      PANELS[id] = panelElement;
    } else {
      allPanelsExist = false;
    }
  });
  
  // Si falta algún panel requerido, no continúa
  if (!allPanelsExist) {
    return;
  }
  
  // ===== ESTADO DE LA APP =====
  let updateIntervalId = null; // Referencia al temporizador de intervalo
  let isUpdating = false;      // Indica si hay una actualización en curso
  
  /**
   * Valida la estructura del objeto de métricas devuelto por la API.
   * @param {Object} metrics - El objeto de métricas.
   * @returns {Boolean} Verdadero si la estructura es válida, falso en caso contrario.
   */
  function isValidMetrics(metrics) {
    const requiredKeys = ['agencyToday', 'companyToday', 'agencyMonth', 'companyMonth'];
    if (!requiredKeys.every(key => key in metrics)) {
      return false;
    }
    
    // Cada panel debe tener las siguientes métricas
    const panelKeys = ['nb_prem', 'nb_pol', 'rn_prem', 'rn_pol', 'rw_prem', 'rw_pol', 'tot_prem', 'tot_pol'];
    return requiredKeys.every(key => {
      const panel = metrics[key];
      return panelKeys.every(k => typeof panel[k] !== 'undefined');
    });
  }

  /**
   * Función principal para obtener y actualizar las métricas.
   * Gestiona el estado de carga, el tiempo de espera, la validación y la actualización de los paneles.
   */
  async function updateMetrics() {
    // Evita ejecutar múltiples actualizaciones simultáneas
    if (isUpdating) return;
    isUpdating = true;
    
    try {
      toggleLoadingState(true); // Muestra estado de carga
      
      // Usa AbortController para controlar el tiempo de espera de la solicitud
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
      
      const response = await fetch(API_ENDPOINT, {
        signal: controller.signal,
        headers: {
          'Cache-Control': 'no-cache'
        }
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }
      
      const metrics = await response.json();
      
      // Asegura que la estructura de métricas es válida
      if (!isValidMetrics(metrics)) {
        throw new Error('Respuesta de API inválida: Estructura de datos incorrecta');
      }
      
      // Actualiza los paneles de métricas
      updateAllPanels(metrics);

      // Si hay datos detallados de agencias, actualiza el total de hoy en el encabezado
      if (metrics.agencyToday && Array.isArray(metrics.agencyToday.agencies)) {
        updateAgenciesTodayTotal(metrics.agencyToday.agencies);
      }
    } catch (error) {
      // El manejo de errores es silencioso (puedes mejorarlo para mostrar error al usuario)
    } finally {
      toggleLoadingState(false); // Oculta estado de carga
      isUpdating = false;
    }
  }
  
  /**
   * Actualiza todos los paneles de métricas con los nuevos datos.
   * @param {Object} metrics - El objeto de métricas obtenido de la API.
   */
  function updateAllPanels(metrics) {
    PANEL_IDS.forEach(id => {
      const metricKey = id.replace('-panel', ''); // Ejemplo: 'agency-today-panel' => 'agency-today'
      const panel = PANELS[id];
      const data = metrics[metricKey];
      if (panel && data) {
        updatePanelMetrics(panel, data);
      }
    });
  }
  
  /**
   * Actualiza los valores individuales de un panel de métricas.
   * @param {HTMLElement} panel - El elemento del panel.
   * @param {Object} data - Los datos para ese panel.
   */
  function updatePanelMetrics(panel, data) {
    updateMetricElement(panel, 'nb', data.nb_prem, data.nb_pol);
    updateMetricElement(panel, 'rn', data.rn_prem, data.rn_pol);
    updateMetricElement(panel, 'rw', data.rw_prem, data.rw_pol);
    updateMetricElement(panel, 'tot', data.tot_prem, data.tot_pol);
  }
  
  /**
   * Actualiza un elemento específico de métrica dentro de un panel.
   * @param {HTMLElement} panel - El panel.
   * @param {string} prefix - Prefijo de la métrica ('nb', 'rn', 'rw', 'tot').
   * @param {number|string} prem - Valor de prima.
   * @param {number|string} pol - Valor de pólizas.
   */
  function updateMetricElement(panel, prefix, prem, pol) {
    try {
      const selector = `.${prefix}-metric`;
      const element = panel.querySelector(selector);
      if (element && element.textContent !== `${prem} / ${pol}`) {
        element.textContent = `${prem} / ${pol}`;
      }
    } catch (error) {
      // Se ignoran los errores silenciosamente
    }
  }

  /**
   * Suma y muestra el total de primas y pólizas de todas las agencias para hoy.
   * Solo aplica si metrics.agencyToday.agencies es un array.
   * @param {Array} agencies - Array de objetos de agencias.
   */
  function updateAgenciesTodayTotal(agencies) {
    let totalPremium = 0;
    let totalPolicies = 0;
    agencies.forEach(a => {
      let prem = a.premium;
      // Convierte prima de string a número, eliminando formato
      if (typeof prem === 'string') prem = Number(prem.replace(/[^0-9.-]+/g, ''));
      totalPremium += (prem || 0);
      totalPolicies += (Number(a.policies) || 0);
    });
    const formattedPremium = totalPremium.toLocaleString('es-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    });
    // Actualiza el elemento de display si existe
    const totalElem = document.getElementById('agencies-today-total');
    if (totalElem) {
      totalElem.textContent = `${formattedPremium} / ${totalPolicies}`;
    }
  }

  /**
   * Activa o desactiva el estado de carga en todas las tarjetas de métricas.
   * Añade o elimina clases y ajusta la opacidad para indicar que se está actualizando.
   * @param {boolean} isLoading - Verdadero para mostrar estado de carga, falso para ocultar.
   */
  function toggleLoadingState(isLoading) {
    try {
      const cards = document.querySelectorAll('.metric-card');
      if (!cards.length) return;
      cards.forEach(card => {
        if (isLoading) {
          card.classList.add('updating');
          card.style.opacity = '0.7';
          card.classList.add('pe-none'); // Evita eventos de puntero
        } else {
          card.classList.remove('updating');
          card.style.opacity = '1';
          card.classList.remove('pe-none');
        }
      });
    } catch (error) {
      // Se ignoran los errores silenciosamente
    }
  }
  
  /**
   * Inicia el sistema de actualización automática.
   * - Realiza una actualización inmediata al cargar la página.
   * - Configura un intervalo para actualizar periódicamente.
   * - Limpia el intervalo al descargar la página.
   * - Actualiza las métricas cuando la pestaña vuelve a estar visible.
   */
  function startAutoUpdate() {
    updateMetrics(); // Actualización inmediata al cargar la página
    updateIntervalId = setInterval(updateMetrics, UPDATE_INTERVAL); // Actualizaciones periódicas
    window.addEventListener('beforeunload', () => {
      if (updateIntervalId) {
        clearInterval(updateIntervalId);
      }
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        updateMetrics();
      }
    });
  }

  // ===== INICIO =====
  startAutoUpdate(); // Inicia el sistema de actualización cuando el DOM está listo
});