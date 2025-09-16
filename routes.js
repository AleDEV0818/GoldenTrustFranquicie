import express from "express";
import passport from "passport";
import { authenticate } from "./config/passportConfig.js";
import multer from "multer";
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 } // 20MB
});

// ----- CONTROLADORES (AUTH) -----
import {
  login,
  renderResetPassword,
  resetPassword,
  logout,
  checkAuthenticated,
  checkNotAuthenticated
} from "./controllers/auth.js";

// ----- CONTROLADORES (DASHBOARD Y REPORTES) -----
import {
  redirect_dashboard,
  dashboard,
  dashboardLastQuarter,
  dashboardWeekReports,
  totalSalesStatistics,
  nbSalesStatistics,
  rnSalesStatistics,
  rwSalesStatistics,
  cnSalesStatistics,
  dashboardMetrics
} from "./controllers/dash-reports.js";

// ----- CONTROLADORES (AGENCIA) -----
import { agency, agencyDashboardMetrics } from "./controllers/agencyController.js";

// ----- CONTROLADORES (CONFIG) -----
import {
  headcarrier,
  addHeadCarrier,
  head_carrier_list,
  addCarrier,
  deleteCarrier,
  setMonthlyGoal,
  getMonthlyGoal
} from "./controllers/config.js";

// ----- CONTROLADORES (BÚSQUEDA GLOBAL) -----
import { dataSearch } from "./controllers/search.js";

// ----- SERVICIOS (MAIL) -----
import { passwordMail } from "./controllers/mailer.js";

// ----- SUB-ROUTER (DIRECTORIO GTI) -----
import gtiDirectoryRouter from "./controllers/gtusers.js";

// ----- CONTROLADORES (RENEWALS) -----
import * as notRenewalsController from "./controllers/NotRenewalsController.js";
import * as renewalsController from "./controllers/renewalsController.js";

// ----- CONTROLADORES (MENSAJES / VIDEO) -----
import {
  renderMessageCenter,
  streamVideo,
  downloadVideo
} from "./controllers/messageController.js";

// ----- CONTROLADORES (TELEVISOR) -----
import { televisorTotals, getTelevisorData, getNewsTicker } from "./controllers/televisorController.js";
import { televisorTotalsRenewed, getTelevisorDataRenewed, getNewsTickerRenewed } from "./controllers/televisorControllerRenewed.js";

// ----- CONTROLADORES (ESTADÍSTICAS: POLICIES) -----
import {
  renderStatisticsPolicies,
  fetchPoliciesStatistics,
  fetchPoliciesFilters,
  getLocationsForUser
} from "./controllers/statisticsPoliciesController.js";

// ----- CONTROLADORES (ESTADÍSTICAS: CSR) -----
import {
  renderStatisticsCsr,
  fetchCsrStatistics,
  fetchCsrFilters
} from "./controllers/statisticsCsrController.js";

// ----- CONTROLADORES (CSR POLICIES DETAIL) -----
import {
  renderCsrPolicies,
  fetchCsrPoliciesData,
  fetchCsrPoliciesSummary
} from "./controllers/statistics.js";

// ----- SUB-ROUTER (TELEVISOR FRANCHISE) -----
import televisorFranchiseRouter from "./controllers/televisorFranchise.js";

// ----- CONTROLADORES (LICENSED AGENTS Y CODES) -----
import {
  renderLicensedAgents,
  listAgents,
  exportCsv as exportAgentsCsv,
  addAgent,
  getAvailableUsers,
  editAgent,
  notifyExpiringAgents,
  getMailUsersByLocation,
  sendExpiringAgentsMail,
  deleteAgent,
  lastExpiringMailInfo,
  emailSentToday,
  autoExpiringMailRecipients,
  setAutoExpiringMailRecipients
} from "./controllers/licensedController.js";
import * as codesController from "./controllers/codesController.js";

// ----- CONTROLADORES (FRANCHISE KPIs) -----
import {
  renderFranchiseKpisPanel,
  fetchFranchiseKpisPanelData,
  debugFranchiseTotals
} from "./controllers/franchiseKpis.js";

