/**
 * Dashboard de Franquicia 
 * ------------------------------------------------------------------
 * Este script gestiona el dashboard de métricas y ranking para franquicias, incluyendo:
 * - Paneles de métricas por periodo (hoy, mes, año, TKG)
 * - Tablas de resumen y top rankings (día, mes)
 * - Barra de progreso hacia meta mensual
 * - Actualización automática y manejo de errores
 * - Sincronización de reloj y fecha
 */

document.addEventListener('DOMContentLoaded', () => {
    //  IDs de los paneles métricos principales 
    const PANEL_IDS = [
        'franchise-today-panel',
        'franchise-month-panel',
        'franchise-year-panel',
        'franchise-tkg-panel'
    ];

    //  Referencias a paneles de métricas 
    const PANELS = {};
    PANEL_IDS.forEach(id => {
        const panelElement = document.getElementById(id);
        if (panelElement) PANELS[id] = panelElement;
    });

    // Elementos clave del DOM y configuración 
    const elements = {
        summaryTable: document.getElementById('franchise-summary-table'),      // Tabla de resumen
        topDayTable: document.getElementById('franchise-top-day-table'),      // Tabla top día
        topMonthTable: document.getElementById('franchise-top-month-table'),  // Tabla top mes
        currentTime: document.getElementById('current-time'),                 // Hora actual
        currentDate: document.getElementById('current-date'),                 // Fecha actual
        errorContainer: document.getElementById('error-container'),           // Contenedor de errores
        refreshInterval: 600000, // 10 minutos
        monthlyGoalAmount: document.getElementById('monthly-goal-amount'),    // Meta mensual
        remainingGoal: document.getElementById('remaining-goal'),             // Meta restante
        goalProgressText: document.getElementById('goal-progress-text'),      // Texto de progreso
        progressBar: document.querySelector('.progress-bar'),                 // Barra de progreso SVG
        dayTotals: document.getElementById('franchise-day-totals'),           // Totales del día
        monthTotals: document.getElementById('franchise-month-totals'),       // Totales del mes
        lastUpdate: document.getElementById('update-time'),                   // Última actualización
    };

    let monthlyGoal = 10000000; // Meta mensual por defecto
    let retryCount = 0;
    let lastUpdateTime = null;

    //  UTILIDADES DE FORMATO 

    /**
    
     * @param {string|number} currencyString
     * @returns {number}
     */
    function parseCurrencyToNumber(currencyString) {
        if (typeof currencyString === 'number') return currencyString;
        if (typeof currencyString !== 'string') return 0;
        if (currencyString.endsWith('M')) {
            return parseFloat(currencyString.replace(/[^\d.-]/g, '')) * 1000000;
        }
        if (currencyString.endsWith('K')) {
            return parseFloat(currencyString.replace(/[^\d.-]/g, '')) * 1000;
        }
        return parseFloat(currencyString.replace(/[^\d.-]/g, '')) || 0;
    }

    /**
     
     * @param {number|string} amount
     * @returns {string}
     */
    function formatTableCurrency(amount) {
        const numericAmount = typeof amount === 'number' ? amount : parseCurrencyToNumber(amount);
        if (isNaN(numericAmount)) return '$0';
        return '$' + Math.abs(numericAmount).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
    }

    /**
     * Formatea y actualiza el texto de un elemento 
     * @param {HTMLElement} element
     * @param {string} value
     * @param {string} fallback
     */
    function safeUpdate(element, value, fallback = '$0') {
        if (element) element.textContent = value !== undefined && value !== null ? value : fallback;
    }

    /**
     * Formatea moneda natural (igual que formatTableCurrency)
     * @param {number|string} amount
     * @returns {string}
     */
    function formatNaturalCurrency(amount) {
        return formatTableCurrency(amount);
    }

    //  PANEL DE MÉTRICAS: ACTUALIZACIÓN 

    /**
     * Actualiza los paneles métricos con los datos del backend.
     * Incluye meta mensual, premium de compañía y totales por periodo.
     */
    async function updateMetricPanels() {
        try {
            const inputDate = new Date().toISOString().split('T')[0];
            const summaryRes = await fetch(`/api/franchise/summary?date=${inputDate}`);
            if (!summaryRes.ok) throw new Error('Summary fetch failed');
            const summaryData = await summaryRes.json();
            const summary = summaryData.summary;

            // Meta mensual desde backend
            monthlyGoal = parseCurrencyToNumber(summaryData.monthly_goal);
            safeUpdate(elements.monthlyGoalAmount, formatNaturalCurrency(monthlyGoal), '$0');

            // Premium de la compañía del mes (NO el de la franquicia)
            let companyMonthPremium = parseCurrencyToNumber(summaryData.companyMonthPremium);

            // Actualiza goal-box vertical con el premium de la compañía
            updateGoalPanel(companyMonthPremium, monthlyGoal);

            /**
             * Busca datos de métricas por periodo y tipo de negocio
             * @param {string} period - Ejemplo: 'Día', 'Mes', 'Año', 'TKG'
             * @param {string} business_type - Ejemplo: 'New Business', 'Renewal', 'Rewrite', 'Total'
             * @returns {Object} { premium, policies }
             */
            function getMetric(period, business_type) {
                return summary.find(r => r.period === period && r.business_type === business_type) || { premium: 0, policies: 0 };
            }

            // Paneles de métricas para cada periodo
            const todayPanel = PANELS['franchise-today-panel'];
            if (todayPanel) {
                updateMetricElement(todayPanel, 'nb', getMetric('Día', 'New Business').premium, getMetric('Día', 'New Business').policies);
                updateMetricElement(todayPanel, 'rn', getMetric('Día', 'Renewal').premium, getMetric('Día', 'Renewal').policies);
                updateMetricElement(todayPanel, 'rw', getMetric('Día', 'Rewrite').premium, getMetric('Día', 'Rewrite').policies);
                updateMetricElement(todayPanel, 'tot', getMetric('Día', 'Total').premium, getMetric('Día', 'Total').policies);
            }
            const monthPanel = PANELS['franchise-month-panel'];
            if (monthPanel) {
                const nb = getMetric('Mes', 'New Business');
                const rn = getMetric('Mes', 'Renewal');
                const rw = getMetric('Mes', 'Rewrite');
                const tot = getMetric('Mes', 'Total');
                updateMetricElement(monthPanel, 'nb', nb.premium, nb.policies);
                updateMetricElement(monthPanel, 'rn', rn.premium, rn.policies);
                updateMetricElement(monthPanel, 'rw', rw.premium, rw.policies);
                updateMetricElement(monthPanel, 'tot', tot.premium, tot.policies);
            }
            const yearPanel = PANELS['franchise-year-panel'];
            if (yearPanel) {
                updateMetricElement(yearPanel, 'nb', getMetric('Año', 'New Business').premium, getMetric('Año', 'New Business').policies);
                updateMetricElement(yearPanel, 'rn', getMetric('Año', 'Renewal').premium, getMetric('Año', 'Renewal').policies);
                updateMetricElement(yearPanel, 'rw', getMetric('Año', 'Rewrite').premium, getMetric('Año', 'Rewrite').policies);
                updateMetricElement(yearPanel, 'tot', getMetric('Año', 'Total').premium, getMetric('Año', 'Total').policies);
            }
            const tkgPanel = PANELS['franchise-tkg-panel'];
            if (tkgPanel) {
                updateMetricElement(tkgPanel, 'nb', getMetric('TKG', 'New Business').premium, getMetric('TKG', 'New Business').policies);
                updateMetricElement(tkgPanel, 'rn', getMetric('TKG', 'Renewal').premium, getMetric('TKG', 'Renewal').policies);
                updateMetricElement(tkgPanel, 'rw', getMetric('TKG', 'Rewrite').premium, getMetric('TKG', 'Rewrite').policies);
                updateMetricElement(tkgPanel, 'tot', getMetric('TKG', 'Total').premium, getMetric('TKG', 'Total').policies);
            }

            // Actualización de totales destacados por día y mes (New Business)
            const nbToday = getMetric('Día', 'New Business');
            if (elements.dayTotals) {
                elements.dayTotals.innerHTML =
                    ` <span style="color:var(--highlight-yellow);font-weight:bold">${formatTableCurrency(nbToday.premium)}</span> / <span style="color:var(--highlight-yellow);font-weight:bold">${formatTableCurrency(nbToday.policies)}</span>`;
            }
            const nbMonth = getMetric('Mes', 'New Business');
            if (elements.monthTotals) {
                elements.monthTotals.innerHTML =
                    ` <span style="color:var(--highlight-yellow);font-weight:bold">${formatTableCurrency(nbMonth.premium)}</span> / <span style="color:var(--highlight-yellow);font-weight:bold">${formatTableCurrency(nbMonth.policies)}</span>`;
            }
            updateLastUpdateTime();

        } catch (error) {
            showError(error.message);
            setTimeout(updateMetricPanels, Math.min(30000, 2000 * Math.pow(2, retryCount)));
            retryCount++;
        }
    }

    /**
     * Actualiza el contenido de un elemento métrico del panel.
     * @param {HTMLElement} panel
     * @param {string} prefix - Ejemplo: nb, rn, rw, tot
     * @param {number|string} prem
     * @param {number|string} pol
     */
    function updateMetricElement(panel, prefix, prem, pol) {
        try {
            const selector = `.${prefix}-metric`;
            const element = panel.querySelector(selector);
            if (element) {
                element.textContent = `${formatTableCurrency(prem)} / ${formatTableCurrency(pol)}`;
            }
        } catch (error) {
            // Silenciar errores
        }
    }

    /**
     * Actualiza el panel de meta mensual y barra de progreso.
     * @param {number|string} companyMonthPremium
     * @param {number|string} monthlyGoal
     */
    function updateGoalPanel(companyMonthPremium, monthlyGoal) {
        companyMonthPremium = parseCurrencyToNumber(companyMonthPremium);
        monthlyGoal = parseCurrencyToNumber(monthlyGoal);
        const remaining = monthlyGoal - companyMonthPremium;

        safeUpdate(elements.remainingGoal, formatNaturalCurrency(remaining), '$0');
        if (elements.progressBar && elements.goalProgressText) {
            const radius = 42;
            const circumference = 2 * Math.PI * radius;
            let percent = 0;
            if (monthlyGoal > 0 && !isNaN(companyMonthPremium) && !isNaN(monthlyGoal)) {
                percent = Math.round((companyMonthPremium / monthlyGoal) * 100);
            }
            const offset = Math.max(0, circumference - percent / 100 * circumference);
            elements.progressBar.setAttribute('stroke-dasharray', `${circumference}`);
            elements.progressBar.setAttribute('stroke-dashoffset', offset);

            if (percent > 100) {
                elements.progressBar.classList.add('donut-green');
                elements.goalProgressText.classList.add('progress-green');
            } else {
                elements.progressBar.classList.remove('donut-green');
                elements.goalProgressText.classList.remove('progress-green');
            }

            elements.goalProgressText.textContent = percent + "%";
        }
        safeUpdate(elements.monthlyGoalAmount, formatNaturalCurrency(monthlyGoal), '$0');
    }

    /**
     * Actualiza las tablas de top ranking (día y mes) con datos del backend.
     */
    async function updateTopTables() {
        try {
            const inputDate = new Date().toISOString().split('T')[0];
            const res = await fetch(`/api/franchise/top?date=${inputDate}`);
            if (!res.ok) throw new Error('Top tables fetch failed');
            const data = await res.json();
            populateTable('franchise-top-day-table', data.topDay);
            populateMonthTable('franchise-top-month-table', data.topMonth);
        } catch (error) {
            showError(error.message);
        }
    }

    /**
     * Rellena la tabla de top mes con filas y formatea porcentaje.
     * @param {string} tableId
     * @param {Array} rows
     */
    function populateMonthTable(tableId, rows) {
        const table = document.getElementById(tableId);
        if (!table) return;
        const tbody = table.querySelector('tbody');
        if (!tbody) return;
        tbody.innerHTML = "";

        if (!Array.isArray(rows) || rows.length === 0) {
            const tr = document.createElement('tr');
            tr.innerHTML = `<td colspan="4" style="text-align:center;">No data</td>`;
            tbody.appendChild(tr);
            return;
        }

        rows.forEach(row => {
            const alias = row.alias;
            const policies = row.policies_current !== undefined ? row.policies_current : row.policies;
            const premium = row.premium_current !== undefined ? row.premium_current : row.premium;
            let percentValue = (row.premium_percent !== undefined && row.premium_percent !== null) ? row.premium_percent : null;

            let percentDisplay = percentValue !== null ? `${percentValue}%` : '-';
            // Agrega la clase "percent-red" si el porcentaje es menor a 0
            let percentClass = "";
            if (percentValue !== null && !isNaN(percentValue) && Number(percentValue) < 0) {
                percentClass = "percent-red";
            }

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${alias}</td>
                <td>${formatTableCurrency(policies)}</td>
                <td>${formatTableCurrency(premium)}</td>
                <td class="${percentClass}">${percentDisplay}</td>
            `;
            tbody.appendChild(tr);
        });
    }

    /**
     * Rellena la tabla de top día con filas.
     * @param {string} tableId
     * @param {Array} rows
     */
    function populateTable(tableId, rows) {
        const table = document.getElementById(tableId);
        if (!table) return;
        const tbody = table.querySelector('tbody');
        if (!tbody) return;
        tbody.innerHTML = "";

        if (!Array.isArray(rows) || rows.length === 0) {
            const tr = document.createElement('tr');
            tr.innerHTML = `<td colspan="3" style="text-align:center;">No data</td>`;
            tbody.appendChild(tr);
            return;
        }

        rows.forEach(row => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${row.alias}</td>
                <td>${formatTableCurrency(row.policies)}</td>
                <td>${formatTableCurrency(row.premium)}</td>
            `;
            tbody.appendChild(tr);
        });
    }

    /**
     * Actualiza el reloj y la fecha mostrados en el dashboard.
     * También actualiza el timestamp de última actualización.
     */
    function updateClockAndDate() {
        const now = new Date();
        const formattedTime = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
        const formattedDate = now.toLocaleDateString('en-US', {
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
        });
        safeUpdate(elements.currentTime, formattedTime);
        safeUpdate(elements.currentDate, formattedDate);
        safeUpdate(elements.lastUpdate, formattedTime);
    }

    /**
     * Sincroniza el reloj para actualizarse justo al inicio de cada minuto.
     */
    function startClockMinuteSync() {
        updateClockAndDate();
        const now = new Date();
        const msToNextMinute = (60 - now.getSeconds()) * 1000 - now.getMilliseconds();
        setTimeout(function () {
            updateClockAndDate();
            setInterval(updateClockAndDate, 60000);
        }, msToNextMinute);
    }

    /**
     * Actualiza el timestamp de la última actualización.
     */
    function updateLastUpdateTime() {
        lastUpdateTime = new Date();
        if (elements.lastUpdate) {
            const formatted = lastUpdateTime.toLocaleString('en-US', {
                year: 'numeric',
                month: 'short',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: false
            });
            elements.lastUpdate.textContent = formatted;
        }
    }

    /**
     * Muestra un mensaje de error en pantalla y prepara reconexión.
     * @param {string} message - Mensaje a mostrar.
     */
    function showError(message) {
        if (!elements.errorContainer) {
            const errorContainer = document.createElement('div');
            errorContainer.id = 'error-container';
            errorContainer.style.position = 'absolute';
            errorContainer.style.top = '50%';
            errorContainer.style.left = '50%';
            errorContainer.style.transform = 'translate(-50%, -50%)';
            errorContainer.style.background = 'rgba(231, 76, 60, 0.95)';
            errorContainer.style.padding = '40px';
            errorContainer.style.borderRadius = '20px';
            errorContainer.style.textAlign = 'center';
            errorContainer.style.width = '80%';
            errorContainer.style.maxWidth = '700px';
            errorContainer.style.fontSize = '2.2rem';
            errorContainer.style.zIndex = '10';
            errorContainer.style.display = 'none';
            errorContainer.style.border = '3px solid #fff';
            errorContainer.style.boxShadow = '0 10px 40px rgba(0, 0, 0, 0.2)';
            document.body.appendChild(errorContainer);
            elements.errorContainer = errorContainer;
        }
        elements.errorContainer.innerHTML = `
            <h2>SYSTEM ERROR</h2>
            <p>${message}</p>
            <p style="font-size: 1.5rem; margin-top: 20px;">Reconnecting in 15 seconds...</p>
        `;
        elements.errorContainer.style.display = 'block';
    }

    /**
     * Inicializa el dashboard: métricas, reloj, tablas y refresc periódico.
     */
    function init() {
        updateMetricPanels();
        startClockMinuteSync();
        updateTopTables();
        setInterval(() => {
            updateMetricPanels();
            updateTopTables();
        }, elements.refreshInterval);
    }

    //  INICIALIZACIÓN 
    init();
});