import express from "express";
import passport from "passport";
import { authenticate } from "./config/passportConfig.js";
import multer from "multer";
const upload = multer();

import {
  login,
  renderResetPassword,
  resetPassword,
  logout,
  checkAuthenticated,
  checkNotAuthenticated
} from "./controllers/auth.js";
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
import { agency, agencyDashboardMetrics } from './controllers/agencyController.js';
import {
  headcarrier,
  addHeadCarrier,
  head_carrier_list,
  addCarrier,
  deleteCarrier,
  setMonthlyGoal,
  getMonthlyGoal
} from "./controllers/config.js";
import { dataSearch } from "./controllers/search.js";
import { passwordMail } from "./controllers/mailer.js";
import gtiDirectoryRouter from "./controllers/gtusers.js";
import notRenewalsController from "./controllers/NotRenewalsController.js";
import renewalsController from "./controllers/renewalsController.js";
import {
  renderMessageCenter,
  streamVideo,
  downloadVideo
} from "./controllers/messageController.js";
import { televisorTotals, getTelevisorData, getNewsTicker } from './controllers/televisorController.js';
import { televisorTotalsRenewed, getTelevisorDataRenewed, getNewsTickerRenewed } from './controllers/televisorControllerRenewed.js';
import {
  renderStatisticsPolicies,
  fetchPoliciesStatistics,
  fetchPoliciesFilters,
  getLocationsForUser
} from "./controllers/statisticsPoliciesController.js";
import {
  renderStatisticsCsr,
  fetchCsrStatistics,
  fetchCsrFilters
} from "./controllers/statisticsCsrController.js";
import {
  renderCsrPolicies,
  fetchCsrPoliciesData,
  fetchCsrPoliciesSummary
} from "./controllers/statistics.js";
import televisorFranchiseRouter from "./controllers/televisorFranchise.js";
import {
  renderLicensedAgents,
  listAgents,
  exportCsv,
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

const router = express.Router();

// Middleware to protect renewals and licensed agents routes
const renewalsAuth = (req, res, next) => {
  if (!req.isAuthenticated()) return res.redirect('/login');
  if (!req.user?.location_id) return res.status(403).send("User has no assigned location.");
  next();
};

// --------- AUTH & USER ROUTES ---------
router.get('/login', checkAuthenticated, login);
router.post('/login', authenticate(passport));
router.post('/users/auth/send/:email', passwordMail);
router.get('/users/auth/reset-password/:email', renderResetPassword);
router.post('/users/auth/reset-password/:email', resetPassword);
router.get('/users/logout', logout);

// --------- DASHBOARD ROUTES ---------
router.get('/', checkNotAuthenticated, redirect_dashboard);
router.get('/users/dashboard', checkNotAuthenticated, dashboard);
router.post('/users/dashboard/lastQuarter', checkNotAuthenticated, dashboardLastQuarter);
router.post('/users/dashboard/weekReports', checkNotAuthenticated, dashboardWeekReports);
router.post('/users/dashboard/totalSalesStatistics', checkNotAuthenticated, totalSalesStatistics);
router.post('/users/dashboard/nbSalesStatistics', checkNotAuthenticated, nbSalesStatistics);
router.post('/users/dashboard/rnSalesStatistics', checkNotAuthenticated, rnSalesStatistics);
router.post('/users/dashboard/rwSalesStatistics', checkNotAuthenticated, rwSalesStatistics);
router.post('/users/dashboard/cnSalesStatistics', checkNotAuthenticated, cnSalesStatistics);
router.get('/users/dashboard/metrics', checkNotAuthenticated, dashboardMetrics);

// --------- CONFIG ROUTES ---------
router.get('/users/config/headcarriers', checkNotAuthenticated, headcarrier);
router.post('/users/config/headcarrier/addHeadCarrier', checkNotAuthenticated, addHeadCarrier);
router.get('/users/config/headcarrier/list', checkNotAuthenticated, head_carrier_list);
router.post('/users/config/headcarrier/addCarrier', checkNotAuthenticated, addCarrier);
router.post('/users/config/headcarrier/deleteCarrier', checkNotAuthenticated, deleteCarrier);
router.post('/users/config/headcarrier/setGoal', checkNotAuthenticated, setMonthlyGoal);

// --------- SEARCH ---------
router.post('/users/search', checkNotAuthenticated, dataSearch);

// --------- GTI DIRECTORY ---------
router.use('/users', gtiDirectoryRouter);

// --------- AGENCY ---------
router.get('/users/agency', agency);
router.get('/api/agency-dashboard-metrics', agencyDashboardMetrics);

// --------- VIDEO & MESSAGE CENTER ---------
router.get('/users/message-center/upholding-gti-standards', renewalsAuth, streamVideo);
router.get('/users/renewals/message-center', renewalsAuth, renderMessageCenter);
router.get('/video/download', downloadVideo);

// --------- STATISTICS POLICIES ---------
router.get("/users/statistics/policies", renewalsAuth, renderStatisticsPolicies);
router.get("/users/statistics/policies/filters", renewalsAuth, fetchPoliciesFilters);
router.post("/users/statistics/policies/search", renewalsAuth, fetchPoliciesStatistics);

// --------- STATISTICS CSR ---------
router.get("/users/statistics/csr", renewalsAuth, renderStatisticsCsr);
router.get("/users/statistics/csr/filters", renewalsAuth, fetchCsrFilters);
router.post("/users/statistics/csr/search", renewalsAuth, fetchCsrStatistics);

// --------- CSR POLICIES ---------
router.get('/users/statistics/csr-policies/:group_by_type/:group_name', renewalsAuth, renderCsrPolicies);
router.get('/users/statistics/csr-policies/data/:group_by_type/:group_name', renewalsAuth, fetchCsrPoliciesData);
router.get('/users/statistics/csr-policies/summary/:group_by_type/:group_name', renewalsAuth, fetchCsrPoliciesSummary);

// --------- RENEWALS ---------
router.get("/users/renewals/agency-upcoming-renewals", renewalsAuth, renewalsController.agencyUpcomingRenewalsView);
router.post("/users/renewals/agency-upcoming-renewals/data", renewalsAuth, renewalsController.agencyUpcomingRenewalsData);
router.get('/users/renewals/agency-expired-not-renewed', renewalsAuth, notRenewalsController.expiredNotRenewedView);
router.post('/users/renewals/agency-expired-not-renewed/data-month', renewalsAuth, notRenewalsController.getExpiredPolicies);
router.post('/users/renewals/agency-lost-renewals-by-line-kpis', renewalsAuth, notRenewalsController.getLostRenewalKPIs);

// --------- TELEVISOR ROUTES ---------
router.get('/televisor/totals', renewalsAuth, (req, res) => {
  req.query.location_id = req.user?.location_id || null;
  televisorTotals(req, res);
});
router.get('/televisor/data', renewalsAuth, async (req, res) => {
  req.query.location_id = req.user?.location_id || null;
  const data = await getTelevisorData(req);
  data.monthly_goal = await getMonthlyGoal();
  res.json(data);
});
router.get('/ticker/data', renewalsAuth, async (req, res) => {
  req.query.location_id = req.user?.location_id || null;
  await getNewsTicker(req, res);
});

// --------- TELEVISOR RENEWED ROUTES ---------
router.get('/televisor-renewed/totals', renewalsAuth, (req, res) => {
  req.query.location_id = req.user?.location_id || null;
  televisorTotalsRenewed(req, res);
});
router.get('/televisor-renewed/data', renewalsAuth, async (req, res) => {
  req.query.location_id = req.user?.location_id || null;
  await getTelevisorDataRenewed(req, res);
});
router.get('/televisor-renewed/ticker', renewalsAuth, async (req, res) => {
  req.query.location_id = req.user?.location_id || null;
  await getNewsTickerRenewed(req, res);
});

// --------- TELEVISOR FRANCHISE ---------
router.use(televisorFranchiseRouter);

// --------- LICENSED AGENTS (AUDIT LOGS INCLUDED) ---------
router.get('/users/licensed-agents', renewalsAuth, renderLicensedAgents);
router.get('/users/agents', renewalsAuth, listAgents);
router.get('/users/agents/export', renewalsAuth, exportCsv);
router.post('/users/agents', renewalsAuth, addAgent);
router.get('/users/agents/available-users', renewalsAuth, getAvailableUsers);
router.put('/users/agents/:id', renewalsAuth, editAgent);
router.delete('/users/agents/:id', renewalsAuth, deleteAgent);

// --------- MAIL USERS ENDPOINT (admin.mail) ---------
router.get('/users/mail-users', renewalsAuth, getMailUsersByLocation);
router.post('/users/agents/send-expiring-mail', renewalsAuth, sendExpiringAgentsMail);
router.get('/users/agents/email-sent-today', renewalsAuth, emailSentToday);
router.get('/users/agents/last-expiring-mail', renewalsAuth, lastExpiringMailInfo);

// Auto-mail recipients (get/set)
router.get('/users/agents/auto-expiring-mail-recipients', renewalsAuth, autoExpiringMailRecipients);
router.post('/users/agents/set-auto-expiring-mail-recipients', renewalsAuth, setAutoExpiringMailRecipients);

// --------- ACCESS CODES PAGE & API ---------
router.get('/users/codes', renewalsAuth, codesController.renderCodesPage); // <--- ¡Aquí llamas el render desde el controller!
router.get('/users/codes/api', renewalsAuth, codesController.listCodes);
router.get('/users/codes/export', renewalsAuth, codesController.exportCsv);
router.post('/users/codes/import', renewalsAuth, upload.single('file'), codesController.importCodes);
router.get('/users/codes/agencies', renewalsAuth, codesController.listAgencies);
router.get('/users/codes/agencies-map', renewalsAuth, codesController.listAgenciesMap); // opcional, solo si usas AJAX mapping

export default router;