// ----- CONTROLADORES (FRANCHISE ERRORS: tabla directa sin caché) -----
import {
  renderFranchiseErrorsPanel,
  fetchFranchiseErrorsPanelData
} from "./controllers/franchiseError.js";

// ----- CONTROLADORES (POLICIES MISSING CSR/PRODUCER) -----
import {
  fetchMissingCsrOrProducerPolicies, 
  renderMissingCsrOrProducerView
} from "./controllers/missingCsrProducerController.js";

// ----- CONTROLADORES (POLICY REPORT BY LOCATION) -----
import {
  fetchPolicyReportByLocation,
  renderPolicyReportByLocationView
} from "./controllers/policy-report-by-location.js";

// ----- CONTROLADORES (MISSING CONTACT ERRORS: email/phone/invalid_email) -----
import {
  fetchMissingContactErrors,
  renderMissingContactErrorsView,
  verifyContactsEmails,
  fetchActiveClientsCount,
  fetchMissingContactSummary
} from "./controllers/missing-contact-errorsController.js";

const router = express.Router();

const SCOPE_DEBUG = process.env.SCOPE_DEBUG === "1";

router.use((req, res, next) => {
  res.locals.currentPath = req.originalUrl || req.path || "";
  next();
});

const renewalsAuth = (req, res, next) => {
  if (!req.isAuthenticated()) return res.redirect("/login");
  if (!req.user?.location_id) return res.status(403).send("User has no assigned location.");
  next();
};

function canOverrideLocation(user) {
  if (!user) return false;
  if (user.location_type === 1) return true; // Franchise/central
  if (user.department && user.department.trim() === "Marketing & IT") return true;
  return false;
}

function scopeLocation(req, res, next) {
  try {
    const userLocation = req.user?.location_id;
    const overrideQuery = req.query.location != null ? Number(req.query.location) : undefined;
    const overrideBody = req.body?.location != null ? Number(req.body.location) : undefined;

    const override = Number.isFinite(overrideQuery) ? overrideQuery
                   : Number.isFinite(overrideBody) ? overrideBody
                   : undefined;

    let effective = userLocation;
    let source = "user";

    if (Number.isFinite(override) && canOverrideLocation(req.user)) {
      effective = override;
      source = "override";
      req.user.location_id = effective;
      if (req.session) req.session.locationOverride = effective;
    } else if (!Number.isFinite(override) && req.session?.locationOverride && canOverrideLocation(req.user)) {
      effective = Number(req.session.locationOverride);
      if (Number.isFinite(effective)) {
        source = "override";
        req.user.location_id = effective;
      }
    }

    if (!effective) return res.status(403).send("No effective location available.");

    req.scope = { locationId: effective, source };

    if (SCOPE_DEBUG) {
      console.log(`[scopeLocation] source=${source} effective=${effective} q=${req.query.location} b=${req.body?.location} s=${req.session?.locationOverride ?? "∅"}`);
    }

    next();
  } catch (e) {
    console.error("scopeLocation error:", e);
    res.status(500).send("scopeLocation failed");
  }
}

// ================================== RUTAS ==================================

// AUTH
router.get("/login", checkAuthenticated, login);
router.post("/login", authenticate(passport));
router.post("/users/auth/send/:email", passwordMail);
router.get("/users/auth/reset-password/:email", renderResetPassword);
router.post("/users/auth/reset-password/:email", resetPassword);
router.get("/users/logout", logout);

// DASHBOARD
router.get("/", checkNotAuthenticated, redirect_dashboard);
router.get("/users/dashboard", checkNotAuthenticated, dashboard);
router.post("/users/dashboard/lastQuarter", checkNotAuthenticated, dashboardLastQuarter);
router.post("/users/dashboard/weekReports", checkNotAuthenticated, dashboardWeekReports);
router.post("/users/dashboard/totalSalesStatistics", checkNotAuthenticated, totalSalesStatistics);
router.post("/users/dashboard/nbSalesStatistics", checkNotAuthenticated, nbSalesStatistics);
router.post("/users/dashboard/rnSalesStatistics", checkNotAuthenticated, rnSalesStatistics);
router.post("/users/dashboard/rwSalesStatistics", checkNotAuthenticated, rwSalesStatistics);
router.post("/users/dashboard/cnSalesStatistics", checkNotAuthenticated, cnSalesStatistics);
router.get("/users/dashboard/metrics", checkNotAuthenticated, dashboardMetrics);

