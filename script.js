/*
 * script.js
 *
 * Este script maneja la actualización de la fecha y hora en tiempo real (zona horaria Ciudad de México),
 * asigna datos de ejemplo a los paneles macro y calcula un sentimiento de mercado simplificado basado en
 * condiciones de “risk on” y “risk off”. Este es un prototipo; en una aplicación real se incorporarían
 * fuentes de datos en vivo y lógicas complejas.
 */

// Establece la zona horaria de México para todas las funciones de fecha/hora
const MX_TIMEZONE = 'America/Mexico_City';

// Datos simulados para el panel macro y el cálculo de sentimiento.  
// En una aplicación completa estos valores se actualizarían con APIs reales.  
const macroData = {
    dxy: { value: 103.15, direction: -0.4 },     // índice del dólar y cambio porcentual
    us10y: { value: 4.45, pattern: 'Cup & Handle' },
    us02y: { value: 4.81 },
    vix: { value: 14.5 },
    wti: { value: 95.1, change: -7.8 },
    xauusd: { value: 4558, trend: '+0.8 %' }
};

// Calcula el sentimiento de riesgo simplificado
function calculateRiskSentiment() {
    // Lógica simple: risk-on si el DXY cae, el VIX baja y el WTI cae (menor riesgo geopolítico)
    const { dxy, vix, wti } = macroData;
    if (dxy.direction < 0 && vix.value < 15 && wti.change < 0) {
        return 'risk-on';
    }
    if (dxy.direction > 0 && vix.value > 20) {
        return 'risk-off';
    }
    return 'neutral';
}

// -----------------------------
//  Actualización dinámica de pares y metales
//
// Usamos el servicio Frankfurter.dev para obtener los tipos de cambio diarios
// sin necesidad de una clave API. Este servicio proporciona datos de cierre
// (EOD) de más de 55 bancos centrales. La API devuelve la tasa más reciente
// disponible para la fecha actual.
// Documentación: https://frankfurter.dev/#/rates

/**
 * Recupera el tipo de cambio de un par de divisas o metal.
 * Si se proporciona la fecha, la API devuelve el valor de cierre de ese día.
 *
 * @param {string} base  – moneda base (por ejemplo, 'EUR', 'USD', 'XAU')
 * @param {string} quote – moneda cotizada (por ejemplo, 'USD', 'JPY')
 * @param {string|null} date – fecha opcional en formato YYYY-MM-DD
 * @returns {Promise<number|null>} – el tipo de cambio o null si hay error
 */
async function fetchRate(base, quote, date = null) {
    let url = `https://api.frankfurter.dev/v2/rate/${base}/${quote}`;
    // Si se especifica fecha, añádela como parámetro de consulta
    if (date) {
        url += `?date=${date}`;
    }
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error('Error al obtener el tipo de cambio');
        const data = await response.json();
        // La API devuelve un objeto con "rate"
        return data.rate;
    } catch (error) {
        console.error('Error en fetchRate:', error);
        return null;
    }
}

// Carga los precios de los pares EURUSD, USDJPY y XAUUSD y actualiza el DOM.
async function loadLivePrices() {
    // Llama a la API para cada par y metal.  
    const [eurusd, usdjpy, xauusd] = await Promise.all([
        fetchRate('EUR', 'USD'),
        fetchRate('USD', 'JPY'),
        fetchRate('XAU', 'USD'),
    ]);
    // Actualiza el panel especial
    if (eurusd) {
        document.querySelectorAll('.special-card h4').forEach((h4, idx) => {
            const cardTitle = h4.textContent.trim();
            if (cardTitle === 'EURUSD') {
                // Busca el párrafo que contiene "Precio actual"
                const priceElement = h4.parentElement.querySelector('.special-info p:nth-child(2)');
                if (priceElement) priceElement.innerHTML = `<strong>Precio actual:</strong> ${eurusd.toFixed(5)}`;
            }
        });
        // El panel de otros activos se eliminó; no actualizamos este valor.
    }
    if (usdjpy) {
        document.querySelectorAll('.special-card h4').forEach((h4, idx) => {
            const cardTitle = h4.textContent.trim();
            if (cardTitle === 'USDJPY') {
                const priceElement = h4.parentElement.querySelector('.special-info p:nth-child(2)');
                if (priceElement) priceElement.innerHTML = `<strong>Precio actual:</strong> ${usdjpy.toFixed(2)}`;
            }
        });
        // No se incluye USDJPY en otros activos en esta versión
    }
    if (xauusd) {
        document.querySelectorAll('.special-card h4').forEach((h4) => {
            const cardTitle = h4.textContent.trim();
            if (cardTitle === 'XAUUSD') {
                const priceElement = h4.parentElement.querySelector('.special-info p:nth-child(2)');
                if (priceElement) priceElement.innerHTML = `<strong>Precio actual:</strong> ${xauusd.toLocaleString('es-MX')}`;
            }
        });
        // Actualiza valor en el macro panel
        const xauValEl = document.getElementById('xauusd-value');
        if (xauValEl) xauValEl.textContent = xauusd.toLocaleString('es-MX');
    }
}

