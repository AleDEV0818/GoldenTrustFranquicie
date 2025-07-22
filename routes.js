import express from "express";
// Importa tus controladores y routers usando import
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
import passport from "passport";
import { authenticate } from "./config/passportConfig.js";
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
  renderStatisticsPolicies, fetchPoliciesStatistics, fetchPoliciesFilters, getLocationsForUser
} from "./controllers/statisticsPoliciesController.js";
import { renderStatisticsCsr, fetchCsrStatistics, fetchCsrFilters } from "./controllers/statisticsCsrController.js";
import { renderCsrPolicies, fetchCsrPoliciesData, fetchCsrPoliciesSummary } from "./controllers/statistics.js";
import televisorFranchiseRouter from "./controllers/televisorFranchise.js";

const router = express.Router();

const renewalsAuth = (req, res, next) => {
  if (!req.isAuthenticated()) return res.redirect('/login');
  if (!req.user?.location_id) return res.status(403).send("Usuario sin ubicación asignada");
  next();
};

// --- Aquí tus rutas exactamente igual que antes ---

// Auth and user
router.get('/login', checkAuthenticated, login);
router.post('/login', authenticate(passport));
router.post('/users/auth/send/:email', passwordMail);
router.get('/users/auth/reset-password/:email', renderResetPassword);
router.post('/users/auth/reset-password/:email', resetPassword);
router.get('/users/logout', logout);

// Dashboard
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

// Config
router.get('/users/config/headcarriers', checkNotAuthenticated, headcarrier);
router.post('/users/config/headcarrier/addHeadCarrier', checkNotAuthenticated, addHeadCarrier);
router.get('/users/config/headcarrier/list', checkNotAuthenticated, head_carrier_list);
router.post('/users/config/headcarrier/addCarrier', checkNotAuthenticated, addCarrier);
router.post('/users/config/headcarrier/deleteCarrier', checkNotAuthenticated, deleteCarrier);
router.post('/users/config/headcarrier/setGoal', checkNotAuthenticated, setMonthlyGoal);

// Search
router.post('/users/search', checkNotAuthenticated, dataSearch);

// GTI Directory
router.use('/users', gtiDirectoryRouter);

// Agency
router.get('/users/agency', agency);
router.get('/api/agency-dashboard-metrics', agencyDashboardMetrics);

// Video and Message Center
router.get('/users/message-center/upholding-gti-standards', renewalsAuth, streamVideo);
router.get('/users/renewals/message-center', renewalsAuth, renderMessageCenter);
router.get('/video/download', downloadVideo);

// Estadísticas de pólizas
router.get("/users/statistics/policies", renewalsAuth, renderStatisticsPolicies);
router.get("/users/statistics/policies/filters", renewalsAuth, fetchPoliciesFilters);
router.post("/users/statistics/policies/search", renewalsAuth, fetchPoliciesStatistics);

// Estadísticas de CSR (ranking)
router.get("/users/statistics/csr", renewalsAuth, renderStatisticsCsr);
router.get("/users/statistics/csr/filters", renewalsAuth, fetchCsrFilters);
router.post("/users/statistics/csr/search", renewalsAuth, fetchCsrStatistics);

// CSR Policies - Detalle de pólizas por group_by_type (csr/agent/producer) y nombre
router.get('/users/statistics/csr-policies/:group_by_type/:group_name', renewalsAuth, renderCsrPolicies);
router.get('/users/statistics/csr-policies/data/:group_by_type/:group_name', renewalsAuth, fetchCsrPoliciesData);
router.get('/users/statistics/csr-policies/summary/:group_by_type/:group_name', renewalsAuth, fetchCsrPoliciesSummary);

// Renovaciones próximas
router.get("/users/renewals/agency-upcoming-renewals", renewalsAuth, renewalsController.agencyUpcomingRenewalsView);
router.post("/users/renewals/agency-upcoming-renewals/data", renewalsAuth, renewalsController.agencyUpcomingRenewalsData);

// Renovaciones expiradas
router.get('/users/renewals/agency-expired-not-renewed', renewalsAuth, notRenewalsController.expiredNotRenewedView);
router.post('/users/renewals/agency-expired-not-renewed/data-month', renewalsAuth, notRenewalsController.getExpiredPolicies);
router.post('/users/renewals/agency-lost-renewals-by-line-kpis', renewalsAuth, notRenewalsController.getLostRenewalKPIs);

// TELEVISOR ROUTES
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

// TELEVISOR RENEWED ROUTES
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

// --- TELEVISOR FRANCHISE ROUTES ---
router.use(televisorFranchiseRouter);

export default router;