// CONFIG
router.get("/users/config/headcarriers", checkNotAuthenticated, headcarrier);
router.post("/users/config/headcarrier/addHeadCarrier", checkNotAuthenticated, addHeadCarrier);
router.get("/users/config/headcarrier/list", checkNotAuthenticated, head_carrier_list);
router.post("/users/config/headcarrier/addCarrier", checkNotAuthenticated, addCarrier);
router.post("/users/config/headcarrier/deleteCarrier", checkNotAuthenticated, deleteCarrier);
router.post("/users/config/headcarrier/setGoal", checkNotAuthenticated, setMonthlyGoal);

// SEARCH
router.post("/users/search", checkNotAuthenticated, dataSearch);

// AGENCY
router.get("/users/agency", checkNotAuthenticated, agency);
router.get("/api/agency-dashboard-metrics", checkNotAuthenticated, agencyDashboardMetrics);

// VIDEO & MESSAGE CENTER
router.get("/users/message-center/upholding-gti-standards", renewalsAuth, streamVideo);
router.get("/users/renewals/message-center", renewalsAuth, renderMessageCenter);
router.get("/video/download", downloadVideo);

// STATISTICS POLICIES
router.get("/users/statistics/policies", renewalsAuth, renderStatisticsPolicies);
router.get("/users/statistics/policies/filters", renewalsAuth, fetchPoliciesFilters);
router.post("/users/statistics/policies/search", renewalsAuth, fetchPoliciesStatistics);

// STATISTICS CSR
router.get("/users/statistics/csr", renewalsAuth, renderStatisticsCsr);
router.get("/users/statistics/csr/filters", renewalsAuth, fetchCsrFilters);
router.post("/users/statistics/csr/search", renewalsAuth, fetchCsrStatistics);

// CSR POLICIES
router.get("/users/statistics/csr-policies/:group_by_type/:group_name", renewalsAuth, renderCsrPolicies);
router.get("/users/statistics/csr-policies/data/:group_by_type/:group_name", renewalsAuth, fetchCsrPoliciesData);
router.get("/users/statistics/csr-policies/summary/:group_by_type/:group_name", renewalsAuth, fetchCsrPoliciesSummary);

// RENEWALS (orden: auth -> scopeLocation)
router.get(
  "/users/renewals/agency-upcoming-renewals",
  renewalsAuth,
  scopeLocation,
  renewalsController.agencyUpcomingRenewalsView
);
router.post(
  "/users/renewals/agency-upcoming-renewals/data",
  renewalsAuth,
  scopeLocation,
  renewalsController.agencyUpcomingRenewalsData
);
router.get(
  "/users/renewals/agency-expired-not-renewed",
  renewalsAuth,
  scopeLocation,
  notRenewalsController.expiredNotRenewedView
);
router.post(
  "/users/renewals/agency-expired-not-renewed/data-month",
  renewalsAuth,
  scopeLocation,
  notRenewalsController.getExpiredPolicies
);
router.post(
  "/users/renewals/agency-lost-renewals-by-line-kpis",
  renewalsAuth,
  scopeLocation,
  notRenewalsController.getLostRenewalKPIs
);

// TELEVISOR
router.get("/televisor/totals", renewalsAuth, (req, res) => {
  req.query.location_id = req.user?.location_id || null;
  televisorTotals(req, res);
});
router.get("/televisor/data", renewalsAuth, async (req, res) => {
  req.query.location_id = req.user?.location_id || null;
  const data = await getTelevisorData(req);
  data.monthly_goal = await getMonthlyGoal();
  res.json(data);
});
router.get("/ticker/data", renewalsAuth, async (req, res) => {
  req.query.location_id = req.user?.location_id || null;
  await getNewsTicker(req, res);
});

// TELEVISOR RENEWED
router.get("/televisor-renewed/totals", renewalsAuth, (req, res) => {
  req.query.location_id = req.user?.location_id || null;
  televisorTotalsRenewed(req, res);
});
router.get("/televisor-renewed/data", renewalsAuth, async (req, res) => {
  req.query.location_id = req.user?.location_id || null;
  await getTelevisorDataRenewed(req, res);
});
router.get("/televisor-renewed/ticker", renewalsAuth, async (req, res) => {
  req.query.location_id = req.user?.location_id || null;
  await getNewsTickerRenewed(req, res);
});

