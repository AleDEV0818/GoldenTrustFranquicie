/**
 * Dashboard Televisor Renewed - Paneles, métricas y ticker
 * ----------------------------------------------------------------------
 * Script principal para el dashboard de métricas y ranking de sucursal/franquicia renovada.
 * Incluye:
 * - Paneles de métricas para hoy y mes (ubicación y compañía)
 * - Tablas y totales de productores (CSR) para hoy y mes
 * - Progreso hacia meta mensual (goal)
 * - Formatos de moneda y enteros amigables
 * - Recuperación de datos desde backend, ticker de noticias y actualización automática
 * - Manejo de errores y elementos críticos
 * - Animaciones y fondo visual
 */

document.addEventListener('DOMContentLoaded', () => {
    //  Elementos DOM principales 
    const elements = {
        todayLocationPremium: document.getElementById('today-location-premium'),
        todayLocationPolicies: document.getElementById('today-location-policies'),
        todayCompanyPremium: document.getElementById('today-company-premium'),
        todayCompanyPolicies: document.getElementById('today-company-policies'),
        monthLocationPremium: document.getElementById('month-location-premium'),
        monthLocationPolicies: document.getElementById('month-location-policies'),
        monthCompanyPremium: document.getElementById('month-company-premium'),
        monthCompanyPolicies: document.getElementById('month-company-policies'),
        csrTodayTable: document.getElementById('csr-today-table'),
        csrTodayTotals: document.getElementById('csr-today-totals'),
        csrMonthTable: document.getElementById('csr-month-table'),
        csrMonthTotals: document.getElementById('csr-month-totals'),
        currentTime: document.getElementById('current-time'),
        nextUpdate: document.getElementById('next-update'),
        currentDate: document.getElementById('current-date'),
        updateTime: document.getElementById('update-time'),
        errorContainer: document.getElementById('error-container'),
        locationAlias: document.getElementById('location-alias'),
        footerLocationAlias: document.getElementById('footer-location-alias'),
        remainingGoal: document.getElementById('remaining-goal'),
        monthlyGoalAmount: document.getElementById('monthly-goal-amount'),
        monthlyGoalRaw: document.getElementById('monthly-goal-raw'),
        companyLogo: document.getElementById('company-logo')
    };

    const refreshInterval = 600000; // 10 minutos
    let monthlyGoal;
    let updateTimer;
    let retryCount = 0;

    //  UTILIDADES DE FORMATO 
    /**
     * Convierte un string de moneda a número 
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
     * Formatea premium como moneda natural 
     */
    function formatNaturalCurrency(amount) {
        const numericAmount = typeof amount === 'number' ? amount : parseCurrencyToNumber(amount);
        if (isNaN(numericAmount)) return '$0';
        const isNegative = numericAmount < 0;
        const absAmount = Math.abs(numericAmount);
        let formatted = '$' + absAmount.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
        return isNegative ? `-${formatted}` : formatted;
    }

    /**
     * Para ticker/cards
     */
    function formatTVCurrency(amount) {
        if (typeof amount === 'string' && amount.startsWith('$') && (amount.includes('M') || amount.includes('K'))) return amount;
        const numericAmount = typeof amount === 'number' ? amount : parseCurrencyToNumber(amount);
        if (isNaN(numericAmount)) return '$0';
        const isNegative = numericAmount < 0;
        const absAmount = Math.abs(numericAmount);
        let formatted;
        if (absAmount >= 1000000) {
            formatted = `$${(absAmount / 1000000).toFixed(1)}M`;
        } else if (absAmount >= 1000) {
            formatted = `$${(absAmount / 1000).toFixed(1)}K`;
        } else {
            formatted = '$' + absAmount.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
        }
        return isNegative ? `-${formatted}` : formatted;
    }

    /**
     * Para tablas sin decimales 
     */
    function formatTableCurrency(amount) {
        const numericAmount = typeof amount === 'number' ? amount : parseCurrencyToNumber(amount);
        if (isNaN(numericAmount)) return '$0';
        const isNegative = numericAmount < 0;
        const absAmount = Math.abs(numericAmount);
        return (isNegative ? '-' : '') + '$' + absAmount.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
    }

    /**
     * Formatea números enteros con separador de miles.
     */
    function formatInteger(value) {
        return Number(value || 0).toLocaleString('en-US', {
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        });
    }

    /**
     * Actualiza el texto de un elemento de forma segura.
     */
    function safeUpdate(element, value, fallback = '0') {
        if (element) element.textContent = value !== undefined && value !== null ? value : fallback;
    }

    // RELOJ Y FECHA
    /**
     * Actualiza la hora y fecha actual en el dashboard.
     */
    function updateClockAndDate() {
        const now = new Date();
        const formattedTime = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
        const formattedDate = now.toLocaleDateString('en-US', {
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
        });
        safeUpdate(elements.currentTime, formattedTime);
        safeUpdate(elements.currentDate, formattedDate);
    }
    /**
     * Sincroniza el reloj justo al inicio de cada minuto.
     */
    function startClockMinuteSync() {
        updateClockAndDate();
        const now = new Date();
        const msToNextMinute = (60 - now.getSeconds()) * 1000 - now.getMilliseconds();
        setTimeout(function() {
            updateClockAndDate();
            setInterval(updateClockAndDate, 60000);
        }, msToNextMinute);
    }

    // PROGRESO DE META (GOAL)
    /**
     * Actualiza la barra de progreso y texto de meta mensual.
     */
    function updateGoalProgress(current, goal) {
        const circle = document.querySelector('.progress-bar');
        const text = document.getElementById('goal-progress-text');
        let percent = 0;

        if (typeof current === "string") current = Number(current.replace(/[^\d.-]/g, ""));
        if (typeof goal === "string") goal = Number(goal.replace(/[^\d.-]/g, ""));
        if (goal > 0 && !isNaN(current) && !isNaN(goal)) {
            percent = Math.round((current / goal) * 100); // Permite porcentajes > 100
        }
        const radius = 42;
        const circumference = 2 * Math.PI * radius;
        const offset = Math.max(0, circumference - percent / 100 * circumference);

        if (circle) {
            circle.style.strokeDasharray = `${circumference}`;
            circle.style.strokeDashoffset = offset;
            if (percent > 100) {
                circle.classList.add('donut-green');
            } else {
                circle.classList.remove('donut-green');
            }
        }
        if (text) {
            text.textContent = percent + "%";
            if (percent > 100) {
                text.classList.add('progress-green');
            } else {
                text.classList.remove('progress-green');
            }
        }
    }

    //  TABLAS DE PRODUCTORES (CSR) 
    /**
     * Actualiza la tabla de productores, mostrando máximo 10 filas.
     */
    function safeUpdateProducerTable(tableElement, producerData) {
        if (!tableElement) return;
        while (tableElement.rows.length > 1) { tableElement.deleteRow(1); }
        if (producerData && Array.isArray(producerData) && producerData.length > 0) {
            producerData.slice(0, 10).forEach(prod => {
                const row = tableElement.insertRow();
                const nameCell = row.insertCell(0);
                nameCell.textContent = prod.producer || prod.name || 'N/A';
                nameCell.className = 'csr-name';
                const policiesCell = row.insertCell(1);
                policiesCell.textContent = formatInteger(prod.policies || 0);
                policiesCell.className = 'csr-policies';
                const premiumCell = row.insertCell(2);
                premiumCell.textContent = formatTableCurrency(prod.premium) || '$0';
                premiumCell.className = 'csr-premium';
            });
        } else {
            const row = tableElement.insertRow();
            const cell = row.insertCell(0);
            cell.colSpan = 3;
            cell.textContent = 'No data available';
            cell.className = 'no-data';
        }
    }

    /**
     * Actualiza los totales de productores (CSR) en el dashboard.
     */
    function safeUpdateProducerTotals(data) {
        const sumPremium = (arr) => Array.isArray(arr)
            ? arr.reduce((sum, prod) => sum + parseCurrencyToNumber(prod.premium), 0)
            : 0;
        const sumPolicies = (arr) => Array.isArray(arr)
            ? arr.reduce((sum, prod) => sum + (parseInt(prod.policies) || 0), 0)
            : 0;
        if (elements.csrTodayTotals) {
            const todayTotalPremium = sumPremium(data.csrToday);
            const todayTotalPolicies = sumPolicies(data.csrToday);
            elements.csrTodayTotals.textContent =
                `${formatTableCurrency(todayTotalPremium)} / ${formatInteger(todayTotalPolicies)}`;
        }
        if (elements.csrMonthTotals) {
            const monthTotalPremium = sumPremium(data.csrMonth);
            const monthTotalPolicies = sumPolicies(data.csrMonth);
            elements.csrMonthTotals.textContent =
                `${formatTableCurrency(monthTotalPremium)} / ${formatInteger(monthTotalPolicies)}`;
        }
    }

    //  UI ANIMATION
    /**
     * Aplica animación "changing" a métricas y totales.
     */
    function safeApplyChangeAnimation() {
        try {
            const metricValues = document.querySelectorAll('.metric-value, .csr-premium, .csr-policies, .remaining-amount');
            metricValues.forEach(value => {
                if (value) {
                    value.classList.add('changing');
                    setTimeout(() => {
                        if (value) value.classList.remove('changing');
                    }, 500);
                }
            });
        } catch (e) { }
    }

    /**
     * Reinicia y actualiza el contador de próxima actualización.
     */
    function safeResetNextUpdateCounter() {
        if (!elements.nextUpdate) return;
        try {
            if (updateTimer) clearInterval(updateTimer);
            let secondsLeft = refreshInterval / 1000;
            elements.nextUpdate.textContent = `${secondsLeft} sec`;
            updateTimer = setInterval(() => {
                secondsLeft--;
                if (elements.nextUpdate) elements.nextUpdate.textContent = `${secondsLeft} sec`;
                if (secondsLeft <= 0) {
                    clearInterval(updateTimer);
                    if (elements.nextUpdate) elements.nextUpdate.textContent = 'Updating...';
                }
            }, 1000);
        } catch (e) { }
    }

    //  LOCATION ALIAS 
    /**
     * Actualiza el alias de ubicación en todos los elementos relevantes.
     */
    function updateLocationAliasInDOM(alias, locationType) {
        if (Number(locationType) === 1) {
            alias = "Corporate";
        }
        document.querySelectorAll('.js-location-alias').forEach(el => {
            el.textContent = alias;
        });
        safeUpdate(elements.locationAlias, alias, 'Location');
        safeUpdate(elements.footerLocationAlias, alias, 'Location');
    }

    // MAIN UI UPDATE
    /**
     * Actualiza la UI principal del dashboard con los datos recibidos.
     */
    function updateUI(data) {
        safeUpdate(elements.todayLocationPremium, formatTVCurrency(data.today.location.premium), '$0');
        safeUpdate(elements.todayLocationPolicies, formatInteger(data.today.location.policies), '0');
        safeUpdate(elements.todayCompanyPremium, formatTVCurrency(data.today.company.premium), '$0');
        safeUpdate(elements.todayCompanyPolicies, formatInteger(data.today.company.policies), '0');
        safeUpdate(elements.monthLocationPremium, formatTVCurrency(data.month.location.premium), '$0');
        safeUpdate(elements.monthLocationPolicies, formatInteger(data.month.location.policies), '0');
        safeUpdate(elements.monthCompanyPremium, formatTVCurrency(data.month.company.premium), '$0');
        safeUpdate(elements.monthCompanyPolicies, formatInteger(data.month.company.policies), '0');
        try {
            const companyMonthPremium = parseCurrencyToNumber(data.month.company.premium);
            const remaining = monthlyGoal - companyMonthPremium;
            safeUpdate(elements.remainingGoal, formatTableCurrency(remaining), '$0');
            updateGoalProgress(companyMonthPremium, monthlyGoal);
            if (remaining <= 0) {
                elements.remainingGoal.classList.add('goal-reached');
                elements.remainingGoal.classList.remove('goal-not-reached');
            } else {
                elements.remainingGoal.classList.add('goal-not-reached');
                elements.remainingGoal.classList.remove('goal-reached');
            }
        } catch (e) {
            safeUpdate(elements.remainingGoal, '$0');
            updateGoalProgress(0, monthlyGoal);
        }
        safeUpdateProducerTable(elements.csrTodayTable, data.csrToday);
        safeUpdateProducerTable(elements.csrMonthTable, data.csrMonth);
        safeUpdateProducerTotals(data);

        try {
            const now = new Date();
            const formattedTime = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
            safeUpdate(elements.currentTime, formattedTime);
            safeUpdate(elements.updateTime, formattedTime);
            const formattedDate = now.toLocaleDateString('en-US', {
                weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
            });
            safeUpdate(elements.currentDate, formattedDate);
        } catch (e) { }
        safeResetNextUpdateCounter();
        updateLocationAliasInDOM(data.locationAlias || 'Corporate', data.locationType || 1);
        if (elements.errorContainer && elements.errorContainer.style.display === 'block') {
            elements.errorContainer.style.display = 'none';
        }
        safeApplyChangeAnimation();
    }

    // ERROR HANDLING 
    /**
     * Muestra un mensaje de error crítico en el dashboard.
     * @param {string} message
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

    // VISUAL BACKGROUND
    /**
     * Crea elementos visuales animados de fondo para el dashboard.
     */
    function createBackgroundElements() {
        const bgContainer = document.getElementById('background-elements');
        if (!bgContainer) return;
        for (let i = 0; i < 25; i++) {
            const circle = document.createElement('div');
            circle.className = 'bg-circle';
            const size = Math.random() * 100 + 30;
            circle.style.width = `${size}px`;
            circle.style.height = `${size}px`;
            circle.style.left = `${Math.random() * 100}%`;
            circle.style.top = `${Math.random() * 100}%`;
            circle.style.opacity = Math.random() * 0.1 + 0.05;
            circle.style.animationDelay = `${Math.random() * 20}s`;
            bgContainer.appendChild(circle);
        }
    }

    // LECTURA DE PARÁMETROS DE URL 
    /**
     * Lee los parámetros relevantes para la consulta.
     * @returns {{ locationType: number, locationId: string }}
     */
    function getUrlParams() {
        const urlParams = new URLSearchParams(window.location.search);
        let locationType = urlParams.get('location_type') || 1;
        let locationId = urlParams.get('location_id');
        if (!locationId || locationId === 'null') locationId = '';
        return {
            locationType,
            locationId
        };
    }

    // FETCH DATA PRINCIPAL 
    /**
     * Recupera los datos principales del backend y actualiza la UI.
     * Maneja errores y reconexión incremental.
     */
    async function fetchData() {
        try {
            const { locationType, locationId } = getUrlParams();
            let apiUrl = `/televisor-renewed/data?location_type=${locationType}`;
            if (locationId) {
                apiUrl += `&location_id=${locationId}`;
            }
            const response = await fetch(apiUrl);
            if (!response.ok) {
                const errorData = await response.json().catch(() => null);
                const errorMsg = errorData?.error || `Error ${response.status}: ${response.statusText}`;
                throw new Error(errorMsg);
            }
            const data = await response.json();
            if (data.error) {
                showError(`Backend Error: ${data.error}`);
            } else {
                retryCount = 0;
                monthlyGoal = parseCurrencyToNumber(data.monthly_goal); // <-- ACTUALIZA meta desde backend
                safeUpdate(elements.monthlyGoalAmount, formatTableCurrency(monthlyGoal), '$0');
                updateUI({
                    today: data.today,
                    month: data.month,
                    csrToday: data.csrToday || [],
                    csrMonth: data.csrMonth || [],
                    locationAlias: data.locationAlias || 'Corporate',
                    locationType: data.locationType || 1
                });
            }
        } catch (error) {
            showError('Connection Error: ' + error.message);
            const delay = Math.min(30000, 2000 * Math.pow(2, retryCount));
            setTimeout(fetchData, delay);
            retryCount++;
        }
    }


    //  VERIFICACIÓN DE ELEMENTOS CRÍTICOS 
    /**
     * Verifica que los elementos críticos existen en el DOM. Si falta alguno, muestra error crítico.
     */
    function checkCriticalElements() {
        const criticalElements = [
            'today-location-premium', 'today-company-premium',
            'month-location-premium', 'month-company-premium',
            'csr-today-table', 'csr-month-table',
            'monthly-goal-amount', 'remaining-goal'
        ];
        criticalElements.forEach(id => {
            if (!document.getElementById(id)) {
                showError(`Critical element #${id} is missing from the page`);
            }
        });
    }

    // NEWS TICKER 
    /**
     * Recupera y actualiza el ticker de noticias con datos del backend.
     */
    async function fetchAndRenderTicker() {
        try {
            const { locationId } = getUrlParams();
            const res = await fetch(`/televisor-renewed/ticker?location_id=${locationId || ''}`);
            if (!res.ok) throw new Error('Ticker fetch failed');
            const { tickerLines } = await res.json();
            renderNewsTicker(tickerLines);
        } catch (e) {
            renderNewsTicker(["No ticker data available"]);
        }
    }

    /**
     * Muestra las líneas del ticker en el DOM.
     * @param {Array<string>} lines
     */
    function renderNewsTicker(lines) {
        const ticker = document.getElementById('news-ticker');
        if (!ticker) return;
        ticker.innerHTML = lines && lines.length
            ? lines.map(line => `<span class="ticker-item">${line}</span>`).join(' ')
            : '<span class="ticker-item">No ticker data</span>';
        ticker.style.animation = 'none';
        void ticker.offsetWidth;
        ticker.style.animation = '';
    }

    // INICIALIZACIÓN
    /**
     * Inicializa el dashboard: chequeo de elementos, fondo, fetch de datos y ticker, reloj.
     */
    function init() {
        checkCriticalElements();
        createBackgroundElements();
        fetchData();
        fetchAndRenderTicker();
        setInterval(fetchData, refreshInterval);
        setInterval(fetchAndRenderTicker, refreshInterval);
        safeResetNextUpdateCounter();
        startClockMinuteSync();
        if (elements.companyLogo) {
            elements.companyLogo.innerHTML = `
                 <img src="/img/branding/gti_logo1.png" alt="Company Logo" 
                     style="max-width: 200px; max-height: 80px;">
            `;
        }
    }
    init();
});