// -----------------------------
//  Estadísticas de análisis para cada par
//
// Estas funciones calculan los máximos, mínimos, medias y volatilidades de los
// últimos "n" días para cada par de divisas o metal utilizando la API de
// Frankfurter. La API devuelve datos diarios de cierre (EOD), por lo que
// estos valores se actualizan una vez al día.

// Devuelve la fecha en formato YYYY-MM-DD restando un número de días al día actual
function getPastDate(daysAgo) {
    const date = new Date();
    date.setDate(date.getDate() - daysAgo);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// Recupera una serie temporal de los últimos "days" días y calcula métricas
async function fetchTimeSeries(base, quote, days) {
    const values = [];
    // Recorremos los últimos "days" días hacia atrás. Si algún día cae en fin de semana
    // y no hay dato disponible, simplemente no añadimos valor.
    for (let i = days; i >= 1; i--) {
        const date = getPastDate(i);
        const rate = await fetchRate(base, quote, date);
        if (rate) {
            values.push(rate);
        }
    }
    if (!values.length) return null;
    const max = Math.max(...values);
    const min = Math.min(...values);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
    const volatility = Math.sqrt(variance);
    // El último valor (más reciente) se encuentra al final del array
    const lastRate = values[values.length - 1];
    return { max, min, mean, volatility, lastRate };
}

// Carga y actualiza las estadísticas para EUR/USD, USD/JPY y XAU/USD
async function loadAnalysisStats() {
    const days = 7;
    const eurStats = await fetchTimeSeries('EUR', 'USD', days);
    const jpyStats = await fetchTimeSeries('USD', 'JPY', days);
    const xauStats = await fetchTimeSeries('XAU', 'USD', days);
    // Función auxiliar para formatear números con separador de miles
    function formatNumber(num, decimals = 4) {
        return num.toLocaleString('es-MX', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    }
    // Actualiza EURUSD
    if (eurStats) {
        document.getElementById('eur-max').innerHTML = `<strong>Máximo&nbsp;(7&nbsp;días):</strong> ${formatNumber(eurStats.max)}`;
        document.getElementById('eur-min').innerHTML = `<strong>Mínimo&nbsp;(7&nbsp;días):</strong> ${formatNumber(eurStats.min)}`;
        document.getElementById('eur-avg').innerHTML = `<strong>Media&nbsp;(7&nbsp;días):</strong> ${formatNumber(eurStats.mean)}`;
        document.getElementById('eur-vol').innerHTML = `<strong>Volatilidad:</strong> ${formatNumber(eurStats.volatility, 5)}`;
        const trendEl = document.getElementById('eur-trend');
        if (eurStats.lastRate > eurStats.mean) {
            trendEl.textContent = 'Tendencia: alcista';
            trendEl.style.color = '#0f9d58';
        } else if (eurStats.lastRate < eurStats.mean) {
            trendEl.textContent = 'Tendencia: bajista';
            trendEl.style.color = '#db4437';
        } else {
            trendEl.textContent = 'Tendencia: neutra';
            trendEl.style.color = '#f4b400';
        }
    }
    // Actualiza USDJPY
    if (jpyStats) {
        document.getElementById('jpy-max').innerHTML = `<strong>Máximo&nbsp;(7&nbsp;días):</strong> ${formatNumber(jpyStats.max, 2)}`;
        document.getElementById('jpy-min').innerHTML = `<strong>Mínimo&nbsp;(7&nbsp;días):</strong> ${formatNumber(jpyStats.min, 2)}`;
        document.getElementById('jpy-avg').innerHTML = `<strong>Media&nbsp;(7&nbsp;días):</strong> ${formatNumber(jpyStats.mean, 2)}`;
        document.getElementById('jpy-vol').innerHTML = `<strong>Volatilidad:</strong> ${formatNumber(jpyStats.volatility, 4)}`;
        const trendEl = document.getElementById('jpy-trend');
        if (jpyStats.lastRate > jpyStats.mean) {
            trendEl.textContent = 'Tendencia: alcista';
            trendEl.style.color = '#0f9d58';
        } else if (jpyStats.lastRate < jpyStats.mean) {
            trendEl.textContent = 'Tendencia: bajista';
            trendEl.style.color = '#db4437';
        } else {
            trendEl.textContent = 'Tendencia: neutra';
            trendEl.style.color = '#f4b400';
        }
    }
    // Actualiza XAUUSD
    if (xauStats) {
        document.getElementById('xau-max').innerHTML = `<strong>Máximo&nbsp;(7&nbsp;días):</strong> ${formatNumber(xauStats.max, 2)}`;
        document.getElementById('xau-min').innerHTML = `<strong>Mínimo&nbsp;(7&nbsp;días):</strong> ${formatNumber(xauStats.min, 2)}`;
        document.getElementById('xau-avg').innerHTML = `<strong>Media&nbsp;(7&nbsp;días):</strong> ${formatNumber(xauStats.mean, 2)}`;
        document.getElementById('xau-vol').innerHTML = `<strong>Volatilidad:</strong> ${formatNumber(xauStats.volatility, 2)}`;
        const trendEl = document.getElementById('xau-trend');
        if (xauStats.lastRate > xauStats.mean) {
            trendEl.textContent = 'Tendencia: alcista';
            trendEl.style.color = '#0f9d58';
        } else if (xauStats.lastRate < xauStats.mean) {
            trendEl.textContent = 'Tendencia: bajista';
            trendEl.style.color = '#db4437';
        } else {
            trendEl.textContent = 'Tendencia: neutra';
            trendEl.style.color = '#f4b400';
        }
    }
}

// Actualiza la fecha y hora en el header
function updateDateTime() {
    const now = new Date();
    const optionsDate = { year: 'numeric', month: 'long', day: 'numeric', timeZone: MX_TIMEZONE };
    const optionsTime = { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: MX_TIMEZONE };
    document.getElementById('current-date').textContent = new Intl.DateTimeFormat('es-MX', optionsDate).format(now);
    document.getElementById('current-time').textContent = new Intl.DateTimeFormat('es-MX', optionsTime).format(now);
}

// Carga datos de ejemplo en el panel macro
function loadMacroPanel() {
    document.getElementById('dxy-value').textContent = macroData.dxy.value.toFixed(2);
    document.getElementById('dxy-direction').textContent = macroData.dxy.direction > 0 ? 'Alza' : 'Baja';
    document.getElementById('us10y-value').textContent = macroData.us10y.value.toFixed(2) + ' %';
    document.getElementById('us10y-pattern').textContent = macroData.us10y.pattern;
    document.getElementById('us02y-value').textContent = macroData.us02y.value.toFixed(2) + ' %';
    document.getElementById('vix-value').textContent = macroData.vix.value.toFixed(1);
    document.getElementById('wti-value').textContent = macroData.wti.value.toFixed(2);
    document.getElementById('xauusd-value').textContent = macroData.xauusd.value.toLocaleString('es-MX');
}

// Actualiza el sentimiento de riesgo y cambia la clase del estado en el header
function updateMarketStatus() {
    const sentiment = calculateRiskSentiment();
    const statusEl = document.getElementById('market-status');
    statusEl.classList.remove('buy', 'sell', 'neutral', 'alert');
    if (sentiment === 'risk-on') {
        statusEl.classList.add('buy');
        statusEl.textContent = 'Estado del mercado: Apetito de riesgo (Risk‑ON)';
    } else if (sentiment === 'risk-off') {
        statusEl.classList.add('sell');
        statusEl.textContent = 'Estado del mercado: Aversión al riesgo (Risk‑OFF)';
    } else {
        statusEl.classList.add('neutral');
        statusEl.textContent = 'Estado del mercado: Neutral';
    }
    // Actualiza también el valor en la tarjeta de apetito de riesgo
    const riskValueEl = document.getElementById('risk-value');
    riskValueEl.textContent = sentiment === 'risk-on' ? 'Alto' : (sentiment === 'risk-off' ? 'Bajo' : 'Medio');
    // Cambia el color según el sentimiento
    riskValueEl.style.color = sentiment === 'risk-on' ? '#0f9d58' : (sentiment === 'risk-off' ? '#db4437' : '#f4b400');
}

// Función de inicialización
function init() {
    loadMacroPanel();
    updateMarketStatus();
    updateDateTime();
    // Cargar precios en vivo de los pares y el oro
    loadLivePrices();
    // Calcular y mostrar estadísticas de análisis
    loadAnalysisStats();
    // Actualizar cada segundo la hora
    setInterval(updateDateTime, 1000);
    // Actualizar sentimiento cada 5 minutos (300000 ms) en un entorno real
    setInterval(updateMarketStatus, 300000);
    // Actualizar precios cada 15 minutos (900000 ms) para reflejar cambios recientes sin saturar la API.
    // Frankfurter no impone cuotas fijas, pero limitar la frecuencia ayuda a evitar bloqueos por exceso de peticiones.
    setInterval(loadLivePrices, 900000);
    // Actualizar estadísticas cada 15 minutos (mismo intervalo que los precios)
    setInterval(loadAnalysisStats, 900000);
}

// Ejecutar init cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', init);