// TELEVISOR FRANCHISE (esto habilita /api/franchise/render y demás del sub-router)
router.use("/api/franchise", televisorFranchiseRouter);

// LICENSED AGENTS
router.get("/users/licensed-agents", renewalsAuth, renderLicensedAgents);
router.get("/users/agents", renewalsAuth, listAgents);
router.get("/users/agents/export", renewalsAuth, exportAgentsCsv);
router.post("/users/agents", renewalsAuth, addAgent);
router.get("/users/agents/available-users", renewalsAuth, getAvailableUsers);
router.put("/users/agents/:id", renewalsAuth, editAgent);
router.delete("/users/agents/:id", renewalsAuth, deleteAgent);

// MAIL USERS
router.get("/users/mail-users", renewalsAuth, getMailUsersByLocation);
router.post("/users/agents/send-expiring-mail", renewalsAuth, sendExpiringAgentsMail);
router.get("/users/agents/email-sent-today", renewalsAuth, emailSentToday);
router.get("/users/agents/last-expiring-mail", renewalsAuth, lastExpiringMailInfo);
router.get("/users/agents/auto-expiring-mail-recipients", renewalsAuth, autoExpiringMailRecipients);
router.post("/users/agents/set-auto-expiring-mail-recipients", renewalsAuth, setAutoExpiringMailRecipients);

// ===================== CODES (ACCESS CODES) =====================
router.get("/users/codes", renewalsAuth, codesController.renderCodesPage);
router.get("/users/codes/api", renewalsAuth, codesController.listCodes);
router.get("/users/codes/export", renewalsAuth, codesController.exportCsv);
// Import con multer: el campo debe llamarse "file"
router.post("/users/codes/import", renewalsAuth, upload.single("file"), codesController.importCodes);

// FRANCHISE KPIS
router.get("/franchise-kpis", checkNotAuthenticated, renderFranchiseKpisPanel);
router.get("/api/franchise-kpis-panel", checkNotAuthenticated, fetchFranchiseKpisPanelData);
router.get("/api/franchise-kpis-panel/debug-totals", checkNotAuthenticated, debugFranchiseTotals);

// FRANCHISE ERRORS
router.get("/franchise-errors", checkNotAuthenticated, renderFranchiseErrorsPanel);
router.get("/api/franchise-errors-panel", checkNotAuthenticated, fetchFranchiseErrorsPanelData);
router.get("/api/franchise-errors", checkNotAuthenticated, fetchFranchiseErrorsPanelData);

// POLICIES MISSING CSR/PRODUCER
router.get("/api/missing-csr-producer", renewalsAuth, scopeLocation, fetchMissingCsrOrProducerPolicies);
router.get("/users/missing-csr-producer", renewalsAuth, scopeLocation, renderMissingCsrOrProducerView);

// POLICY REPORT BY LOCATION
router.get("/api/policy-report-by-location", renewalsAuth, scopeLocation, fetchPolicyReportByLocation);
router.get("/users/policy-report-by-location", renewalsAuth, scopeLocation, renderPolicyReportByLocationView);

// MISSING CONTACT ERRORS (email/phone/invalid_email)
// SSR para la vista
router.get("/users/missing-contact-errors", renewalsAuth, scopeLocation, renderMissingContactErrorsView);
// APIs de detalle/acción
router.get("/api/missing-contact-errors", renewalsAuth, scopeLocation, fetchMissingContactErrors);
router.post("/api/missing-contact-errors/verify", renewalsAuth, scopeLocation, verifyContactsEmails);
// APIs KPI (para que cambien al cambiar location)
router.get("/api/active-clients-count", renewalsAuth, scopeLocation, fetchActiveClientsCount);
router.get("/api/missing-contact-errors/summary", renewalsAuth, scopeLocation, fetchMissingContactSummary);

// GTI DIRECTORY
router.use("/users/gtidirectory", gtiDirectoryRouter);

export default router;